-- LOGIN FASE A / A3.1: SCHEMA + RLS do ROSTER DO PROFESSOR.
--
-- O coach cadastra/lista/edita/remove os alunos DELE. Vínculo: members.coach_id
-- = auth.uid() do coach (= members.profile_id do coach, preenchido pela ponte A2).
-- Guardar o auth.uid() direto (e não members.id do coach) mantém a RLS uma
-- COMPARAÇÃO DE COLUNA — sem subquery em members, sem RECURSÃO de policy.
--
-- LEITURA: policy SELECT do coach (lê só os seus). ESCRITA: via RPCs SECURITY
-- DEFINER — o coach NUNCA envia coach_id (o servidor seta = auth.uid()), então
-- não há como forjar o dono nem escalar papel. members segue fechado para escrita
-- direta exceto super_admin.
--
-- Aditivo. NÃO toca as 4 policies super_admin, a ponte A2, check_username_available
-- nem user_roles. Idempotente. Rodar no SQL Editor após verificação.

-- ===========================================================================
-- 1. COLUNAS NOVAS em members (todas nullable, aditivas)
-- ===========================================================================
alter table public.members
  add column if not exists coach_id       uuid references public.profiles(id) on delete set null;
alter table public.members
  add column if not exists level           text; -- nível do aluno (opcional; queryável p/ campeonatos)
alter table public.members
  add column if not exists member_number   text; -- número de sócio (text: zeros à esquerda/letras)
alter table public.members
  add column if not exists class_schedule  text; -- horário de aula (texto livre)

-- Índice para a listagem do roster (coach lê where coach_id = auth.uid()).
create index if not exists members_coach_id_idx on public.members (coach_id);

-- ===========================================================================
-- 2. RLS — LEITURA do coach (as 4 policies super_admin ficam intactas; policies
--    são PERMISSIVAS → OR-combinam. O coach lê SÓ os alunos dele.)
-- ===========================================================================
drop policy if exists "members coach select own" on public.members;
create policy "members coach select own" on public.members
  for select to authenticated
  using (
    coach_id = auth.uid()
    and exists (
      select 1 from public.user_roles
      where user_id = auth.uid() and role = 'coach'
    )
  );
-- Sem policies de INSERT/UPDATE/DELETE para o coach — a escrita é só via as RPCs
-- abaixo (SECURITY DEFINER). members continua fechado para escrita direta.

-- ===========================================================================
-- 3. RPCs de ESCRITA (SECURITY DEFINER, set search_path '', só authenticated).
--    O coach nunca envia coach_id — o servidor seta = auth.uid().
-- ===========================================================================

-- ADICIONAR aluno. phone OPCIONAL (o aluno pode não ter celular ainda); se vier,
-- valida E.164 (mesma tranca de profiles.phone). club_slug herdado do coach.
create or replace function public.coach_add_student(
  p_name           text,
  p_phone          text default null,
  p_level          text default null,
  p_member_number  text default null,
  p_class_schedule text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid          uuid := auth.uid();
  v_club_slug  text;
  v_id         uuid;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- Só coach cadastra alunos.
  if not exists (
    select 1 from public.user_roles where user_id = uid and role = 'coach'
  ) then
    raise exception 'not a coach';
  end if;

  -- Nome obrigatório; guardas de tamanho.
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'name required';
  end if;
  if length(p_name) > 120
     or coalesce(length(p_phone), 0) > 20
     or coalesce(length(p_level), 0) > 40
     or coalesce(length(p_member_number), 0) > 40
     or coalesce(length(p_class_schedule), 0) > 120 then
    raise exception 'field too long';
  end if;

  -- Celular opcional; se vier, precisa ser E.164 válido.
  if p_phone is not null and p_phone !~ '^\+[1-9]\d{6,14}$' then
    raise exception 'invalid phone';
  end if;

  -- club_slug herdado do member-coach (o aluno fica no mesmo clube do professor;
  -- null se o coach não tiver clube).
  select club_slug into v_club_slug
    from public.members
   where profile_id = uid and role = 'coach'
   limit 1;

  insert into public.members
    (name, phone, level, member_number, class_schedule, coach_id, role, active, club_slug)
  values
    (trim(p_name), p_phone, p_level, p_member_number, p_class_schedule, uid, 'player', true, v_club_slug)
  returning id into v_id;

  return v_id;
end;
$$;

-- EDITAR aluno. O where escopa ao PRÓPRIO coach + role player; não toca coach_id
-- nem role (nem estão nos parâmetros). Se não for aluno dele → 0 linhas, silencioso.
create or replace function public.coach_update_student(
  p_student_id     uuid,
  p_name           text,
  p_phone          text,
  p_level          text,
  p_member_number  text,
  p_class_schedule text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.user_roles where user_id = uid and role = 'coach'
  ) then
    raise exception 'not a coach';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'name required';
  end if;
  if length(p_name) > 120
     or coalesce(length(p_phone), 0) > 20
     or coalesce(length(p_level), 0) > 40
     or coalesce(length(p_member_number), 0) > 40
     or coalesce(length(p_class_schedule), 0) > 120 then
    raise exception 'field too long';
  end if;
  if p_phone is not null and p_phone !~ '^\+[1-9]\d{6,14}$' then
    raise exception 'invalid phone';
  end if;

  update public.members
     set name           = trim(p_name),
         phone          = p_phone,
         level          = p_level,
         member_number  = p_member_number,
         class_schedule = p_class_schedule
   where id = p_student_id
     and coach_id = uid
     and role = 'player';
end;
$$;

-- REMOVER aluno = SOFT-DELETE (active=false; preserva histórico, reversível).
-- Escopado ao próprio coach + role player.
create or replace function public.coach_remove_student(p_student_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.user_roles where user_id = uid and role = 'coach'
  ) then
    raise exception 'not a coach';
  end if;

  update public.members
     set active = false
   where id = p_student_id
     and coach_id = uid
     and role = 'player';
end;
$$;

-- ===========================================================================
-- 4. GRANTS (regra da casa): DEFAULT PRIVILEGES concedem execute a anon; revoke
--    from public não alcança. Trio explícito nas 3 RPCs. SECURITY DEFINER escreve
--    em members (que o usuário comum não pode por RLS).
-- ===========================================================================
revoke execute on function public.coach_add_student(text, text, text, text, text) from public;
revoke execute on function public.coach_add_student(text, text, text, text, text) from anon;
grant  execute on function public.coach_add_student(text, text, text, text, text) to authenticated;

revoke execute on function public.coach_update_student(uuid, text, text, text, text, text) from public;
revoke execute on function public.coach_update_student(uuid, text, text, text, text, text) from anon;
grant  execute on function public.coach_update_student(uuid, text, text, text, text, text) to authenticated;

revoke execute on function public.coach_remove_student(uuid) from public;
revoke execute on function public.coach_remove_student(uuid) from anon;
grant  execute on function public.coach_remove_student(uuid) to authenticated;
