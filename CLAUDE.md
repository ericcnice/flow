# pwer-flow (Flow)

PWA offline-first de placar para esportes de raquete (tênis, beach, padel, squash, ping pong, pickleball), em flow.pwer.com.br. Next.js 15.5 (App Router) / React 19 / TypeScript / Supabase. Voz de árbitro estilo Grand Slam; funciona sem rede.

## PRINCÍPIOS ESTRUTURAIS INVIOLÁVEIS (regra de TODA decisão)
Estas duas regras são a espinha do Flow. NENHUMA feature pode violá-las. Se uma feature exige quebrá-las, a feature está errada, não as regras.

1. O FLOW FUNCIONA OFFLINE. O jogo TEM que rolar sem internet (quadra sem sinal, praia, qualquer lugar). Nada que dependa de servidor para JOGAR pode existir no caminho crítico. Servidor/realtime/identidade são ENRIQUECIMENTO OPCIONAL por cima de um núcleo offline autossuficiente. Matar o offline mata o produto.

2. O USUÁRIO JOGA SEM LOGIN. Escanear e jogar, sem cadastro, sem fricção — respeitando privacidade e o momento de quem não quer/não pode logar. A carteirinha é CONVITE, nunca EXIGÊNCIA. O anônimo é cidadão de primeira classe, não um caso degradado. Tirar a fricção respeitando a privacidade É a beleza do app.

CONSEQUÊNCIA PARA IDENTIDADE NOS SLOTS: a identidade (carteirinha/profile_id no slot) é 100% OPCIONAL e ADITIVA. Um slot pode ser (a) carteirinha (foto/tick/profile_id, quem escaneou logado), (b) string simples digitada (anônimo, offline), ou (c) fallback "Jogador N". Os três COEXISTEM no mesmo jogo. A identidade ENRIQUECE quando existe; a ausência NUNCA bloqueia.

CONSEQUÊNCIA PARA ENFORCEMENT: por isso o "Jogo completo" e a identidade nos slots são EXIBIÇÃO, não permissão/enforcement de servidor. Enforcement real (servidor validando quem age) exigiria amarrar tudo a identidade+servidor, o que QUEBRARIA offline e anônimo. Não é só "mais simples" fazer exibido — é a ÚNICA forma que respeita as regras invioláveis. A trava "Jogo completo" é informativa (protege a experiência, não é segurança de servidor).

## Regras operacionais do código
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

## A CARTEIRINHA FLOW (conceito central de identidade)
O profile do jogador (nome, foto, tick verde de verificado, celular confirmado, histórico de jogos) É uma CARTEIRINHA de identidade portátil do jogador — "este é o Eric Nice, verificado, com estes jogos". Não é "cadastro de aluno"; é "identidade do jogador", que serve a TODOS os contextos.

POR QUE É O ATIVO CENTRAL: a carteirinha é o que torna os convites desejáveis. A pessoa não se cadastra por burocracia — se cadastra para TER uma carteirinha (identidade, histórico, o tick verde = prova social). O jogo/aula é a isca; a carteirinha é o que ela ganha e leva consigo.

O QUE PENDURA NA CARTEIRINHA (cada contexto enriquece a mesma identidade):
- Aluno de professor (feito: convite do professor A/B.1) → "sou aluno da Ana"
- Jogador em jogos (próximo: convite de jogo / slots de identidade no placar) → histórico de partidas com identidade
- Futuro: ranking, torneios, estatísticas → tudo pendura na mesma carteirinha

A INFRAESTRUTURA DE HOJE É A CARTEIRINHA: o cadastro, o claim, a landing /convite/{token}, a foto, o tick verde, a soberania de dados — tudo isso é a infra da carteirinha, reaproveitável em cada novo contexto. O convite de jogo REUSA quase inteiro (landing, cadastro, claim); o que muda é o gatilho (nasce no placar, não no roster), o vínculo (slot do jogo, não coach) e o "voltar ao jogo" (depende dos slots de identidade no placar = A4).

A carteirinha é o "passaporte" do jogador no ecossistema Flow. Cada convite (professor, jogo, oponente) é uma porta para CRIAR ou USAR a carteirinha. É por isso que a infra é tão reaproveitável — não construímos "cadastro de aluno", construímos "identidade do jogador".

## O funil de conversão silencioso (a assimetria visual como isca)
A identidade OPCIONAL nos slots não é só enriquecimento — é o MOTOR DE CONVERSÃO. No mesmo jogo, lado a lado: o jogador cadastrado aparece com FOTO + TICK VERDE, tratado por nome; o anônimo é "Jogador 2" (rótulo cinza). Essa assimetria, na tela que ambos olham, é um convite silencioso: "olha como fica com carteirinha". O anônimo vê o que PODERIA ser.

REGRA DE OURO: a conversão vem do DESEJO, não da coerção. PULL, não push. A foto do outro NÃO é uma parede ("cadastre-se para continuar") — é uma VITRINE ("existe algo melhor quando você quiser"). O anônimo joga o jogo inteiro feliz sem se cadastrar; a carteirinha do vizinho é o anúncio, não o bloqueio. Respeita as regras invioláveis (offline/sem-login) E converte — o oposto de bloquear para forçar cadastro.

CONSEQUÊNCIA DE DESIGN: a assimetria tem que ser VISÍVEL e DESEJÁVEL (a foto/tick do cadastrado deve puxar o olho, ser bonita), não escondida. Cada jogo com um cadastrado ao lado de um anônimo é um mini-comercial da carteirinha rodando na própria quadra. O tick verde e a foto (já usados como prova social no convite do professor) ganham uma segunda função: anunciar a identidade para quem ainda não tem.

