-- FATIA 3a da unificação: catálogo PÚBLICO de clubes/quadras para a jornada.
-- venues/courts têm RLS só-super_admin; a jornada é ANÔNIMA — então o acesso é
-- por RPC SECURITY DEFINER (bypass da RLS) que devolve SÓ branding público
-- (slug, nome, logo) + quadras ATIVAS. Mesmo padrão de get_sponsor_by_slug /
-- get_sponsor_for_court.
--
-- ⚠️ Esta fatia é CAMINHO MORTO: a migração cria as RPCs, mas a jornada
-- (club-opening) CONTINUA no CLUBS estático nesta entrega. Ligar na jornada
-- (união-com-piso) é a Fatia 3b. Nada aqui muda o comportamento em produção.
--
-- Idempotente (create or replace). Rodar no SQL Editor após verificação.

-- 1. Catálogo de UM clube por slug. Retorna jsonb:
--    { slug, name, logo_url, courts: [ { sport, slug, name } ] }
--    Clube inexistente/inativo → null. courts ordenadas por sport, sort, slug.
--    Slugs no banco já estão em minúsculas; normalizamos a ENTRADA por garantia.
create or replace function public.get_public_club(p_slug text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
  v_slug text;
  v_name text;
  v_logo text;
  v_courts jsonb;
begin
  -- Guarda de tamanho (mesmo padrão das RPCs anônimas): porta pública, limita o
  -- que um chamador pode despejar. Fora dos limites → null, sem tocar tabelas.
  if p_slug is null or length(p_slug) > 64 then
    return null;
  end if;

  select v.id, v.slug, v.name, v.logo_url
    into v_id, v_slug, v_name, v_logo
    from public.venues v
   where v.slug = lower(trim(p_slug))
     and v.active = true;

  -- Clube inexistente ou inativo: null (o caller trata como "não achei").
  if v_id is null then
    return null;
  end if;

  -- Quadras ATIVAS do clube, agregadas em array de objetos, na ordem de exibição.
  select coalesce(
           jsonb_agg(
             jsonb_build_object('sport', c.sport, 'slug', c.slug, 'name', c.name)
             order by c.sport, c.sort, c.slug
           ),
           '[]'::jsonb
         )
    into v_courts
    from public.courts c
   where c.venue_id = v_id
     and c.active = true;

  return jsonb_build_object(
    'slug', v_slug,
    'name', v_name,
    'logo_url', v_logo,
    'courts', v_courts
  );
end;
$$;

-- 2. Catálogo COMPLETO (todos os clubes ativos), mesmo formato por clube num
--    array. Para o TESTE DE EQUIVALÊNCIA (bundle ⊆ banco) e usos futuros — NÃO
--    é para o caminho crítico da jornada.
create or replace function public.get_public_clubs()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_result jsonb;
begin
  select coalesce(
           jsonb_agg(clube order by clube->>'slug'),
           '[]'::jsonb
         )
    into v_result
    from (
      select jsonb_build_object(
               'slug', v.slug,
               'name', v.name,
               'logo_url', v.logo_url,
               'courts', coalesce(
                 (select jsonb_agg(
                           jsonb_build_object('sport', c.sport, 'slug', c.slug, 'name', c.name)
                           order by c.sport, c.sort, c.slug
                         )
                    from public.courts c
                   where c.venue_id = v.id
                     and c.active = true),
                 '[]'::jsonb
               )
             ) as clube
        from public.venues v
       where v.active = true
    ) s;

  return v_result;
end;
$$;

-- 3. GRANTS. Os DEFAULT PRIVILEGES do Supabase concedem EXECUTE a anon em
--    funções novas do schema public; revoke from public NÃO alcança esse grant
--    direto. Trio explícito. anon é INTENCIONAL (jornada anônima), como as RPCs
--    get_sponsor_by_slug / get_sponsor_for_court / log_court_visit.
revoke execute on function public.get_public_club(text) from public;
revoke execute on function public.get_public_club(text) from anon;
grant execute on function public.get_public_club(text) to anon, authenticated;

revoke execute on function public.get_public_clubs() from public;
revoke execute on function public.get_public_clubs() from anon;
grant execute on function public.get_public_clubs() to anon, authenticated;
