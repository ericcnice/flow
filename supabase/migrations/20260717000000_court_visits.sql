-- Peça D: log de acessos por quadra (court_visits) + RPC de escrita.
--
-- Independente das peças A/B (sponsors, court_sponsors): aqui `sponsor_slug` é
-- texto solto — registra o que FOI MOSTRADO no acesso. A FK para `sponsors`
-- entra na peça A, sem migração de dados, porque o slug é estável.
--
-- Rodar no SQL Editor do Supabase (ou via CLI). Idempotente: pode reexecutar.

create table if not exists public.court_visits (
  id           bigint generated always as identity primary key,
  venue_slug   text not null,
  sport        text not null,
  court_slug   text not null,
  -- Patrocinador exibido naquele acesso (adCfg.slug), ou null na rota base.
  sponsor_slug text,
  created_at   timestamptz not null default now()
);

-- Toda consulta de estatística é "as visitas DESTA quadra, mais recentes
-- primeiro": o índice cobre o filtro (venue, sport, court) e a ordenação.
create index if not exists court_visits_lookup_idx
  on public.court_visits (venue_slug, sport, court_slug, created_at desc);

-- RLS ligado e SEM policy nenhuma para anon (nem INSERT nem SELECT): o anônimo
-- NÃO toca a tabela diretamente — senão poderia forjar ou apagar contagem. A
-- única porta de entrada é a RPC abaixo.
alter table public.court_visits enable row level security;

-- SECURITY DEFINER: a função roda com os privilégios do dono (que é dono da
-- tabela e atravessa a RLS), então o INSERT passa sem dar ao anônimo qualquer
-- acesso direto. `search_path` fixo é a blindagem padrão de SECURITY DEFINER
-- contra sequestro de schema.
create or replace function public.log_court_visit(
  p_venue_slug  text,
  p_sport       text,
  p_court_slug  text,
  p_sponsor_slug text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.court_visits (venue_slug, sport, court_slug, sponsor_slug)
  values (p_venue_slug, p_sport, p_court_slug, p_sponsor_slug);
$$;

-- A RPC é a ÚNICA porta de escrita: a jornada de QR (anônima) e usuários
-- autenticados podem chamá-la; ninguém pode escrever na tabela por fora dela.
grant execute on function public.log_court_visit(text, text, text, text)
  to anon, authenticated;
