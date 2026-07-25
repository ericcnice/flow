-- CONVITE VIRAL / FATIA B.1a: as RPCs da RECEPÇÃO + profiles.birth_date.
--
-- O aluno clica no link que o coach mandou (/convite/{token}), a landing lê o
-- convite AINDA ANÔNIMO ("A Cidea te convidou"), ele loga (Google/OTP) e o
-- CLAIM vincula a conta ao member do roster. Aqui é só o BANCO: a landing é a
-- B.1b e o disparo do claim pós-login é a B.1c.
--
-- DUAS RPCs COM PÚBLICOS DIFERENTES — e é isso que define a segurança de cada:
--   get_invite_by_token  → ANÔNIMA (quem clicou ainda não tem conta). Retorno
--                          MÍNIMO e fixo; a tabela invites continua fechada
--                          para anon (a função roda como owner e devolve só as
--                          3 colunas escolhidas).
--   claim_invite         → só AUTHENTICATED (escreve o vínculo). Devolve CÓDIGO
--                          de estado, não exceção: "já usado" e "já é seu" são
--                          telas do produto, não erros.
--
-- Aditivo: 1 coluna + 2 funções NOVAS. NÃO toca a tabela invites,
-- coach_invite_student, claim_coach_membership, handle_new_user, as policies de
-- members/profiles, a jornada nem lib/scoring. Idempotente. Rodar no SQL Editor
-- após verificação.

-- ===========================================================================
-- 1. COLUNA profiles.birth_date
-- ===========================================================================
-- Data de nascimento capturada no cadastro da landing. É ela que DECIDE o fluxo
-- legal (LGPD art. 14): >= 18 segue normal; < 18 vê a parede amigável e o
-- consentimento parental é a B.2. A idade-limite mora no CÓDIGO como constante
-- ajustável — nada aqui trava 18, de propósito (a linha final, 13/16/18, sai da
-- validação com advogado/DPO).
--
-- Nullable: todo mundo que já se cadastrou está sem ela, e a coluna não pode
-- quebrar essas contas. Sem CHECK de data máxima porque current_date não é
-- IMMUTABLE (o Postgres recusa em constraint) — a validação de faixa é do front.
--
-- Escrita: NÃO precisa de RPC. profiles tem policy self update
-- ("profiles self update", 20260722020000_identity_base.sql) e grant de UPDATE
-- para authenticated — o próprio dono grava, como já faz com name/phone.
alter table public.profiles add column if not exists birth_date date;

comment on column public.profiles.birth_date is
  'Data de nascimento (LGPD art. 14: decide adulto vs menor no cadastro). Nullable — contas anteriores à B.1 não têm.';

