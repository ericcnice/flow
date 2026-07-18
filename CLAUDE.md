# pwer-flow (Flow)

PWA offline-first de placar para esportes de raquete (tênis, beach, padel, squash, ping pong, pickleball), em flow.pwer.com.br. Next.js 15.5 (App Router) / React 19 / TypeScript / Supabase. Voz de árbitro estilo Grand Slam; funciona sem rede.

## Princípios invioláveis
- **Offline-first**: a jornada de QR nunca espera rede no caminho crítico; os timers das telas armam em t=0. Toda resolução de patrocinador tem fallback síncrono e timeout curto (2s) — pendurar na rede congelaria a abertura.
- **`lib/scoring`**: NUNCA modificar sem os 73 testes passando (`npm test`). É o núcleo do produto.
- **Jornada de QR em produção** (`components/club-opening.tsx`, rotas `app/[clube]/[esporte]/[quadra][/ad]`, `lib/supabase/sponsors.ts`, `lib/clubs-config.ts` / ADS): mudanças só com investigação prévia e escopo explícito. Slugs `ad1`/`ad2` já estão impressos em cartazes — nunca remover.
- **Antes de todo commit**: `npm test` + `npm run build`. NÃO usar claude-in-chrome; validação é só por test/build.

## Regras de banco (Supabase)
- **Tabelas da jornada anônima** (`sponsors`, `court_sponsors`, `court_visits`): RLS habilitado, ZERO policies. Acesso só via RPC `SECURITY DEFINER`.
- **Tabelas de admin** (`members`, `venues`): RLS com policy super_admin; leitura/escrita direta com a sessão (`.from(...)`) funciona.
- **Toda RPC**: `plpgsql`, `security definer`, `set search_path to ''` (nomes `public.*` qualificados), guardas de tamanho nos parâmetros (`length(...) > N`).
- **Guarda super_admin no corpo** (via `auth.uid()` + `user_roles`): leitura falha em silêncio (`return` vazio); escrita falha barulhenta (`raise exception`, traduzida pela Server Action em erro de formulário).
- **REGRA DOS GRANTS** (aprendida 17-18/07/2026): os DEFAULT PRIVILEGES do Supabase concedem EXECUTE a `anon` em funções novas do schema `public`; `revoke from public` NÃO alcança esses grants diretos. Todo fim de migração de função leva o trio explícito: `revoke execute ... from public` + `revoke ... from anon` + `grant ... to authenticated`. `anon` só permanece nas RPCs da jornada anônima: `get_sponsor_by_slug`, `get_sponsor_for_court`, `log_court_visit`.
- **Migrações**: arquivos versionados em `supabase/migrations/` (timestamp `YYYYMMDDHHMMSS_nome.sql`) espelham o banco real. NÃO há MCP do Supabase — o Eric roda manualmente no SQL Editor após verificação pela IA do Supabase.
- **Idempotência sempre**: `create ... if not exists`, `on conflict do nothing`, `create or replace`, `add column if not exists`.

## Arquitetura de patrocinadores (peças A/B/C/D/E, jul/2026)
- **`sponsors`**: entidade própria; `slug` canônico único e definitivo (viaja na URL e no cache do cliente). `member_id` null = marca solta (ex.: Coca-Cola); apontando para um coach = patrocinador-pessoa. Admin em `/dashboard/sponsors` (peça C.1) via RPCs `list/create/update/set_sponsor_active`.
- **Precedência de resolução**: `/[ad]` na URL (cartaz impresso; ADS estático primeiro, sem rede) → `court_sponsors` (por quadra) → `venues.default_sponsor_id` (geral do clube) → nada (pula a Tela 2). Feito no banco por `coalesce`.
- **Sponsor inativo em quadra = vazio** (NÃO cai no default): o filtro `active=true` vem depois do `coalesce`.
- **`court_visits`**: telemetria; grava o que FOI MOSTRADO (`sponsor_slug`). Throttle de 30min por (venue, sport, quadra) no localStorage. Os números são "acessos", nunca "visitantes únicos".
- **Aliases históricos**: `ad1` = `nicholasventura` na agregação; `ad2` = marca "PWER Squash" sem coach. Mapa hardcoded em `visit-stats.tsx` (`SPONSOR_ALIASES`/`SPONSOR_LABELS`) — dívida a migrar para o banco.
- **Cache do cliente** (`lib/supabase/sponsors.ts`): `sponsor_${slug}` = identidade, SEM TTL (logo trocado não atualiza em device que já cacheou); `court_sponsor_${venue}_${sport}_${court}` = temporal, TTL 10min. Só sucesso é cacheado — nunca o "não achei".
- **`members.sponsor_logo_url`**: APOSENTADO da UI (peça C.1). Coluna segue no banco, mas a fonte de verdade dos logos é `sponsors`; o member-form não a edita mais.

## Identificadores — armadilha conhecida
- **sportId canônico** (`'tennis'`, `'beach'`, `'padel'`, `'squash'`, `'tabletennis'`, `'pickleball'`) ≠ **slug de URL** (`'tenis'`, `'beachtennis'`, `'padel'`, `'squash'`, `'pingpong'`, `'pickleball'`). Mapa em `SPORT_SLUG_TO_ID` (`lib/clubs-config.ts`).
- `court_visits` grava o **canônico**; a GRADE do dashboard usa **slug de URL**. Junções SEMPRE via `sportIdFromSlug` — sem isso só "squash" casa por coincidência (slug == id) e o resto mostra 0 para sempre (bug silencioso).
- **GRADE de quadras**: hardcoded em 2 cópias gêmeas (`venues/[slug]/share-links.tsx` e `visit-stats.tsx`) + lista plana em `CLUBS.spac.quadras`. Extração para `lib/` pendente (peça C.2). Tabela `courts` conscientemente adiada.

## Pacto CLUBS × venues
- Slug de venue idêntico nos dois sistemas: `CLUBS` estático (`lib/clubs-config.ts`) valida a jornada; `venues` (banco) serve o admin. Clube novo entra nos DOIS.
- Slug travado no dashboard até a unificação. Rename futuro será com popup de aviso (QRs impressos param), NÃO redirect.

## Fluxo de trabalho
- **Claude Chat**: estratégia, decisões, prompts. **Claude Code**: executa código, commits, push. **IA do Supabase**: verifica e roda o SQL.
- **Método por peça**: investigação read-only → decisão no chat → prompt com intocáveis explícitos → migração verificada antes de rodar → QA de produção no celular.
- **Commits** com trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
