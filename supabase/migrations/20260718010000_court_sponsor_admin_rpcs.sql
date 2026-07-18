-- Peça C.2: RPCs de administração da associação patrocinador POR QUADRA
-- (court_sponsors) + patrocinador geral do clube (venues.default_sponsor_id).
--
-- Fecha o ciclo A/B/C.1: as tabelas e a resolução da jornada (get_sponsor_for_court)
-- já existem — aqui entra só o caminho de ESCRITA do dashboard. court_sponsors tem
-- RLS com ZERO policies (padrão da jornada anônima), então toda escrita/leitura
-- passa por estas funções SECURITY DEFINER, com guarda de super_admin no corpo.
--
-- LEITURA (list_court_sponsors) falha em SILÊNCIO (return vazio) sem o papel.
-- ESCRITA (set/remove/default) falha com RAISE EXCEPTION — a Server Action
-- traduz para erro de formulário legível.
--
-- ⚠️ sport aqui é o sportId CANÔNICO ('tennis','beach','tabletennis'…), NÃO o
-- slug de URL ('tenis','beachtennis','pingpong'). É o que a jornada grava e o
-- que get_sponsor_for_court recebe (ctx.sportId). O dashboard converte com
-- sportIdFromSlug antes de chamar estas RPCs.
--
-- Padrões da casa: plpgsql, security definer, set search_path to '' (nomes
-- public.* qualificados), guardas de tamanho. REGRA DOS GRANTS: revoke from
-- public + revoke from anon + grant to authenticated em TODAS.
--
-- Idempotente (create or replace). Rodar no SQL Editor do Supabase após verificação.

-- 1. LISTAGEM das associações de um venue, para o painel. Leitura só via RPC
--    (a tabela é ilegível direto). Join em sponsors traz nome/slug e o
--    sponsor_active — a UI usa isso para alertar "associação com sponsor inativo".
create or replace function public.list_court_sponsors(p_venue_id uuid)
returns table(
  sport          text,
  court_slug     text,
  sponsor_id     uuid,
  sponsor_name   text,
  sponsor_slug   text,
  sponsor_active boolean,
  updated_at     timestamptz
)
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Só super_admin lê. Sem o papel → vazio (não erro): leitura falha em silêncio.
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'super_admin'
  ) then
    return;
  end if;

  return query
    select
      cs.sport,
      cs.court_slug,
      cs.sponsor_id,
      s.name    as sponsor_name,
      s.slug    as sponsor_slug,
      s.active  as sponsor_active,
      cs.updated_at
    from public.court_sponsors cs
    join public.sponsors s on s.id = cs.sponsor_id
    where cs.venue_id = p_venue_id;
end;
$$;

-- 2. ASSOCIA (ou reassocia) um patrocinador a uma quadra. Upsert na PK composta.
--    O sponsor PODE estar inativo — é permitido de propósito (a UI alerta que a
--    quadra fica sem logo); o que não pode é o sponsor não existir.
create or replace function public.set_court_sponsor(
  p_venue_id   uuid,
  p_sport      text,
  p_court_slug text,
  p_sponsor_id uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Guarda de ESCRITA: aborta (não silencioso). O caller traduz.
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'super_admin'
  ) then
    raise exception 'não autorizado.';
  end if;

  -- Normaliza + guardas de tamanho (padrão da casa; espelha get_sponsor_for_court).
  p_sport      := lower(trim(coalesce(p_sport, '')));
  p_court_slug := lower(trim(coalesce(p_court_slug, '')));

  if length(p_sport) < 1 or length(p_sport) > 32 then
    raise exception 'esporte inválido.';
  end if;
  if length(p_court_slug) < 1 or length(p_court_slug) > 64 then
    raise exception 'quadra inválida.';
  end if;

  -- Venue e sponsor precisam existir. Sponsor inativo é PERMITIDO (só valida
  -- existência) — a precedência (inativo → vazio, não cai no default) é da
  -- get_sponsor_for_court, e a UI avisa.
  if not exists (select 1 from public.venues v where v.id = p_venue_id) then
    raise exception 'local não encontrado.';
  end if;
  if not exists (select 1 from public.sponsors s where s.id = p_sponsor_id) then
    raise exception 'patrocinador não encontrado.';
  end if;

  insert into public.court_sponsors (venue_id, sport, court_slug, sponsor_id, updated_at)
  values (p_venue_id, p_sport, p_court_slug, p_sponsor_id, now())
  on conflict (venue_id, sport, court_slug)
    do update set sponsor_id = excluded.sponsor_id, updated_at = now();
end;
$$;

-- 3. REMOVE a associação de uma quadra (dropdown "Nenhum" na UI). Sem associação,
--    a quadra passa a cair no default do clube (comportamento da jornada).
create or replace function public.remove_court_sponsor(
  p_venue_id   uuid,
  p_sport      text,
  p_court_slug text
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

  p_sport      := lower(trim(coalesce(p_sport, '')));
  p_court_slug := lower(trim(coalesce(p_court_slug, '')));

  delete from public.court_sponsors cs
   where cs.venue_id = p_venue_id
     and cs.sport = p_sport
     and cs.court_slug = p_court_slug;

  if not found then
    raise exception 'associação não encontrada.';
  end if;
end;
$$;

-- 4. DEFINE (ou LIMPA) o patrocinador GERAL do clube. p_sponsor_id null = limpar.
--    Camada de fallback das quadras sem associação própria.
create or replace function public.set_venue_default_sponsor(
  p_venue_id   uuid,
  p_sponsor_id uuid
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

  -- Se veio um sponsor, ele precisa existir. null = limpar (sem validação).
  if p_sponsor_id is not null
     and not exists (select 1 from public.sponsors s where s.id = p_sponsor_id) then
    raise exception 'patrocinador não encontrado.';
  end if;

  update public.venues set default_sponsor_id = p_sponsor_id where id = p_venue_id;

  if not found then
    raise exception 'local não encontrado.';
  end if;
end;
$$;

-- REGRA DOS GRANTS (CLAUDE.md): os DEFAULT PRIVILEGES do Supabase dão EXECUTE a
-- anon em funções novas; revoke from public NÃO alcança. Trio explícito em todas.
-- Nenhuma destas é da jornada anônima, então anon fica de fora de todas.
revoke execute on function public.list_court_sponsors(uuid) from public;
revoke execute on function public.list_court_sponsors(uuid) from anon;
grant  execute on function public.list_court_sponsors(uuid) to authenticated;

revoke execute on function public.set_court_sponsor(uuid, text, text, uuid) from public;
revoke execute on function public.set_court_sponsor(uuid, text, text, uuid) from anon;
grant  execute on function public.set_court_sponsor(uuid, text, text, uuid) to authenticated;

revoke execute on function public.remove_court_sponsor(uuid, text, text) from public;
revoke execute on function public.remove_court_sponsor(uuid, text, text) from anon;
grant  execute on function public.remove_court_sponsor(uuid, text, text) to authenticated;

revoke execute on function public.set_venue_default_sponsor(uuid, uuid) from public;
revoke execute on function public.set_venue_default_sponsor(uuid, uuid) from anon;
grant  execute on function public.set_venue_default_sponsor(uuid, uuid) to authenticated;
