-- LOGIN FASE A / A1.1: base de identidade no banco (sem UI ainda).
--  1) Corrige a segurança de public.profiles (hoje: RLS on + ZERO policies, e
--     anon com DML direto — falha dos DEFAULT PRIVILEGES). Passa a self-access.
--  2) CHECK de E.164 em profiles.phone (chave de identidade global).
--  3) reserved_usernames (clubes-alvo + sistema) — leitura só via RPC.
--  4) RPCs públicas de disponibilidade (username cruzado + celular) — boolean.
--
-- NÃO toca members/venues/courts, a jornada, lib/scoring nem as RPCs existentes.
-- Idempotente. Rodar no SQL Editor após verificação pela IA do Supabase.

-- ===========================================================================
-- 1. SEGURANÇA DE public.profiles
-- ===========================================================================
-- RLS já está ligado; reforço idempotente.
alter table public.profiles enable row level security;

-- Fecha o buraco: anon NÃO acessa profiles de forma alguma; authenticated só
-- SELECT/UPDATE (INSERT é da trigger handle_new_user, que roda como owner e
-- ignora RLS/grants; DELETE nunca). O revoke total antes do grant limpa os
-- privilégios diretos herdados dos DEFAULT PRIVILEGES.
revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
grant select, update on public.profiles to authenticated;

-- SELF-ACCESS: cada um lê e edita SÓ o próprio perfil (auth.uid() = id). O
-- dashboard (guard.ts) lê o profile do PRÓPRIO super_admin (eq id = user.id),
-- então esta policy self já o cobre — sem policy extra de super_admin.
-- `create policy` não tem `if not exists`; o drop antes torna idempotente.
drop policy if exists "profiles self select" on public.profiles;
create policy "profiles self select" on public.profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);
-- Sem policy de INSERT/DELETE para usuário: INSERT é da trigger; DELETE, nunca.

-- ===========================================================================
-- 2. E.164 EM profiles.phone
-- ===========================================================================
-- Aceita só E.164 (+ código, 7 a 15 dígitos, começando 1-9) OU null. O front
-- normaliza (libphonenumber-js) e o banco é a tranca. NÃO toca members.phone.
-- (Pré-requisito verificado na checagem: nenhum profiles.phone atual viola isto
-- — o app nunca escreveu essa coluna, então devem estar todos null.)
alter table public.profiles drop constraint if exists profiles_phone_e164;
alter table public.profiles
  add constraint profiles_phone_e164
  check (phone is null or phone ~ '^\+[1-9]\d{6,14}$');

-- ===========================================================================
-- 3. USERNAMES RESERVADOS
-- ===========================================================================
create table if not exists public.reserved_usernames (
  slug       text primary key,
  reason     text not null check (reason in ('club', 'system')),
  created_at timestamptz not null default now()
);

-- RLS on + ZERO policies: leitura SÓ via RPC (SECURITY DEFINER), padrão das
-- tabelas fechadas da casa. anon sem acesso direto (belt-and-suspenders).
alter table public.reserved_usernames enable row level security;
revoke all on public.reserved_usernames from anon;

-- Seed idempotente. Clubes-alvo comerciais ('club') — ninguém vira "pinheiros"
-- se o clube pinheiros é alvo. Sistema ('system') — rotas/termos reservados.
insert into public.reserved_usernames (slug, reason) values
  ('pinheiros', 'club'), ('paulistano', 'club'), ('hebraica', 'club'),
  ('corinthians', 'club'), ('palmeiras', 'club'), ('sao-paulo', 'club'),
  ('santos', 'club'), ('flamengo', 'club'), ('fluminense', 'club'),
  ('hipica-sp', 'club'), ('hipica-campinas', 'club'), ('harmonia', 'club'),
  ('esperia', 'club'), ('sirio', 'club'), ('monte-libano', 'club'),
  ('ipe', 'club'), ('spac', 'club'),
  ('admin', 'system'), ('api', 'system'), ('app', 'system'),
  ('flow', 'system'), ('root', 'system'), ('suporte', 'system'),
  ('support', 'system'), ('help', 'system'), ('login', 'system'),
  ('signup', 'system'), ('auth', 'system'), ('dashboard', 'system'),
  ('sobre', 'system'), ('about', 'system'), ('contato', 'system'),
  ('contact', 'system'), ('termos', 'system'), ('terms', 'system'),
  ('privacidade', 'system'), ('privacy', 'system')
on conflict (slug) do nothing;

-- ===========================================================================
-- 4. RPCs PÚBLICAS DE DISPONIBILIDADE (retornam SÓ boolean — nunca vazam quem
--    já tem). Checagem em tempo real durante o cadastro.
-- ===========================================================================

-- USERNAME: disponível = formato OK E não existe cruzado (members.slug,
-- venues.slug, reserved_usernames). Formato: 3-30, minúsculas/números/hífen,
-- começando por alfanumérico. Normaliza (lower/trim) — "PINHEIROS" cai no
-- reservado "pinheiros" e retorna false.
create or replace function public.check_username_available(p_username text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v text;
begin
  -- Guarda de tamanho (porta pública): fora dos limites → indisponível.
  if p_username is null or length(p_username) > 30 then
    return false;
  end if;

  v := lower(trim(p_username));

  -- Formato canônico do slug (mín. 3, máx. 30). Inválido → indisponível.
  if v !~ '^[a-z0-9][a-z0-9-]{2,29}$' then
    return false;
  end if;

  -- Cruzado: pessoa, clube, reservado. Qualquer hit → indisponível.
  if exists (select 1 from public.members where slug = v) then return false; end if;
  if exists (select 1 from public.venues where slug = v) then return false; end if;
  if exists (select 1 from public.reserved_usernames where slug = v) then return false; end if;

  return true;
end;
$$;

-- CELULAR: disponível = E.164 válido E não existe em profiles.phone. Formato
-- inválido → false (não é "verificável").
create or replace function public.check_phone_available(p_phone text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_phone is null or length(p_phone) > 20 then
    return false;
  end if;

  if p_phone !~ '^\+[1-9]\d{6,14}$' then
    return false;
  end if;

  if exists (select 1 from public.profiles where phone = p_phone) then
    return false;
  end if;

  return true;
end;
$$;

-- GRANTS. Trio explícito (DEFAULT PRIVILEGES concedem execute a anon; revoke
-- from public não alcança esse grant direto). anon é INTENCIONAL: o check em
-- tempo real acontece durante o cadastro, que pode PRECEDER a sessão (o usuário
-- escolhe username/celular antes de o login existir). As RPCs devolvem só
-- boolean — não vazam identidade.
revoke execute on function public.check_username_available(text) from public;
revoke execute on function public.check_username_available(text) from anon;
grant execute on function public.check_username_available(text) to anon, authenticated;

revoke execute on function public.check_phone_available(text) from public;
revoke execute on function public.check_phone_available(text) from anon;
grant execute on function public.check_phone_available(text) to anon, authenticated;
