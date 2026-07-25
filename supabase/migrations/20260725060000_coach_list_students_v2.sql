-- SOBERANIA DE DADOS / FATIA 3 (parte A): a leitura do roster passa a devolver
-- EMAIL e IDADE do aluno cadastrado.
--
-- POR QUE O EMAIL: é dado de RETORNO do aluno (vem do login Google/OTP, como
-- tudo que ele declara), não algo que o professor digita. Serve para
-- DESAMBIGUAR homônimos — com dois "Eric Nice" no roster, é o email que
-- distingue um do outro na hora de anotar a aula.
--
-- POR QUE A IDADE, E POR QUE SEM O DIA: o professor PRECISA da idade para
-- organizar torneio (categoria sub-14, data de corte) — negar seria proteção no
-- lugar errado. Mas idade + mês/ano já cobrem categorização e corte (que usam
-- ano/mês, nunca dia), e é o DIA que transforma a data de nascimento num
-- identificador preciso (cruzamento/fraude). Então saem DERIVADOS:
--   idade               integer  → anos completos
--   nascimento_mes_ano  text     → 'MM/AAAA'
-- `birth_date` cru NUNCA sai desta função. O dia fica no banco.
--
-- É exatamente por isso que a leitura é RPC e não policy: aqui o retorno é
-- escolhido campo a campo e dá para DERIVAR. Uma policy em profiles entregaria
-- a LINHA inteira, com o dia junto (RLS filtra linha, não coluna).
--
-- ⚠️ DROP + CREATE, não `create or replace`: mudar o `returns table` muda o tipo
-- de retorno, e o Postgres recusa ("cannot change return type of existing
-- function"). Como o DROP leva os grants junto, o trio é REEMITIDO no fim —
-- diferente das outras migrações desta série, onde ele era preservado.
--
-- O resto da função é idêntico à v1 (20260725040000): display_name/
-- display_phone/avatar_url resolvidos, is_claimed, convite relevante, ordem
-- pelo nome mostrado. NÃO toca members, profiles, invites, coach_add_student,
-- coach_update_student, coach_remove_student, a jornada nem lib/scoring.
-- Idempotente. Rodar no SQL Editor após verificação.

drop function if exists public.coach_list_students();

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
  email               text,      -- NOVO: do profile, só p/ cadastrado ativo
  idade               integer,   -- NOVO: anos completos, derivado
  nascimento_mes_ano  text,      -- NOVO: 'MM/AAAA' — sem o dia, sempre
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
         x.email, x.idade, x.nascimento_mes_ano,
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

        -- EMAIL: idem. Aluno solto não tem email nenhum no member (o coach
        -- cadastra nome+celular), e conta excluída foi anonimizada.
        case
          when m.profile_id is not null and p.deleted_at is null then p.email
          else null
        end as email,

        -- IDADE em anos COMPLETOS. age() já respeita o aniversário do ano
        -- corrente — nada de dividir dias, que erra em bissexto e na véspera.
        case
          when m.profile_id is not null
           and p.deleted_at is null
           and p.birth_date is not null
          then extract(year from age(p.birth_date))::integer
          else null
        end as idade,

        -- MÊS/ANO. O to_char nunca inclui o dia: é a granularidade que sai da
        -- função, não uma formatação de conveniência.
        case
          when m.profile_id is not null
           and p.deleted_at is null
           and p.birth_date is not null
          then to_char(p.birth_date, 'MM/YYYY')
          else null
        end as nascimento_mes_ano,

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
-- GRANTS — obrigatórios aqui: o DROP acima apagou os privilégios da v1.
-- ===========================================================================
revoke execute on function public.coach_list_students() from public;
revoke execute on function public.coach_list_students() from anon;
grant  execute on function public.coach_list_students() to authenticated;