## Flow Club como comunidade-lar (visão — Eric)
Todo jogador pertence a PELO MENOS uma comunidade. Um jogador que entra organicamente, SEM clube associado, teria o FLOW CLUB como comunidade padrão — para não ficar "órfão"/sem pertencimento. Modelo real: uma pessoa joga em VÁRIOS clubes (sócia do SPAC, beach na praia, aula em outro lugar) — o Flow Club é o denominador comum, o lar quando não há outro.
DISTINÇÃO: clubes reais têm QUADRAS FÍSICAS (QR na parede); o Flow Club é comunidade SEM lugar físico — QUADRAS VIRTUAIS, para o jogo em qualquer lugar (praia, quadra pública). Coerente com a âncora móvel (celular = quadra temporária).
QUANDO: é conceito de COMUNIDADE/pertencimento que se conecta com a CARTEIRINHA — desenvolver quando a carteirinha amadurecer, NÃO agora. Hoje o Flow Club tem quadras de teste (q1/q2) como os outros; o conceito de quadra virtual vem junto com o conceito de comunidade. A carteirinha guardaria as comunidades do jogador (pode pertencer a vários clubes + o Flow Club).

## Filiação automática ao Flow Club (o mecanismo — Eric)
DISTINÇÃO que separa três coisas hoje grudadas:
1. VÍNCULO com professor (aluno da Ana) = relação pessoa↔pessoa, INDEPENDE de clube.
2. CONTEXTO do jogo (logo do SPAC/outro clube/nenhum) = decoração da partida, viaja no histórico, NÃO "filia" ninguém. Hoje o convite do professor NÃO prende o jogador a um clube — cria o vínculo aluno↔professor; o clube é só o contexto/bandeira no placar. (Confirmar na investigação.)
3. FILIAÇÃO/pertencimento do jogador = a que comunidade ele pertence. Hoje não existe como conceito ativo.

MECANISMO (a ideia): quando o jogador cria a carteirinha por QUALQUER porta (convite da Ana no SPAC, convite de outro professor/clube, ou orgânico), ganha AUTOMATICAMENTE a filiação ao FLOW CLUB (comunidade virtual). Assim NUNCA fica preso ao clube pela qual entrou — o Flow Club é dele, portátil, funciona em qualquer lugar. Adicionalmente pode ter vínculos com clubes físicos.

PRINCÍPIO: a PORTA DE ENTRADA não determina o PERTENCIMENTO. Entrou pela Ana no SPAC? É aluno da Ana (vínculo pessoal) + membro do Flow Club (comunidade portátil) — NÃO "sócio do SPAC". O clube é onde o jogo ACONTECE (lugar); o Flow Club é a CASA do jogador (pertencimento). Todas as portas levam ao Flow Club como lar. O convite pode vir de qualquer professor/clube/nenhum — muda só o contexto (o logo); não muda que o convidado ganha carteirinha + filiação ao Flow Club.

QUANDO: parte do conceito de comunidade — desenvolver quando a carteirinha amadurecer. Registrar agora para não perder; a filiação automática ao Flow Club é o mecanismo concreto do "Flow Club como comunidade-lar".

## Marca do Flow — tipografia e símbolo (correção, Eric)
A fonte do Flow **É Audiowide**, com um DEGRADÊ (gradiente azul→verde) aplicado. A Audiowide é o padrão de TODOS os logos de produtos da PWER IO — usada para consistência de marca entre os produtos. NÃO há fonte arredondada separada; o registro anterior sobre isso estava incorreto.

