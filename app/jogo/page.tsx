"use client"

import { Fragment, useState, useEffect, useRef, type CSSProperties, type ReactNode } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { NameEditModal } from "@/components/name-edit-modal"
import { ConfirmModal } from "@/components/confirm-modal"
import { Settings, Volume2, VolumeX, Undo2, BarChart2, RotateCcw, LogOut, ArrowLeftRight, Share2, Users, UserMinus, X } from "lucide-react"
import { ThirdSetModal } from "@/components/third-set-modal"
import { ShareModal } from "@/components/share-modal"
// Superfície de configuração ÚNICA: a MESMA tela de setup (esporte + regras),
// aberta agora também DE DENTRO do jogo pelo botão de config (aposenta o GameMenu
// antigo neste fluxo).
import { SportSetup } from "@/components/sport-setup"
// Layout do placar de transmissão, compartilhado com a tela /placar (espectador):
// o overlay "placar geral" e a tela read-only renderizam a MESMA tabela.
import { BroadcastScoreboard } from "@/components/broadcast-view"

// >>> Voz "placeholder" (preto e branco): reage aos eventos do motor e fala o
// placar com a voz nativa do navegador. announce() = lógica evento→texto;
// createSpeechSynthesisSpeaker() = camada de som trocável. Ver lib/voice/*.
import { announce, announceUndo } from "@/lib/voice/announcer"
import { createSpeechSynthesisSpeaker, type Speaker } from "@/lib/voice/speaker"

// >>> A tela consome o motor de scoring (lib/scoring) e agora é MULTI-ESPORTE:
// o esporte escolhido na tela de setup determina o MÓDULO do motor e como o
// ponto é formatado (15/30/40 do tênis vs. contagem corrida do squash/ping
// pong/pickleball). O "catálogo" (lib/sports-catalog) é a cola entre a UI e os
// módulos — ele NÃO altera lib/scoring, só o consome.
import { ScoringEngine } from "@/lib/scoring/engine"
import { sportById, familyOf, formatPoint, defaultRulesFor, buildScoreCols, concededUnitFlags, displayServer, sideChangeOf, migrateRacketRules, type SideChangeMode, type SportId } from "@/lib/sports-catalog"
import { themeClassName, type ThemeId } from "@/lib/themes"
import { clubFromCacheOrBundle } from "@/lib/supabase/club-catalog"
import { AppAuthCta } from "@/components/auth/app-auth"
import { resolveSponsor, type Sponsor } from "@/lib/supabase/sponsors"
import type { GameState, Side } from "@/lib/scoring/types"

// Realtime (bônus, offline-first): cria/assina a sala ao vivo. O jogo NUNCA
// depende disso — se o Supabase falhar, tudo segue funcionando localmente.
import { createLiveMatch, getLiveMatchState } from "@/lib/supabase/live-match"
import { useRealtimeMatch } from "@/lib/hooks/use-realtime-match"

type GameConfig = {
  quadra: string
  /** Esporte escolhido na tela de setup (define o módulo do motor). */
  sport?: SportId
  /** Tema de cor do placar (default Neutro). Personalização por partida. */
  theme?: ThemeId
  /** Clube de contexto (quando a partida veio da jornada /[clube]/...). Ausente
   *  = jogo genérico iniciado pela home; sem assinatura de clube no placar. */
  clube?: string
  /** Anúncio/patrocinador da abertura (ex.: "ad1"). Só quando a rota tinha
   *  /[ad]; ausente em jogos sem patrocínio ou partidas antigas. */
  ad?: string
  gameType: string
  scoreType: string
  players: {
    blue1: string
    blue2: string
    red1: string
    red2: string
  }
  /** Sacador individual INICIAL por lado (0 = blue1/red1, 1 = blue2/red2). Campo
   *  aditivo do B1: aqui é só criado/persistido/propagado — a UI de escolha vem
   *  no B1b e a rotação derivada no B2. `firstServer` (Side, na semente do motor)
   *  segue sendo a fonte do motor. Ausente = {A:0,B:0}. */
  initialServer?: { A: 0 | 1; B: 0 | 1 }
  /** Logo do clube VISITANTE (slot interclubes futuro). Campo aditivo: sem UI de
   *  seleção nesta entrega — por ora os dois times mostram o logo do clube da
   *  quadra. Quando definido, o time B usa este. */
  visitorClubLogo?: string
  startTime: string
  maxSets?: number
  /** Sala Realtime (bônus). Ausentes em partidas offline ou antigas.
   *  `editToken` é o SEGREDO do dono; `viewToken` é seguro de compartilhar. */
  matchId?: string
  viewToken?: string
  editToken?: string
  /** Espelhamento dos lados na tela (A1) — SÓ visual, SÓ deste aparelho.
   *  Persistido localmente para sobreviver a reload; NÃO entra no sync (o telão
   *  segue na orientação canônica). Ausente/false = não espelhado. */
  mirrored?: boolean
  /** Ligar o aviso automático "TROCA DE LADO" (A2). Escolha do juiz no setup.
   *  Padrão DESLIGADO (aviso não solicitado é ruído em quadra) — o swipe (A1)
   *  segue disponível independente disto. Ausente/false = sem aviso. */
  sideChangeAlert?: boolean
}

// Ação registrada para persistência: o estado do motor é reconstruído por
// replay (o engine não expõe setter de estado — ver lib/scoring/engine.ts).
type Action = { kind: "point" | "game"; side: Side }

// Mapa de lados: a tela usa blue/red; o motor usa A/B.
const sideOf = (team: "blue" | "red"): Side => (team === "blue" ? "A" : "B")

// Abreviação BROADCAST do nome: primeiro nome vira inicial ("Eric Nice" →
// "E. Nice"); nome único fica inteiro. O truncate final é do CSS.
function abbrevName(full: string): string {
  const t = (full ?? "").trim()
  if (!t) return t
  const sp = t.indexOf(" ")
  if (sp <= 0) return t
  const first = t.slice(0, sp)
  const rest = t.slice(sp + 1).trim()
  if (!rest) return first
  return `${first.charAt(0).toUpperCase()}. ${rest}`
}

// Nome ainda no fallback ("Player 1..4", legado "Jogador 1..4" ou vazio) — usado
// para detectar a ETAPA 1 (nomes não editados) da faixa de nomes do portrait.
// Reconhece o legado "Jogador" (partidas/jornada antigas) além do novo "Player".
function isFallbackName(n: string): boolean {
  const t = (n ?? "").trim()
  return !t || /^(player|jogador)\s*\d?$/i.test(t)
}

/** Rótulo fallback canônico por posição global (blue1=1, blue2=2, red1=3, red2=4). */
function fallbackLabel(team: "blue" | "red", idx: number): string {
  return `Player ${team === "blue" ? idx + 1 : idx + 3}`
}

/**
 * Nome para EXIBIÇÃO (portrait): fallback/vazio → "Player N" INTEIRO (nunca
 * abrevia); nome digitado pelo usuário → abreviação broadcast quando pedida
 * ("Eric Nice" → "E. Nice"). A abreviação NÃO se aplica a fallbacks.
 */
function displayName(raw: string, team: "blue" | "red", idx: number, abbrev: boolean): string {
  const t = (raw ?? "").trim()
  if (!t || isFallbackName(t)) return fallbackLabel(team, idx)
  return abbrev ? abbrevName(t) : t
}

// Guarda DEFENSIVA: um objeto de regras é do FORMATO esperado pela família do
// esporte atual da tela? Usado antes de aplicar rules remotas (set_config) e ao
// abrir o setup — regras de outra família (ex.: squash {target,winBy} chegando
// numa tela de tênis, que espera {gamesPerSet, tiebreak:{...}}) quebrariam o
// motor/RULE_SPECS. Só checa a PRESENÇA dos campos discriminantes; não valida
// valores (o motor tolera valores fora do range, só não tolera campo ausente).
function rulesMatchFamily(rules: any, family: "tennis" | "rally" | "sideout"): boolean {
  if (!rules || typeof rules !== "object") return false
  if (family === "tennis") {
    // tênis/beach/padel: discriminadas por `gamesPerSet` (numérico) — é o que
    // falta nas regras de rally ({target, winBy}). O desempate agora é o campo
    // único `tiebreakMode` (o motor tolera ausência → 'tb7' via resolveTiebreakMode),
    // então não é mais discriminante.
    return typeof rules.gamesPerSet === "number"
  }
  // rally/sideout (squash/ping pong/pickleball): contagem corrida por alvo.
  return typeof rules.target === "number" && typeof rules.winBy === "number"
}

// Janela do DUPLO-TOQUE (desfazer por gesto). Curta o bastante para não colidir
// com dois pontos legítimos consecutivos no mesmo lado (que, na marcação real,
// nunca acontecem em <300ms).
const DOUBLE_TAP_MS = 300

// Janela entre toques do TRIPLO-TOQUE que dispara o sorteio de saque (B1c). Um
// pouco mais folgada que o duplo-toque: são 3 toques deliberados na mesma bola.
const TRIPLE_TAP_MS = 400

// Quanto tempo o aviso "TROCA DE LADO" fica na tela antes de sumir sozinho.
// Curto de propósito: é um lembrete discreto, não um banner que domina a tela.
const SIDE_CHANGE_MS = 3000

/**
 * A jogada que ACABOU de ser marcada disparou uma troca de lado? Função PURA que
 * compara o estado ANTES e DEPOIS do ponto/game — só LÊ o GameState, NÃO altera
 * lib/scoring. Dispara na TRANSIÇÃO (a jogada que causou a condição), nunca em
 * re-render; e nunca no undo (o undo não passa por aqui). Regras por `mode`:
 *
 *  - "tennis-odd-games": total de games do set corrente ACABOU de virar ímpar
 *    (um game foi vencido e o set não fechou); no tiebreak, o total de pontos
 *    do tiebreak acabou de atingir um múltiplo de 6.
 *  - "each-game": um game ACABOU de fechar; e, no game DECISIVO (currentSet ===
 *    bestOf), quando o 1º lado atinge 5 pontos (regra do ping pong).
 *  - "none": nunca.
 *
 * Nunca avisa quando a partida acabou (não há próximo lado a trocar).
 */
function crossedSideChange(
  mode: SideChangeMode,
  before: GameState,
  after: GameState,
  bestOf: number,
): boolean {
  if (mode === "none" || after.finished) return false

  if (mode === "tennis-odd-games") {
    // Tiebreak: total de pontos acabou de bater múltiplo de 6.
    if (before.isTiebreak && after.isTiebreak) {
      const tb = after.A.tiebreakPoints + after.B.tiebreakPoints
      const tbBefore = before.A.tiebreakPoints + before.B.tiebreakPoints
      if (tb > 0 && tb % 6 === 0 && tb !== tbBefore) return true
    }
    // Games: total do set corrente subiu 1 (game vencido, set não fechou) e é ímpar.
    const gAfter = after.A.games + after.B.games
    const gBefore = before.A.games + before.B.games
    return gAfter === gBefore + 1 && gAfter % 2 === 1
  }

  if (mode === "each-game") {
    // Um game (unidade) acabou de fechar.
    if (after.completedSets.length > before.completedSets.length) return true
    // Game decisivo: primeiro lado a atingir 5 pontos.
    if (after.currentSet === bestOf) {
      if (after.A.points === 5 && before.A.points < 5) return true
      if (after.B.points === 5 && before.B.points < 5) return true
    }
    return false
  }

  return false
}

// Botão COMPARTILHAR: visual destacado (fundo sólido branco), diferente dos
// demais botões glass. Centralizado aqui para ajuste fácil de cor/efeito.
const SHARE_BTN_STYLE: CSSProperties = { background: "#ffffff", color: "#0a0a0a" }

// ZONA DE INFORMAÇÃO (portrait): azul SUPER ESCURO, quase preto — o mesmo do
// rodapé, consolidado como fundo do painel de placar geral E do menu bottom
// sheet. Contraste deliberado: claro = jogo, escuro = informação.
const INFO_BG = "#0a1024"

