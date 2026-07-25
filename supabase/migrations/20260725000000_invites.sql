-- CONVITE VIRAL / FATIA A.1: SCHEMA + RPC dos CONVITES (só o banco; o botão
-- "Convidar" no roster e o link do WhatsApp são a A.2/A.3; a landing /convite,
-- o claim e o consentimento de menores são a Fatia B).
--
-- O coach cadastra o aluno no roster (A3) e dispara um LINK ÚNICO pré-vinculado
-- àquele member, enviado pelo PRÓPRIO WhatsApp dele (zero custo de API). Este
-- arquivo cria a tabela do convite e a RPC que gera/reusa o token.
--
-- DUAS DECISÕES QUE MOLDAM O SCHEMA:
--  1) TOKEN ESTÁVEL POR ALUNO enquanto 'pending' — reenviar manda O MESMO link.
--     Se cada envio gerasse token novo, a mensagem antiga (que é justamente a
--     que o aluno costuma reabrir no WhatsApp) viraria link morto. O índice
--     PARCIAL único é a tranca real disso, não a lógica da RPC.
--  2) ESCRITA SÓ VIA RPC (SECURITY DEFINER) — o coach NUNCA envia coach_id; o
--     servidor seta = auth.uid(). Sem policy de INSERT/UPDATE/DELETE não há como
--     forjar o dono do convite nem convidar aluno de outro professor. Mesmo
--     padrão do roster (20260724010000_coach_roster.sql).
--
-- Aditivo: tabela NOVA + função NOVA + 1 insert em reserved_usernames. NÃO toca
-- members, profiles, user_roles, matches, consents, as RPCs coach_*,
-- claim_coach_membership, check_username_available nem new_match_token (que é
-- só REUSADA). Idempotente. Rodar no SQL Editor após verificação.

-- ===========================================================================
-- 1. TABELA public.invites
-- ===========================================================================
-- `kind` já nasce com 'generic' no check para o CONVITE GENÉRICO (tipo 2: link
-- reutilizável que o coach joga no grupo de WhatsApp, sem pré-vínculo a um
-- aluno, mas com atribuição ao professor). Não é desta fatia — está aqui para
-- não exigir migração de check depois. Por isso student_member_id é NULLABLE.
create table if not exists public.invites (
  id                    uuid primary key default gen_random_uuid(),
  -- O SEGREDO que viaja na URL (/convite/{token}). Gerado por new_match_token.
  token                 text not null unique,
  kind                  text not null default 'direct'
                          check (kind in ('direct', 'generic')),
  -- Aluno do roster. null = convite genérico (sem pré-vínculo).
  student_member_id     uuid references public.members(id) on delete cascade,
  -- Dono do convite = auth.uid() do coach. Referencia profiles(id) igual
  -- members.coach_id: mantém a RLS como COMPARAÇÃO DE COLUNA (sem subquery em
  -- members, sem risco de recursão de policy).
  coach_id              uuid not null references public.profiles(id) on delete cascade,
  status                text not null default 'pending'
                          check (status in ('pending', 'registered', 'revoked')),
  created_at            timestamptz not null default now(),
  -- Última vez que o coach TOCOU em "Convidar" (o app abre o WhatsApp; não há
  -- como saber se ele apertou enviar — por isso o vocabulário é "convidado",
  -- nunca "enviado"/"recebido").
  last_sent_at          timestamptz,
  send_count            integer not null default 0,
  -- Preenchidos na Fatia B, quando o aluno reivindica (o único estado com
  -- verdade forte: veio do banco, não da intenção do coach).
  registered_at         timestamptz,
  registered_profile_id uuid references public.profiles(id) on delete set null,
  -- Coluna criada, SEM enforcement nesta fatia. Convite fica parado dias no
  -- WhatsApp do aluno; expirar cedo mata conversão. A política de expiração é
  -- decisão da Fatia B — a coluna existe só para não exigir migração lá.
  expires_at            timestamptz
);

-- ===========================================================================
-- 2. ÍNDICES
-- ===========================================================================
-- A TRANCA do token estável: no máximo UM convite 'pending' por aluno. Reenvio
-- reusa esse registro (a RPC só incrementa send_count/last_sent_at). Parcial
-- porque 'registered'/'revoked' podem coexistir historicamente, e porque o
-- convite genérico (student_member_id null) fica de fora.
create unique index if not exists invites_one_pending_per_student
  on public.invites (student_member_id)
  where status = 'pending' and kind = 'direct';

-- Listagem/métrica por professor ("quantos convidou / quantos se cadastraram").
create index if not exists invites_coach_id_idx on public.invites (coach_id);

-- Leitura do status no roster: a A.2 lê os convites dos alunos listados
-- (embed do PostgREST members -> invites, que filtra por student_member_id).
create index if not exists invites_student_member_idx
  on public.invites (student_member_id);

-- ===========================================================================
-- 3. RLS — LEITURA por policy; ESCRITA só via RPC
-- ===========================================================================
alter table public.invites enable row level security;

-- Tabela NOVA no schema public: os DEFAULT PRIVILEGES do Supabase já concederam
-- privilégios diretos a anon/authenticated. O revoke total antes do grant limpa
-- isso (mesmo padrão de public.matches). anon NUNCA toca invites — a leitura
-- pública por token é da Fatia B e será por RPC SECURITY DEFINER, com retorno
-- mínimo e resistente a enumeração.
revoke all on public.invites from anon;
revoke all on public.invites from authenticated;
grant select on public.invites to authenticated;

-- `create policy` não tem `if not exists`; o drop antes torna idempotente.

-- COACH: vê só os convites que ELE criou (coach_id = auth.uid()).
drop policy if exists "invites coach select own" on public.invites;
create policy "invites coach select own" on public.invites
  for select to authenticated
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'coach'
    )
  );