CORES OFICIAIS DA MARCA (usar em materiais, no site e no app):
- **Logo Flow**: "flow" em MINÚSCULO, fonte Audiowide, com degradê LINEAR do AZUL **#0078FF** (início) ao VERDE **#00FF6F** (fim).
- **"w" isolado** (símbolo/avatar): a letra "w" na MESMA fonte e MESMO degradê (#0078FF → #00FF6F).

O "w" é o que preenche o lugar do logo quando não há clube/patrocinador no contexto (jogo avulso/praia) — hoje aquele espaço é um espaçador invisível na pílula do placar.

## Onde a foto do jogador aparece (regra: função, não decoração) — decisão Eric
A foto/avatar aparece SÓ onde tem função; NUNCA polui a tela de trabalho.
- SCOREBOARD (marcar pontos): SEM foto. Jogadores e juiz já conhecem os nomes; a foto não ajuda a marcar ponto e polui a tela deliberadamente enxuta (o exercício de tirar ícones p/ o settings). O tick verde da 1a pode ficar (é sutil), mas foto NÃO.
- CELEBRAÇÃO (Game / Set / Fim de jogo): foto GRANDE. A pílula expande p/ baixo e mostra "Game, {Nome}" com a foto 512px (ou círculo com iniciais). Função: reconhecimento/emoção — e é o PICO do funil (o anônimo vê o momento glorioso do cadastrado com foto grande e quer o mesmo). Decisão da pílula expandir no Game/Set já registrada antes.
- LINK DE TRANSMISSÃO (assistir 1 jogo): foto O TEMPO INTEIRO, grande e bonita (a estrela da tela de quem assiste).
- TELÃO (vários jogos): foto o tempo inteiro, MENOR, em todos os jogos (grade de quem joga).
Regra geral: contexto de TRABALHO (marcar ponto) = sem foto; contexto de EXIBIÇÃO/CELEBRAÇÃO (assistir, comemorar) = foto presente.

## O preview no popup de editar atletas (o espelho da vaidade)
No popup "Nomes da dupla" (onde se edita os jogadores), mostrar um PREVIEW da foto/carteirinha que vai aparecer nas transmissões/celebrações — "é assim que você vai aparecer para o mundo". Poder de produto (Eric):
1. VAIDADE VIRA MOTOR: a pessoa vê sua foto no preview e quer que seja boa → sobe foto 512px caprichada. O preview PROVOCA o upload de qualidade (reforça a decisão das iniciais-como-padrão que forçam foto boa).
2. FUNIL NO PONTO CERTO: no popup, o cadastrado tem foto/tick no preview; o anônimo tem iniciais cinza. A assimetria aparece no momento em que a pessoa pensa na própria identidade — "se eu me cadastrar, apareço assim". Conversão no ponto exato.
O preview é o ESPELHO que faz a pessoa se arrumar — alimenta qualidade da foto E conversão.

## O popup de preencher slot: QR como PADRÃO, teclado como opção (decisão Eric — filosofia da 1c)
Quando o popup de editar/preencher um slot de jogador abre, o PADRÃO NÃO é o teclado subindo para digitar nome. O padrão é o QR CODE limpo (grande, sozinho — ou com o link de WhatsApp abaixo), convidando o outro jogador a ESCANEAR e entrar com a CARTEIRINHA. Um toggle em cima ("inserir nome manual") é que faz o teclado subir para digitar um nome anônimo.

POR QUE (inverter o default):
1. O default convida à IDENTIDADE: a primeira coisa que aparece é "traga sua carteirinha" (escaneie), não "digite um nome qualquer". Empurra suavemente para o cadastro (o funil) sem OBRIGAR (o toggle manual respeita o anônimo).
2. RESOLVE O TECLADO DE RAIZ: o teclado comia 50%+ da tela quando subia automático. Com o QR como padrão, o teclado NEM SOBE por default — a tela fica livre para o QR grande (que precisa de espaço para escanear). O teclado só aparece sob o toggle. Os dois modos não competem.
3. Coerente com as regras invioláveis: mostra o caminho preferido (identidade) mas garante o anônimo a um toque (o toggle). PULL forte, sem PUSH coercitivo. "Força" a logar só no sentido de tornar a identidade o caminho natural — nunca bloqueia o anônimo.

TERCEIRO CAMINHO (o WhatsApp): alguns celulares de amigos não leem QR (Eric presenciou). Então além do QR, um botão "enviar link por WhatsApp" — o mesmo destino do QR (entrar no slot), por link. Cobre quem não escaneia.

Isto é a filosofia da 1c (o QR check-in do jogador / preencher slot). NÃO é a 1b.2a (que é só o preview da foto de quem já está no slot). A 1c redesenha o popup com: QR padrão + toggle manual + botão WhatsApp, resolvendo o teclado.

## Modelo de identidade e negócio (Login Fase A)
- **Hierarquia**: **Player** (todos; role padrão criado pela trigger `handle_new_user` no signup) → **Coach** (o super_admin promove via `members.role='coach'` no dashboard) → **Coach com marca+patrocinador no QR** (fatia futura; reusa `sponsors.member_id` apontando pro coach).
- **Cadeia técnica existente**: `auth.users` → `profiles` (`id`, `name`, `email`, `phone`) → `members` (via `profile_id`, **hoje sempre null**) + `user_roles` (via `user_id`). A trigger de signup cria o `profile` + `user_roles='player'`; **NÃO cria `member`** e **NÃO promove coach**. `profiles.id = auth.users.id`; `user_roles` é a autorização de login (≠ `members.role`, que é atributo de pessoa).
- **Allowlist = `members.role='coach'`** já setado pelo admin (onboarding CURADO; sem signup público de coach). Falta a **"ponte" no login**: quando o `email` do `profile` bate com um `member` coach, **vincular `members.profile_id`** (claim) + **promover `user_roles` a `coach`**. Match por **email VERIFICADO** (Google/OTP) é seguro — o provider já garantiu a posse do endereço.
- **Vínculo coach→aluno**: `coach_id` em `members` (decisão da fatia A3; escopa o roster ao coach via RLS).
- **`live_matches` = jogo AO VIVO (efêmero)**, canal de sync por tokens — **NÃO é histórico**. "Salvar histórico ao logar" é **tabela NOVA** (fatia futura), não reaproveita `live_matches`.
- **Nomes do dashboard em inglês** (Players / Courts / Sponsors) por internacionalização — as colunas/rotas seguem esse padrão; o texto de UI voltado ao professor é PT-BR.
- **Fatiamento Fase A**: **A1** login + perfil mínimo · **A2** ponte coach (claim + promoção) · **A3** roster escopado ao coach (`coach_id` + RLS) · **A4** slots de jogador com identidade (`member_id` aditivo na config; os 4 estados) · **A5** claim por celular (E.164 como ID; aluno anônimo reivindica ao logar).

## Tick de verificação + nome verificado vs digitado (implementado no Passo 1a)
- TICK VERDE de "verificado pelo Flow": o slot do jogador LOGADO ganha um selo verde (identidade ancorada em email/celular reais). É estratégia de AQUISIÇÃO de custo zero: verificação é aspiracional (estilo Instagram), e sendo grátis — só logar — incentiva o cadastro. "Quero meu selo" vira motor de login.
- DISTINÇÃO CONCEITUAL dos slots: nome VERIFICADO (dono logado — travado no jogo, editável só no /perfil que é a fonte da verdade, com tick) vs nome DIGITADO (string livre, sem garantia, editável). Terceiros nunca alteram um nome verificado (evita falsa atribuição / risco legal).
- O convite do oponente (Passo 2 do A4) é o que transforma um nome DIGITADO num VERIFICADO: em vez de eu escrever o nome do adversário, ele loga e afirma o próprio nome (resolve o cheiro de falsa atribuição que o "digitar nome do adversário" tem hoje).
- Confiabilidade: nome verificado é prova de quem jogou — essencial para torneio/ranking/histórico com valor. O tick aparece também no link de transmissão (espectador vê a credibilidade).

## Passo 1c — Sistema de celebração (visão, backlog após 1b)
Gamificação que mexe com vaidade para incentivar cadastro + dar emoção à transmissão. Hoje não há celebração entre games (só o card final) — momento desperdiçado.
- ESCALA POR PESO (a distinção é visual, vira linguagem que o espectador aprende): GAME vencido = pílula do vencedor expande vertical, mostra o avatar, recolhe rápido (sutil). SET = mesma animação do game (consistência). PARTIDA = distinta e maior: o avatar do campeão cobre os dois lados/tela inteira, encobrindo o adversário ("acabou, este venceu"). A diferença de escala comunica a diferença de peso sem texto.
- SÓ O VENCEDOR aparece (psicologia: o perdedor não quer a cara estampada na derrota). Na vitória final, celebração + placar, sem humilhar o perdedor.
- FOTO vs INICIAL: logado mostra foto; não-logado mostra inicial (círculo digno, estilo o "C" do perfil — convite, não castigo). O contraste (minha inicial ao lado da foto do outro) é o incentivo de cadastro.
- TOGGLE no settings para desligar celebrações (respeita juiz sério / quem marca rápido).
- SINCRONIZADA NA TRANSMISSÃO (fator uau de venda): FORMA A (preferida, baixo risco) = o espectador DERIVA a celebração do que já sincroniza (detecta local "o game mudou" e dispara a animação com a foto que já buscou), sem mandar evento novo pelo sync. FORMA B (mandar evento explícito via set_config) = mais arriscada, evitar. Investigar se a Forma A tem timing confiável.
- DEPENDÊNCIA: o Passo 1b (foto do usuário disponível/buscável) é o alicerce — sem foto não há o que celebrar com rosto.
- A DECIDER no 1c: celebração de game é do vencedor do game, ou marco neutro? (no tênis, ganhar o game nem sempre é "algo especial" — pode ser só segurar o saque). Desenhar sobre a tela real com mockups do Eric.

## A3 e a visão de plataforma de clube (roadmap)
MODELO: usuários finais GRÁTIS; cobra-se de PROFESSORES e CLUBES. O professor é a alavanca de adoção (traz alunos). O clube muitas vezes é o ÚLTIMO a aderir, talvez nunca — então a experiência do professor NÃO pode depender da adoção do clube. Foco total no professor.

A3 (AGORA) — ROSTER SIMPLES DO PROFESSOR: o coach cadastra/gerencia os alunos DELE (vínculo `coach_id` em `members`, que já existe no schema). Campos: nome, celular (chave de identidade futura), nível (opcional, p/ campeonatos), número de sócio (opcional, identificador rápido tipo bar/restaurante do clube), horário de aula (opcional, muitas crianças). Acesso escopado por RLS (coach vê/gerencia só os seus — hoje `members` é super_admin-exclusivo, precisa policy nova). O aluno é `member` sem `profile_id` até criar conta; o claim futuro por celular vincula.

VISÃO DE CLUBE (FUTURO, registrado — próximo grande bloco quando um clube formalizar):
- Quando o clube PAGA, os alunos são SÓCIOS do clube (fonte de dados rica: filiação, número de sócio, dependentes). Duas fontes: professor cadastra soltos VS clube fornece a base de sócios que os professores CONSOMEM.
- Entidade "clube com sócios" acima do professor; login de CLUBE (o dono loga como SPAC, não admin, para inserir/gerenciar a base de sócios consumida por Ana/Shock/Nicholas).
- O aluno pertence ao CLUBE (sócio); o vínculo com o professor é uma ASSOCIAÇÃO (turma), não posse. Um sócio pode ser aluno da Ana E jogar em campeonato do capitão Lucas.
- RANKING INTERNO gerenciado pelo Flow (o capitão Lucas do beach tênis já pediu; Letz Play faz mal feito). Peça de negócio grande: faz o clube DEPENDER do Flow (o ranking oficial vive no sistema).
- O roster simples da A3 NÃO conflita: quando o clube-com-sócios existir, os alunos cadastrados soltos podem ser vinculados aos sócios. Começar simples não fecha portas.

## Soberania de dados no roster (regra + Fatia 3 pendente)
REGRA: quem tem conta é dono da própria identidade. `members.profile_id` é a fronteira — aluno SOLTO (profile_id null) tem nome/celular como ANOTAÇÃO do professor (tudo editável); aluno CADASTRADO tem a identidade vinda do profile DELE (somente leitura para o coach). Os campos PEDAGÓGICOS (nível, nº de sócio, horário) são sempre do coach, nos dois casos.
- **Fatia 1 (no ar)**: RPC `coach_list_students` resolve `display_name`/`display_phone`/`avatar_url` (profile quando cadastrado; anotação quando solto; `deleted_at` → volta para a anotação, senão o aluno sumiria da lista). Embed members→profiles NÃO serve: `profiles` tem RLS self, o embed devolveria null EM SILÊNCIO e o card seguiria com o nome velho. O badge "Cadastrado" deriva de `is_claimed`, não do status do convite.
- **Fatia 2 (no ar)**: `coach_update_student` congela name/phone quando `profile_id` não é null (`case` lendo a própria linha — a trava é no BANCO, tela é uma chamada de DevTools de distância).
- **Fatia 3 (pendente — UI)**: modal em dois blocos — "dados do aluno" (somente leitura, com o tick verde de verificado) e "suas anotações" (pedagógico, editável).

EMAIL NO BLOCO "DADOS DO ALUNO" (Fatia 3): além de nome/celular/foto, mostrar o EMAIL do profile. É dado de RETORNO do aluno (vem do login Google/OTP, como tudo que ele declara), NÃO algo que o coach digita — mesma lógica de soberania. MOTIVO PRÁTICO: DESAMBIGUAR alunos homônimos — com dois "Eric Nice" no roster, o email distingue ericnice@me.com de eric.nice@pwerio.com na hora. A RPC `coach_list_students` precisa passar a retornar o email do profile, só quando `is_claimed` (conta excluída/`deleted_at` → sem email, mesma regra de nome/phone).

IDADE NO ROSTER — CORREÇÃO da regra anterior ("birth_date nunca sai"): o coach PRECISA da idade dos alunos para organizar torneios (categorias/datas de corte); negar seria proteção no lugar errado. DECISÃO (Eric): expor ao coach IDADE + MÊS/ANO, SEM O DIA. Ex.: "12 anos · 12/2014". RAZÃO: idade + mês/ano cobrem categorização (sub-14) e datas de corte de torneio (que usam ano/mês, nunca dia); omitir o DIA remove a granularidade que torna a data de nascimento um identificador preciso (fraude/cruzamento) sem tirar utilidade esportiva. O mínimo de dado sensível para o máximo de utilidade.

IMPLEMENTAÇÃO na `coach_list_students`: NÃO retornar `birth_date` cru. Retornar campos DERIVADOS — `idade` (calculada, integer) + `birth_month_year` (text, ex. "12/2014"). O DIA fica no banco e nunca sai na RPC. Só para `is_claimed`; conta excluída (`deleted_at`) → sem idade, como nome/email/phone.

CONTEXTO DE EXPOSIÇÃO: a idade sai SÓ para o coach DONO do aluno (a RPC é escopada por `coach_id = auth.uid()`), não para qualquer um — o contexto professor↔seu aluno legitima. A parede dos 18, o consentimento parental (B.2) e o Family Link continuam protegendo o CADASTRO; a idade no roster é uso pedagógico legítimo, camada diferente.

Isto reforça (não enfraquece) o motivo de a leitura ser RPC e não policy: o retorno é escolhido a dedo, campo a campo, e derivar idade/mês-ano só é possível assim. Uma policy em `profiles` entregaria a LINHA inteira, com o dia junto (RLS filtra LINHA, não coluna).

## Convite viral do professor (visão, fatia após o avatar)
A máquina de captação via professor. DOIS tipos de convite:

CONVITE DIRECIONADO (tipo 1): o coach cadastra o aluno no roster (nome + WhatsApp — dado que ele já tem). Botão CONVIDAR gera link ÚNICO pré-vinculado àquele member, com mensagem PERSONALIZÁVEL ("Olá João, aqui é a Ana, te enviando pra cadastrar no Flow..."). O coach envia pelo PRÓPRIO WhatsApp (zero custo de API). O aluno clica → landing "A Ana te convidou" → cadastro rápido (Google/email PRIMEIRO, vantagens depois) → o cadastro VINCULA ao member do roster (o claim) e ENRIQUECE com foto/slug/idade que o aluno/pai preenche. Status visível pra Ana (enviado→cadastrado). Rastreável, pré-vinculado, pessoal (converte mais).

CONVITE GENÉRICO (tipo 2): a Ana joga um link GENÉRICO no grupo de WhatsApp do tênis (200+ pessoas no SPAC). Reutilizável, qualquer um se cadastra. NÃO pré-vinculado a um member, MAS carrega a ATRIBUIÇÃO ao professor ("veio pela Ana") pra métrica/indicação futura. Alcance massivo, viralização real. Tecnicamente mais simples (sem pré-vínculo). Um link por professor/campanha.

MÉTRICAS: a Ana vê quantos convidou e quantos se cadastraram (controle dela). O SUPER ADMIN vê nº de convites/cadastros por professor = MÉTRICA DE ENGAJAMENTO (quais professores são alavancas reais; base pra futuro programa de indicação/comissão "a Ana trouxe 40 pessoas").

REQUISITOS DO CADASTRO:
- IDADE (data de nascimento) OBRIGATÓRIA — questão legal: MENOR → consentimento parental (o pai se cadastra e cadastra o filho, o pai é o titular do consentimento, NÃO o admin/coach); MAIOR → consentimento próprio. A idade DECIDE o fluxo.
- Enriquecimento: o aluno/pai sobe a própria foto (qualidade + consentimento embutidos), escolhe slug, etc. O trabalho se distribui pra quem tem o dado.

ENVIO EM MASSA: "convidar todos os pendentes" do ROSTER (os que a Ana já cadastrou) — NÃO da agenda. O coach dispara pelo WhatsApp dele (individual ou grupo da turma).

DESCARTADO (com motivo): integração com agenda/contatos do Google — permissão invasiva (recuo de conversão), exige aprovação/auditoria do Google (semanas), e LGPD sobre contatos de TERCEIROS (dado de quem nunca consentiu). Custo >> economia de digitação. Não fazer.

FILOSOFIA: distribuir o cadastro pra os DONOS dos dados (professor inicia com o contato que tem; aluno/pai completa com consentimento + foto). Tira o admin de ser gargalo e responsável legal por dados de menores. Escala infinitamente. Prova social (verificado + foto + torneios) alimenta o tipo 2.

## Idade no cadastro e menores (decisão + visão)
DECISÃO ATUAL (B.1): capturar data de nascimento (profiles.birth_date) no cadastro. Parede em 18 anos como PISO SEGURO PROVISÓRIO — a idade-limite é uma CONSTANTE fácil de mudar (não travada na lógica). >= 18 segue o fluxo normal (claim + perfil); < 18 vê parede amigável ("Para menores de 18, quem cadastra é o responsável — peça para ele abrir este link"). Sem claim, sem gravar dado além do que o auth já criou.

POR QUE 18 (e não a intuição de liberar 13+): a idade de consentimento LGPD (art. 14) NÃO depende de o produto ser bom/saudável — protege o DADO do menor, não avalia o mérito do serviço. Fronteiras legais: CRIANÇA até 12 (consentimento parental OBRIGATÓRIO e específico); ADOLESCENTE 13-17 (zona cinzenta — menos rígido que criança, mais que adulto; interpretação varia). "13+ se cadastra sozinho" é possível mas NÃO é certeza jurídica. 18 é o piso seguro enquanto não há validação de advogado/DPO.

VISÃO-ALVO (Eric): o Flow é produto saudável/presencial (o oposto do que vicia — não é rede social, não é online). Jovens 13-14 já têm celular e querem interagir; a intenção é eventualmente liberar 13+ autônomo. DEPENDENTES (conta parental) pensada para 6-12. A intuição de Eric (dependentes 6-12, 13+ autônomo) converge com a estrutura legal (criança até 12 / adolescente 13+).

CAMINHO: a idade-limite vira CONFIGURAÇÃO. Antes de baixar de 18, VALIDAÇÃO com advogado/DPO (já necessária para menores de qualquer forma) define a linha final (13/16/18). A B.2 (consentimento parental + dependentes) constrói o modelo de menores com a linha definida juridicamente. Ponto crítico da B.2 já mapeado: o menor que digita a idade JÁ TEM conta no auth (criada no login) → a parede deixa conta órfã; a B.2 decide apagar/marcar/congelar (aparentado com a pendência de re-login de conta com deleted_at).

Este é um dos pontos mais sensíveis da revisão jurídica (art. 14) — reforçar na lista de revisão dos T&C.

## Furo de proteção de menores descoberto no QA da B.1c (tratar na B.2)
TESTE REAL (William, conta de menor no Google Family Link): revelou dois problemas de ORDEM/proteção que a B.2 deve fechar:

1. CLAIM RODA ANTES DA VERIFICAÇÃO DE IDADE: hoje o fluxo é login → claim (vincula members.profile_id) → depois pede idade → parede. Quando é menor, o vínculo JÁ ACONTECEU quando a parede aparece = conta órfã de menor vinculada ao roster sem cadastro completo. CORREÇÃO (B.2): verificar idade ANTES de vincular — se menor, NÃO fazer o claim (deixar para o responsável). A ordem correta é idade → (se adulto) claim → cadastro.

2. MENOR CONTORNA A PAREDE PELO /PERFIL: após o claim + parede, o menor foi ao /perfil (que detecta "sem T&C" e pede aceite) e CONSEGUIU aceitar os termos + marketing, contornando a parede da landing. O /perfil NÃO checa idade. CORREÇÃO (B.2): o /perfil (ou o app) precisa respeitar a idade — um menor não deve conseguir completar cadastro/aceitar T&C por NENHUM caminho. Possivelmente: se birth_date indica menor (ou está ausente + conta veio de convite de menor), bloquear o cadastro até haver fluxo parental.

3. CAMADA EXTERNA (bônus): o Google Family Link já exige consentimento parental para o menor logar em apps novos — reforço externo antes de chegar ao Flow. Não substitui a proteção do Flow, mas é uma camada a mais.

Esses furos NÃO são exploráveis por acidente no fluxo adulto normal (precisam de conta de menor + navegação deliberada), mas são proteção de menores = prioridade da B.2. A B.2 (consentimento parental + dependentes) fecha os três + trata a conta órfã (apagar/marcar/congelar). Reforça a necessidade de revisão jurídica do art. 14.

## Convite do oponente / de partida (visão — evolução do A4, fatia após o convite do professor)
A viralização que NÃO depende do professor — como o Flow atravessa para novos círculos, fora do clube de origem.

CENÁRIO: o jogador logado (já com FOTO + tick VERIFICADO, prova social) vai jogar num lugar novo, com alguém que não usa o Flow. Ao MONTAR a partida (ele é o Jogador 1, já identificado), o app oferece convidar o Jogador 2 (ou 3/4 em duplas) para se cadastrar e ENTRAR NAQUELE JOGO. Via link de WhatsApp OU QR (antes só QR; agora também link, mesmo conteúdo). A pessoa clica → cadastra → VOLTA como Jogador 2 daquela partida específica.

POR QUE É FORTE:
1. INCENTIVO IMEDIATO E CONCRETO: não é "cadastre-se no Flow" (abstrato), é "entre neste jogo que estamos jogando AGORA". A pessoa está com a raquete na mão — conversão no momento perfeito. Resolve a questão do "por que um usuário comum indicaria?": ele indica porque PRECISA do oponente no jogo. O incentivo é o próprio jogo (utilidade imediata, não recompensa abstrata).
2. ESPALHA FORA DO CLUBE: o professor traz alunos (contexto SPAC); o convite jogador→jogador é como o Flow atravessa para círculos novos quando o usuário viaja/joga em outro lugar. Cada jogo com alguém novo = porta de entrada.
3. USA A FOTO/VERIFICADO: o Jogador 1 aparece logado, com foto + tick verde = prova social no momento do convite ("quero um perfil assim também"). A vaidade construída vira motor de captação.

INFRAESTRUTURA: reusa a mesma base (link único com token, atribuição a quem convidou, cadastro que vincula) = tabela invites com um CONTEXTO novo (não student_member_id, mas um contexto de jogo/match_id — a definir). Reusa a LANDING/recepção do convite do professor (Fatia B) — por isso vem DEPOIS que a recepção existir (a landing do convite de partida é primo da do professor).

DEPENDÊNCIAS: "a pessoa volta como Jogador 2 daquele jogo" encadeia com o multi-device/sync (placar compartilhado até 3 devices, já existe) + uma camada de IDENTIDADE nos slots do placar (o Jogador 2 logado, não anônimo) = conecta com o A4 (slots com identidade, ainda não feito). Construível, mas depende do sistema de slots/identidade do placar.

SEQUÊNCIA: fatia própria, DEPOIS do convite do professor (Fatia A disparo + Fatia B recepção). Reusa a recepção. É a evolução do "A4 / convite do oponente / QR de partida" já mencionado no backlog.

Relacionado: o convite GENÉRICO (tipo 2) também não é exclusivo do professor — qualquer usuário pode ter um link de indicação com atribuição (incentivo a definir: social/vaidade, recompensa, ou utilidade). O convite do oponente é a forma mais forte disso, porque o incentivo (o jogo) é intrínseco.

## Âncora de jogo + quadra inteligente + fila (visão — os degraus)
CONCEITO CENTRAL — A ÂNCORA: algo que representa o jogo e recebe os jogadores. O jogador SEMPRE faz o mesmo: escaneia a âncora → sua carteirinha entra num slot do jogo. O contexto define QUEM é a âncora:
- DENTRO DO CLUBE: a âncora é o QR DA QUADRA (fixo). O jogo VIVE NA QUADRA (no servidor), NÃO no celular de ninguém. Os celulares são apenas JANELAS para o jogo da quadra — conectam e desconectam livremente. Isso resolve "joguei cedo e fui embora com meu celular": o jogo nunca foi do celular, é da quadra; o próximo grupo abre nos celulares DELES, e a partida computa nas contas DELES.
- FORA DO CLUBE (praia, quadra pública sem QR Flow): a âncora é o QR NO CELULAR do dono (quadra temporária). Os amigos escaneiam o celular dele e entram no jogo.
O TIPO de âncora é definido pelo contexto (tem QR de quadra? → quadra é âncora; não tem? → celular é âncora). O celular NUNCA é âncora dentro do clube — lá sempre é a quadra.

A QUADRA INTELIGENTE (contexto clube):
- Ao primeiro que escaneia, a quadra PERGUNTA "simples ou dupla?" — ela não assume (beach pode ser 1v1 ou 2v2). Isso define quantos slots esperar (2 ou 4).
- Cada pessoa que escaneia o MESMO QR da quadra entra no placar ao lado das anteriores. Ninguém apresenta celular. A quadra monta o jogo.
- A pergunta "simples/dupla" se repete A CADA NOVO JOGO (o próximo da fila redefine) — senão embaralha os jogos seguintes e precisaria de reset.

A FILA (quando a quadra está ocupada):
- Quem escaneia com a quadra cheia entra na FILA, por ORDEM DE ESCANEADA (justo, sem discussão — o sistema carimba a ordem).
- Quando o jogo acaba, a quadra PROMOVE o próximo da fila automaticamente. Os celulares do próximo grupo já escanearam (estão na fila), então quando é a vez deles, o jogo abre nos celulares deles.
- ESPECTADOR = retenção: quem espera na fila acompanha o placar ao vivo (modo espectador, já existe) e sabe quando está perto de jogar — pode até "ir tomar um café". O próximo da fila é um espectador que vira jogador.

OS QUATRO DEGRAUS (ordem de construção — cada um entrega valor e valida antes do próximo; NÃO pular para o topo, erro tipo PWER LINK):
1. SLOTS DE IDENTIDADE NO PLACAR (A4): Jogador 1/2/3/4 viram CARTEIRINHAS (foto/tick), não rótulos genéricos. Slot vazio preenchível por nome simples (baixo valor) OU escanear/link para a carteirinha. Reusa a infra de identidade de hoje. É o TIJOLO — sem jogadores com identidade, a fila não tem de quem ser feita.
2. ÂNCORA MÓVEL (celular-QR, praia): você joga, amigos escaneiam seu QR, entram nos slots. Caso simples, sem fila, sem quadra. Prova o átomo "escaneou → entrou no jogo". Reusa mais.
3. ÂNCORA FIXA (quadra-QR): o QR da quadra recebe jogadores. Ainda sem fila — "escaneou a quadra → entrou no jogo da quadra". A quadra vira dona do jogo (resolve o celular-que-vai-embora).
4. A FILA: quadra-QR + "o que fazer quando cheio" → fila por ordem, simples/dupla por jogo, promoção automática. O módulo completo de gestão de quadra.

VALOR COMERCIAL: a quadra que auto-organiza a fila é feature de GESTÃO DE QUADRA que o clube valoriza (não só placar — fluxo da quadra). Tem valor de venda (clube/professor paga por organização).

QUANDO: depende de validar o SPAC. Observar na validação quão comum é a FILA no mundo real: se a maioria é "marquei com amigos, jogamos, saímos" (degraus 1-2 bastam), a fila é luxo futuro; se as quadras vivem lotadas com espera (o "Rei da Quadra" do beach sugere que sim), a fila é core. Degrau 1 (slots de identidade) é o próximo passo natural e reusa a carteirinha; a fila é o destino, não a próxima fatia.

## Fila por esporte + os DOIS QRs + o televisor (arquitetura, refinada com o SPAC real)
A FILA É DIFERENTE POR ESPORTE — é a estrutura, não um detalhe:
- BEACH (fila de raquete): ordem PURA de chegada, não importa quem é a dupla (a raquete enfileirada fora da quadra é a verdade). Fila individual/simples por ordem. Descontraído — QR estático serve.
- TÊNIS (fila de grupo pré-formado): a dupla/simples E OS ADVERSÁRIOS já vêm definidos, marcados com antecedência (dias/semana antes). A fila é de GRUPOS já montados. Regra do clube: só entra na fila se TODOS os jogadores estiverem PRESENTES (check-in de todos). Isso evita "guardar fila".

AS TRÊS COLUNAS (modelo já prototipado por Eric no app antigo, funcionando no front — repo separado v0-game-flow, referência de lógica quando construir):
1. PLAYERS WAITING: marcaram para o dia, podem não estar no clube ainda (status "Waiting Check-in" / "Checked-in"). Sala de espera, serve p/ todos os esportes.
2. PLAYER GROUPS: onde os esportes divergem. Beach: grupo forma por ordem de fila (todos precisam estar checked-in). Tênis: grupo pré-avisado que "acende verde" conforme cada jogador faz check-in.
3. COURT WAITING: grupos prontos (todos verdes) esperando quadra livre → vão à quadra quando alguma libera.
Toggle "Peak Hours" = só duplas jogam / preferência a duplas.

OS DOIS QRs (funções e segurança diferentes — decisão importante):
1. QR DA QUADRA (ESTÁTICO): fica NA quadra. Serve o PLACAR ("jogo nesta quadra, marca meus pontos"). Contexto de jogo em andamento. Estático ok — você já está fisicamente na quadra.
2. QR DO TELEVISÃO (DINÂMICO, muda a cada X tempo): fica no TELEVISOR do dept. de esportes. Serve o CHECK-IN DE FILA ("estou presente no clube, entro na fila"). DINÂMICO POR SEGURANÇA: só quem está FISICAMENTE na frente da tela escaneia — foto no WhatsApp não serve (o QR já mudou). A PRESENÇA FÍSICA vira a prova, exatamente o que a regra do tênis exige. Substitui o leitor facial (Hikvision) que Eric tinha planejado — o QR dinâmico faz o mesmo, barato e de fácil adoção com a carteirinha.

POR QUE DINÂMICO SÓ NA FILA: entrar na fila (tênis) exige PROVA DE PRESENÇA → dinâmico. Jogar na quadra não exige (já está lá) → estático. NÃO é "escanear o mesmo QR 2x" — são DOIS QRs, dois momentos, dois requisitos.

POR QUE NÃO PRÉ-ATRIBUIR QUADRA: os jogos são por PARTIDA, não por tempo (1-2h, imprevisível). Não dá pra saber qual/quando a quadra libera. A fila é dinâmica: o grupo espera, e quando ALGUMA quadra libera, o próximo é chamado PARA AQUELA.

O TELEVISOR = PAINEL DE CONTROLE DA FILA (não só telão de placar): o telão do SPAC já mostra quadras ocupadas, tempo de jogo, fila de espera (ReservaQuadras hoje). O Flow adiciona: o QR DINÂMICO de check-in + integração com a CARTEIRINHA (fila mostra pessoas identificadas; check-in pela carteirinha). Isso reformula "o telão" — não é só placar, é o painel da fila com o QR de check-in.

CHECK-IN FRICTIONLESS (o alvo de UX): cheguei ao clube → escaneio o televisor → se beach, aparece meu lugar na fila (ou "entre, divirta-se" se vazio); se tênis, o sistema sabe que meu grupo foi pré-marcado e me diz "seu parceiro Fulano já fez check-in / ainda não chegou, você ainda não está na fila". Simples, sem humano no balcão.

## Distribuição, parcerias e white-label (visão estratégica)
O Flow foi construído com "superfícies de marca" que já existem (QR contextual, card de patrocinador na abertura, "Powered by Flow" clicável/rastreável, placar compartilhado, telão futuro). A mesma infraestrutura de sponsors que serve professor/clube serve parceiros comerciais — o Flow é WHITE-LABEL-READY sem reconstrução.

TRÊS MODELOS DE DISTRIBUIÇÃO (além de professor-paga / clube-paga):

1. LOJAS DE ENCORDOAMENTO / MATERIAIS ESPORTIVOS (o mais acionável cedo): são um CANAL que já tem relação recorrente com professores de tênis/squash (raquete/corda toda semana). Modelo ganha-ganha-ganha: a loja dá "Flow com a marca dela" como agrado ao cliente (professor ganha ferramenta grátis + útil), a loja fideliza e ganha visibilidade, o Flow ganha distribuição. A loja pode revender os serviços premium (setup pago) = vira REVENDEDOR/afiliado de alto valor (traz dezenas de professores, não um). Conecta com a rede de afiliados/convite viral: a loja teria um "link de convite de loja". Radar: quando o convite viral estiver pronto.

2. GRANDE MARCA ESPORTIVA (Wilson, Head): patrocínio de DISTRIBUIÇÃO por presença de marca no esporte de base — a marca aparece em cada jogo/placar/telão (mídia esportiva capilar, estar no momento em que a pessoa joga). É VENDA CORPORATIVA (reuniões, proposta, contrato grande), depende de TRAÇÃO primeiro (eles perguntam "quantos jogos/clubes por mês"). Horizonte, não próximo passo — perseguir após SPAC + professores validarem uso.

3. PATROCINADOR INSTITUCIONAL (Itaú etc.): marca institucional / responsabilidade social patrocinando esporte de base. Mesma lógica da marca esportiva: venda corporativa, depende de tração, horizonte.

IMPLICAÇÃO DE PRODUTO (registrar, não urgente): se o Flow vira white-label (marca da loja/Wilson), a arquitetura de sponsors precisará eventualmente de um NÍVEL DE MARCA ACIMA do clube/professor ("este Flow inteiro é da loja X"). Não urgente, mas saber que vem influencia como o sponsor system evolui.

FILOSOFIA: um produto, três+ modelos de receita (professor paga / clube paga / marca patrocina distribuição), servidos pela mesma base de sponsors. Tração primeiro (SPAC), parcerias depois.

## Fluxo de trabalho
- **Claude Chat**: estratégia, decisões, prompts. **Claude Code**: executa código, commits, push. **IA do Supabase**: verifica e roda o SQL.
- **Método por peça**: investigação read-only → decisão no chat → prompt com intocáveis explícitos → migração verificada antes de rodar → QA de produção no celular.
- **Commits** com trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