export default function JogoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const quadra = searchParams.get("quadra") || "1"

  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null)

  // Realtime da partida (bônus). Conectamos como 'editor' (dono do jogo). O
  // hook falha graciosamente: nada aqui bloqueia a marcação de pontos local.
  const rt = useRealtimeMatch()
  const [shareOpen, setShareOpen] = useState(false)
  // Evita recriar/reassinar a sala mais de uma vez por carga da tela.
  const realtimeInitRef = useRef(false)
  // Carregamento REMOTE-FIRST (aberto via link/QR com match=/edit=/view= na URL).
  const [remoteLoading, setRemoteLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  // Já vimos alguma ação de placar vinda do remoto? Usado para distinguir um
  // RESET legítimo (remoto zera após ter tido ações) de dado inicial/atrasado.
  const hadRemoteActionsRef = useRef(false)
  // Espelho estável do gameConfig (para o sync effect ler sem stale-closure).
  const gameConfigRef = useRef<GameConfig | null>(null)
  // Enquanto o dono faz o BACKFILL do histórico para a sala recém-criada, o
  // sync effect deve IGNORAR os broadcasts (senão o placar do dono regride).
  const backfillingRef = useRef(false)

  // Esporte da partida (do setup). Fica em estado (para o render decidir família
  // de placar) e em ref (para acesso estável dentro de rebuildEngine, sem closure
  // velha). Default tênis para partidas antigas sem `sport`.
  const [sport, setSport] = useState<SportId>("tennis")
  const sportRef = useRef<SportId>("tennis")

  // Tema de cor do placar (do setup). Aplicado como classe no container raiz —
  // o placar (contagem + broadcast) consome as variáveis CSS do tema. Persiste
  // na config da partida. Default Neutro (partidas antigas sem `theme`).
  const [theme, setTheme] = useState<ThemeId>("neutro")

  // Clube de contexto (quando a partida veio de /[clube]/...). Só para a
  // assinatura discreta do logo no topo do placar. Ausente = jogo genérico.
  const [clube, setClube] = useState<string | null>(null)

  // Motor de scoring: o engine é a fonte de verdade; espelhamos o GameState em
  // estado do React para disparar re-render. actions/rules/firstServer guardam
  // o necessário para persistir e reconstruir por replay. As regras são opacas
  // aqui (`any`): cada esporte tem seu próprio formato — o motor as consome.
  const engineRef = useRef<ScoringEngine<any> | null>(null)
  const actionsRef = useRef<Action[]>([])
  const rulesRef = useRef<any>(defaultRulesFor("tennis"))
  const firstServerRef = useRef<Side>("A")
  const [gameState, setGameState] = useState<GameState | null>(null)

  const [elapsedTime, setElapsedTime] = useState("00:00:00")
  const [startTime, setStartTime] = useState<Date | null>(null)
  // Lado cujo popup de edição de nomes está aberto (B1a). null = fechado. A
  // edição inline antiga (Input no canto/faixa) morreu — agora é o popup grande.
  const [editingSide, setEditingSide] = useState<null | "blue" | "red">(null)
  // Fase de seleção de sacador (B1b): as pílulas pulsam até o juiz ESCOLHER quem
  // saca. `serverChosen` desliga o pulso após a 1ª escolha; volta a false ao
  // reentrar no pré-jogo (undo até 0-0) — ver o effect abaixo.
  const [serverChosen, setServerChosen] = useState(false)

  // Orientação (reescrita do PORTRAIT — cidadão de 1ª classe). Detecta via
  // matchMedia (o CSS já usava orientation; aqui precisamos ramificar o JSX,
  // porque portrait e landscape são layouts distintos). SSR nasce portrait
  // (mobile-first); corrige no mount. Landscape mantém o layout atual.
  const [isPortrait, setIsPortrait] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)")
    const update = () => setIsPortrait(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])

  // Menu inferior recolhível (portrait): fechado = só a engrenagem.
  const [menuOpen, setMenuOpen] = useState(false)

  // "O sacador JÁ foi escolhido nesta partida?" (portrait). Diferente de
  // serverChosen (que o effect do B1b zera ao iniciar, p/ o landscape re-pulsar
  // no undo): este PERSISTE até uma partida nova. Assim, ao voltar ao 0-0 por
  // undo, as bolas do portrait NÃO re-pulsam se já houve escolha — mantêm a
  // amarela fixa e permitem re-escolha (regra do portrait). Reset em nova partida.
  const [serverEverChosen, setServerEverChosen] = useState(false)
  // Confirmação de RECOMEÇAR (modal do app, não window.confirm): aberta pelo
  // botão "Recomeçar" do bottom sheet.
  const [confirmRestartOpen, setConfirmRestartOpen] = useState(false)
  // Nomes COMBINADOS para exibição em superfícies que não são as pílulas
  // (tela de fim, broadcast): simples = "Nome"; duplas = "Nome1/Nome2".
  const [bluePlayerName, setBluePlayerName] = useState("")
  const [redPlayerName, setRedPlayerName] = useState("")
  const [animatingBlue, setAnimatingBlue] = useState(false)
  const [animatingRed, setAnimatingRed] = useState(false)
  // Overlay de configuração (a mesma tela de setup, aberta dentro do jogo).
  const [setupOpen, setSetupOpen] = useState(false)
  const [showOverview, setShowOverview] = useState(false)
  const overviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Voz: liga/desliga o anúncio (persistido). Default DESLIGADO — ver toggleVoice.
  // O speaker é a camada de som trocável (hoje: speechSynthesis).
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const speakerRef = useRef<Speaker | null>(null)
  // Timer do anúncio de UNDO (falado com um pequeno atraso após o cancel, para
  // não ser engolido pela corrida cancel→speak do speechSynthesis). Guardado em
  // ref para poder ser cancelado se uma ação mais nova chegar antes de falar.
  const undoSpeakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showThirdSetModal, setShowThirdSetModal] = useState(false)
  const [blueCardBlinking, setBlueCardBlinking] = useState(false)
  const [redCardBlinking, setRedCardBlinking] = useState(false)
  const [maxSets, setMaxSets] = useState(3)

  // Compartilhar o resultado: ref da "arte" (só a área visual a capturar, SEM
  // os botões) + estado de "gerando" para o feedback no botão e evitar cliques
  // repetidos enquanto a imagem é montada.
  const finishArtRef = useRef<HTMLDivElement>(null)
  const [sharing, setSharing] = useState(false)

  // Último toque de marcação (lado + instante), para reconhecer o DUPLO-TOQUE
  // que desfaz. Não dispara re-render (é só detecção de gesto) → fica em ref.
  const lastTapRef = useRef<{ team: "blue" | "red"; time: number } | null>(null)

  // SORTEIO DE SAQUE por TRIPLO-TOQUE numa bola (B1c). Contador de toques rápidos
  // por bola (key `${team}-${idx}`) em ref (só detecção). `drawing` roda a
  // animação; `drawHighlight` = bola destacada no frame atual do sorteio; o timer
  // encadeia os frames (desacelerando) e é limpo no unmount.
  const ballTapRef = useRef<{ key: string; count: number; time: number } | null>(null)
  const drawTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [drawHighlight, setDrawHighlight] = useState<{ team: "blue" | "red"; idx: number } | null>(null)

  // Aviso "TROCA DE LADO" (A2): disparado na TRANSIÇÃO por handleScoreClick,
  // some sozinho após SIDE_CHANGE_MS ou ao próximo toque. Só avisa — não troca
  // nada (o espelhamento é o gesto manual do juiz, fatia A1). SÓ aparece se o
  // juiz LIGOU o aviso no setup (padrão desligado).
  const [showSideChange, setShowSideChange] = useState(false)
  const sideChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Preferência do juiz (do setup): ligar/desligar o aviso. Padrão desligado.
  const [sideChangeAlert, setSideChangeAlert] = useState(false)
  // A dica "deslize para trocar" aparece só na PRIMEIRA exibição da partida.
  const [sideChangeHint, setSideChangeHint] = useState(false)
  const sideChangeHintUsedRef = useRef(false)

  // Espelhamento dos lados (A1): SÓ visual, SÓ deste aparelho. Alternado por
  // SWIPE horizontal no palco. `swipeStartRef` guarda o início do gesto;
  // `swipedRef` sinaliza que o release foi um swipe (não um toque), para o
  // handleScoreClick ABORTAR o ponto daquele release.
  const [mirrored, setMirrored] = useState(false)
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const swipedRef = useRef(false)

  // Confirmação de conexão (placar compartilhado). editorCount (do presence, já
  // exposto pelo hook) INCLUI este aparelho. Só a QUEDA vira toast — a subida é
  // confirmada no popup. `prevEditorCountRef` detecta a transição; o debounce
  // evita alertar no refresh do outro aparelho (leave+join rápido).
  const [showDisconnect, setShowDisconnect] = useState(false)
  const [disconnectMsg, setDisconnectMsg] = useState("")
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevEditorCountRef = useRef(0)
  const dropDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openScoreboard = () => {
    // Garantir que a URL tenha o parâmetro quadra corretamente
    const placarUrl = `/placar?quadra=${quadra}`
    window.open(placarUrl, "_blank")
  }

  // Deriva regras padrão a partir da config quando não há semente do motor
  // salva (ex.: partidas antigas). Para a família tênis, respeita o maxSets do
  // config (compat com o controle de "melhor de" da tela de jogo). Para os
  // demais esportes, usa os padrões do próprio esporte.
  const rulesFromConfig = (config: GameConfig): any => {
    const base = defaultRulesFor(config.sport)
    if (familyOf(config.sport) === "tennis") {
      return { ...base, bestOf: (config.maxSets || 3) === 5 ? 5 : 3 }
    }
    return base
  }

  // (Re)constrói o engine aplicando as ações por replay e reflete no estado.
  // Usa o MÓDULO do esporte atual (sportRef) — é aqui que "vira" squash, padel,
  // etc. em vez de tênis fixo.
  // TRANSACIONAL + PROTEGIDO: constrói o motor num engine LOCAL e só COMMITA nos
  // refs/estado se todo o replay passar. Qualquer exceção (ex.: regras de outra
  // família chegando por sync) é capturada e logada — mantém o ÚLTIMO ESTADO
  // VÁLIDO em vez de derrubar a tela (não há error boundary acima). Retorna
  // true/false para o chamador saber se aplicou.
  const rebuildEngine = (rules: any, firstServer: Side, actions: Action[]): boolean => {
    try {
      const module = sportById(sportRef.current).module
      const engine = new ScoringEngine(module, rules, firstServer)
      for (const a of actions) {
        if (a.kind === "game") engine.awardGameFor(a.side)
        else engine.pointFor(a.side)
      }
      // Commit só após sucesso — evita refs meio-atualizados/estado corrompido.
      engineRef.current = engine
      actionsRef.current = [...actions]
      rulesRef.current = rules
      firstServerRef.current = firstServer
      setGameState(engine.getState())
      return true
    } catch (err) {
      console.error(
        "[scoring] rebuildEngine falhou — mantendo o último estado válido (nada aplicado).",
        { err, sport: sportRef.current, rules },
      )
      return false
    }
  }

  // Persiste o suficiente para reconstruir o motor por quadra.
  const persist = () => {
    localStorage.setItem(
      `tennis_engine_${quadra}`,
      JSON.stringify({ rules: rulesRef.current, firstServer: firstServerRef.current, actions: actionsRef.current }),
    )
  }

  useEffect(() => {
    // --- PARTE A: REMOTE-FIRST (aberto via link/QR) -------------------------
    // Se a URL traz match + (edit OU view), carregamos o estado da SALA remota,
    // sem depender de config local e SEM redirecionar para a home.
    const matchParam = searchParams.get("match")
    const editParam = searchParams.get("edit")
    const viewParam = searchParams.get("view") // link de espectador (/placar) ou legado
    const vParam = searchParams.get("v") // view_token no link de EDITOR (novo)
    const sportParam = searchParams.get("sport")
    const themeParam = searchParams.get("theme")
    const scoreTypeParam = searchParams.get("scoreType")
    const gameTypeParam = searchParams.get("gameType")

    // O CANAL de broadcast é sempre calculado a partir do view_token (é assim que
    // o servidor transmite em apply_live_match_action). No link de espectador ele
    // vem em `view=`; no link de editor, em `v=`.
    const channelViewToken = viewParam || vParam || null
    // O edit_token autoriza ESCRITA (applyLiveMatchAction). Para a leitura inicial
    // qualquer um dos dois serve (get_live_match_state aceita view OU edit).
    const anyToken = channelViewToken || editParam
    // Token usado para assinar/ler: preferimos SEMPRE o view_token (canal certo);
    // só caímos no edit_token em links ANTIGOS de editor (sem &v=).
    const subscribeToken = channelViewToken || editParam

    if (matchParam && anyToken && !realtimeInitRef.current) {
      realtimeInitRef.current = true
      setRemoteLoading(true)
      setLoadError(false)

      // Sport/tema vêm pela URL (o servidor ainda não guarda) — setar ANTES do
      // rebuildEngine para instanciar o módulo de scoring certo e o tema real.
      const resolvedSport = (sportParam || "tennis") as SportId
      sportRef.current = resolvedSport
      setSport(resolvedSport)
      const resolvedTheme = (themeParam || "neutro") as ThemeId

      // Aviso de link ANTIGO: é editor (tem edit=) mas sem o view_token (&v=/view=).
      // Não quebra — segue com o edit_token, mas o canal ficará no tópico errado
      // (não receberá broadcasts). Gere um novo link de compartilhamento.
      if (editParam && !channelViewToken) {
        console.warn(
          "Link de editor em formato ANTIGO (sem &v=view_token): o canal de " +
            "broadcast ficará incorreto e este device não receberá atualizações " +
            "ao vivo. Gere um novo link de compartilhamento.",
        )
      }

      void (async () => {
        try {
          const remote = await getLiveMatchState(subscribeToken as string)
          if (!remote) {
            setLoadError(true)
            setRemoteLoading(false)
            return
          }

          const rState: any = remote.state || {}
          // Regras da sala só são aceitas se forem do FORMATO do esporte resolvido
          // (o mesmo da URL/motor). Sala com regras de outra família cairia no
          // default válido em vez de quebrar o motor no primeiro replay.
          const rRules = migrateRacketRules(
            rulesMatchFamily(rState.rules, familyOf(resolvedSport))
              ? rState.rules
              : defaultRulesFor(resolvedSport),
          )
          const rFirst: Side = rState.firstServer === "B" ? "B" : "A"

          // scoreType agora vive na RAIZ do state (padrão unificado set_config);
          // a URL (&scoreType=) é só fallback para salas/links antigos.
          const rawActions: any[] = Array.isArray(rState.actions) ? rState.actions : []
          const loadedScoreType: "pontos" | "games" =
            rState.scoreType === "games" || rState.scoreType === "pontos"
              ? rState.scoreType
              : scoreTypeParam === "games"
                ? "games"
                : "pontos"
          // Só point/game vão para o rebuildEngine (config vive na raiz, não aqui).
          const cleanActions: Action[] = []
          for (const a of rawActions) {
            if (a?.kind === "point" || a?.kind === "game") cleanActions.push({ kind: a.kind, side: a.side })
          }

          // Config SINTÉTICO mínimo: suficiente p/ a tela renderizar. Tema e
          // scoreType agora vêm da URL / histórico da sala, não mais fixos.
          const synthetic: GameConfig = {
            quadra,
            sport: resolvedSport,
            theme: resolvedTheme,
            // Join de link compartilhado: HERDA o formato do host pela URL
            // (&gameType=); fallback 'duplas' (padrão do clube) p/ links antigos.
            gameType: gameTypeParam === "simples" || gameTypeParam === "duplas" ? gameTypeParam : "duplas",
            scoreType: loadedScoreType,
            players: { blue1: "Player 1", blue2: "Player 2", red1: "Player 3", red2: "Player 4" },
            startTime: new Date().toISOString(),
            maxSets: (rRules?.bestOf as number) || 3,
            matchId: remote.id,
            editToken: editParam || undefined,
          }
          setGameConfig(synthetic)
          setTheme(resolvedTheme)
          setClube(null)
          setBluePlayerName("Player 1")
          setRedPlayerName("Player 3")
          setStartTime(new Date(synthetic.startTime))
          setMaxSets(synthetic.maxSets || 3)
          if (cleanActions.length > 0) hadRemoteActionsRef.current = true

          rebuildEngine(rRules, rFirst, cleanActions)
          setRemoteLoading(false)

          // Continua escutando o canal usando o VIEW_TOKEN (subscribeToken) para
          // o tópico bater com o do servidor. O papel é editor se há edit_token.
          await rt.subscribe(subscribeToken as string, remote.id, editParam ? "editor" : "viewer")
        } catch (err) {
          console.error("Carregamento remoto falhou:", err)
          setLoadError(true)
          setRemoteLoading(false)
        }
      })()
      return
    }

    // --- Fluxo LOCAL (inalterado) ------------------------------------------
    // Load game configuration from localStorage
    const storedConfig = localStorage.getItem(`tennis_match_${quadra}`)
    if (storedConfig) {
      const config = JSON.parse(storedConfig)
      setGameConfig(config)

      // Resolve o esporte ANTES de (re)construir o motor: config tem prioridade
      // (persiste), com a query como dica e tênis como fallback (partidas antigas).
      const resolvedSport = (config.sport || searchParams.get("sport") || "tennis") as SportId
      sportRef.current = resolvedSport
      setSport(resolvedSport)
      setTheme((config.theme as ThemeId) || "neutro")
      setClube(typeof config.clube === "string" ? config.clube : null)
      // Espelhamento (A1): tolerante a ausência (partidas antigas) → false.
      setMirrored(config.mirrored === true)
      // Aviso de troca de lado (A2): padrão desligado, tolerante a ausência.
      setSideChangeAlert(config.sideChangeAlert === true)

      setStartTime(new Date(config.startTime))
      setBluePlayerName(
        config.gameType === "simples" ? config.players.blue1 : `${config.players.blue1}/${config.players.blue2}`,
      )
      setRedPlayerName(
        config.gameType === "simples" ? config.players.red1 : `${config.players.red1}/${config.players.red2}`,
      )
      setMaxSets(config.maxSets || 3)

      // Reconstrói o estado do motor a partir do que foi persistido (replay).
      let rules = rulesFromConfig(config)
      let firstServer: Side = "A"
      let actions: Action[] = []
      const stored = localStorage.getItem(`tennis_engine_${quadra}`)
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          // MIGRAÇÃO: seed legado (flags tiebreak/superTiebreak) → tiebreakMode.
          if (parsed.rules) rules = migrateRacketRules(parsed.rules)
          if (parsed.firstServer === "A" || parsed.firstServer === "B") firstServer = parsed.firstServer
          if (Array.isArray(parsed.actions)) actions = parsed.actions
        } catch {
          // estado corrompido: começa limpo
        }
      }
      rebuildEngine(rules, firstServer, actions)

      // --- Realtime (BÔNUS, fire-and-forget) ---------------------------------
      // Roda DEPOIS do rebuildEngine e NÃO é aguardado: a tela já está pronta e
      // jogável. Qualquer falha aqui é silenciosa — o jogo é offline-first.
      if (!realtimeInitRef.current) {
        realtimeInitRef.current = true
        void (async () => {
          try {
            if (config.matchId && config.viewToken) {
              // Partida existente (reload): o dono volta como editor, sem criar
              // sala nova.
              await rt.subscribe(config.viewToken, config.matchId, "editor")
            } else {
              // Partida nova (nunca teve sala): cria uma e persiste os tokens
              // de volta no MESMO objeto de config (tennis_match_${quadra}).
              // Config inicial: a sala nasce já com scoreType/sacador/regras/
              // jogadores atuais (gravados no `state` pela RPC), sem depender de
              // set_config depois. O sport também viaja pela URL (&sport=).
              // Objeto em VARIÁVEL (não literal) para incluir `theme` sem exigir
              // que ele esteja na interface LiveMatchInitialState — o campo viaja
              // no jsonb e a RPC grava tudo na raiz do `state` da sala.
              const initialConfig = {
                scoreType: config.scoreType,
                firstServer: firstServerRef.current,
                rules: rulesRef.current,
                players: config.players,
                theme: config.theme ?? theme,
                sport: config.sport ?? sportRef.current,
              }
              const room = await createLiveMatch(config.clube, initialConfig)
              if (!room) return
              const updated: GameConfig = {
                ...config,
                matchId: room.id,
                viewToken: room.viewToken,
                editToken: room.editToken,
              }
              localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(updated))
              setGameConfig(updated)
              // Entra no canal como editor (presence/broadcast).
              await rt.subscribe(room.viewToken, room.id, "editor")

              // BACKFILL (Bug 2): se o dono já jogou pontos ANTES de compartilhar,
              // a sala nasce vazia e ele ficaria "à frente" do servidor para
              // sempre (rejeitando todo broadcast → sincronização unidirecional).
              // Reenvia o histórico local para a sala, em SEQUÊNCIA (ordem
              // preservada) e fire-and-forget. Enquanto isso, o sync effect é
              // silenciado (backfillingRef) para o placar do dono não regredir.
              const pending = actionsRef.current.slice()
              if (pending.length > 0) {
                backfillingRef.current = true
                try {
                  for (const a of pending) {
                    await rt.applyAction(room.editToken, room.id, { kind: a.kind, side: a.side })
                  }
                } finally {
                  backfillingRef.current = false
                }
              }
            }
          } catch (err) {
            // Sala é bônus: logar e seguir. O jogo NÃO depende disso.
            console.error("Realtime indisponível (jogo segue offline):", err)
          }
        })()
      }
    } else {
      // Redirect to configuration if no game is set up
      router.push(`/`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quadra, router])

  // Mantém o espelho do gameConfig sempre atual (lido pelo sync effect).
  useEffect(() => {
    gameConfigRef.current = gameConfig
  }, [gameConfig])

  // Aplica ao gameConfig LOCAL um patch de campos de configuração vindos do
  // remoto (scoreType, players, maxSets, theme). Atualiza também os nomes
  // exibidos (derivados de players) e o tema. "último patch vence" (sem acumular).
  const applyLocalConfig = (patch: {
    scoreType?: "pontos" | "games"
    players?: Partial<GameConfig["players"]>
    maxSets?: number
    theme?: ThemeId
  }) => {
    const prev = gameConfigRef.current
    if (!prev) return
    let changed = false
    const updated: GameConfig = { ...prev }

    if (patch.scoreType && prev.scoreType !== patch.scoreType) {
      updated.scoreType = patch.scoreType
      changed = true
    }
    let playersChanged = false
    if (patch.players) {
      const mergedPlayers = { ...prev.players, ...patch.players }
      if (JSON.stringify(mergedPlayers) !== JSON.stringify(prev.players)) {
        updated.players = mergedPlayers
        changed = true
        playersChanged = true
      }
    }
    let maxSetsChanged = false
    if (typeof patch.maxSets === "number" && prev.maxSets !== patch.maxSets) {
      updated.maxSets = patch.maxSets
      changed = true
      maxSetsChanged = true
    }
    let themeChanged = false
    if (patch.theme && prev.theme !== patch.theme) {
      updated.theme = patch.theme
      changed = true
      themeChanged = true
    }
    if (!changed) return

    gameConfigRef.current = updated
    setGameConfig(updated)
    try {
      localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(updated))
    } catch {
      // ignora
    }
    if (playersChanged) {
      const p = updated.players
      setBluePlayerName(updated.gameType === "simples" ? p.blue1 : `${p.blue1}/${p.blue2}`)
      setRedPlayerName(updated.gameType === "simples" ? p.red1 : `${p.red1}/${p.red2}`)
    }
    if (maxSetsChanged) setMaxSets(updated.maxSets || 3)
    if (themeChanged) setTheme(updated.theme as ThemeId)
  }

  // --- PARTE B: sincronização do PLACAR (broadcast → engine) ---------------
  // Observa rt.state (histórico de ações point/game) e reconstrói o engine com
  // dedup anti-eco + guards de RESET (vazio) e UNDO (prefixo do local). A CONFIG
  // (scoreType/players/firstServer/rules/theme) NÃO passa por aqui — vive na raiz
  // do state e é aplicada pela Parte B2.
  useEffect(() => {
    const remote = rt.state
    if (!Array.isArray(remote)) return

    // Durante o backfill do dono, os broadcasts (parciais) são ignorados para
    // não regredir o placar local — o dono já tem o histórico completo.
    if (backfillingRef.current) return

    // Esta Parte B cuida SÓ das ações de placar (point/game). Toda a CONFIG
    // (scoreType/players/firstServer/rules/theme) vive na RAIZ do state e é
    // aplicada pela Parte B2 — não é processada aqui dentro de actions.
    const scoreActions: Action[] = []
    let hasUnknown = false
    for (const a of remote as any[]) {
      if (a?.kind === "point" || a?.kind === "game") {
        scoreActions.push({ kind: a.kind, side: a.side })
        continue
      }
      hasUnknown = true // undo/reset crus ou algo inesperado
    }

    // Segurança: kind inesperado (não point/game) dentro de actions → NÃO
    // reconstrói o engine, mantém o local seguro (não adivinha).
    if (hasUnknown) {
      console.error("state.actions remoto com kind inesperado:", remote)
      return
    }

    if (scoreActions.length > 0) hadRemoteActionsRef.current = true

    const local = actionsRef.current

    // (2) Decide as ações-alvo com dedup anti-eco + guards.
    const sameActions =
      scoreActions.length === local.length &&
      scoreActions.every((a, i) => a.kind === local[i]?.kind && a.side === local[i]?.side)

    let targetActions: Action[] | null = sameActions ? null : scoreActions
    if (!sameActions && scoreActions.length < local.length) {
      // Remoto mais curto: aceita se for RESET (vazio, já vimos ações) ou UNDO
      // legítimo (remoto é PREFIXO EXATO do local). Caso contrário (divergência
      // real) protege contra out-of-order.
      const isReset = scoreActions.length === 0 && hadRemoteActionsRef.current
      const isPrefix = scoreActions.every(
        (a, i) => a.kind === local[i]?.kind && a.side === local[i]?.side,
      )
      if (!isReset && !isPrefix) targetActions = null
    }

    // Ações não mudaram → nada a reconstruir aqui (config é tratada na Parte B2).
    if (targetActions === null) return

    // Adota o novo placar (outro editor / undo / reset). Regras e sacador vêm dos
    // refs atuais (mantidos em dia pela Parte B2 / handlers locais).
    rebuildEngine(rulesRef.current, firstServerRef.current, targetActions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt.state])

  // --- PARTE B2: config da RAIZ do state (players/firstServer/rules) ---------
  // A RPC grava set_config na RAIZ do state (não em actions), então mudanças de
  // config NÃO alteram rt.state.length — o effect acima (deps [rt.state]) nunca
  // dispararia por elas. Aqui reagimos aos campos que o hook repassa da raiz:
  // remotePlayers/remoteFirstServer/remoteRules/remoteTheme/remoteScoreType. Cada
  // um tem dedup anti-eco: só aplica se o valor remoto DIFERE do que já temos (o
  // eco da própria ação já bate com o ref/config local e é ignorado).
  useEffect(() => {
   try {
    // players → gameConfig local. applyLocalConfig já deduplica por conteúdo
    // (só muda se diferente do players atual) e atualiza os nomes exibidos.
    if (rt.remotePlayers && typeof rt.remotePlayers === "object") {
      applyLocalConfig({ players: rt.remotePlayers })
    }

    // theme → aplica setTheme + gameConfig via applyLocalConfig (dedup por
    // conteúdo: só muda se diferente do tema atual). Não afeta o motor.
    if (rt.remoteTheme) {
      applyLocalConfig({ theme: rt.remoteTheme as ThemeId })
    }

    // scoreType → gameConfig local (dedup por conteúdo no applyLocalConfig).
    // Não afeta o motor: só muda a granularidade do próximo toque e o display.
    if (rt.remoteScoreType === "pontos" || rt.remoteScoreType === "games") {
      applyLocalConfig({ scoreType: rt.remoteScoreType })
    }

    // firstServer e rules podem exigir rebuild do motor. Combinamos num único
    // rebuild se qualquer um mudou (replay das ações atuais preserva o placar).
    let nextFirstServer = firstServerRef.current
    let nextRules = rulesRef.current
    let needRebuild = false

    if (
      (rt.remoteFirstServer === "A" || rt.remoteFirstServer === "B") &&
      rt.remoteFirstServer !== firstServerRef.current // dedup anti-eco
    ) {
      nextFirstServer = rt.remoteFirstServer
      needRebuild = true
    }

    // VALIDAÇÃO DE COMPATIBILIDADE (correção do crash): só adota rules remotas se
    // forem do FORMATO do esporte ATUAL da tela. Regras de outra família (ex.:
    // squash chegando por sync numa tela de tênis) quebrariam rebuildEngine/UI —
    // aqui IGNORAMOS o patch, avisamos, e mantemos as regras locais válidas.
    const remoteRulesObj =
      rt.remoteRules && typeof rt.remoteRules === "object" ? rt.remoteRules : null
    if (remoteRulesObj && !rulesMatchFamily(remoteRulesObj, familyOf(sportRef.current))) {
      console.warn(
        "[realtime] Regras remotas INCOMPATÍVEIS com o esporte atual — patch de set_config ignorado (mantendo regras locais).",
        { sportAtual: sportRef.current, familiaAtual: familyOf(sportRef.current), regrasRemotas: remoteRulesObj },
      )
    } else if (
      remoteRulesObj &&
      JSON.stringify(remoteRulesObj) !== JSON.stringify(rulesRef.current) // dedup anti-eco
    ) {
      nextRules = migrateRacketRules(remoteRulesObj) // legado remoto → tiebreakMode
      needRebuild = true
      const bo = (remoteRulesObj as any).bestOf
      if (bo === 3 || bo === 5) applyLocalConfig({ maxSets: bo })
    }

    if (needRebuild) {
      // Replay das ações ATUAIS com as novas regras/sacador — preserva o placar
      // (mesmo mecanismo do onSetupConfirm/toggleServing locais). rebuildEngine
      // já é protegido internamente (mantém o último estado válido em falha).
      rebuildEngine(nextRules, nextFirstServer, actionsRef.current)
    }
   } catch (err) {
     // Rede de segurança: nenhum dado remoto malformado deve derrubar a tela.
     console.error("[realtime] Falha ao aplicar config remota (set_config) — ignorado, estado local preservado.", err)
   }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt.remotePlayers, rt.remoteFirstServer, rt.remoteRules, rt.remoteTheme, rt.remoteScoreType])

  useEffect(() => {
    // Update elapsed time
    if (startTime) {
      const timer = setInterval(() => {
        const now = new Date()
        const diff = now.getTime() - startTime.getTime()

        const hours = Math.floor(diff / (1000 * 60 * 60))
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        const seconds = Math.floor((diff % (1000 * 60)) / 1000)

        setElapsedTime(
          `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
        )
      }, 1000)

      return () => clearInterval(timer)
    }
  }, [startTime])

  // Placar geral expandido: abre por toque no placar central e some sozinho
  // após ~5s (ou ao tocar fora). O timer é guardado em ref para poder ser
  // cancelado se o usuário fechar antes.
  const openOverview = () => {
    setShowOverview(true)
    if (overviewTimerRef.current) clearTimeout(overviewTimerRef.current)
    overviewTimerRef.current = setTimeout(() => setShowOverview(false), 5000)
  }
  const closeOverview = () => {
    if (overviewTimerRef.current) clearTimeout(overviewTimerRef.current)
    setShowOverview(false)
  }
  useEffect(() => {
    return () => {
      if (overviewTimerRef.current) clearTimeout(overviewTimerRef.current)
    }
  }, [])

  // Patrocinador da tela de FIM, resolvido por resolveSponsor (ADS estático →
  // cache → RPC). Fica aqui em cima, e não junto do resto dos dados de fim de
  // jogo lá embaixo, porque entre um ponto e outro existe um `return` antecipado
  // (o estado de carregando/erro): hook depois dele quebraria a ordem dos hooks.
  // null enquanto resolve e null quando não há patrocinador — a guarda de render
  // (`finishAd?.logoUrl`) já trata os dois como "não desenha o cartão", que é o
  // mesmo fallback gracioso de antes.
  //
  // Resolve no MOUNT do /jogo (o dep é a config, que carrega no início), não ao
  // fim da partida: quando a tela de fim aparece, minutos depois, já resolveu há
  // muito. Por isso o cartão não "pisca" e o PNG de compartilhamento nunca sai
  // sem o logo por corrida de tempo.
  const [finishAd, setFinishAd] = useState<Sponsor | null>(null)
  useEffect(() => {
    let alive = true
    resolveSponsor(gameConfig?.ad).then((s) => {
      if (alive) setFinishAd(s)
    })
    return () => {
      alive = false
    }
  }, [gameConfig?.ad])

  // Voz (client-only): instancia o speaker e restaura a preferência salva.
  // Default DESLIGADO (não surpreender o usuário com som — precisa optar).
  useEffect(() => {
    speakerRef.current = createSpeechSynthesisSpeaker()
    if (localStorage.getItem("voice_enabled") === "1") setVoiceEnabled(true)
    return () => {
      if (undoSpeakTimerRef.current) clearTimeout(undoSpeakTimerRef.current)
      if (sideChangeTimerRef.current) clearTimeout(sideChangeTimerRef.current)
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current)
      if (dropDebounceRef.current) clearTimeout(dropDebounceRef.current)
      speakerRef.current?.cancel()
    }
  }, [])

  // Queda de conexão no placar compartilhado: quando editorCount DIMINUI e não
  // recupera dentro do debounce (~1,5s → filtra o refresh do outro aparelho, que
  // é leave+join rápido), mostra um toast transitório. Só quando HAVIA outro
  // aparelho (baseline ≥ 2) e ESTE segue conectado (≥ 1) — assim não alertamos a
  // NOSSA própria queda (ir offline). editorCount inclui este aparelho.
  useEffect(() => {
    const prev = prevEditorCountRef.current
    const current = rt.editorCount
    prevEditorCountRef.current = current

    if (current < prev) {
      const baseline = prev
      if (dropDebounceRef.current) clearTimeout(dropDebounceRef.current)
      dropDebounceRef.current = setTimeout(() => {
        dropDebounceRef.current = null
        if (
          prevEditorCountRef.current < baseline && // ainda caído (não recuperou)
          baseline >= 2 && // havia outro aparelho
          prevEditorCountRef.current >= 1 // nós seguimos conectados
        ) {
          if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current)
          // Mensagem pela composição antes da queda: baseline 2 (você + 1) = "o
          // outro"; 3+ (você + vários) = "um aparelho". Nunca soa como "eu caí".
          setDisconnectMsg(
            baseline <= 2 ? "O outro aparelho saiu do placar" : "Um aparelho saiu do placar",
          )
          setShowDisconnect(true)
          disconnectTimerRef.current = setTimeout(() => {
            disconnectTimerRef.current = null
            setShowDisconnect(false)
          }, 3000)
        }
      }, 1500)
    } else if (current > prev) {
      // Recuperou/cresceu antes do debounce: era o refresh do outro — não alerta.
      if (dropDebounceRef.current) {
        clearTimeout(dropDebounceRef.current)
        dropDebounceRef.current = null
      }
    }
  }, [rt.editorCount])

  // Rearma o pulso de seleção de sacador (B1b): ao SAIR do pré-jogo (1º ponto),
  // zera `serverChosen` para que uma futura volta ao 0-0 (undo/reset) faça as
  // pílulas pulsarem de novo. Deriva "started" do gameState (só leitura).
  useEffect(() => {
    if (!gameState) return
    const startedNow =
      gameState.A.points > 0 ||
      gameState.B.points > 0 ||
      gameState.A.games > 0 ||
      gameState.B.games > 0 ||
      gameState.A.sets > 0 ||
      gameState.B.sets > 0 ||
      gameState.completedSets.length > 0
    if (startedNow) setServerChosen(false)
  }, [gameState])

  const toggleVoice = () => {
    setVoiceEnabled((prev) => {
      const next = !prev
      localStorage.setItem("voice_enabled", next ? "1" : "0")
      if (!next) speakerRef.current?.cancel() // ao mutar, corta a fala em curso
      return next
    })
  }

  // --- PARTE C: envio de ações à sala (fire-and-forget, offline-first) ------
  // Resolve o edit_token/matchId disponível (dono via gameConfig OU editor
  // convidado via URL). Sem eles (jogo local puro ou espectador) não envia nada.
  // NUNCA aguardamos: marcar ponto é instantâneo; o Realtime é paralelo e pode
  // falhar em silêncio.
  const sendRealtimeAction = (action: {
    kind: string
    side?: Side
    value?: string
    patch?: Record<string, any>
  }) => {
    const editToken = gameConfig?.editToken || searchParams.get("edit") || undefined
    const matchId = gameConfig?.matchId || searchParams.get("match") || undefined
    if (!editToken || !matchId) return
    void Promise.resolve(rt.applyAction(editToken, matchId, action)).catch((err) => {
      console.error("Envio de ação ao Supabase falhou (jogo segue local):", err)
    })
  }

  // Esconde o aviso de troca de lado (e cancela o timer de auto-hide).
  const hideSideChange = () => {
    if (sideChangeTimerRef.current) {
      clearTimeout(sideChangeTimerRef.current)
      sideChangeTimerRef.current = null
    }
    setShowSideChange(false)
  }

  // Mostra o aviso e agenda o auto-hide. Chamado só na transição (ver
  // crossedSideChange) e só com o aviso LIGADO. A dica "deslize para trocar"
  // acompanha apenas a PRIMEIRA exibição da partida.
  const flashSideChange = () => {
    if (sideChangeTimerRef.current) clearTimeout(sideChangeTimerRef.current)
    const primeira = !sideChangeHintUsedRef.current
    sideChangeHintUsedRef.current = true
    setSideChangeHint(primeira)
    setShowSideChange(true)
    sideChangeTimerRef.current = setTimeout(() => {
      sideChangeTimerRef.current = null
      setShowSideChange(false)
    }, SIDE_CHANGE_MS)
  }

  // Alterna o espelhamento (A1). SÓ visual e SÓ deste aparelho: persiste no
  // config LOCAL (sobrevive a reload) e NÃO propaga para a sala (o telão segue
  // canônico). Tolerante a config ausente. O aviso de troca some ao virar.
  const toggleMirror = () => {
    hideSideChange()
    setMirrored((m) => {
      const next = !m
      const cfg = gameConfigRef.current
      if (cfg) {
        const updated: GameConfig = { ...cfg, mirrored: next }
        gameConfigRef.current = updated
        setGameConfig(updated)
        try {
          localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(updated))
        } catch {
          // Sem localStorage (aba privada): o espelhamento vale só nesta sessão.
        }
      }
      return next
    })
  }

  const handleScoreClick = (team: "blue" | "red") => {
    const engine = engineRef.current
    if (!engine) return

    // ANTI-PONTO-ACIDENTAL (A1): se o release que gerou este click foi um SWIPE
    // (detectado em onPointerUp do palco), consome-o e NÃO marca ponto. Também
    // não arma o duplo-toque. `swipedRef` é rearmado (false) a cada onPointerDown,
    // então nunca fica "preso" matando um toque futuro.
    if (swipedRef.current) {
      swipedRef.current = false
      return
    }

    // Durante o sorteio de saque (B1c) a tela está "animando" — ignora marcação
    // acidental até o sorteio terminar (então volta ao normal, ainda pré-jogo).
    if (drawing) return

    // Qualquer toque some com o aviso de troca de lado (some "ao próximo toque").
    // Se ESTE mesmo toque disparar uma nova troca, o flash reabre logo abaixo.
    hideSideChange()

    // DUPLO-TOQUE (2 toques rápidos no MESMO lado, ≤300ms) = DESFAZER. Como
    // marcar é INSTANTÂNEO (o toque simples nunca espera), o 1º toque do gesto já
    // marcou um ponto; este 2º toque NÃO marca e desfaz DOIS (o ponto que o 1º
    // toque acabou de marcar + o último ponto real) — efeito líquido idêntico a
    // apertar VOLTAR uma vez, e dispara a MESMA voz de undo (announceUndo). A
    // detecção acontece ANTES de marcar, então o toque simples não ganha atraso.
    const now = Date.now()
    const last = lastTapRef.current
    if (last && last.team === team && now - last.time <= DOUBLE_TAP_MS) {
      lastTapRef.current = null
      undoPoints(2)
      return
    }

    if (engine.getState().finished) return

    const side = sideOf(team)

    // Snapshot ANTES da jogada — base da detecção de troca de lado (transição).
    const before = engine.getState()

    // Granularidade: modo "games" concede o game inteiro; senão, marca 1 ponto.
    const kind: "point" | "game" = gameConfig?.scoreType === "games" ? "game" : "point"
    if (kind === "game") {
      engine.awardGameFor(side)
      actionsRef.current.push({ kind: "game", side })
    } else {
      engine.pointFor(side)
      actionsRef.current.push({ kind: "point", side })
    }

    const after = engine.getState()
    setGameState(after)
    persist()

    // Aviso de troca de lado (A2): só se o juiz LIGOU, e só na TRANSIÇÃO
    // conforme a regra do esporte. A detecção roda igual; só a exibição é opt-in.
    if (
      sideChangeAlert &&
      crossedSideChange(sideChangeOf(sport), before, after, (rulesRef.current?.bestOf as number) || 3)
    ) {
      flashSideChange()
    }
    // Espelha a ação na sala (paralelo; não bloqueia a marcação local).
    sendRealtimeAction({ kind, side })

    // Arma o duplo-toque: registra este toque (que REALMENTE marcou) para que um
    // 2º toque rápido no mesmo lado seja reconhecido como "desfazer".
    lastTapRef.current = { team, time: now }

    // Animate the score: crescer do número (.score-animation, 0.3s) + FLASH de
    // fundo invertido (.point-flash, 0.34s) — os dois pendurados no mesmo estado
    // `animating`. 360ms cobre a maior das duas p/ a classe não sair no meio.
    if (team === "blue") {
      setAnimatingBlue(true)
      setTimeout(() => setAnimatingBlue(false), 360)
    } else {
      setAnimatingRed(true)
      setTimeout(() => setAnimatingRed(false), 360)
    }

    // Piscar o card do vencedor quando um game/set/partida é fechado.
    const events = engine.getLastEvents()
    const won = events.find((e) => e.type === "GAME" || e.type === "SET" || e.type === "MATCH")
    if (won?.side === "A") {
      setBlueCardBlinking(true)
      setTimeout(() => setBlueCardBlinking(false), 1500)
    } else if (won?.side === "B") {
      setRedCardBlinking(true)
      setTimeout(() => setRedCardBlinking(false), 1500)
    }

    // Voz (NÃO-BLOQUEANTE): reage aos eventos que o motor acabou de emitir.
    // A marcação e o re-render já foram disparados acima (setGameState/persist);
    // só então calculamos o texto e falamos. speechSynthesis.speak() não bloqueia
    // e o próprio speaker cancela a fala anterior (sem fila). Usamos queueMicrotask
    // para desacoplar do handler sem sair da mesma "tarefa" — preserva o gesto do
    // usuário (alguns navegadores exigem a fala dentro do gesto) e não atrasa o
    // ponto. A voz é apenas o "preto e branco": trocável depois sem mexer nisto.
    if (voiceEnabled) {
      // Um ponto novo é mais recente que qualquer undo agendado: descarta o timer
      // pendente para "corrigido" não falar por cima do ponto que acabou de sair.
      if (undoSpeakTimerRef.current) {
        clearTimeout(undoSpeakTimerRef.current)
        undoSpeakTimerRef.current = null
      }
      const speech = announce(events, engine.getState(), { lang: "pt-BR", sport })
      if (speech) {
        const speaker = speakerRef.current
        queueMicrotask(() => speaker?.speak(speech.text, { lang: "pt-BR" }))
      }
    }
  }

  // Desfaz até `times` marcações do motor e anuncia UMA vez o placar corrigido.
  //  - times=1: botão VOLTAR / ação do setup — desfaz o último ponto real.
  //  - times=2: duplo-toque — como o 1º toque do gesto já marcou (instantâneo),
  //    desfazer 2 tem o MESMO efeito líquido de VOLTAR uma vez (remove o último
  //    ponto real e cancela o ponto que o gesto acabou de marcar).
  // Só anuncia se algo foi de fato desfeito (respeita canUndo).
  const undoPoints = (times: number) => {
    const engine = engineRef.current
    if (!engine) return
    speakerRef.current?.cancel() // corta um anúncio em curso ao voltar o ponto
    let undone = 0
    for (let i = 0; i < times; i++) {
      if (!engine.canUndo()) break
      engine.undo()
      actionsRef.current.pop()
      undone++
    }
    if (undone === 0) return
    lastTapRef.current = null // qualquer undo encerra a "janela" de duplo-toque
    const state = engine.getState()
    setGameState(state)
    persist()
    // Espelha na sala: um {kind:'undo'} por ponto desfeito (paralelo, best-effort).
    // ⚠️ INTENCIONAL (modelo do marcador de tecido): no placar compartilhado o
    // undo remove a ÚLTIMA ação da sala, de QUALQUER aparelho — se um lado
    // desfaz logo após o ponto do outro, é o ponto do outro que sai. Qualquer
    // aparelho manipula o último estado, como no marcador físico. NÃO é bug.
    for (let i = 0; i < undone; i++) sendRealtimeAction({ kind: "undo" })

    // Voz ao desfazer (se ligada): palavra curta de correção + placar corrigido
    // recantado, pelo MESMO caminho isolado (announcer + speaker).
    //
    // No DUPLO-TOQUE o 1º toque acabou de anunciar o PONTO — essa fala ainda pode
    // estar em curso quando o gesto desfaz. O speakerRef.current?.cancel() no topo
    // desta função corta essa fala, mas interromper uma locução e emitir OUTRA no
    // MESMO instante faz o speechSynthesis (Chrome) engolir a nova (corrida
    // cancel→speak) — era por isso que o botão VOLTAR falava (nada em curso) e o
    // duplo-toque não. Solução: agendar a fala do undo num pequeno atraso, dando
    // tempo do cancel assentar; assim "corrigido" é a ÚLTIMA fala e não é cortada.
    // Isso atrasa só a VOZ do undo (~200ms, imperceptível), nunca a marcação. O
    // timer é guardado/descartável para um ponto novo (ou outro undo) substituí-lo.
    if (voiceEnabled) {
      const speech = announceUndo(state, { lang: "pt-BR", sport })
      if (speech) {
        const speaker = speakerRef.current
        if (undoSpeakTimerRef.current) clearTimeout(undoSpeakTimerRef.current)
        undoSpeakTimerRef.current = setTimeout(() => {
          undoSpeakTimerRef.current = null
          speaker?.speak(speech.text, { lang: "pt-BR" })
        }, 200)
      }
    }
  }

  // Caminho confiável de undo (botão VOLTAR + ação do setup): desfaz 1 ponto.
  const undoLastPoint = () => undoPoints(1)

  // Escolha do sacador inicial pelo TOQUE numa pílula (B1b) — substitui o antigo
  // chip SAQUE. Grava o LADO (firstServer, mesma escrita do toggle antigo:
  // rebuild do motor com ações vazias) E o jogador do lado (initialServer[side];
  // em simples sempre 0). Sincroniza ambos. Só age no pré-jogo (sem ações).
  const chooseServer = (team: "blue" | "red", playerIndex: number) => {
    if (actionsRef.current.length !== 0) return
    const side = sideOf(team) // "A" | "B"

    // 1) LADO → firstServer (o motor).
    rebuildEngine(rulesRef.current, side, [])
    persist()
    sendRealtimeAction({ kind: "set_config", patch: { firstServer: side } })

    // 2) JOGADOR do lado → initialServer[side] (config; UI/derivação, não o motor).
    const c = gameConfigRef.current
    if (c) {
      const idx: 0 | 1 = c.gameType === "duplas" && playerIndex === 1 ? 1 : 0
      const initialServer = {
        A: c.initialServer?.A ?? 0,
        B: c.initialServer?.B ?? 0,
        [side]: idx,
      } as { A: 0 | 1; B: 0 | 1 }
      const newConfig: GameConfig = { ...c, initialServer }
      setGameConfig(newConfig)
      gameConfigRef.current = newConfig
      try {
        localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(newConfig))
      } catch {
        // aba privada / cota
      }
      sendRealtimeAction({ kind: "set_config", patch: { initialServer } })
    }

    setServerChosen(true) // para o pulso (landscape/B1b); a bola já salta
    setServerEverChosen(true) // portrait: escolha registrada até a próxima partida
  }

  // Candidatos do sorteio = jogadores EXISTENTES: duplas → os 4; simples → os 2.
  const drawCandidates = (): { team: "blue" | "red"; idx: number }[] => {
    const duplas = gameConfigRef.current?.gameType === "duplas"
    return duplas
      ? [
          { team: "blue", idx: 0 },
          { team: "blue", idx: 1 },
          { team: "red", idx: 0 },
          { team: "red", idx: 1 },
        ]
      : [
          { team: "blue", idx: 0 },
          { team: "red", idx: 0 },
        ]
  }

  // SORTEIO ANIMADO do sacador inicial (B1c). As bolas "piscam" alternando o
  // destaque amarelo aleatoriamente entre os jogadores, DESACELERANDO (~1,5s), e
  // param num sorteado. O resultado grava firstServer + initialServer pelo MESMO
  // chooseServer do toque manual. Só pré-jogo; ignora se já estiver rodando.
  const startServerDraw = () => {
    if (drawing || started) return
    const cands = drawCandidates()
    // Intervalos crescentes (desaceleração), somando ~1,5s.
    const steps = [55, 60, 65, 75, 90, 110, 135, 165, 200, 240, 285]
    setDrawing(true)
    let i = 0
    let last = -1
    const pick = () => {
      // evita repetir o mesmo destaque duas vezes seguidas (leitura melhor).
      let n = Math.floor(Math.random() * cands.length)
      if (cands.length > 1 && n === last) n = (n + 1) % cands.length
      last = n
      return cands[n]
    }
    const tick = () => {
      setDrawHighlight(pick())
      i += 1
      if (i < steps.length) {
        drawTimerRef.current = setTimeout(tick, steps[i])
      } else {
        const winner = pick()
        setDrawHighlight(winner)
        drawTimerRef.current = setTimeout(() => {
          setDrawing(false)
          setDrawHighlight(null)
          chooseServer(winner.team, winner.idx) // grava firstServer + initialServer
        }, 380)
      }
    }
    drawTimerRef.current = setTimeout(tick, steps[0])
  }

  // Toque numa BOLA de saque no pré-jogo: 1 toque escolhe aquele jogador
  // (chooseServer); 3 toques rápidos na MESMA bola disparam o SORTEIO. Não colide
  // com o duplo-toque→undo (que vive no bloco de toque, atrás da pílula).
  const onServeBallTap = (team: "blue" | "red", idx: number) => {
    if (started || drawing) return
    const key = `${team}-${idx}`
    const now = Date.now()
    const prev = ballTapRef.current
    const count = prev && prev.key === key && now - prev.time <= TRIPLE_TAP_MS ? prev.count + 1 : 1
    ballTapRef.current = { key, count, time: now }
    if (count >= 3) {
      ballTapRef.current = null
      startServerDraw()
      return
    }
    chooseServer(team, idx)
  }

  // Limpa o timer do sorteio no unmount (evita setState após desmontar).
  useEffect(() => () => {
    if (drawTimerRef.current) clearTimeout(drawTimerRef.current)
  }, [])

  const toggleScoreType = () => {
    if (!gameConfig) return

    const next: "pontos" | "games" = gameConfig.scoreType === "pontos" ? "games" : "pontos"
    const newConfig = { ...gameConfig, scoreType: next }

    // (a) Efeito local imediato (como antes).
    setGameConfig(newConfig)
    gameConfigRef.current = newConfig
    localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(newConfig))
    // (b) Propaga o modo pelo padrão UNIFICADO set_config (raiz do state), igual
    // a players/firstServer/rules/theme. A escolha vale para todos os devices.
    sendRealtimeAction({ kind: "set_config", patch: { scoreType: next } })
  }

  const handleThirdSetChoice = (_playTiebreak: boolean) => {
    // Fase 0: a escolha de tiebreak/super tiebreak do set decisivo ainda não é
    // exposta ao motor (refinamento futuro). Apenas fecha o modal.
    setShowThirdSetModal(false)
  }

  // Grava os nomes de um lado a partir do popup (B1a): estruturado (p1/p2), SEM
  // a antiga convenção de split por "/". Em simples só p1 conta. Persiste, mantém
  // os nomes COMBINADOS em sincronia (tela de fim/broadcast) e propaga players
  // pelo mesmo set_config de sempre.
  const saveNames = (team: "blue" | "red", p1: string, p2: string) => {
    const cfg = gameConfigRef.current
    if (!cfg) return
    const duplas = cfg.gameType === "duplas"
    const players = { ...cfg.players }
    if (team === "blue") {
      players.blue1 = p1
      if (duplas) players.blue2 = p2
    } else {
      players.red1 = p1
      if (duplas) players.red2 = p2
    }

    const newConfig: GameConfig = { ...cfg, players }
    setGameConfig(newConfig)
    gameConfigRef.current = newConfig
    try {
      localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(newConfig))
    } catch {
      // aba privada / cota: segue só em memória
    }

    setBluePlayerName(duplas ? `${players.blue1}/${players.blue2}` : players.blue1)
    setRedPlayerName(duplas ? `${players.red1}/${players.red2}` : players.red1)

    sendRealtimeAction({ kind: "set_config", patch: { players } })
  }

  // Troca o FORMATO da partida (simples↔duplas) do popup de nomes — mesmo campo
  // que o toggle do settings grava. Persiste, re-deriva os nomes combinados e
  // propaga via set_config (como o settings). As pílulas passam a mostrar 1↔2.
  const setMatchGameType = (newGt: string) => {
    const cfg = gameConfigRef.current
    if (!cfg) return
    const newConfig: GameConfig = { ...cfg, gameType: newGt }
    setGameConfig(newConfig)
    gameConfigRef.current = newConfig
    try {
      localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(newConfig))
    } catch {
      // aba privada / cota
    }
    const p = newConfig.players
    setBluePlayerName(newGt === "duplas" ? `${p.blue1}/${p.blue2}` : p.blue1)
    setRedPlayerName(newGt === "duplas" ? `${p.red1}/${p.red2}` : p.red1)
    sendRealtimeAction({ kind: "set_config", patch: { gameType: newGt } })
  }

  // RECOMEÇAR a partida: zera o placar MANTENDO a config (jogadores, gameType,
  // initialServer, tema — tudo vive no gameConfig, fora do motor). Reconstrói o
  // motor com ações vazias, permanece na tela de jogo e volta à fase PRÉ-JOGO
  // (serverChosen/EverChosen = false → pode reescolher o saque). Sincroniza o
  // reset pelo mesmo canal (o 2º aparelho zera junto). SEM confirm nativo — a
  // confirmação é o ConfirmModal do app.
  const restartMatch = () => {
    localStorage.removeItem(`tennis_engine_${quadra}`)
    localStorage.removeItem(`tennis_score_${quadra}`)
    rebuildEngine(rulesRef.current, "A", [])
    persist()
    setServerChosen(false)
    setServerEverChosen(false) // volta a convidar a escolha de saque
    sendRealtimeAction({ kind: "reset" }) // zera a sala também (best-effort)
  }

  // Legado (overlay de setup): mantém o confirm nativo por ora — fora do escopo
  // do menu de ações. Reaproveita restartMatch para não duplicar a reconstrução.
  const resetGame = () => {
    if (confirm("Tem certeza que deseja reiniciar o jogo? Todos os dados serão perdidos.")) {
      restartMatch()
    }
  }

  // "Jogar de novo" da TELA DE FIM: zera o placar mantendo o MESMO config e os
  // mesmos jogadores. Reaproveita a reconstrução do resetGame, sem o confirm —
  // a partida já acabou, não há o que perder. finished volta a false → a tela de
  // fim some e o placar normal reaparece zerado.
  const playAgain = () => {
    localStorage.removeItem(`tennis_engine_${quadra}`)
    localStorage.removeItem(`tennis_score_${quadra}`)
    rebuildEngine(rulesRef.current, "A", [])
    persist()
    setServerEverChosen(false)
    sendRealtimeAction({ kind: "reset" }) // zera a sala também (best-effort)
  }

  // COMPARTILHAR o resultado: captura a "arte" (finishArtRef — só o card visual,
  // sem os botões) como PNG e abre o menu NATIVO de compartilhamento com o
  // arquivo anexado (WhatsApp, Instagram, etc.). Fluxo:
  //  1) html-to-image (import dinâmico → fora do bundle até o 1º uso) → Blob PNG;
  //  2) monta um File e tenta navigator.share({ files }) se canShare aceitar;
  //  3) FALLBACK (desktop/navegadores sem share de arquivos): baixa o PNG.
  // Erros são tratados sem quebrar a tela; cancelar o share nativo (AbortError)
  // é silencioso. O estado `sharing` dá o feedback "Gerando..." e trava recliques.
  const shareResult = async () => {
    const node = finishArtRef.current
    if (!node || sharing) return
    setSharing(true)
    try {
      const { toBlob } = await import("html-to-image")
      const blob = await toBlob(node, { pixelRatio: 2, cacheBust: true })
      if (!blob) throw new Error("não foi possível gerar a imagem")
      const file = new File([blob], `resultado-quadra-${quadra}.png`, { type: "image/png" })

      const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean }
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({
          files: [file],
          title: "Resultado da partida",
          text: `${winnerName} venceu!`,
        })
      } else {
        // Fallback: baixar a imagem (link de download temporário).
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = file.name
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      // Usuário cancelou o menu nativo → silencioso; demais falhas, loga.
      if ((err as Error)?.name !== "AbortError") {
        console.error("Compartilhar falhou:", err)
      }
    } finally {
      setSharing(false)
    }
  }

  // Encerrar a partida: descarta o jogo desta quadra e volta pra home.
  // (Ação herdada do antigo GameMenu — ver rodapé do overlay de config.)
  const endMatch = () => {
    if (confirm("Tem certeza que deseja encerrar o jogo? Você será redirecionado para a tela inicial.")) {
      localStorage.removeItem(`tennis_match_${quadra}`)
      localStorage.removeItem(`tennis_engine_${quadra}`)
      localStorage.removeItem(`tennis_score_${quadra}`)
      router.push("/")
    }
  }

  // Inicia uma NOVA partida NESTA quadra com outro esporte/regras (troca de
  // esporte no meio). Zera o placar (novo esporte = partida nova) e reconstrói o
  // motor com o MÓDULO do novo esporte. sportRef precisa estar setado ANTES do
  // rebuildEngine (ele lê o módulo por sportRef.current).
  const startNewMatch = (
    nextSport: SportId,
    nextRules: any,
    nextTheme: ThemeId,
    nextSideChangeAlert: boolean,
    nextGameType: string,
  ) => {
    sportRef.current = nextSport
    setSport(nextSport)
    setTheme(nextTheme)
    setSideChangeAlert(nextSideChangeAlert)

    const now = new Date()
    setStartTime(now)
    setMaxSets(nextRules.bestOf ?? 3)

    if (gameConfig) {
      const newConfig: GameConfig = {
        ...gameConfig,
        sport: nextSport,
        theme: nextTheme,
        sideChangeAlert: nextSideChangeAlert,
        gameType: nextGameType,
        initialServer: { A: 0, B: 0 }, // partida nova → sacador individual no padrão
        startTime: now.toISOString(),
        maxSets: nextRules.bestOf ?? 3,
      }
      setGameConfig(newConfig)
      localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(newConfig))
      // Nomes combinados podem mudar de forma se o formato mudou (simples↔duplas).
      const p = newConfig.players
      setBluePlayerName(nextGameType === "duplas" ? `${p.blue1}/${p.blue2}` : p.blue1)
      setRedPlayerName(nextGameType === "duplas" ? `${p.red1}/${p.red2}` : p.red1)
    }
    localStorage.removeItem(`tennis_score_${quadra}`)

    // rebuildEngine cuida de rules/actions/firstServer refs + estado. Ações
    // vazias = placar zerado.
    rebuildEngine(nextRules, "A", [])
    persist()
    setServerEverChosen(false)
  }

  // Decisão do overlay de config (a tela de setup dentro do jogo):
  //  - MESMO esporte  → CASO 1: aplica a regra nova MANTENDO o placar. O motor é
  //    reconstruído com as novas regras e RE-HIDRATADO pelo replay das ações já
  //    feitas (mesmo mecanismo usado na persistência), então pontos/games/sets
  //    são preservados e a regra vale daqui pra frente. NÃO recomeça a partida.
  //  - OUTRO esporte  → CASO 2: confirma e inicia uma partida nova (startNewMatch).
  const onSetupConfirm = (
    nextSport: SportId,
    nextRules: any,
    sportChanged: boolean,
    nextTheme: ThemeId,
    nextSideChangeAlert: boolean,
    nextGameType: string,
  ) => {
    if (!sportChanged) {
      // O tema é personalização: aplica SEM recomeçar a partida (só recolore).
      rebuildEngine(nextRules, firstServerRef.current, actionsRef.current)
      setTheme(nextTheme)
      // Aviso de troca de lado: preferência LOCAL do juiz (não vai para o sync).
      setSideChangeAlert(nextSideChangeAlert)
      if (gameConfig) {
        const newConfig: GameConfig = {
          ...gameConfig,
          theme: nextTheme,
          sideChangeAlert: nextSideChangeAlert,
          gameType: nextGameType,
          maxSets: nextRules.bestOf ?? gameConfig.maxSets,
        }
        setGameConfig(newConfig)
        gameConfigRef.current = newConfig
        localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(newConfig))
        // Se o formato mudou (simples↔duplas), a forma dos nomes combinados muda.
        const p = newConfig.players
        setBluePlayerName(nextGameType === "duplas" ? `${p.blue1}/${p.blue2}` : p.blue1)
        setRedPlayerName(nextGameType === "duplas" ? `${p.red1}/${p.red2}` : p.red1)
      }
      setMaxSets(nextRules.bestOf ?? maxSets)
      persist()
      // Propaga REGRAS (bestOf/tiebreak/vantagem) e TEMA para os outros devices.
      // sideChangeAlert e gameType NÃO entram: preferência/estado local (gameType
      // viaja por URL no join; o hook não expõe remoteGameType).
      sendRealtimeAction({ kind: "set_config", patch: { rules: nextRules, theme: nextTheme } })
      setSetupOpen(false)
      return
    }
    if (confirm("Trocar de esporte vai iniciar uma nova partida. Continuar?")) {
      startNewMatch(nextSport, nextRules, nextTheme, nextSideChangeAlert, nextGameType)
      setSetupOpen(false)
    }
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 p-6 text-center">
        <p className="text-lg font-semibold">Não foi possível carregar esta partida</p>
        <p className="text-sm opacity-70">O link pode ter expirado ou a sala não existe mais.</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-2 rounded-full bg-white px-5 py-2 text-sm font-bold text-neutral-900 active:scale-95 transition"
        >
          Voltar ao início
        </button>
      </div>
    )
  }

  if (remoteLoading || !gameConfig || !gameState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        {remoteLoading ? "Carregando partida ao vivo..." : "Carregando..."}
      </div>
    )
  }

  // --- Derivações de exibição a partir do GameState do motor (blue=A, red=B) ---
  const gs = gameState
  // Config não-nulo após o guard acima — capturado num const para as closures
  // de render (renderNameFaixa/renderTouchBlock) o enxergarem estreitado.
  const cfg = gameConfig
  const finished = gs.finished
  const blueWinner = gs.winner === "A"
  const redWinner = gs.winner === "B"
  // Sacador a EXIBIR: fora do tiebreak = gs.server; DURANTE o tiebreak, o motor
  // congela state.server no 1º sacador (só roda por game), então derivamos a
  // alternância 1-2-2 ponto a ponto via displayServer (lê o estado, não altera
  // o motor). É isto que posiciona a bola de saque no jogador certo.
  const server = displayServer(gs)
  const blueServing = server === "A"
  const isTiebreak = gs.isTiebreak
  // "início da partida" = nenhum ponto/game/set jogado ainda.
  const started =
    gs.A.points > 0 ||
    gs.B.points > 0 ||
    gs.A.games > 0 ||
    gs.B.games > 0 ||
    gs.A.sets > 0 ||
    gs.B.sets > 0 ||
    gs.completedSets.length > 0
  const initialServingSet = !started

  // ROTAÇÃO INDIVIDUAL DE SAQUE EM DUPLAS (B2 — derivação na UI, lib/scoring
  // INTOCADO). O motor alterna só o LADO (gs.server); aqui derivamos QUAL parceiro
  // do lado saca o game atual. Regra oficial: dentro do time, os parceiros
  // alternam a cada VEZ que o time volta a sacar → ciclo P1→P3→P2→P4.
  //
  // Derivação: o lado sacador serve games alternados; sua "vez" no set é
  // floor(gamesDoSet / 2) (0-based) — par → initialServer[lado], ímpar → parceiro.
  // Lê games do SET atual (gs.A.games + gs.B.games) + initialServer + firstServer
  // (implícito: game 1 do set é do firstServer). Só vale p/ o lado que saca; o
  // outro time não tem bola acesa. Simples → sempre 0. TIEBREAK → mantém o
  // comportamento atual (initialServer fixo; a rotação a cada 2 pontos é a B3).
  const serverPlayerIdx = (team: "blue" | "red"): 0 | 1 => {
    const side = sideOf(team)
    const init = (gameConfig?.initialServer?.[side] ?? 0) as 0 | 1
    if (gameConfig?.gameType !== "duplas" || isTiebreak) return init
    const gamesNoSet = gs.A.games + gs.B.games
    const vezDoTime = Math.floor(gamesNoSet / 2) // 0-based: 0ª, 1ª, 2ª… vez do time
    return (vezDoTime % 2 === 0 ? init : 1 - init) as 0 | 1
  }

  // NOTA (B1b): a bola de saque deixou de deslizar por lado da quadra (deuce/ad).
  // Agora ela é ancorada à PÍLULA do sacador (ver renderNameFaixa). O cálculo de
  // servingCourt foi removido — decisão de produto: bola na pílula não desliza.

  // Família de placar do esporte: "tennis" (15/30/40, games, sets, tiebreak) ou
  // "rally"/"sideout" (contagem corrida por game). Decide como exibir o placar.
  const family = familyOf(sport)
  const isTennisFamily = family === "tennis"
  // Rótulo da "unidade" de cada coluna do placar: SET no tênis, GAME nos demais.
  const unitLabel = isTennisFamily ? "Set" : "Game"

  // Total de colunas do placar broadcast = formato da partida:
  //  - tênis: sets possíveis (bestOf);   - rally/sideout: games possíveis (bestOf).
  // Vem das regras EM VIGOR no motor (rulesRef), não do maxSets (que é tênis).
  const totalUnits = (rulesRef.current?.bestOf as number) || (maxSets === 5 ? 5 : 3)

  // Placar broadcast: uma coluna POR UNIDADE POSSÍVEL (totalUnits colunas fixas).
  //  - unidade encerrada  → placar daquela unidade (games no set, ou pontos no game);
  //  - unidade em andamento → valor atual, destacado (a "coluna corrente");
  //  - unidade por vir      → played:false → renderizado como dash (–).
  // Fonte de verdade ÚNICA (lib/sports-catalog.buildScoreCols) compartilhada
  // entre o PLACAR GERAL (tabela horizontal) e a TRILHA da chip central.
  const broadcastCols = buildScoreCols(gs, { bestOf: totalUnits, isTennisFamily, finished, isTiebreak })
  // Quais unidades foram fechadas por CONCESSÃO (replay das ações no motor real).
  // Nessas, a pílula/broadcast mostra só o indicador de vitória (●/○), nunca o
  // placar de pontos fictício da concessão.
  const concededUnits = concededUnitFlags(
    sportById(sport).module,
    rulesRef.current,
    firstServerRef.current,
    actionsRef.current,
  )
  // Conteúdo de uma célula de unidade na pílula: número real quando disputada;
  // ●/○ (venceu/não venceu) quando concedida; "–" quando futura. O game EM
  // ANDAMENTO (current) nunca é concedido → mantém o número parcial ao vivo.
  // O indicador de concessão vale SÓ na família rally (squash/ping pong/
  // pickleball): lá um game concedido grava um placar de PONTOS fictício. No
  // tênis/beach/padel o número é a contagem REAL de games (verdadeira mesmo em
  // games-mode), então mostramos SEMPRE o placar — nunca a bolinha.
  const pillCell = (c: (typeof broadcastCols)[number], sideKey: "a" | "b") => {
    if (!c.played) return "–"
    const mine = sideKey === "a" ? c.a : c.b
    const theirs = sideKey === "a" ? c.b : c.a
    if (isTennisFamily || c.current || !concededUnits[c.setNum - 1]) return mine
    const won = (mine ?? 0) > (theirs ?? 0)
    return <span style={{ opacity: won ? 1 : 0.35 }}>{won ? "●" : "○"}</span>
  }

  // --- Dados da TELA DE FIM DE JOGO (só usados quando finished) -------------
  // Lado vencedor → letra p/ selecionar quem venceu (A/B). O recap por unidade
  // usa broadcastCols (adaptado por família), então não precisamos mais do tally
  // agregado de sets/games aqui.
  const winnerLetter = gs.winner === "B" ? "b" : "a"
  const winnerName = gs.winner === "B" ? redPlayerName : bluePlayerName
  const loserName = gs.winner === "B" ? bluePlayerName : redPlayerName
  // Logo do clube: SEMPRE que houver clube. O do patrocinador vem do estado
  // `finishAd` (resolvido no effect lá em cima — ver comentário de lá).
  const finishClub = clube ? clubFromCacheOrBundle(clube) : null

  // --- Dados extra da ARTE de fim de jogo (design azul-marinho FIXO) ---------
  // Nome AMIGÁVEL do esporte (dinâmico p/ o título da arte): "Tênis", "Beach
  // Tennis", "Padel", "Squash", "Ping Pong", "Pickleball" — vem do catálogo.
  const finishSportName = sportById(sport).name
  // Recap por UNIDADE: números do vencedor (linha de cima) e do perdedor (linha
  // de baixo), uma entrada por unidade JÁ JOGADA. Igual p/ todas as famílias —
  // broadcastCols já adapta a "unidade" (set no tênis; game/pontos no rally/
  // side-out), então squash/ping pong/pickleball ganham o recap coerente de graça.
  const finishPlayedCols = broadcastCols.filter((c) => c.played)
  const winnerRecap = finishPlayedCols.map((c) => (winnerLetter === "a" ? c.a : c.b))
  const loserRecap = finishPlayedCols.map((c) => (winnerLetter === "a" ? c.b : c.a))
  // Data do jogo formatada (ex. "9 DE JULHO 2026") a partir de startTime.
  const finishMonths = [
    "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
    "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
  ]
  const finishDate = startTime
    ? `${startTime.getDate()} DE ${finishMonths[startTime.getMonth()]} ${startTime.getFullYear()}`
    : ""

  // Ponto do game atual de um lado (coluna destacada na ponta direita).
  // Em tiebreak são os pontos do tiebreak; com a partida encerrada fica vazio.
  const pointOf = (side: Side): string => {
    if (finished) return ""
    // formatPoint resolve por família: 15/30/40 (ou tiebreak) no tênis; contagem
    // corrida (points) no squash/ping pong/pickleball.
    return formatPoint(sport, gs[side], isTiebreak)
  }

  // Número grande de cada card: ponto do game formatado por esporte
  // (0/15/30/40/AD ou tiebreak no tênis; contagem corrida nos demais), ou o
  // total de games no modo "games".
  const bigNumber = (side: Side): string => {
    if (isTiebreak) return gs[side].tiebreakPoints.toString()
    if (gameConfig.scoreType === "games") return gs[side].games.toString()
    return formatPoint(sport, gs[side], false)
  }

  /* ===================== TELA VERTICAL (PORTRAIT) — QUADRA 2.0 ==============
     Cidadão de 1ª classe. Estrutura (cima→baixo): FAIXA A · BLOCO A · divisória
     · BLOCO B · FAIXA B · PAINEL PLACAR · MENU. Chrome (faixas/painel/menu) é
     `shrink-0` (desconta antes da divisão); os dois blocos são `flex-1` → áreas
     idênticas, divisória no centro exato. O landscape segue o layout atual. */

  /** Logo do clube p/ o time (por ora o do clube da quadra nos dois; visitante é
   *  slot futuro sem UI). null = jogo genérico sem clube. */
  const logoForTeam = (team: "blue" | "red"): string | null => {
    const home = clube ? (clubFromCacheOrBundle(clube)?.logo || null) : null
    return team === "red" && cfg.visitorClubLogo ? cfg.visitorClubLogo : home
  }

  // BOLA DE SAQUE (SVG) COMPARTILHADA entre vertical e horizontal — mesma bola nas
  // duas orientações. Agora SPORT-AWARE (deriva do `sport` canônico); a LÓGICA de
  // saque é a mesma, só muda cor/forma:
  //  - tênis/beach/padel/pickleball: bola de tênis amarela (#FEE100) + costuras;
  //    não-sacador acinzentado (#8b95a7).
  //  - squash: bola PRETA; sacador com anel claro + glow (aparece sobre o fundo
  //    escuro); não-sacador esmaecido (some de propósito quando não saca).
  //  - ping pong: LARANJA oficial (melhor contraste no placar escuro que o branco);
  //    não-sacador com a mesma laranja esmaecida.
  const serveBola = (acesa: boolean, pulse: boolean) => {
    const kind = sport === "squash" ? "squash" : sport === "tabletennis" ? "pingpong" : "tennis"

    let fill = acesa ? "#FEE100" : "#8b95a7"
    let ring = "rgba(0,0,0,0.25)"
    let ringW = 2
    let opacity = 1
    let seams = kind === "tennis"
    let glow = false

    if (kind === "squash") {
      fill = "#0d0d0d" // bola preta
      if (acesa) {
        ring = "#eef2f7" // anel claro p/ destacar o sacador no fundo escuro
        ringW = 4
        glow = true
      } else {
        ring = "#3a4150"
        opacity = 0.4 // não-sacador esmaecido
      }
    } else if (kind === "pingpong") {
      fill = "#ff7a1a" // laranja oficial
      if (!acesa) opacity = 0.35 // não-sacador esmaecido
    }

    return (
      <span
        aria-hidden
        className={`block h-9 w-9 shrink-0 drop-shadow ${pulse ? "serve-pill-pulse" : ""}`}
        style={{
          opacity,
          // Glow claro só no sacador do squash (span, não o svg → não é cortado).
          ...(glow ? { filter: "drop-shadow(0 0 4px rgba(238,242,247,0.85))" } : {}),
        }}
      >
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <circle cx="50" cy="50" r="48" fill={fill} stroke={ring} strokeWidth={ringW} />
          {seams && (
            <>
              <path
                d="M20 12 C40 34 40 66 20 88"
                fill="none"
                stroke={acesa ? "#b89b00" : "#59616f"}
                strokeWidth="5"
                strokeLinecap="round"
              />
              <path
                d="M80 12 C60 34 60 66 80 88"
                fill="none"
                stroke={acesa ? "#b89b00" : "#59616f"}
                strokeWidth="5"
                strokeLinecap="round"
              />
            </>
          )}
        </svg>
      </span>
    )
  }

  // FAIXA DE NOMES (uma por time). DUAS FASES (item 2):
  //  PRÉ-JOGO (!started): nomes OPCIONAIS — dois alvos coexistem. Tocar na METADE
  //    do jogador → escolhe o saque; tocar no CENTRO (logo) → popup de nomes. A
  //    pílula pulsa 2x na entrada (item 1) e para.
  //  JOGO (>=1 ponto): pílula inteira → popup; bolas só indicam.
  const renderNameFaixa = (team: "blue" | "red") => {
    const teamServing = team === "blue" ? blueServing : !blueServing
    const serverIdx = serverPlayerIdx(team) // rotação individual de duplas (item 3)
    const duplas = cfg.gameType === "duplas"
    const raw =
      team === "blue"
        ? duplas
          ? [cfg.players.blue1, cfg.players.blue2]
          : [cfg.players.blue1]
        : duplas
          ? [cfg.players.red1, cfg.players.red2]
          : [cfg.players.red1]
    // Nomes exibidos: fallback → "Player N" INTEIRO (nunca abrevia); digitado →
    // abreviação broadcast.
    const names = raw.map((n, i) => displayName(n, team, i, true))
    const prejogo = !started
    const showAmarela = serverEverChosen || started // antes da 1ª escolha: sem amarela

    // Bola (compartilhada): acesa = sacador. O pulso da fase pré-jogo é da PÍLULA
    // (as bolas movem junto) — finito, 2x, na entrada; a bola não pulsa sozinha.
    // DURANTE O SORTEIO (B1c): a amarela segue o destaque aleatório (drawHighlight),
    // ignorando o sacador normal, para "piscar" entre os jogadores.
    const bola = (idx: number) => {
      if (drawing) {
        const on = drawHighlight?.team === team && drawHighlight?.idx === idx
        return serveBola(on, false)
      }
      return serveBola(showAmarela && teamServing && idx === serverIdx, false)
    }
    const logoEl = logoForTeam(team) ? (
      <span className="relative block h-7 w-7 shrink-0 overflow-hidden rounded-full ring-1 ring-white/25">
        <Image src={logoForTeam(team)!} alt="" fill sizes="28px" className="object-cover" />
      </span>
    ) : (
      <span className="h-7 w-7 shrink-0" aria-hidden />
    )
    const nameEl = (n: string) => (
      <span className="truncate text-sm font-bold uppercase tracking-wide text-white">{n}</span>
    )

    // Pílula FLUTUANTE: glass, rounded-full, sombra. `pointer-events-auto` (o
    // container ao redor é pointer-events-none → tocar fora da pílula marca ponto).
    const pill =
      "glass pointer-events-auto w-full rounded-full px-3 py-1 shadow-lg ring-1 ring-white/10 min-h-[52px]"
    const editOnClick = (e: { stopPropagation: () => void }) => {
      e.stopPropagation()
      setEditingSide(team)
    }
    const nameCentered = (
      <span className="min-w-0 flex-1 truncate text-center text-sm font-bold uppercase tracking-wide text-white">
        {names[0]}
      </span>
    )

    // SIMPLES (item 5a): [LOGO na esquerda] [Nome no centro] [BOLA na direita] —
    // o logo assume a ponta que a 2ª bola ocuparia em duplas.
    if (!duplas) {
      // PRÉ-JOGO: dois alvos — metade do jogador escolhe o saque (nomes
      // opcionais), o logo abre o popup. A pílula pulsa 2x na entrada e para.
      if (prejogo) {
        return (
          <div className={`${pill} flex items-center gap-2 serve-pill-pulse`}>
            <button type="button" onClick={editOnClick} aria-label="Editar nomes" className="shrink-0">
              {logoEl}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onServeBallTap(team, 0)
              }}
              className="flex min-w-0 flex-1 items-center gap-2"
            >
              {nameCentered}
              {bola(0)}
            </button>
          </div>
        )
      }
      // JOGO: pílula inteira abre o popup; sem pulso.
      return (
        <button
          type="button"
          onClick={editOnClick}
          aria-label="Editar nomes"
          className={`${pill} flex items-center gap-2`}
        >
          {logoEl}
          {nameCentered}
          {bola(0)}
        </button>
      )
    }

    // DUPLAS: [bola][Nome1] [LOGO] [Nome2][bola]. Grupos justify-between → bola na
    // EXTREMIDADE, nome perto do logo.
    const gridPill = `${pill} grid grid-cols-[1fr_auto_1fr] items-center gap-2`
    // PRÉ-JOGO: cada metade escolhe o sacador do par (nomes opcionais), logo
    // central abre o popup. Pílula pulsa 2x na entrada e para.
    if (prejogo) {
      return (
        <div className={`${gridPill} serve-pill-pulse`}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onServeBallTap(team, 0)
            }}
            className="flex min-w-0 items-center justify-between gap-2"
          >
            {bola(0)}
            {nameEl(names[0])}
          </button>
          <button type="button" onClick={editOnClick} aria-label="Editar nomes" className="shrink-0">
            {logoEl}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onServeBallTap(team, 1)
            }}
            className="flex min-w-0 items-center justify-between gap-2"
          >
            {nameEl(names[1])}
            {bola(1)}
          </button>
        </div>
      )
    }
    // JOGO: pílula inteira abre o popup; sem pulso. A bola amarela migra sozinha
    // conforme serverIdx = serverPlayerIdx(team) (rotação B2, item 3).
    return (
      <button
        type="button"
        onClick={editOnClick}
        aria-label="Editar nomes"
        className={gridPill}
      >
        <span className="flex min-w-0 items-center justify-between gap-2">
          {bola(0)}
          {nameEl(names[0])}
        </span>
        {logoEl}
        <span className="flex min-w-0 items-center justify-between gap-2">
          {nameEl(names[1])}
          {bola(1)}
        </span>
      </button>
    )
  }

  // BLOCO DE TOQUE (absolute inset-0): número gigante; toda a área marca ponto.
  // Sem pílulas/bola (moram nas faixas). `numberFontSize` capa o número por
  // orientação (portrait: blocos menores; landscape: meia-largura, altura cheia).
  const renderTouchBlock = (team: "blue" | "red", numberFontSize: string, padTop = "0") => {
    const side = sideOf(team)
    const isA = team === "blue"
    const nameA = isA ? bluePlayerName : redPlayerName
    const animating = isA ? animatingBlue : animatingRed
    const blinking = isA ? blueCardBlinking : redCardBlinking
    const isWinner = isA ? blueWinner : redWinner
    const bgVar = isA ? "--lado-a-bg" : "--lado-b-bg"
    const txtVar = isA ? "--lado-a-texto" : "--lado-b-texto"
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={`Marcar ponto para ${nameA}`}
        onClick={() => handleScoreClick(team)}
        className={`absolute inset-0 flex cursor-pointer select-none flex-col items-stretch justify-center overflow-hidden
          ${animating ? "point-flash" : ""}`}
        style={
          {
            // padTop (item 1, só vertical): reserva a faixa da pílula flutuante do
            // topo para o justify-center centrar OPTICAMENTE o número no vão livre
            // abaixo dela (não no bloco inteiro). Landscape usa "0" → sem efeito.
            paddingTop: padTop,
            backgroundColor: `var(${bgVar})`,
            color: `var(${txtVar})`,
            "--blk-bg": `var(${bgVar})`,
            "--blk-text": `var(${txtVar})`,
          } as CSSProperties
        }
      >
        {blinking && <span aria-hidden className="win-blink pointer-events-none absolute inset-0 z-20" />}
        <div
          className={`giant-number px-2 text-center ${animating ? "score-animation" : ""}`}
          style={{ fontSize: numberFontSize }}
        >
          {bigNumber(side)}
        </div>
        {(isTiebreak || (finished && isWinner)) && (
          <div className="absolute bottom-0 left-0 right-0 pb-2 text-center text-xs font-bold tracking-[0.2em] opacity-80">
            {finished && isWinner ? "VENCEDOR" : "TIEBREAK"}
          </div>
        )}
      </div>
    )
  }

  // PAINEL PLACAR GERAL (fixo, inferior, transparente ao toque). 2 linhas:
  // [logo] nome [ponto] [até 5 unidades]. Largura RESERVADA p/ 5 sets → o placar
  // NUNCA trunca; o nome usa o resto (regra broadcast). MATA a faixa central
  // expansível antiga.
  // widthClass = largura MÁXIMA do painel (default max-w-md p/ o portrait, que
  // preenche quase toda a largura da tela estreita). O landscape passa uma largura
  // menor (max-w-xs) → painel de PÍLULA centralizado, com margem lateral, sem
  // esticar de ponta a ponta na tela larga. compact = altura MÍNIMA (py enxuto) p/
  // devolver espaço vertical à área de jogo na paisagem. Ambos com DEFAULT que
  // preserva o portrait byte-a-byte (mesma string de classe).
  const renderScorePanel = (widthClass = "max-w-md", compact = false) => {
    const rows: { team: "blue" | "red"; key: "a" | "b" }[] = [
      { team: "blue", key: "a" },
      { team: "red", key: "b" },
    ]
    const ordered = mirrored ? [rows[1], rows[0]] : rows
    return (
      <div
        className={`pointer-events-none w-full px-3 ${compact ? "py-1" : "py-2"}`}
        style={{ backgroundColor: INFO_BG }}
      >
        <div
          className={`mx-auto grid ${widthClass} items-center gap-x-2 ${compact ? "gap-y-0.5" : "gap-y-1"} rounded-2xl px-3 ${compact ? "py-1" : "py-2"} ring-1 ring-white/10`}
          style={{ gridTemplateColumns: "auto minmax(0,1fr) 1.4rem repeat(5, 1.05rem)" }}
        >
          {ordered.map(({ team, key }) => {
            // Nomes do painel: mesma regra da faixa (fallback → "Player N" inteiro;
            // digitado → abreviado). Simples = 1 nome; duplas = "N1 / N2".
            const p = cfg.players
            const combined =
              cfg.gameType === "duplas"
                ? `${displayName(team === "blue" ? p.blue1 : p.red1, team, 0, true)} / ${displayName(
                    team === "blue" ? p.blue2 : p.red2,
                    team,
                    1,
                    true,
                  )}`
                : displayName(team === "blue" ? p.blue1 : p.red1, team, 0, true)
            const logo = logoForTeam(team)
            const point = pointOf(sideOf(team))
            return (
              <Fragment key={team}>
                {logo ? (
                  <span className="relative block h-4 w-4 shrink-0 overflow-hidden rounded-full ring-1 ring-white/15">
                    <Image src={logo} alt="" fill sizes="16px" className="object-cover" />
                  </span>
                ) : (
                  <span className="h-4 w-4 shrink-0" aria-hidden />
                )}
                <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-white/90">
                  {combined}
                </span>
                <span className="text-center text-sm font-bold tabular-nums text-[#FEE100]">{point}</span>
                {Array.from({ length: 5 }).map((_, i) => {
                  const c = broadcastCols[i]
                  const color = !c
                    ? "transparent"
                    : !c.played
                      ? "rgba(255,255,255,0.35)"
                      : c.current
                        ? "#FEE100"
                        : "#ffffff"
                  return (
                    <span
                      key={i}
                      className="text-center text-xs font-bold tabular-nums"
                      style={{ color }}
                    >
                      {c ? pillCell(c, key) : ""}
                    </span>
                  )
                })}
              </Fragment>
            )
          })}
        </div>
      </div>
    )
  }

  // MENU (portrait): BOTTOM SHEET. Recolhido = engrenagem flutuante no bloco B
  // (ver renderPortrait). Aberto = painel sólido (azul super escuro, SEM glass)
  // deslizando de baixo (~1/3). Fecha no X, toque fora (jogo acima) ou pós-ação.
  const runMenu = (fn: () => void) => {
    setMenuOpen(false)
    fn()
  }
  // Botão do menu: ícone circular GRANDE (alvo ≥56px) + rótulo pequeno embaixo.
  const menuBtn = (icon: ReactNode, label: string, onClick: () => void, disabled = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex min-w-[56px] flex-col items-center gap-1 disabled:opacity-40"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white transition active:scale-95">
        {icon}
      </span>
      <span className="text-[10px] font-medium text-white/70">{label}</span>
    </button>
  )
  const renderBottomSheet = () => (
    <>
      {/* Toque fora (área do jogo acima) fecha. */}
      <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
      <div
        className="animate-in slide-in-from-bottom fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 rounded-t-3xl px-5 pb-7 pt-6 shadow-2xl duration-200"
        style={{ backgroundColor: INFO_BG }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setMenuOpen(false)}
          aria-label="Fechar menu"
          className="absolute right-3 top-3 rounded-full p-2 text-white/60 transition hover:text-white active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>

        {/* LINHA 1: 5 ações. COMPARTILHAR no CENTRO (posição de honra, fundo
            branco diferenciado — incentivar o share como motor de aquisição). */}
        <div className="mt-1 flex items-end justify-between gap-1">
          {menuBtn(<Undo2 className="h-6 w-6" />, "Desfazer", () => runMenu(undoLastPoint), !started)}
          {menuBtn(
            voiceEnabled ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6 opacity-70" />,
            "Volume",
            () => runMenu(toggleVoice),
          )}
          <button
            type="button"
            onClick={() => runMenu(() => setShareOpen(true))}
            aria-label="Compartilhar partida"
            className="flex min-w-[56px] flex-col items-center gap-1"
          >
            <span
              style={SHARE_BTN_STYLE}
              className="flex h-16 w-16 items-center justify-center rounded-full shadow-lg ring-1 ring-black/10 transition active:scale-95"
            >
              <Share2 className="h-7 w-7" />
            </span>
            <span className="text-[10px] font-bold text-white">Compartilhar</span>
          </button>
          {menuBtn(<RotateCcw className="h-6 w-6" />, "Recomeçar", () =>
            runMenu(() => setConfirmRestartOpen(true)),
          )}
          {menuBtn(<Settings className="h-6 w-6" />, "Ajustes", () => runMenu(() => setSetupOpen(true)))}
        </div>

        {/* LINHA 2: segmentado PONTOS|GAMES sozinho, largo e centrado. */}
        <div className="flex w-full items-center gap-1 rounded-full bg-white/10 p-1">
          {(
            [
              ["pontos", "Pontos"],
              ["games", "Games"],
            ] as const
          ).map(([mode, label]) => {
            const on = gameConfig.scoreType === mode
            return (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  if (!on) runMenu(toggleScoreType)
                  else setMenuOpen(false)
                }}
                aria-pressed={on}
                className={`flex-1 rounded-full px-3 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors ${
                  on ? "central-seg-on" : "text-white/60"
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )

  // Monta a tela vertical: swipe + mirror POR ORDEM (mirror troca as seções de
  // time, faixas junto — coerente com os blocos). O swipe (A1) é o mesmo do
  // palco: horizontal, aborta o ponto do release.
  const renderPortrait = () => {
    const order: readonly ("blue" | "red")[] = mirrored ? ["red", "blue"] : ["blue", "red"]
    return (
      <>
        <main
          className="flex min-h-0 flex-1 flex-col"
          style={{ touchAction: "none" }}
          onPointerDown={(e) => {
            swipedRef.current = false
            swipeStartRef.current = { x: e.clientX, y: e.clientY }
          }}
          onPointerUp={(e) => {
            const start = swipeStartRef.current
            swipeStartRef.current = null
            if (!start) return
            const dx = e.clientX - start.x
            const dy = e.clientY - start.y
            const limiar = Math.max(80, e.currentTarget.clientWidth * 0.15)
            if (Math.abs(dx) >= limiar && Math.abs(dx) > Math.abs(dy)) {
              swipedRef.current = true
              toggleMirror()
            }
          }}
          onPointerCancel={() => {
            swipeStartRef.current = null
          }}
        >
          {/* BLOCO order[0]: bloco de toque (absolute inset-0) + pílula FLUTUANTE
              no TOPO. O container da pílula é pointer-events-none → tocar FORA
              dela (mesmo nesta faixa de altura) marca ponto; a pílula é
              pointer-events-auto (stopPropagation só na área dela). Blocos são
              flex-1/basis-0 → alturas IDÊNTICAS (as pílulas não roubam altura). */}
          <div className="relative flex min-h-0 flex-1 basis-0 overflow-hidden">
            {renderTouchBlock(order[0], "min(42vw, 30vh)", "4rem")}
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
              {renderNameFaixa(order[0])}
            </div>
          </div>

          <div className="h-px shrink-0" style={{ backgroundColor: "var(--palco-divisor)" }} />

          {/* BLOCO order[1]: pílula FLUTUANTE no TOPO (espelho do time A — cada
              pílula apresenta seu bloco na ENTRADA, logo abaixo da divisória) +
              ENGRENAGEM flutuante no canto inferior direito (sem colisão). */}
          <div className="relative flex min-h-0 flex-1 basis-0 overflow-hidden">
            {renderTouchBlock(order[1], "min(42vw, 30vh)", "4rem")}
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
              {renderNameFaixa(order[1])}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(true)
              }}
              aria-label="Menu"
              className="glass absolute bottom-3 right-3 z-20 rounded-full p-2.5 text-white transition active:scale-95"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </main>
        <div className="shrink-0">{renderScorePanel()}</div>
        {menuOpen && renderBottomSheet()}
      </>
    )
  }

  /* ============ TELA HORIZONTAL (LANDSCAPE) — a VERTICAL deitada ============
     Reusa a MESMA anatomia da v2 sem layout próprio: as pílulas de nome são o
     renderNameFaixa da vertical (logo central, largura constante), o placar é o
     renderScorePanel da vertical e o menu é bottom sheet. Só a geometria (dois
     blocos lado a lado + painel estreito no rodapé) é específica da paisagem. */

  // BOTTOM SHEET landscape: UMA LINHA (a horizontal tem largura). Reusa runMenu +
  // menuBtn + o segmentado. Mesmo #0a1024 sólido, X + toque fora + auto-close.
  const renderBottomSheetLandscape = () => (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden />
      <div
        className="animate-in slide-in-from-bottom fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-end justify-center gap-4 rounded-t-3xl px-6 pb-6 pt-6 shadow-2xl duration-200"
        style={{ backgroundColor: INFO_BG }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setMenuOpen(false)}
          aria-label="Fechar menu"
          className="absolute right-3 top-3 rounded-full p-2 text-white/60 transition hover:text-white active:scale-95"
        >
          <X className="h-5 w-5" />
        </button>
        {menuBtn(<Undo2 className="h-6 w-6" />, "Desfazer", () => runMenu(undoLastPoint), !started)}
        {menuBtn(
          voiceEnabled ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6 opacity-70" />,
          "Volume",
          () => runMenu(toggleVoice),
        )}
        <button
          type="button"
          onClick={() => runMenu(() => setShareOpen(true))}
          aria-label="Compartilhar partida"
          className="flex min-w-[56px] flex-col items-center gap-1"
        >
          <span
            style={SHARE_BTN_STYLE}
            className="flex h-16 w-16 items-center justify-center rounded-full shadow-lg ring-1 ring-black/10 transition active:scale-95"
          >
            <Share2 className="h-7 w-7" />
          </span>
          <span className="text-[10px] font-bold text-white">Compartilhar</span>
        </button>
        {menuBtn(<RotateCcw className="h-6 w-6" />, "Recomeçar", () =>
          runMenu(() => setConfirmRestartOpen(true)),
        )}
        {menuBtn(<Settings className="h-6 w-6" />, "Ajustes", () => runMenu(() => setSetupOpen(true)))}
        {/* Segmentado na MESMA linha (flex-wrap cai abaixo se não couber). */}
        <div className="flex items-center gap-1 self-center rounded-full bg-white/10 p-1">
          {(
            [
              ["pontos", "Pontos"],
              ["games", "Games"],
            ] as const
          ).map(([mode, label]) => {
            const on = gameConfig.scoreType === mode
            return (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  if (!on) runMenu(toggleScoreType)
                  else setMenuOpen(false)
                }}
                aria-pressed={on}
                className={`rounded-full px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors ${
                  on ? "central-seg-on" : "text-white/60"
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )

  // Monta a tela HORIZONTAL: dois blocos lado a lado (larguras idênticas, gap de
  // divisória), pílulas de time nas extremidades superiores, pílula central e a
  // engrenagem flutuante. Swipe + mirror POR ORDEM (coerente com a v2).
  const renderLandscape = () => {
    const order: readonly ("blue" | "red")[] = mirrored ? ["red", "blue"] : ["blue", "red"]
    return (
      <>
        <main
          className="flex min-h-0 flex-1 flex-row"
          style={{ gap: "1px", backgroundColor: "var(--palco-divisor)", touchAction: "none" }}
          onPointerDown={(e) => {
            swipedRef.current = false
            swipeStartRef.current = { x: e.clientX, y: e.clientY }
          }}
          onPointerUp={(e) => {
            const start = swipeStartRef.current
            swipeStartRef.current = null
            if (!start) return
            const dx = e.clientX - start.x
            const dy = e.clientY - start.y
            const limiar = Math.max(80, e.currentTarget.clientWidth * 0.15)
            if (Math.abs(dx) >= limiar && Math.abs(dx) > Math.abs(dy)) {
              swipedRef.current = true
              toggleMirror()
            }
          }}
          onPointerCancel={() => {
            swipeStartRef.current = null
          }}
        >
          {/* Bloco ESQUERDO (order[0]): MESMA pílula da vertical (renderNameFaixa —
              logo CENTRAL, w-full → largura constante em simples/duplas),
              centralizada no topo. padTop "4rem" = centralização óptica idêntica à
              vertical (número centra no vão abaixo da pílula). */}
          <div className="relative flex min-h-0 flex-1 basis-0 overflow-hidden">
            {renderTouchBlock(order[0], "min(38vw, 62vh)", "4rem")}
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
              {renderNameFaixa(order[0])}
            </div>
          </div>

          {/* Bloco DIREITO (order[1]): idem + engrenagem flutuante. */}
          <div className="relative flex min-h-0 flex-1 basis-0 overflow-hidden">
            {renderTouchBlock(order[1], "min(38vw, 62vh)", "4rem")}
            <div className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-3">
              {renderNameFaixa(order[1])}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setMenuOpen(true)
              }}
              aria-label="Menu"
              className="glass absolute bottom-3 right-3 z-30 rounded-full p-2.5 text-white transition active:scale-95"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </main>
        {/* PLACAR GERAL: mesmo painel da vertical (renderScorePanel — logos +
            nomes + ponto + games/sets), encostado na base. ESTREITO (max-w-xs
            centralizado, margem lateral) e BAIXO (compact = py enxuto) → devolve
            espaço vertical à área de jogo. Chrome inferior em flow → os dois
            blocos dividem o espaço acima (50/50); a engrenagem (bottom-3 do bloco
            direito) fica logo acima. */}
        <div className="shrink-0">{renderScorePanel("max-w-xs", true)}</div>
        {menuOpen && renderBottomSheetLandscape()}
      </>
    )
  }

  return (
    <div
      className={`relative flex flex-col h-[100dvh] overflow-hidden mono-tabular ${themeClassName(theme)}`}
      style={{ backgroundColor: "var(--palco-fundo)", color: "var(--palco-discreto)" }}
    >
      {/* PORTRAIT (QUADRA 2.0): tela vertical reescrita — cidadão de 1ª classe.
          Faixas de nome, blocos, painel geral fixo e menu recolhível. */}
      {isPortrait && renderPortrait()}

      {/* LANDSCAPE (QUADRA 2.0): tela horizontal reescrita — espelho da vertical
          v2. Pílulas de time nas extremidades, painel de placar geral no rodapé
          (renderScorePanel, largura de pílula) e menu bottom sheet. Só renderiza
          em paisagem. */}
      {!isPortrait && renderLandscape()}

      {/* AVISO "TROCA DE LADO" (A2): banner não-bloqueante, alto contraste (amarelo
          de destaque #FEE100 + texto preto — legível sob sol e igual em qualquer
          tema), disparado só na TRANSIÇÃO. pointer-events-none: nunca rouba toque;
          some sozinho (SIDE_CHANGE_MS) ou ao próximo toque. Ancorado no topo (abaixo
          do placar/chip), longe dos números gigantes. */}
      {showSideChange && !finished && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute left-1/2 top-[15%] z-40 -translate-x-1/2"
        >
          {/* Lembrete DISCRETO (não banner dominante): pílula pequena, alto
              contraste (amarelo + preto) p/ ler sob sol, some rápido (~3s). */}
          <div className="side-change-banner flex flex-col items-center gap-0.5 rounded-full bg-[#FEE100] px-3.5 py-1.5 shadow-lg ring-1 ring-black/15">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-black">
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Troca de lado
            </span>
            {/* Sinergia A2+A1: ENSINA o gesto — só na 1ª exibição da partida. */}
            {sideChangeHint && (
              <span className="text-[9px] font-semibold uppercase tracking-wide text-black/60">
                deslize para trocar
              </span>
            )}
          </div>
        </div>
      )}

      {/* TOAST de SAÍDA de aparelho (placar compartilhado): mesma pílula discreta
          do aviso de troca de lado (.side-change-banner, ~3s), em vermelho de
          alto contraste — relevante num jogo sem juiz onde o outro lado caiu. A
          mensagem deixa claro que foi O OUTRO (nunca "eu"). Só aparece após o
          debounce de queda (não no refresh). */}
      {showDisconnect && (
        <div
          aria-live="polite"
          className="pointer-events-none absolute left-1/2 top-[15%] z-40 -translate-x-1/2"
        >
          <div className="side-change-banner flex items-center gap-2 rounded-full bg-rose-600 px-3.5 py-1.5 text-white shadow-lg ring-1 ring-black/15">
            <UserMinus className="h-3.5 w-3.5" />
            <span className="text-xs font-bold uppercase tracking-[0.14em]">{disconnectMsg}</span>
          </div>
        </div>
      )}

      {/* Controles nas BORDAS (topo + rodapé), NUNCA no meio: o miolo da tela —
          onde vivem os números gigantes dos dois blocos — fica LIVRE de controle
          em qualquer orientação. Regra fixa (retrato e paisagem):
            - PLACAR GERAL: sempre no TOPO, centralizado.
            - Barra de controles (voltar · contagem · voz/config): sempre no RODAPÉ.
          Cada controle é pointer-events-auto + stopPropagation; os containers de
          borda são pointer-events-none, então seus vãos deixam o toque passar e o
          resto da tela (os blocos) continua sendo a área de marcar ponto. */}

      {/* LANDSCAPE antigo (topo-centro vertical + barra de botões soltos)
          MORREU: o placar geral vira a pílula central #0a1024 e os controles
          viram a engrenagem flutuante + bottom sheet (renderLandscape). */}

      {/* Placar geral expandido: overlay glass de tela cheia, estilo BROADCAST
          (Grand Slam). Aparece ao tocar no placar central, some sozinho após
          ~5s ou ao tocar fora do painel. */}
      {showOverview && (
        <div
          className="stage-overlay glass-overlay-anim absolute inset-0 z-30 flex items-center justify-center p-4 md:p-8"
          onClick={closeOverview}
          role="dialog"
          aria-label="Placar geral"
        >
          <div
            className="glass-panel-anim w-full max-w-5xl flex flex-col gap-3 md:gap-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Topo discreto: quadra + cronômetro. */}
            <div className="w-full flex items-center justify-between text-[11px] md:text-sm uppercase tracking-widest opacity-70">
              <span>Quadra {gameConfig.quadra}</span>
              <span className="tabular-nums">
                {elapsedTime}
                {isTiebreak ? " · TB" : ""}
              </span>
            </div>

            {/* Tabela broadcast: NOME → SETS (uma coluna por set possível) →
                GAME (set corrente destacado) → PONTO (ponta direita, grande).
                Mesmo componente que a tela /placar (espectador) — layout ÚNICO. */}
            <div className="w-full overflow-x-auto">
              <BroadcastScoreboard
                cols={broadcastCols}
                isTennisFamily={isTennisFamily}
                unitLabel={unitLabel}
                server={server}
                winner={gs.winner ?? null}
                names={{ A: bluePlayerName, B: redPlayerName }}
                points={{ A: pointOf("A"), B: pointOf("B") }}
                conceded={concededUnits}
              />
            </div>

            {/* Rodapé: vencedor (se encerrada) + dica de fechar. */}
            <div className="w-full flex items-center justify-between gap-3">
              {finished ? (
                <span className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] opacity-90">
                  Vencedor: {blueWinner ? bluePlayerName : redWinner ? redPlayerName : ""}
                </span>
              ) : (
                <span />
              )}
              <span className="text-[10px] uppercase tracking-widest opacity-40 whitespace-nowrap">
                toque fora para fechar
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Overlay de CONFIGURAÇÃO = a MESMA tela de setup (card claro), aberta
          dentro do jogo, JÁ no contexto atual: pré-selecionada no esporte vigente
          e com os toggles refletindo as regras atuais (rulesRef). O rodapé reúne
          as ações SECUNDÁRIAS herdadas do antigo GameMenu (desfazer / marcação /
          placar / reiniciar / encerrar), compactas e discretas — no miolo
          rolável, sem competir com o CTA JOGAR fixo. */}
      {setupOpen && (
        <div className="fixed inset-0 z-50">
          <SportSetup
            initialSport={sport}
            // Defesa contra o 2º crash: se as regras atuais estiverem
            // incompatíveis com o esporte (ex.: estado herdado corrompido de
            // outra sala), o RULE_SPECS do setup leria r.tiebreak.enabled e
            // quebraria. Cai num default VÁLIDO do esporte em vez de estourar.
            initialRules={
              rulesMatchFamily(rulesRef.current, familyOf(sport)) ? rulesRef.current : defaultRulesFor(sport)
            }
            initialTheme={theme}
            initialSideChangeAlert={sideChangeAlert}
            initialGameType={gameConfig.gameType}
            // Veio da quadra (jornada QR) → seletor de esporte recolhido: o
            // professor raramente troca e as regras ganham a 1ª dobra. Jogo
            // genérico (sem clube) → expandido (a escolha importa mais).
            sportFromCourt={!!clube}
            context="ingame"
            onClose={() => setSetupOpen(false)}
            onConfirm={onSetupConfirm}
            footer={
              <div className="pt-3 mt-1 border-t flex flex-wrap gap-2" style={{ borderColor: "var(--setup-card-borda)" }}>
                <button
                  type="button"
                  className="setup-action"
                  onClick={() => {
                    undoLastPoint()
                    setSetupOpen(false)
                  }}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  Desfazer ponto
                </button>
                <button
                  type="button"
                  className="setup-action"
                  onClick={() => {
                    toggleScoreType()
                    setSetupOpen(false)
                  }}
                >
                  <BarChart2 className="h-3.5 w-3.5" />
                  {gameConfig.scoreType === "pontos" ? "Contar por games" : "Contar por pontos"}
                </button>
                <button
                  type="button"
                  className="setup-action"
                  onClick={() => {
                    openScoreboard()
                    setSetupOpen(false)
                  }}
                >
                  <BarChart2 className="h-3.5 w-3.5" />
                  Abrir placar
                </button>
                <button
                  type="button"
                  className="setup-action"
                  onClick={() => {
                    resetGame()
                    setSetupOpen(false)
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reiniciar
                </button>
                <button type="button" className="setup-action setup-action-danger" onClick={endMatch}>
                  <LogOut className="h-3.5 w-3.5" />
                  Encerrar partida
                </button>
              </div>
            }
          />
        </div>
      )}

      {/* TELA DE FIM DE JOGO: overlay OPACO de tela cheia com o resultado final,
          pensado como "a arte que vira imagem de compartilhamento". Desde este
          redesign o visual é FIXO — fundo AZUL-MARINHO escuro sólido (#12123a),
          textos branco/amarelo/cinza — e NÃO depende do tema do jogo nem do
          esporte (funciona idêntico p/ tênis, beach, padel, squash, ping pong,
          pickleball). SÓ cores sólidas + texto + logos, SEM glass/blur (efeitos
          complexos capturam mal). O nome do esporte é dinâmico (catálogo) e o
          recap usa broadcastCols (adapta set/game por família). */}
      {finished && gs.winner && (
        <div
          className="stage-finish absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 px-4 py-8 overflow-y-auto"
          style={{ backgroundColor: "#0b0b24", color: "#ffffff" }}
          role="dialog"
          aria-label="Resultado final"
        >
          {/* A "ARTE" (finishArtRef): SÓ o que entra na imagem compartilhada.
              Fundo próprio (azul-marinho) → o PNG fica completo e autocontido.
              Os botões de ação ficam FORA desta div (abaixo), então NÃO aparecem
              na captura — mecanismo de captura inalterado. */}
          <div
            ref={finishArtRef}
            className="w-full max-w-sm flex flex-col items-center gap-4 rounded-3xl px-7 py-8 text-center"
            style={{ backgroundColor: "#12123a", color: "#ffffff" }}
          >
            {/* 1. Logo do CLUBE — grande, centralizado no topo. */}
            {finishClub?.logo && (
              <div className="relative aspect-square h-24 md:h-28 rounded-full overflow-hidden shadow-lg">
                <Image src={finishClub.logo} alt={finishClub.nome} fill sizes="128px" className="object-cover" />
              </div>
            )}

            {/* 2. Divisor fino. */}
            <div className="h-px w-full bg-white/15" />

            {/* 3. Nome do ESPORTE (dinâmico), grande, branco, com boa separação. */}
            <div className="text-2xl md:text-3xl font-black uppercase tracking-[0.22em] leading-tight">
              {finishSportName}
            </div>

            {/* 4. Divisor fino. */}
            <div className="h-px w-full bg-white/15" />

            {/* 5. Colocação do vencedor: anel azul-claro (só contorno) com "1º"
                   grande em amarelo (número + "º" sobrescrito menor). */}
            <div
              className="flex items-center justify-center rounded-full"
              style={{ height: "6rem", width: "6rem", border: "3px solid #6c9cff" }}
            >
              <span className="font-black leading-none" style={{ color: "#FEE100" }}>
                <span className="text-5xl md:text-6xl align-baseline">1</span>
                <span className="text-xl md:text-2xl align-super">º</span>
              </span>
            </div>

            {/* 6. Vencedor: nome em amarelo bold + "VENCEDOR" abaixo, branco/menor. */}
            <div className="flex flex-col items-center gap-1">
              <div
                className="max-w-full truncate text-3xl md:text-4xl font-black uppercase leading-none"
                style={{ color: "#FEE100" }}
              >
                {winnerName}
              </div>
              <div className="text-xs md:text-sm font-bold uppercase tracking-[0.35em] text-white/85">
                Vencedor
              </div>
            </div>

            {/* 7. Recap do placar: uma linha por jogador — vencedor em cima
                   (branco), perdedor embaixo (cinza). Cada linha: nome à esquerda
                   + números por unidade (set no tênis; game/pontos no rally/
                   side-out) alinhados em coluna entre as duas linhas. */}
            <div
              className="w-full flex flex-col gap-1 text-lg md:text-xl font-bold tabular-nums"
              style={{ display: "grid", gridTemplateColumns: `minmax(0,1fr) repeat(${finishPlayedCols.length}, 1.6rem)` }}
            >
              <div className="contents">
                <span className="truncate text-left uppercase" style={{ color: "#ffffff" }}>
                  {winnerName}
                </span>
                {winnerRecap.map((v, i) => (
                  <span key={`w-${i}`} className="text-center" style={{ color: "#ffffff" }}>
                    {v}
                  </span>
                ))}
              </div>
              <div className="contents">
                <span className="truncate text-left uppercase" style={{ color: "#8a8ab0" }}>
                  {loserName}
                </span>
                {loserRecap.map((v, i) => (
                  <span key={`l-${i}`} className="text-center" style={{ color: "#8a8ab0" }}>
                    {v}
                  </span>
                ))}
              </div>
            </div>

            {/* 9 + 10. Oferecimento: divisor + "OFERECIMENTO" à esquerda e o logo
                   do patrocinador em CARTÃO CLARO à direita (só se houver `ad`
                   resolvido). Cartão claro — e não preto como antes — porque o
                   logo vem de fora e pode ter arte escura, que sumia no preto;
                   é o mesmo tratamento da Tela 2 da abertura e do /placar. */}
            {finishAd?.logoUrl && (
              <>
                <div className="h-px w-full bg-white/15" />
                <div className="w-full flex items-center justify-between gap-3">
                  <span className="text-[11px] md:text-xs font-bold uppercase tracking-[0.2em] text-white/70">
                    Oferecimento
                  </span>
                  <div className="rounded-xl bg-white p-2.5 shadow-md ring-1 ring-black/5">
                    <div className="relative h-12 md:h-14 w-32 md:w-36">
                      <Image src={finishAd.logoUrl} alt={finishAd.name} fill sizes="160px" className="object-contain" />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* 11. Divisor + data do jogo (dinâmica). */}
            <div className="h-px w-full bg-white/15" />
            <div className="text-[11px] md:text-xs font-bold uppercase tracking-[0.25em] text-white/60">
              {finishDate}
            </div>
          </div>

          {/* 8. Ações — FORA da arte (não entram na imagem). "JOGAR DE NOVO"
              (preenchido branco) e "COMPARTILHAR" (contornado, transparente).
              Compartilhar captura a arte e abre o share nativo, com "Gerando…"
              enquanto monta o PNG. */}
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={playAgain}
              className="rounded-full px-6 py-3 font-black uppercase tracking-wide text-sm md:text-base
                active:scale-95 transition-transform shadow-md"
              style={{ backgroundColor: "#ffffff", color: "#12123a" }}
            >
              Jogar de novo
            </button>
            <button
              type="button"
              onClick={shareResult}
              disabled={sharing}
              aria-label="Compartilhar resultado"
              className="rounded-full px-6 py-3 font-bold uppercase tracking-wide text-sm md:text-base
                border-2 border-white text-white active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-wait"
            >
              {sharing ? "Gerando…" : "Compartilhar"}
            </button>
          </div>

          {/* CONTA (A1.2): CTA/saudação de login — ADITIVO, atrás de flag, FORA do
              finishArtRef (não entra na imagem). Nunca gateia nada. */}
          <AppAuthCta />

          {/* Encerrar (voltar à home) — discreto, para não ficar preso na tela. */}
          <button
            type="button"
            onClick={endMatch}
            className="mt-1 text-[11px] uppercase tracking-widest underline text-white/60"
          >
            Encerrar partida
          </button>
        </div>
      )}

      {/* Third Set Choice Modal */}
      <ThirdSetModal isOpen={showThirdSetModal} onClose={handleThirdSetChoice} />

      {/* Modal de compartilhamento (QR de editor + link de espectador). Os
          campos de sala vêm do gameConfig; se ausentes, o modal mostra estado
          "indisponível" e o jogo segue local. editorCount vem do presence. */}
      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        quadra={quadra}
        sport={sport}
        theme={theme}
        scoreType={gameConfig.scoreType}
        clube={clube ?? undefined}
        ad={gameConfig.ad}
        gameType={gameConfig.gameType}
        matchId={gameConfig.matchId}
        viewToken={gameConfig.viewToken}
        editToken={gameConfig.editToken}
        editorCount={rt.editorCount}
      />

      {/* Popup grande de edição de nomes (B1a): abre ao tocar numa pílula do lado.
          NESTA fatia o toque SEMPRE abre o editor (a alternância seletor-de-saque/
          editor por fase entra no B1b). accentColor = cor do lado no tema. */}
      {editingSide && (
        <NameEditModal
          accentColor={editingSide === "blue" ? "var(--lado-a-bg)" : "var(--lado-b-bg)"}
          gameType={cfg.gameType}
          onGameTypeChange={setMatchGameType}
          // Sempre os DOIS nomes do lado (não filtrado por formato): trocar para
          // duplas no popup revela o 2º nome já existente.
          initialNames={
            editingSide === "blue"
              ? [cfg.players.blue1, cfg.players.blue2]
              : [cfg.players.red1, cfg.players.red2]
          }
          onSave={(p1, p2) => saveNames(editingSide, p1, p2)}
          onClose={() => setEditingSide(null)}
        />
      )}

      {/* Confirmação de RECOMEÇAR (modal do app, sem "flow.pwer.com.br diz"). */}
      {confirmRestartOpen && (
        <ConfirmModal
          message="Recomeçar a partida? Os pontos serão perdidos."
          confirmLabel="Recomeçar"
          onConfirm={restartMatch}
          onClose={() => setConfirmRestartOpen(false)}
        />
      )}
    </div>
  )
}
