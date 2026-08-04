-- TELÃO: a ligação QUADRA → PARTIDA ATIVA.
--
-- O PROBLEMA QUE ELA RESOLVE: o telão roda numa TV, e quem opera está no
-- celular. São DOIS APARELHOS — então a ligação não pode viver em
-- localStorage; precisa de um lugar no servidor que os dois enxerguem.
--
-- É a ligação MANUAL: o parceiro cola o link de transmissão da partida que está
-- naquela quadra. A resolução automática ("qual jogo está na q1 agora?") não
-- existe porque o contexto de quadra NÃO é gravado na sala ao vivo hoje — e,
-- mais importante, ela carregaria uma decisão de privacidade (tornar
-- descobrível o view_token de qualquer partida de um clube) que não se toma
-- para atender um piloto.
--
-- ⚠️ NENHUMA POLICY, de propósito: a tabela guarda `view_token`, que é segredo
-- de compartilhamento. Sem RLS fechada, um `select` do cliente anônimo
-- entregaria a transmissão de todas as quadras de todos os clubes. O acesso é
-- só pelo SERVIDOR (service_role), que valida o token de operação antes.
--
-- Aditivo: tabela NOVA, sem função nova. NÃO toca live_matches, matches,
-- court_visits, venues, sponsors nem RPC alguma. Idempotente.
-- Rodar no SQL Editor do Supabase após verificação.

create table if not exists public.telao_links (
  venue_slug text not null,
  court_slug text not null,
  -- O segredo de LEITURA da sala (nunca o edit_token: o telão é EXIBIÇÃO e não
  -- tem por que poder escrever no placar de ninguém).
  view_token text not null,
  match_id   uuid,
  updated_at timestamptz not null default now(),
  primary key (venue_slug, court_slug)
);

-- RLS ligada e ZERO policies: ninguém lê nem escreve direto, nem anon nem
-- authenticated. Só o service_role (que bypassa RLS) alcança, pelo servidor.
alter table public.telao_links enable row level security;
revoke all on public.telao_links from anon;
revoke all on public.telao_links from authenticated;
