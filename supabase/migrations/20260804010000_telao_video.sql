-- TELÃO, Fatia 2a: a CONFIG DE VÍDEO sai do código e vai para a operação.
--
-- POR QUÊ: na Fatia 1 o canal do YouTube ficou hardcoded no catálogo estático.
-- Funciona, mas enterra no código uma informação que o PARCEIRO precisa mexer —
-- e foi exatamente esse tipo de detalhe invisível que fez o logo faltar sem
-- ninguém perceber. Config que alguém edita tem que estar onde essa pessoa
-- consegue ver.
--
-- DUAS FONTES DE VÍDEO, com precedência:
--   1. `telao_links.video_url` — vídeo PRÓPRIO daquela quadra (clube com uma
--      transmissão dedicada por quadra);
--   2. `telao_config.youtube_channel_id` — o canal do CLUBE, em modo "o que
--      estiver ao vivo agora" (uma transmissão só, que troca de jogo);
--   3. nenhum dos dois → quadra SEM vídeo: o telão mostra só o placar.
--
-- ⚠️ `view_token` VIRA NULLABLE, e não é detalhe. Uma quadra pode ter vídeo
-- configurado e NENHUMA partida ligada (é o estado normal entre jogos). Com a
-- coluna obrigatória, salvar o vídeo de uma quadra sem partida falharia — e o
-- operador levaria a culpa por um erro de modelagem.
--
-- Aditivo e idempotente. NÃO toca live_matches, matches, court_visits, venues,
-- sponsors nem RPC alguma. Rodar no SQL Editor após verificação.

-- ===========================================================================
-- 1. telao_links: vídeo por quadra + partida opcional
-- ===========================================================================
alter table public.telao_links
  add column if not exists video_url text;

alter table public.telao_links
  alter column view_token drop not null;

-- ===========================================================================
-- 2. telao_config: o canal do CLUBE (uma linha por venue)
-- ===========================================================================
create table if not exists public.telao_config (
  venue_slug         text primary key,
  -- ID do canal (UC...), usado no embed `live_stream?channel=`. Só o ID, nunca
  -- uma URL: o embed do YouTube não aceita outra coisa, e guardar o que ele
  -- aceita evita ter que adivinhar formato na hora de exibir.
  youtube_channel_id text,
  updated_at         timestamptz not null default now()
);

-- ===========================================================================
-- 3. GRANTS — a mesma regra da telao_links
-- ===========================================================================
-- RLS ligada e ZERO policies: nem anon nem authenticated tocam a tabela. O
-- acesso é só pelo SERVIDOR, depois de validar o token de operação.
--
-- ⚠️ O service_role BYPASSA a RLS mas AINDA PRECISA do grant de tabela — são
-- camadas separadas do PostgreSQL. Sem esta linha o telão falha EM SILÊNCIO
-- (config sempre vazia, sem erro em lugar nenhum). Foi o que já aconteceu com
-- a telao_links; aqui o grant vai junto desde o início.
alter table public.telao_config enable row level security;
revoke all on public.telao_config from anon;
revoke all on public.telao_config from authenticated;
grant all on public.telao_config to service_role;
