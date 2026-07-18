-- Peça C.1: RPCs de administração de patrocinadores (sponsors) para o dashboard.
--
-- POR QUE RPC E NÃO .from('sponsors'): a tabela sponsors tem RLS LIGADO e ZERO
-- policies (ver 20260717020000_sponsors.sql) — ninguém lê nem escreve direto,
-- nem super_admin. O dashboard usa anon key + sessão nos cookies (NÃO
-- service_role), então toda a administração passa por estas funções SECURITY
-- DEFINER, no mesmo molde da get_venue_visit_stats: a função roda com os
-- privilégios do OWNER, e a autorização real mora na GUARDA de super_admin no
-- corpo (auth.uid() lê o JWT da requisição e funciona sob SECURITY DEFINER).
--
-- LEITURA (list_sponsors) falha em SILÊNCIO (return vazio) se não for
-- super_admin — igual à get_venue_visit_stats. ESCRITA (create/update/
-- set_active) falha com RAISE EXCEPTION — o caller (Server Action) traduz a
-- mensagem para erro de formulário legível.
--
-- Padrões da casa em TODAS: plpgsql, security definer, set search_path to ''
-- (nomes public.* qualificados), guardas de tamanho, revoke execute from public
-- + grant to authenticated (a autorização fina é a guarda no corpo).
--
-- Idempotente (create or replace). Rodar no SQL Editor do Supabase após verificação.

-- 1. LISTAGEM para o painel. Leitura só via esta RPC (a tabela é ilegível
--    direto). left join em members para trazer o nome de exibição da pessoa
--    vinculada (null quando é marca solta). Ordena por name.
create or replace function public.list_sponsors()
returns table(
  id          uuid,
  slug        text,
  name        text,
  logo_url    text,
  member_id   uuid,
  member_name text,
  active      boolean,
  created_at  timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Só super_admin lista. Sem o papel → vazio (não erro): a leitura falha em
  -- silêncio, exatamente como a get_venue_visit_stats.
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'super_admin'
  ) then
    return;
  end if;

  return query
    select
      s.id,
      s.slug,
      s.name,
      s.logo_url,
      s.member_id,
      nullif(trim(concat_ws(' ', m.name, m.last_name)), '') as member_name,
      s.active,
      s.created_at
    from public.sponsors s
    left join public.members m on m.id = s.member_id
    order by s.name;
end;
$$;

-- 2. CRIAÇÃO. Retorna o id gerado. Guarda de escrita ABORTA (raise exception) —
--    nunca silenciosa. Valida slug/name/logo_url; unique_violation no slug vira
--    mensagem clara; se p_member_id vier, a pessoa precisa existir.
create or replace function public.create_sponsor(
  p_slug      text,
  p_name      text,
  p_logo_url  text,
  p_member_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
begin
  -- Guarda de ESCRITA: sem super_admin, aborta (não silencioso). O caller
  -- traduz para erro de formulário.
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'super_admin'
  ) then
    raise exception 'não autorizado.';
  end if;

  -- Normaliza. slug é canônico e definitivo: minúsculas, [a-z0-9-].
  p_slug     := lower(trim(coalesce(p_slug, '')));
  p_name     := trim(coalesce(p_name, ''));
  p_logo_url := trim(coalesce(p_logo_url, ''));

  -- Validações + guardas de tamanho (padrão da casa: limita o que uma porta
  -- authenticated pode despejar).
  if p_slug !~ '^[a-z0-9-]+$' or length(p_slug) > 64 then
    raise exception 'slug inválido: use só minúsculas, números e hífen (até 64).';
  end if;
  if length(p_name) < 1 or length(p_name) > 120 then
    raise exception 'nome inválido: 1 a 120 caracteres.';
  end if;
  if p_logo_url !~ '^https://' or length(p_logo_url) > 500 then
    raise exception 'logo inválido: a URL precisa começar com https:// (até 500 caracteres).';
  end if;

  -- Vínculo opcional: se veio member_id, a pessoa tem que existir.
  if p_member_id is not null
     and not exists (select 1 from public.members m where m.id = p_member_id) then
    raise exception 'pessoa vinculada não encontrada.';
  end if;

  insert into public.sponsors (slug, name, logo_url, member_id)
  values (p_slug, p_name, p_logo_url, p_member_id)
  returning id into v_id;

  return v_id;
