-- LOGIN FASE A / A2.1: a PONTE DO COACH (só a RPC; a chamada pós-login é a A2.2).
--
-- Quando um usuário loga com email VERIFICADO que casa `members.email` de um
-- coach AINDA NÃO reivindicado, a RPC:
--   (a) VINCULA  — members.profile_id = auth.uid() (o "claim");
--   (b) PROMOVE  — user_roles → 'coach' (upsert, nunca rebaixa admin).
-- Onboarding CURADO: o admin preenche members.email na conversa de onboarding;
-- o login apenas ATIVA. Match por email CONFIRMADO (Google/OTP) = seguro.
--
-- NÃO toca a trigger handle_new_user, o signup, o dashboard nem a Fase A.
-- Idempotente (safe chamar a cada login). Rodar no SQL Editor após verificação.

create or replace function public.claim_coach_membership()
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  uid        uuid := auth.uid();
  v_email    text;
  v_conf     timestamptz;
  v_member   uuid;
  v_claimed  integer;
begin
  -- Sem sessão → nada a fazer.
  if uid is null then
    return 'noop';
  end if;

  -- FONTE VERIFICADA: o email + a confirmação vêm do auth.users (não de
  -- profiles.email, que embora não editável na UI não é a prova). SÓ email
  -- CONFIRMADO promove — fecha qualquer caminho de email não-verificado.
  select email, email_confirmed_at
    into v_email, v_conf
    from auth.users
   where id = uid;

  if v_email is null or v_conf is null then
    return 'noop';
  end if;

  -- ALLOWLIST: um coach ATIVO, com esse email (normalizado), ainda SEM dono.
  -- Sem unique em members.email → limit 1 (desempate determinístico por id).
  select id
    into v_member
    from public.members
   where lower(email) = lower(v_email)
     and role = 'coach'
     and profile_id is null
     and active = true
   order by id
   limit 1;

  if v_member is null then
    return 'noop';
  end if;

  -- CLAIM concorrência-safe: só vincula se AINDA estiver sem dono. Se outra
  -- sessão reivindicou no intervalo, 0 linhas → aborta sem promover.
  update public.members
     set profile_id = uid
   where id = v_member
     and profile_id is null;

  get diagnostics v_claimed = row_count;
  if v_claimed = 0 then
    return 'noop';
  end if;

  -- PROMOÇÃO: user_roles → 'coach'. Upsert (a trigger já criou 'player'); nunca
  -- rebaixa um admin/super_admin (guarda no where do do-update).
  insert into public.user_roles (user_id, role)
  values (uid, 'coach')
  on conflict (user_id) do update
     set role = 'coach'
   where public.user_roles.role not in ('admin', 'super_admin');

  return 'promoted';
end;
$$;

-- GRANTS (regra da casa): DEFAULT PRIVILEGES concedem execute a anon em funções
-- novas; revoke from public NÃO alcança esse grant direto. Trio explícito.
-- SECURITY DEFINER: roda como owner para escrever em members/user_roles, que o
-- usuário comum não pode por RLS. Só authenticated executa.
revoke execute on function public.claim_coach_membership() from public;
revoke execute on function public.claim_coach_membership() from anon;
grant execute on function public.claim_coach_membership() to authenticated;
