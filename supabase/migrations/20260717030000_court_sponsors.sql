-- Peça B: patrocinador POR QUADRA (court_sponsors) + patrocinador geral do
-- clube (venues.default_sponsor_id) + RPC de resolução com precedência.
--
-- Não mexe na get_sponsor_by_slug (peça A) nem no ADS: a rota /[ad] impressa
-- continua resolvendo por slug. Esta peça é o caminho da ROTA BASE — sem /[ad]
-- na URL — que passa a descobrir o patrocinador consultando a associação da
-- quadra, com o "geral do clube" como fallback.
--
-- Seed VAZIO por decisão de produto: nenhuma associação nasce pronta. Sem
-- associação e sem default = nenhum logo (idêntico ao comportamento de hoje).
--
-- Idempotente. Rodar no SQL Editor do Supabase após verificação.

-- 1. Associação quadra → patrocinador. Estado ATUAL (uma quadra, um
--    patrocinador): a PK composta já garante a unicidade, sem constraint extra.
--    venue_id (uuid), e não venue_slug: o slug do venue é editável, e a
--    associação não pode orfanar num rename. A RPC recebe o slug e faz o join.
create table if not exists public.court_sponsors (
  venue_id   uuid not null references public.venues(id) on delete cascade,
  sport      text not null,
  court_slug text not null,
  sponsor_id uuid not null references public.sponsors(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (venue_id, sport, court_slug)
);

-- RLS ligado e ZERO policies: leitura só via RPC (SECURITY DEFINER), padrão da
-- casa (court_visits, sponsors). Ninguém lê nem escreve a tabela direto.
alter table public.court_sponsors enable row level security;

-- 2. Patrocinador GERAL do clube: camada distinta, fallback das quadras sem
--    associação própria. null = clube sem patrocinador geral.
alter table public.venues
  add column if not exists default_sponsor_id uuid references public.sponsors(id);

-- 3. Resolução por quadra, MESMO shape de retorno da get_sponsor_by_slug
--    (TABLE(name, slug, sponsor_logo_url)) — logo_url sai aliasado. Devolve o
--    SLUG do patrocinador de propósito: o cliente grava esse slug na config, e
--    /jogo e /placar re-resolvem por ele via get_sponsor_by_slug. Sem o slug, o
--    round-trip quebraria.
--
--    Precedência: coalesce(court_sponsors → venues.default_sponsor_id). O join
--    em sponsors com active=true vem DEPOIS do coalesce — então um patrocinador
--    de quadra inativo resulta em vazio (não cai no default): o coalesce já
--    escolheu o id, e o filtro de ativo o descarta. É o comportamento pedido.
--
--    plpgsql, SECURITY DEFINER, search_path vazio → nomes qualificados public.*.
create or replace function public.get_sponsor_for_court(
  p_venue_slug text,
  p_sport text,
  p_court_slug text
)
returns table(name text, slug text, sponsor_logo_url text)
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Guarda de tamanho (mesmo padrão de log_court_visit): a porta é anônima, então
  -- limita o que um chamador pode despejar. Fora dos limites → vazio, sem tocar
  -- as tabelas.
  if p_venue_slug is null or length(p_venue_slug) > 64
     or p_sport is null or length(p_sport) > 32
     or p_court_slug is null or length(p_court_slug) > 64 then
    return;
  end if;

  return query
    select s.name, s.slug, s.logo_url as sponsor_logo_url
    from public.venues v
    join public.sponsors s
      on s.id = coalesce(
        (select cs.sponsor_id
           from public.court_sponsors cs
          where cs.venue_id = v.id
            and cs.sport = p_sport
            and cs.court_slug = p_court_slug),
        v.default_sponsor_id
      )
    where v.slug = p_venue_slug
      and v.active = true
      and s.active = true;
end;
$$;

-- Mesma blindagem de acesso da log_court_visit: tira o execute do PUBLIC e
-- concede explicitamente só a anon (jornada) e authenticated.
revoke execute on function public.get_sponsor_for_court(text, text, text) from public;
grant execute on function public.get_sponsor_for_court(text, text, text)
  to anon, authenticated;