exception
  -- Só a colisão de slug (único campo unique em sponsors). As guardas acima
  -- levantam sqlstate P0001 (raise_exception), que NÃO cai aqui e propaga.
  when unique_violation then
    raise exception 'slug já existe: escolha outro.';
end;
$$;

-- 3. EDIÇÃO. Mesmas guardas e validações do create.
--
--    ⚠️ Mudar o SLUG de um sponsor com histórico é PERMITIDO, mas o slug ANTIGO
--    já gravado em court_visits.sponsor_slug NÃO migra — a telemetria histórica
--    preserva o que foi REALMENTE mostrado à época, então um rename aqui não
--    reescreve o passado (o rollup por patrocinador do visit-stats pode passar a
--    contar o mesmo sponsor sob dois rótulos). O cache de cliente sponsor_${slug}
--    também é por slug: o nome novo só aparece em devices que ainda não cachearam.
create or replace function public.update_sponsor(
  p_id        uuid,
  p_slug      text,
  p_name      text,
  p_logo_url  text,
  p_member_id uuid default null
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'super_admin'
  ) then
    raise exception 'não autorizado.';
  end if;

  p_slug     := lower(trim(coalesce(p_slug, '')));
  p_name     := trim(coalesce(p_name, ''));
  p_logo_url := trim(coalesce(p_logo_url, ''));

  if p_slug !~ '^[a-z0-9-]+$' or length(p_slug) > 64 then
    raise exception 'slug inválido: use só minúsculas, números e hífen (até 64).';
  end if;
  if length(p_name) < 1 or length(p_name) > 120 then
    raise exception 'nome inválido: 1 a 120 caracteres.';
  end if;
  if p_logo_url !~ '^https://' or length(p_logo_url) > 500 then
    raise exception 'logo inválido: a URL precisa começar com https:// (até 500 caracteres).';
  end if;

  if p_member_id is not null
     and not exists (select 1 from public.members m where m.id = p_member_id) then
    raise exception 'pessoa vinculada não encontrada.';
  end if;

  update public.sponsors
     set slug      = p_slug,
         name      = p_name,
         logo_url  = p_logo_url,
         member_id = p_member_id
   where id = p_id;

  if not found then
    raise exception 'patrocinador não encontrado.';
  end if;
exception
  when unique_violation then
    raise exception 'slug já existe: escolha outro.';
end;
$$;

-- 4. ATIVAR / DESATIVAR (soft-delete). Nunca delete real: as FKs em
--    sponsors.member_id e court_sponsors.sponsor_id tornariam um delete
--    destrutivo (on delete cascade em court_sponsors apagaria associações).
--
--    ⚠️ Desativar um sponsor faz TODA quadra associada a ele em court_sponsors
--    ficar SEM patrocinador — e NÃO cair no default do clube. A
--    get_sponsor_for_court (20260717030000_court_sponsors.sql) aplica o filtro
--    active=true DEPOIS do coalesce(court_sponsors → default_sponsor_id): o
--    coalesce já escolheu o id do sponsor da quadra, e o filtro de ativo o
--    descarta, resultando em vazio. É o comportamento pretendido.
create or replace function public.set_sponsor_active(p_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'super_admin'
  ) then
    raise exception 'não autorizado.';
  end if;

  update public.sponsors set active = p_active where id = p_id;

  if not found then
    raise exception 'patrocinador não encontrado.';
  end if;
end;
$$;

-- Blindagem de acesso (mesma da get_venue_visit_stats): tira o execute do PUBLIC
-- e concede só a authenticated. A autorização fina é a guarda de super_admin no
-- corpo de cada função.
revoke execute on function public.list_sponsors() from public;
grant  execute on function public.list_sponsors() to authenticated;

revoke execute on function public.create_sponsor(text, text, text, uuid) from public;
grant  execute on function public.create_sponsor(text, text, text, uuid) to authenticated;

revoke execute on function public.update_sponsor(uuid, text, text, text, uuid) from public;
grant  execute on function public.update_sponsor(uuid, text, text, text, uuid) to authenticated;

revoke execute on function public.set_sponsor_active(uuid, boolean) from public;
grant  execute on function public.set_sponsor_active(uuid, boolean) to authenticated;
