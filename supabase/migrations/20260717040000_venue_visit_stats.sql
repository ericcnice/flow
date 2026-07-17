-- Peça E, fatia 1: agregação de acessos por venue, para o dashboard.
--
-- Leitura de court_visits pelo painel. A tabela tem RLS com ZERO policies (só a
-- RPC de escrita log_court_visit toca nela), então o dashboard NÃO consegue lê-la
-- direto — daí esta RPC de agregação, SECURITY DEFINER, restrita a super_admin.
-- Faz o group by no Postgres (uma passada) e devolve poucas linhas; os rollups
-- (total, por esporte, por quadra, por patrocinador) o cliente monta em JS.
--
-- Idempotente. Rodar no SQL Editor do Supabase após verificação.

create or replace function public.get_venue_visit_stats(p_venue_slug text, p_days int)
returns table(sport text, court_slug text, sponsor_slug text, visitas bigint)
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Guarda de tamanho (padrão da casa) + faixa de dias. Fora dos limites → vazio,
  -- sem tocar a tabela. 3650 = ~10 anos, teto são para o "total".
  if p_venue_slug is null or length(p_venue_slug) > 64
     or p_days is null or p_days < 1 or p_days > 3650 then
    return;
  end if;

  -- Só super_admin lê estatística. O grant é para `authenticated` (qualquer
  -- logado poderia chamar), então a autorização real mora AQUI: sem o papel, a
  -- função retorna vazio em vez de dados. auth.uid() lê o JWT da requisição e
  -- funciona normalmente sob SECURITY DEFINER.
  if not exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role = 'super_admin'
  ) then
    return;
  end if;

  return query
    select v.sport, v.court_slug, v.sponsor_slug, count(*)::bigint
    from public.court_visits v
    where v.venue_slug = p_venue_slug
      and v.created_at >= now() - make_interval(days => p_days)
    group by v.sport, v.court_slug, v.sponsor_slug;
end;
$$;

-- Tira o execute do PUBLIC e concede só a authenticated (a autorização fina é a
-- guarda de super_admin no corpo).
revoke execute on function public.get_venue_visit_stats(text, int) from public;
grant execute on function public.get_venue_visit_stats(text, int) to authenticated;