-- SUPER_ADMIN: métrica de engajamento por professor (quantos convites/cadastros
-- cada coach gerou = quais professores são alavancas reais). Policies são
-- PERMISSIVAS → OR-combinam com a do coach.
drop policy if exists "invites admin select" on public.invites;
create policy "invites admin select" on public.invites
  for select to authenticated
  using (
    exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'super_admin'
    )
  );

-- SEM policies de INSERT/UPDATE/DELETE: toda escrita passa pela RPC abaixo.

-- ===========================================================================
-- 4. RPC coach_invite_student — gera OU reusa o convite do aluno
-- ===========================================================================
-- Retorna o token para o app montar a URL (/convite/{token}) e a mensagem do
-- WhatsApp. Idempotente por natureza: chamar de novo com convite pending devolve
-- O MESMO token (só conta mais um disparo).
--
-- SEGURANÇA (a ordem das guardas importa):
--   a) sessão      — auth.uid() não nulo;
--   b) papel       — user_roles.role = 'coach';
--   c) posse       — o aluno é DELE (members.coach_id = uid, role player, ativo).
-- O parâmetro é só o id do aluno: coach_id vem de auth.uid() no servidor, então
-- não existe payload capaz de criar convite em nome de outro professor. Erro
-- BARULHENTO (raise) em escrita, conforme a regra da casa.
create or replace function public.coach_invite_student(p_student_id uuid)
returns table (token text, status text, send_count integer)
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid       uuid := auth.uid();
  v_token   text;
  v_count   integer;
  v_attempt integer;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1 from public.user_roles where user_id = uid and role = 'coach'
  ) then
    raise exception 'not a coach';
  end if;

  -- Posse do aluno. Mesmo escopo das RPCs de escrita do roster (coach_id = uid,
  -- role player, active). Aluno de outro coach / inexistente / removido →
  -- mesma mensagem, sem revelar qual dos casos é.
  if not exists (
    select 1 from public.members
     where id = p_student_id
       and coach_id = uid
       and role = 'player'
       and active
  ) then
    raise exception 'student not found';
  end if;

  -- ---- REENVIO: já existe convite pending? Reusa o MESMO token. -----------
  -- Referências qualificadas (i.token, i.send_count): os nomes das colunas de
  -- retorno (token/status/send_count) são variáveis aqui dentro, e uma
  -- referência NÃO qualificada seria ambígua (erro de plpgsql).
  select i.token, i.send_count
    into v_token, v_count
    from public.invites i
   where i.student_member_id = p_student_id
     and i.status = 'pending'
     and i.kind = 'direct'
   limit 1;

  if found then
    update public.invites i
       set send_count  = v_count + 1,
           last_sent_at = now()
     where i.token = v_token;
    return query select v_token, 'pending'::text, (v_count + 1);
    return;
  end if;

  -- ---- PRIMEIRO CONVITE: gera o token e insere. --------------------------
  -- Reusa public.new_match_token (já em produção para os tokens de sala ao
  -- vivo): '{prefixo}-{32 hex}' via extensions.gen_random_bytes(16). Uma forma
  -- só de gerar segredo na casa. Prefixo 'IVT' = InViTe.
  --
  -- O laço cobre DOIS unique_violation possíveis, e o tratamento é o mesmo em
  -- ambos — reconsultar:
  --   * índice parcial (duplo-toque simultâneo do coach): já existe pending →
  --     devolve ele, o convite continua idempotente;
  --   * unique(token) (colisão de 128 bits, praticamente impossível): não há
  --     pending → sorteia outro token e repete.
  for v_attempt in 1..2 loop
    begin
      v_token := public.new_match_token('IVT');

      insert into public.invites
        (token, kind, student_member_id, coach_id, status, last_sent_at, send_count)
      values
        (v_token, 'direct', p_student_id, uid, 'pending', now(), 1);

      return query select v_token, 'pending'::text, 1;
      return;

    exception when unique_violation then
      select i.token, i.send_count
        into v_token, v_count
        from public.invites i
       where i.student_member_id = p_student_id
         and i.status = 'pending'
         and i.kind = 'direct'
       limit 1;

      if found then
        return query select v_token, 'pending'::text, v_count;
        return;
      end if;
      -- Sem pending → foi colisão de token. Próxima volta sorteia outro.
    end;
  end loop;

  raise exception 'could not generate invite token';
end;
$$;

-- ===========================================================================
-- 5. GRANTS (regra da casa, aprendida 17-18/07/2026)
-- ===========================================================================
-- Os DEFAULT PRIVILEGES do Supabase concedem EXECUTE a anon em funções novas do
-- schema public, e `revoke from public` NÃO alcança esse grant direto. Trio
-- explícito. SECURITY DEFINER: roda como owner para escrever em invites, que o
-- usuário comum não pode (sem policy de INSERT). Só authenticated executa —
-- convite é ação de coach logado; anon só entra na Fatia B, por outra RPC.
revoke execute on function public.coach_invite_student(uuid) from public;
revoke execute on function public.coach_invite_student(uuid) from anon;
grant  execute on function public.coach_invite_student(uuid) to authenticated;

-- ===========================================================================
-- 6. RESERVA DO SLUG 'convite'
-- ===========================================================================
-- A rota da Fatia B é /convite/{token}. Hoje não há @username na raiz (a árvore
-- dinâmica só tem página em /[clube]/[esporte]/[quadra]), mas
-- check_username_available cruza members.slug / venues.slug / reserved_usernames
-- — reservar agora custa uma linha e evita que alguém pegue "convite" antes.
insert into public.reserved_usernames (slug, reason)
values ('convite', 'system')
on conflict (slug) do nothing;
