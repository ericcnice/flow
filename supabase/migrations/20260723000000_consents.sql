-- LOGIN FASE A / A1.3d: CONSENTIMENTOS + LGPD. Aceite de T&C (versionado),
-- opt-in de marketing (separado), e exclusão de conta = SOFT-DELETE +
-- ANONIMIZAÇÃO (apaga dados pessoais; anula owner_id das partidas; PRESERVA os
-- nomes no result jsonb das súmulas — registro histórico esportivo). NÃO deleta
-- de auth.users. Idempotente. Rodar no SQL Editor após verificação.

-- 1. Marca de conta excluída/anonimizada (o login fica órfão, sem dado pessoal).
alter table public.profiles add column if not exists deleted_at timestamptz;

-- 2. CONSENTIMENTOS — tabela própria (não colunas em profiles): separa a
--    responsabilidade e permite evoluir para log de versões. Estado ATUAL por
--    usuário (1 linha): `tos_version` guarda QUAL versão foi aceita → o app
--    compara com a TOS_VERSION do código para detectar mudança dos termos.
create table if not exists public.consents (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  tos_version          text,
  tos_accepted_at      timestamptz,
  marketing_opt_in     boolean not null default false,
  marketing_updated_at timestamptz,
  updated_at           timestamptz not null default now()
);

-- RLS self (o usuário lê/grava o PRÓPRIO consentimento). Sem delete (a linha
-- morre por cascade se o auth.users sumir; aqui não deletamos auth.users).
alter table public.consents enable row level security;

revoke all on public.consents from anon;
revoke all on public.consents from authenticated;
grant select, insert, update on public.consents to authenticated;

drop policy if exists "consents self select" on public.consents;
create policy "consents self select" on public.consents
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "consents self insert" on public.consents;
create policy "consents self insert" on public.consents
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "consents self update" on public.consents;
create policy "consents self update" on public.consents
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 3. EXCLUSÃO DE CONTA (LGPD) — SECURITY DEFINER (bypassa RLS), só o PRÓPRIO
--    auth.uid(). Apaga cadastro/contato; anula posse das partidas (o result
--    jsonb com nomes fica INTACTO); tenta limpar o metadata pessoal (best
--    effort). NÃO deleta de auth.users. Idempotente (re-anula, inofensivo).
create or replace function public.delete_my_account()
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

  -- Anonimiza a POSSE (some do "meus jogos"); o placar + nomes sobrevivem.
  update public.matches set owner_id = null where owner_id = uid;

  -- Apaga os dados PESSOAIS e marca a conta como excluída.
  update public.profiles
     set name = null, email = null, phone = null, deleted_at = now()
   where id = uid;

  -- Limpa o metadata pessoal do auth.users (username/foto/nome). Best effort:
  -- se o papel não puder escrever em auth.users, o deleted_at acima já basta.
  begin
    update auth.users
       set raw_user_meta_data =
         coalesce(raw_user_meta_data, '{}'::jsonb)
           - 'username' - 'avatar_url' - 'picture' - 'full_name' - 'name'
     where id = uid;
  exception when others then
    null;
  end;
end;
$$;

revoke execute on function public.delete_my_account() from public;
revoke execute on function public.delete_my_account() from anon;
grant execute on function public.delete_my_account() to authenticated;
