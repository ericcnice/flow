-- SISTEMA DE AVATAR / FATIA 1a: schema + Storage RLS + LGPD (só banco; o
-- upload/crop/UI é a 1b).
--
-- A foto CANÔNICA do usuário passa a viver em profiles.avatar_url (a URL pública
-- completa do Storage). Os arquivos ficam no bucket EXISTENTE 'flow-images'
-- (público p/ leitura) sob a pasta 'avatars/{uid}/'. A escrita é restrita ao
-- dono via RLS de storage.objects escopada a essa pasta. O delete_my_account
-- passa a apagar a foto (dado pessoal) na autoexclusão.
--
-- Idempotente. NÃO toca os avatars dos MEMBERS (paths diferentes no mesmo bucket,
-- geridos pelo admin via service_role/dashboard). Rodar no SQL Editor após
-- verificação pela IA do Supabase.

-- ===========================================================================
-- 1. COLUNA — foto canônica do usuário (nullable; guarda a URL pública do Storage)
-- ===========================================================================
alter table public.profiles add column if not exists avatar_url text;

-- ===========================================================================
-- 2. RLS de ESCRITA em storage.objects — SÓ o dono escreve na SUA pasta
--    'avatars/{uid}/' do bucket 'flow-images'. LEITURA continua pública (o bucket
--    já é público) → NÃO criamos policy de select (o telão futuro lê sem auth).
--    Escopo por PASTA: (foldername)[1]='avatars' AND (foldername)[2]=uid — não
--    alcança outros paths do bucket (avatars de members etc.).
-- ===========================================================================
drop policy if exists "avatar user insert own" on storage.objects;
create policy "avatar user insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'flow-images'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "avatar user update own" on storage.objects;
create policy "avatar user update own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'flow-images'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'flow-images'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "avatar user delete own" on storage.objects;
create policy "avatar user delete own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'flow-images'
    and (storage.foldername(name))[1] = 'avatars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- ===========================================================================
-- 3. EXCLUSÃO DE CONTA (LGPD) — agora também APAGA a foto do usuário. Corpo
--    espelha o atual (anonimiza matches; limpa profiles + deleted_at; limpa
--    metadata) + os passos novos (avatar_url null; remove objetos do Storage na
--    pasta do próprio uid). SECURITY DEFINER, guard auth.uid(), grants mantidos.
--    NÃO toca avatars de members (paths diferentes).
-- ===========================================================================
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

  -- Apaga os dados PESSOAIS (inclui a foto canônica) e marca a conta excluída.
  update public.profiles
     set name = null, email = null, phone = null, avatar_url = null, deleted_at = now()
   where id = uid;

  -- Remove os arquivos de avatar do usuário (dado pessoal) — só a pasta dele.
  -- Best effort: se não houver privilégio sobre storage.objects, não derruba a
  -- exclusão (o profiles.avatar_url null acima já esconde a foto na UI).
  begin
    delete from storage.objects
     where bucket_id = 'flow-images'
       and (storage.foldername(name))[1] = 'avatars'
       and (storage.foldername(name))[2] = uid::text;
  exception when others then
    null;
  end;

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