-- ===========================================================================
-- 2. RPC get_invite_by_token — LEITURA PÚBLICA (anon)
-- ===========================================================================
-- A landing precisa dizer "A Cidea te convidou" ANTES de qualquer login. Esta é
-- a 4ª superfície anônima do produto (as outras: get_sponsor_by_slug,
-- get_sponsor_for_court, log_court_visit + as de live_match), então o retorno é
-- deliberadamente mínimo.
--
-- NUNCA SAI DAQUI: phone, email, member_number, class_schedule, level, os UUIDs
-- (invite id, student_member_id, coach_id) e o PRÓPRIO TOKEN (quem chama já o
-- tem; devolvê-lo só multiplicaria os lugares onde o segredo aparece).
--
-- RESISTÊNCIA A ENUMERAÇÃO: token inexistente, formato inválido ou kind
-- 'generic' → ZERO LINHAS, a mesma resposta em todos os casos (a landing mostra
-- uma frase genérica e não revela se o token já existiu). O que sustenta isso
-- de verdade é a entropia: new_match_token dá 128 bits.
create or replace function public.get_invite_by_token(p_token text)
returns table (
  coach_name         text,   -- "Cidea Nice" — o "A {coach} te convidou"
  student_first_name text,   -- "William" — SÓ o primeiro nome
  status             text    -- 'pending' | 'registered' | 'revoked'
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Guarda de tamanho na porta pública (regra da casa). Silenciosa: leitura
  -- falha vazia, nunca barulhenta.
  if p_token is null or length(p_token) > 64 then
    return;
  end if;

  return query
  select
    -- profiles.name é a fonte preferida; se o coach ainda não completou o
    -- perfil, cai no members.name que o admin preencheu no onboarding curado.
    coalesce(p.name, mc.name),
    split_part(trim(m.name), ' ', 1),
    i.status
  from public.invites i
  join public.members m
    on m.id = i.student_member_id
  left join public.profiles p
    on p.id = i.coach_id
  -- Fallback do nome do coach: o member-coach dono daquele profile. Lateral com
  -- limit 1 porque members não tem unique em profile_id.
  left join lateral (
    select mc2.name
      from public.members mc2
     where mc2.profile_id = i.coach_id
       and mc2.role = 'coach'
     order by mc2.id
     limit 1
  ) mc on true
  where i.token = p_token
    and i.kind = 'direct'
  limit 1;
end;
$$;

-- ===========================================================================
-- 3. RPC claim_invite — O CLAIM (authenticated, pós-login)
-- ===========================================================================
-- Vincula members.profile_id = auth.uid() e fecha o convite. A credencial é a
-- POSSE DO TOKEN (por isso, ao contrário de claim_coach_membership, não há
-- exigência de email confirmado — lá o email É a prova; aqui é o link).
--
-- RETORNA CÓDIGO, NÃO raise: 'claimed' | 'already_mine' | 'used' | 'invalid' |
-- 'noop'. Cada um vira uma tela diferente na landing; exceção viraria erro feio
-- numa página pública.
--
-- NÃO PROMOVE PAPEL. user_roles fica 'player' — o aluno é jogador, não coach.
-- (Isto NÃO é um esquecimento por simetria com claim_coach_membership: lá a
-- promoção é o objetivo; aqui promover seria dar a área do professor a quem
-- clicou num convite de aluno.)
--
-- "ALUNO DE DOIS PROFESSORES" NÃO É BLOQUEADO: members não tem unique em
-- profile_id, e o modelo do produto prevê que a mesma pessoa seja aluna da Ana
-- E do Nicholas (duas linhas em members, mesmo profile). Um coach reivindicando
-- convite de aluno também passa — o member-coach dele fica intacto.
create or replace function public.claim_invite(p_token text)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid       uuid := auth.uid();
  v_invite  uuid;
  v_student uuid;
  v_status  text;
  v_reg_by  uuid;
  v_owner   uuid;
  v_n       integer;
begin
  -- Sem sessão não há o que vincular. A landing só chama logada; isto é defesa
  -- em profundidade.
  if uid is null then
    return 'noop';
  end if;

  if p_token is null or length(p_token) > 64 then
    return 'invalid';
  end if;

  select i.id, i.student_member_id, i.status, i.registered_profile_id
    into v_invite, v_student, v_status, v_reg_by
    from public.invites i
   where i.token = p_token
     and i.kind = 'direct'
   limit 1;

  -- Token desconhecido (ou convite genérico) → mesma resposta de token
  -- inválido, sem revelar nada.
  if v_invite is null or v_student is null then
    return 'invalid';
  end if;

  -- Revogado é tratado como inválido de propósito: distinguir "revogado" de
  -- "inexistente" só ajudaria quem está sondando.
  if v_status = 'revoked' then
    return 'invalid';
  end if;

  select m.profile_id
    into v_owner
    from public.members m
   where m.id = v_student;

  -- ---- CONFLITO (a): o aluno JÁ TEM dono. --------------------------------
  if v_owner is not null then
    if v_owner = uid then
      -- Mesma pessoa reabrindo o link (caso PROVÁVEL: a mensagem fica no
      -- WhatsApp para sempre). Idempotente — fecha o convite se ficou pendente.
      update public.invites
         set status                = 'registered',
             registered_at         = coalesce(registered_at, now()),
             registered_profile_id = coalesce(registered_profile_id, uid)
       where id = v_invite
         and status = 'pending';
      return 'already_mine';
    end if;

    -- Outra conta reivindicou. NUNCA desvincula: trocar o dono de um vínculo
    -- por link vazado seria falsa atribuição (o mesmo risco que o tick verde
    -- existe para evitar).
    return 'used';
  end if;

  -- ---- CONFLITO (c): convite já fechado, mas o aluno está sem dono. -------
  -- Raro (vínculo desfeito depois, ou conta reivindicante excluída). Não
  -- re-vincula em silêncio — reescrever members por conta própria aqui seria
  -- desfazer uma decisão que alguém tomou fora deste caminho.
  if v_status = 'registered' then
    if v_reg_by = uid then
      return 'already_mine';
    end if;
    return 'used';
  end if;

  -- ---- CLAIM (aluno sem dono + convite pendente). -------------------------
  -- Concorrência-safe pelo `profile_id is null` no WHERE (mesmo padrão de
  -- claim_coach_membership): se outra sessão vinculou no intervalo, 0 linhas.
  update public.members
     set profile_id = uid
   where id = v_student
     and profile_id is null;

  get diagnostics v_n = row_count;

  if v_n = 0 then
    -- Corrida perdida: relê para responder a verdade.
    select m.profile_id into v_owner from public.members m where m.id = v_student;
    if v_owner = uid then
      return 'already_mine';
    end if;
    return 'used';
  end if;

  update public.invites
     set status                = 'registered',
         registered_at         = now(),
         registered_profile_id = uid
   where id = v_invite
     and status = 'pending';

  return 'claimed';
end;
$$;

-- ===========================================================================
-- 4. GRANTS (regra da casa — com UMA exceção deliberada)
-- ===========================================================================
-- get_invite_by_token: anon PRECISA (quem clicou no link ainda não tem conta) e
-- authenticated TAMBÉM — depois do round-trip do Google o visitante volta
-- LOGADO para a landing, que relê o convite para montar a tela de sucesso.
-- Esquecer o grant de authenticated quebraria justamente o caminho feliz do
-- OAuth. É a única RPC nova destas fatias que NÃO leva `revoke from anon`.
revoke execute on function public.get_invite_by_token(text) from public;
grant  execute on function public.get_invite_by_token(text) to anon;
grant  execute on function public.get_invite_by_token(text) to authenticated;

-- claim_invite: escreve vínculo — exige sessão. Trio completo (os DEFAULT
-- PRIVILEGES do Supabase concedem EXECUTE a anon em funções novas do schema
-- public, e `revoke from public` não alcança esse grant direto).
revoke execute on function public.claim_invite(text) from public;
revoke execute on function public.claim_invite(text) from anon;
grant  execute on function public.claim_invite(text) to authenticated;
