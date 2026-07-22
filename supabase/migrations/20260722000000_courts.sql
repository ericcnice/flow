-- FATIA 1 da unificação de quadras: tabela public.courts (fonte de verdade das
-- quadras POR VENUE) + seed do estado atual. Nesta fatia só o DASHBOARD passa a
-- ler daqui; a JORNADA DE QR continua no CLUBS estático (lib/clubs-config.ts) —
-- risco zero no QR impresso. Reversível: dropar a tabela + reverter o painel.
--
-- `sport` é o id CANÔNICO ('tennis','beach','squash','tabletennis','padel',
-- 'pickleball') — o MESMO que court_visits/court_sponsors já gravam, então os
-- acessos e os patrocinadores casam sem conversão. `slug` é EXATO do QR
-- ('q1','q1-saibro') — precisa bater com os dados históricos.
--
-- Idempotente. Rodar no SQL Editor do Supabase após verificação.

-- 1. Tabela. venue_id (uuid) e não venue_slug: o slug do venue é editável e as
--    quadras não podem orfanar num rename (mesma decisão de court_sponsors).
create table if not exists public.courts (
  id         uuid primary key default gen_random_uuid(),
  venue_id   uuid not null references public.venues(id) on delete cascade,
  sport      text not null,
  slug       text not null,
  name       text not null,
  active     boolean not null default true,
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  unique (venue_id, sport, slug)
);

create index if not exists courts_venue_sport_idx
  on public.courts (venue_id, sport, sort, slug);

-- 2. RLS espelhando venues: super_admin exclusivo, acesso DIRETO com a sessão
--    (.from('courts')). Ao contrário das tabelas da jornada anônima
--    (court_sponsors/court_visits: RLS + zero policies + só-RPC), aqui há
--    policies porque o dashboard lê/escreve direto, autenticado.
--
--    anon NUNCA casa: as 4 policies são `to authenticated` e o revoke abaixo
--    tira qualquer grant direto de tabela do papel anônimo (defense in depth —
--    a REGRA DOS GRANTS do CLAUDE.md é sobre FUNÇÕES, mas o mesmo cuidado com
--    `anon` vale aqui de graça).
alter table public.courts enable row level security;

revoke all on public.courts from anon;

-- `create policy` não tem `if not exists`; o drop antes torna a migração
-- idempotente (roda de novo sem erro).
drop policy if exists "courts super_admin select" on public.courts;
create policy "courts super_admin select" on public.courts
  for select to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'super_admin'
    )
  );

drop policy if exists "courts super_admin insert" on public.courts;
create policy "courts super_admin insert" on public.courts
  for insert to authenticated
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'super_admin'
    )
  );

drop policy if exists "courts super_admin update" on public.courts;
create policy "courts super_admin update" on public.courts
  for update to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'super_admin'
    )
  );

drop policy if exists "courts super_admin delete" on public.courts;
create policy "courts super_admin delete" on public.courts
  for delete to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'super_admin'
    )
  );

-- 3. SEED. Slugs EXATOS dos QRs (batem com court_visits/court_sponsors).
--    O cross join com a linha do venue insere só se o venue existir (senão
--    zero linhas, sem erro). on conflict do nothing = idempotente.

-- SPAC (venue 'spac') — as quadras REAIS conforme a GRADE do dashboard.
-- NÃO semear tennis/q1 nem tennis/q3: aparecem na telemetria mas são quadras
-- FANTASMA (URLs digitadas à mão em testes; o SPAC não tem essas quadras).
insert into public.courts (venue_id, sport, slug, name, sort)
select v.id, x.sport, x.slug, x.name, x.sort
from public.venues v
cross join (values
  ('tennis',      'q1-saibro', 'Quadra 1 (saibro)', 1),
  ('tennis',      'q2-saibro', 'Quadra 2 (saibro)', 2),
  ('tennis',      'q3-saibro', 'Quadra 3 (saibro)', 3),
  ('tennis',      'q4-saibro', 'Quadra 4 (saibro)', 4),
  ('tennis',      'q5-saibro', 'Quadra 5 (saibro)', 5),
  ('tennis',      'q6-saibro', 'Quadra 6 (saibro)', 6),
  ('tennis',      'q7-saibro', 'Quadra 7 (saibro)', 7),
  ('tennis',      'q8-rapida', 'Quadra 8 (rápida)', 8),
  ('squash',      'q1',        'Quadra 1',          1),
  ('squash',      'q2',        'Quadra 2',          2),
  ('squash',      'q3',        'Quadra 3',          3),
  ('beach',       'q1',        'Quadra 1',          1),
  ('beach',       'q2',        'Quadra 2',          2),
  ('tabletennis', 'q1',        'Mesa 1',            1),
  ('tabletennis', 'q2',        'Mesa 2',            2)
) as x(sport, slug, name, sort)
where v.slug = 'spac'
on conflict (venue_id, sport, slug) do nothing;

-- FLOW CLUB (venue 'flow') — q1 e q2 para os SEIS esportes (espelha o CLUBS
-- criado para o clube demo). q1 = QRs dos posts de Instagram; q2 = demos.
insert into public.courts (venue_id, sport, slug, name, sort)
select v.id, x.sport, x.slug, x.name, x.sort
from public.venues v
cross join (values
  ('tennis',      'q1', 'Quadra 1', 1),
  ('tennis',      'q2', 'Quadra 2', 2),
  ('beach',       'q1', 'Quadra 1', 1),
  ('beach',       'q2', 'Quadra 2', 2),
  ('padel',       'q1', 'Quadra 1', 1),
  ('padel',       'q2', 'Quadra 2', 2),
  ('squash',      'q1', 'Quadra 1', 1),
  ('squash',      'q2', 'Quadra 2', 2),
  ('tabletennis', 'q1', 'Mesa 1',   1),
  ('tabletennis', 'q2', 'Mesa 2',   2),
  ('pickleball',  'q1', 'Quadra 1', 1),
  ('pickleball',  'q2', 'Quadra 2', 2)
) as x(sport, slug, name, sort)
where v.slug = 'flow'
on conflict (venue_id, sport, slug) do nothing;
