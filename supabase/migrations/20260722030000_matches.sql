-- LOGIN FASE A / A1.3a: HISTÓRICO de partidas — a recompensa por ter conta.
-- Snapshot AUTOCONTIDO (com nomes: "história precisa de nomes"). Dono = quem
-- encerrou a partida estando logado. Save por SELF-INSERT (o cliente insere com
-- o próprio uid; a RLS `with check owner_id = auth.uid()` é a tranca). Histórico
-- IMUTÁVEL: sem UPDATE. Na exclusão de conta (A1.3d) só o owner_id é anulado
-- (on delete set null) — o result jsonb com os nomes sobrevive como registro.
--
-- NÃO toca live_matches nem as RPCs do Realtime. Idempotente. Rodar no SQL
-- Editor após verificação.

create table if not exists public.matches (
  id         uuid primary key default gen_random_uuid(),
  -- null = conta excluída; a partida (placar + nomes) SOBREVIVE, sem dono.
  owner_id   uuid references auth.users(id) on delete set null,
  sport      text not null,              -- id CANÔNICO ('tennis','beach',…)
  venue_slug text,                        -- nullable (jogo genérico sem clube)
  court_slug text,                        -- nullable
  game_type  text,                        -- 'simples' | 'duplas'
  -- SNAPSHOT autocontido do resultado. Preservado para sempre (registro
  -- histórico esportivo), mesmo após a conta sair:
  --   { players:{blue1,blue2,red1,red2}, winner:'A'|'B', winnerName, loserName,
  --     sets:[{set,a,b,tiebreak?}], sportName, scoreType }
  result     jsonb not null,
  started_at timestamptz,
  ended_at   timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Listagem do perfil (A1.3c): "meus jogos" mais recentes primeiro.
create index if not exists matches_owner_ended_idx
  on public.matches (owner_id, ended_at desc);

-- RLS com policies SELF (mesmo padrão de courts): o dono lê/insere/apaga só o
-- próprio. SEM UPDATE (histórico imutável). anon nunca acessa.
alter table public.matches enable row level security;

revoke all on public.matches from anon;
revoke all on public.matches from authenticated;
grant select, insert, delete on public.matches to authenticated;

-- `create policy` não tem `if not exists`; o drop antes torna idempotente.
drop policy if exists "matches self select" on public.matches;
create policy "matches self select" on public.matches
  for select to authenticated
  using (owner_id = auth.uid());

drop policy if exists "matches self insert" on public.matches;
create policy "matches self insert" on public.matches
  for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "matches self delete" on public.matches;
create policy "matches self delete" on public.matches
  for delete to authenticated
  using (owner_id = auth.uid());
-- Sem policy de UPDATE: o histórico é imutável.
