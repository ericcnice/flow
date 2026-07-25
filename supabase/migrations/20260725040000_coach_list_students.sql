-- SOBERANIA DE DADOS / FATIA 1: a LEITURA do roster passa a resolver a
-- identidade do aluno CADASTRADO a partir do profile DELE.
--
-- O PROBLEMA: o card mostrava members.name — a anotação que o professor digitou
-- ("Pwer Io") — mesmo depois de o aluno criar conta e declarar o próprio nome
-- ("Eric Nice"). Quem tem conta é dono da própria identidade; o roster tem de
-- espelhar isso.
--
-- POR QUE UMA RPC E NÃO UM EMBED: public.profiles tem RLS SELF ("profiles self
-- select", 20260722020000_identity_base.sql) — o coach NÃO lê o profile do
-- aluno. Um embed members→profiles não daria erro: devolveria null em silêncio,
-- o app leria "esse aluno não tem profile" e seguiria mostrando o nome velho.
-- Falha muda em produção, invisível em dev (onde se testa com o próprio user).
--
-- POR QUE NÃO UMA POLICY EM profiles: RLS é por LINHA, não por coluna. Abrir a
-- linha do aluno para o coach entregaria birth_date junto — dado que existe
-- justamente para separar menor de adulto. Aqui o retorno é escolhido a dedo e
-- birth_date fica FISICAMENTE fora da função.
--
-- Aditivo: 1 índice + 1 função NOVA. NÃO toca members, profiles, invites,
-- coach_add_student, coach_update_student (a trava de escrita é a Fatia 2),
-- coach_remove_student, a jornada nem lib/scoring. Idempotente. Rodar no SQL
-- Editor após verificação.

-- ===========================================================================
-- 1. ÍNDICE — a RPC junta por members.profile_id (só havia índice em coach_id)
-- ===========================================================================
create index if not exists members_profile_id_idx on public.members (profile_id);

-- ===========================================================================
-- 2. RPC coach_list_students — a lista do roster, já resolvida
-- ===========================================================================
-- Substitui a query direta + o embed de invites que o app fazia. Uma viagem só,
-- com a identidade resolvida e a ordenação pelo nome que aparece na tela.
create or replace function public.coach_list_students()
returns table (
  id                  uuid,
  level               text,
  member_number       text,
  class_schedule      text,
  is_claimed          boolean,   -- profile_id não é nulo = o aluno é dono de si
  display_name        text,
  display_phone       text,
  avatar_url          text,
  invite_token        text,
  invite_status       text,
  invite_last_sent_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid uuid := auth.uid();
begin
  -- Leitura: falha em SILÊNCIO (return vazio), nunca raise — regra da casa.
  if uid is null then
    return;
  end if;

  if not exists (
    select 1 from public.user_roles where user_id = uid and role = 'coach'
  ) then
    return;
  end if;

  -- Subquery + order externo: assim o ORDER BY usa o display_name JÁ CALCULADO,
  -- sem repetir o case (e sem esbarrar nos nomes das colunas de retorno, que
  -- aqui dentro são variáveis).
  return query
  select x.id, x.level, x.member_number, x.class_schedule,
         x.is_claimed, x.display_name, x.display_phone, x.avatar_url,
         x.invite_token, x.invite_status, x.invite_last_sent_at
    from (
      select
        m.id,
        m.level,
        m.member_number,
        m.class_schedule,
        (m.profile_id is not null) as is_claimed,

        -- IDENTIDADE RESOLVIDA. Três situações, nesta ordem:
        --  1) aluno SOLTO (sem conta)      → a anotação do professor;
        --  2) conta EXCLUÍDA (deleted_at)  → volta para a anotação: o profile
        --     foi anonimizado e mostrar o vazio dele apagaria o aluno da lista
        --     de quem ainda dá aula para ele;
        --  3) aluno CADASTRADO             → o que ELE declarou (com fallback
        --     no member se o profile ainda estiver sem nome).
        case
          when m.profile_id is null      then m.name
          when p.deleted_at is not null   then m.name
          else coalesce(p.name, m.name)
        end as display_name,

        case
          when m.profile_id is null      then m.phone
          when p.deleted_at is not null   then m.phone
          else coalesce(p.phone, m.phone)
        end as display_phone,

        -- Foto só de conta viva. Aluno solto não tem; conta excluída não mostra.
        case
          when m.profile_id is not null and p.deleted_at is null then p.avatar_url
          else null
        end as avatar_url,

        inv.token          as invite_token,
        inv.status         as invite_status,
        inv.last_sent_at   as invite_last_sent_at

      from public.members m
      left join public.profiles p
        on p.id = m.profile_id
      -- Convite MAIS RELEVANTE: o 'registered' manda; senão o 'pending' mais
      -- recente. 'revoked' fica de fora (não deve pintar badge nenhum).
      left join lateral (
        select i.token, i.status, i.last_sent_at
          from public.invites i
         where i.student_member_id = m.id
           and i.kind = 'direct'
           and i.status in ('registered', 'pending')
         order by case when i.status = 'registered' then 0 else 1 end,
                  i.last_sent_at desc nulls last
         limit 1
      ) inv on true

     where m.coach_id = uid
       and m.role = 'player'
       and m.active
    ) x
   order by x.display_name nulls last;
end;
$$;

-- ===========================================================================
-- 3. GRANTS (regra da casa)
-- ===========================================================================
-- Só authenticated: o roster é área de professor logado. anon nunca — esta
-- função enxerga profiles de terceiros por dentro (SECURITY DEFINER), então o
-- trio explícito importa mais aqui do que no resto.
revoke execute on function public.coach_list_students() from public;
revoke execute on function public.coach_list_students() from anon;
grant  execute on function public.coach_list_students() to authenticated;
