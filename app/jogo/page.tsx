"use client"

import { Fragment, useState, useEffect, useRef, type CSSProperties } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Image from "next/image"
import { NameEditModal } from "@/components/name-edit-modal"
import { Settings, Volume2, VolumeX, Undo2, BarChart2, RotateCcw, LogOut, ArrowLeftRight, Share2, Users, UserMinus } from "lucide-react"
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
import { sportById, familyOf, formatPoint, defaultRulesFor, buildScoreCols, concededUnitFlags, displayServer, sideChangeOf, type SideChangeMode, type SportId } from "@/lib/sports-catalog"
import { themeClassName, type ThemeId } from "@/lib/themes"
import { clubBySlug } from "@/lib/clubs-config"
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

// Guarda DEFENSIVA: um objeto de regras é do FORMATO esperado pela família do
// esporte atual da tela? Usado antes de aplicar rules remotas (set_config) e ao
// abrir o setup — regras de outra família (ex.: squash {target,winBy} chegando
// numa tela de tênis, que espera {gamesPerSet, tiebreak:{...}}) quebrariam o
// motor/RULE_SPECS. Só checa a PRESENÇA dos campos discriminantes; não valida
// valores (o motor tolera valores fora do range, só não tolera campo ausente).
function rulesMatchFamily(rules: any, family: "tennis" | "rally" | "sideout"): boolean {
  if (!rules || typeof rules !== "object") return false
  if (family === "tennis") {
    // tênis/beach/padel: bloco de tiebreak (lido pelo motor e pelo RULE_SPECS)
    // + gamesPerSet. É exatamente o que falta nas regras de rally.
    return (
      typeof rules.tiebreak === "object" &&
      rules.tiebreak !== null &&
      typeof rules.gamesPerSet === "number"
    )
  }
  // rally/sideout (squash/ping pong/pickleball): contagem corrida por alvo.
  return typeof rules.target === "number" && typeof rules.winBy === "number"
}

// Janela do DUPLO-TOQUE (desfazer por gesto). Curta o bastante para não colidir
// com dois pontos legítimos consecutivos no mesmo lado (que, na marcação real,
// nunca acontecem em <300ms).
const DOUBLE_TAP_MS = 300

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
          const rRules = rulesMatchFamily(rState.rules, familyOf(resolvedSport))
            ? rState.rules
            : defaultRulesFor(resolvedSport)
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
            gameType: "simples",
            scoreType: loadedScoreType,
            players: { blue1: "Jogador 1", blue2: "Jogador 2", red1: "Jogador 3", red2: "Jogador 4" },
            startTime: new Date().toISOString(),
            maxSets: (rRules?.bestOf as number) || 3,
            matchId: remote.id,
            editToken: editParam || undefined,
          }
          setGameConfig(synthetic)
          setTheme(resolvedTheme)
          setClube(null)
          setBluePlayerName("Jogador 1")
          setRedPlayerName("Jogador 3")
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
          if (parsed.rules) rules = parsed.rules
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
      nextRules = remoteRulesObj
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

  const toggleServing = () => {
    // Só permite alterar o sacador antes do primeiro ponto (nenhuma ação ainda).
    if (actionsRef.current.length === 0) {
      const newFirstServer: Side = firstServerRef.current === "A" ? "B" : "A"
      rebuildEngine(rulesRef.current, newFirstServer, [])
      persist()
      // Propaga o sacador para os outros devices (estado compartilhado).
      sendRealtimeAction({ kind: "set_config", patch: { firstServer: newFirstServer } })
    }
  }

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

  const resetGame = () => {
    if (confirm("Tem certeza que deseja reiniciar o jogo? Todos os dados serão perdidos.")) {
      localStorage.removeItem(`tennis_engine_${quadra}`)
      rebuildEngine(rulesRef.current, "A", [])
      persist()
      sendRealtimeAction({ kind: "reset" }) // zera a sala também (best-effort)
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
  // de render (renderBlock/pílulas) o enxergarem estreitado.
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

  // --- Lado da BOLA DE SAQUE dentro do bloco do sacador --------------------
  // A bola grande aparece SÓ no bloco de quem saca (gs.server). Quando o
  // esporte alterna o LADO da quadra a cada ponto E esse lado é DERIVÁVEL do
  // estado que o motor já expõe (server + points/advantage/tiebreakPoints — NÃO
  // tocamos lib/scoring), a bola desliza na horizontal a cada ponto:
  //   • TÊNIS e PADEL — mesma mecânica de deuce/ad court do tênis:
  //       - em tiebreak, a quadra alterna a CADA ponto → paridade do total de
  //         pontos do tiebreak (par = direita, ímpar = esquerda);
  //       - fora do tiebreak, o 40-40 com vantagem é sempre servido da quadra
  //         de VANTAGEM (esquerda); nos demais casos, paridade do total de
  //         pontos do game (par = quadra de IGUAIS/direita, ímpar = esquerda).
  //   • PICKLEBALL — regra de simples: o sacador serve da quadra DIREITA quando
  //       a PRÓPRIA pontuação é par, da ESQUERDA quando ímpar (derivável do
  //       modelo de saque único da Fase 0 do motor).
  //   • BEACH, SQUASH e PING PONG — "center": sem deslocamento (ver relatório).
  //       Beach não tem a alternância deuce/ad do tênis; no squash o box do
  //       saque depende do histórico de rallies vencidos no saque (não vem no
  //       snapshot server+points); no ping pong o saque troca a cada 2 pontos
  //       sem lado esquerdo/direito da quadra por ponto. Nesses, só QUEM saca.
  type ServeCourt = "left" | "right" | "center"
  const servingCourt: ServeCourt = (() => {
    if (sport === "tennis" || sport === "padel") {
      if (isTiebreak) {
        return (gs.A.tiebreakPoints + gs.B.tiebreakPoints) % 2 === 0 ? "right" : "left"
      }
      if (gs.A.advantage || gs.B.advantage) return "left"
      return (gs.A.points + gs.B.points) % 2 === 0 ? "right" : "left"
    }
    if (sport === "pickleball") {
      return gs[gs.server].points % 2 === 0 ? "right" : "left"
    }
    return "center"
  })()

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
  const finishClub = clube ? clubBySlug(clube) : null

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

  // Nomes INDIVIDUAIS de um lado para as pílulas (B1a): 1 (simples) ou 2 (duplas).
  // Lê direto do config (fonte da verdade); a montagem combinada "A/B" morreu nas
  // pílulas (segue só onde ainda é usada: tela de fim/broadcast).
  const playersOf = (team: "blue" | "red"): string[] => {
    const p = cfg.players
    if (team === "blue") return cfg.gameType === "duplas" ? [p.blue1, p.blue2] : [p.blue1]
    return cfg.gameType === "duplas" ? [p.red1, p.red2] : [p.red1]
  }

  // Pílulas de nome (glass, padrão do placar central). TOCÁVEIS: o click abre o
  // popup de edição do lado e dá stopPropagation (não marca ponto) — mas SÓ no
  // click: nenhum handler de pointer, então o swipe de espelhar (A1) continua
  // borbulhando ao .palco-main. `layout`: "row" (canto landscape) | "col" (faixa
  // central portrait). truncate p/ nomes longos.
  const renderNamePills = (team: "blue" | "red", layout: "row" | "col") => (
    // span inline-flex (não div) porque em landscape isto vive DENTRO do <span>
    // âncora da bola — evita nesting inválido (div em span).
    <span className={`inline-flex ${layout === "col" ? "flex-col" : "flex-row flex-wrap"} gap-1.5`}>
      {playersOf(team).map((nm, i) => (
        <button
          key={i}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setEditingSide(team)
          }}
          title="Editar nomes"
          className="glass max-w-full truncate rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white/90
            transition-transform active:scale-95"
        >
          {nm?.trim() || "Jogador"}
        </button>
      ))}
    </span>
  )

  // --- Bloco de um lado (ScoreBot): número gigante + nome + BOLA DE SAQUE -----
  // Toda a área é tocável e marca ponto para o lado (engine.pointFor via
  // handleScoreClick). As pílulas de nome e o toggle de sacador param a
  // propagação para não marcarem ponto. A bola de saque é só indicador
  // (pointer-events-none): nunca rouba o toque. Cores vêm das vars do tema.
  const renderBlock = (team: "blue" | "red") => {
    const side: Side = sideOf(team)
    const isA = team === "blue"
    const name = isA ? bluePlayerName : redPlayerName // só p/ aria-label
    const animating = isA ? animatingBlue : animatingRed
    const blinking = isA ? blueCardBlinking : redCardBlinking
    const isServing = isA ? blueServing : !blueServing
    const isWinner = isA ? blueWinner : redWinner
    const bgVar = isA ? "--lado-a-bg" : "--lado-b-bg"
    const txtVar = isA ? "--lado-a-texto" : "--lado-b-texto"

    // Espelhamento (A1): o bloco DESLIZA para o outro lado via .palco-main.mirrored
    // (CSS), mas seus alinhamentos internos assumem a posição ORIGINAL — então
    // quando espelhado, o canto nome+saque huga a borda OPOSTA e a bola de saque
    // troca de lado da quadra (35↔65) para casar com a nova posição do bloco.
    const cornerJustify = (isA ? !mirrored : mirrored)
      ? "landscape:justify-start"
      : "landscape:justify-end"
    const serveXLandscape =
      servingCourt === "center"
        ? "50%"
        : servingCourt === "left"
          ? mirrored
            ? "65%"
            : "35%"
          : mirrored
            ? "35%"
            : "65%"

    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={`Marcar ponto para ${name}`}
        onClick={() => handleScoreClick(team)}
        className={`palco-block ${isA ? "palco-block-a" : "palco-block-b"} relative flex-1 basis-0 flex flex-col items-stretch justify-center overflow-hidden cursor-pointer select-none
          ${animating ? "point-flash" : ""}`}
        style={{
          backgroundColor: `var(${bgVar})`,
          color: `var(${txtVar})`,
          // Expõe as cores do tema deste lado para o keyframe pointFlash inverter
          // (fundo↔texto) sem saber se é lado A ou B.
          "--blk-bg": `var(${bgVar})`,
          "--blk-text": `var(${txtVar})`,
        } as CSSProperties}
      >
        {/* Piscar do bloco vencedor (game/set/partida): overlay dedicado. Fica
            NUM ELEMENTO À PARTE do bloco de propósito — o bloco usa a propriedade
            `animation` para o FLASH ao marcar ponto (.point-flash), e um elemento
            só pode ter uma `animation`; o overlay mantém o win-blink (box-shadow
            inset = mesma borda interna) sem colidir. pointer-events-none p/ não
            roubar o toque de marcar ponto. */}
        {blinking && (
          <span aria-hidden className="win-blink pointer-events-none absolute inset-0 z-20" />
        )}

        {/* Canto: nome do jogador (pequeno) + indicador de saque.
            RETRATO (estreita-e-alta, blocos empilhados): o NOME SAI do canto (é
            `portrait:hidden` aqui) e passa para a FAIXA HORIZONTAL central sobre
            a linha divisória — assim o canto fica LIVRE e a bola de saque vira o
            único elemento ali (menos sobreposição do nome/número/bola). PAISAGEM
            (larga-e-baixa, blocos lado a lado): INALTERADO — o grupo nome+saque
            foge do CENTRO (onde fica o placar geral no topo) e huga a borda
            EXTERNA de cada bloco — lado A à esquerda, lado B à direita — para o
            placar central não cobrir o nome do lado direito. */}
        <div
          className={`absolute top-0 left-0 right-0 z-10 flex items-start justify-between gap-2 px-4 pt-3 md:px-5 md:pt-4
            ${cornerJustify}`}
        >
          {/* CONTAINER DO NOME: envolve SÓ o nome (texto/Input) e é a ÂNCORA
              HORIZONTAL da bola de saque em LANDSCAPE. `landscape:relative` → em
              paisagem este span vira o CONTAINING BLOCK da bola (position
              estabelecida), então a bola (filha ABSOLUTA aqui dentro) segue a
              POSIÇÃO REAL do nome — left/top em % passam a ser relativos à CAIXA
              DO NOME, não a uma % fixa do bloco inteiro. Em RETRATO o container
              fica `static` (sem `landscape:relative`), então o containing block da
              bola volta a ser o WRAPPER externo (comportamento de portrait
              INTACTO). O container NÃO é `portrait:hidden` (só o texto do nome é),
              senão esconderia a bola junto; a bola é filha absoluta → não conta
              na largura do container (o container continua "envolvendo só o nome").
              `max-w-[75%] min-w-0` garante o truncamento do nome como antes. */}
          <span className="min-w-0 max-w-[75%] landscape:relative">
            {/* PÍLULAS de nome (B1a) — só PAISAGEM (portrait:hidden); em retrato
                elas vivem na faixa central. Substituem o nome/Input inline. A bola
                de saque abaixo (âncora inalterada) continua como hoje. */}
            <span className="portrait:hidden">{renderNamePills(team, "row")}</span>

            {/* BOLA DE SAQUE: indicador GRANDE e MÓVEL. Filha absoluta do
                CONTAINER DO NOME acima → fica SEMPRE logo abaixo do nome (`top:
                100%` da caixa do nome + margem) e, em landscape, ACOMPANHA a
                posição real do nome (não uma % do bloco). Aparece só no bloco de
                quem saca; desliza p/ esquerda/direita quando o lado da quadra muda
                (tênis/padel/pickleball) ou fica no centro quando não se aplica
                (beach/squash/ping pong). FORMA: bola de tênis em SVG — disco na
                cor do número (currentColor = --lado-*-texto) + duas curvas de
                costura na cor de fundo do tema (--lado-*-bg) em baixa opacidade.
                Anel = --lado-*-bg.

                POSIÇÃO HORIZONTAL por ORIENTAÇÃO (a vertical `top:100%` já ancora
                perto do topo do bloco nos dois casos): o `left` sai de duas
                variáveis e o media query em .serve-ball escolhe qual usar:
                  - RETRATO: container `static` → left é % do WRAPPER (que cobre a
                    faixa superior do bloco inteiro, left-0 right-0). Aqui os nomes
                    migraram p/ a pílula central, então os cantos ficaram livres:
                    --serve-x-portrait é FIXO em 85% (canto superior DIREITO), IGUAL
                    nos dois blocos (não espelhado) e SEM deslizar — não segue mais
                    o lado da quadra nem a antiga posição do nome. Só muda QUAL
                    bloco a exibe (o de quem saca).
                  - PAISAGEM: container `relative` → left é % da CAIXA DO NOME:
                    --serve-x-landscape = 35/50/65% (centrado sob o nome, com um
                    leve deslize p/ indicar o lado da quadra em tênis/padel).
                    Como o nome já é jogado p/ a borda externa (landscape:justify-
                    start/end), a bola segue o nome no canto certo automaticamente.
                    INALTERADO. */}
            {isServing && !finished && (
              <svg
                aria-hidden
                viewBox="0 0 100 100"
                className="serve-ball"
                style={{
                  "--serve-x-portrait": "85%",
                  "--serve-x-landscape": serveXLandscape,
                  color: `var(${txtVar})`,
                  boxShadow: `0 0 0 0.3rem var(${bgVar}), 0 0.3rem 1rem rgba(0, 0, 0, 0.4)`,
                } as CSSProperties}
              >
                {sport === "squash" ? (
                  <>
                    {/* Bola de SQUASH: disco PRETO sólido — a bola de squash é
                        sempre preta, independente do tema (por isso #000 fixo, e
                        não currentColor) — com o "pingo" amarelo de velocidade na
                        lateral, como a marcação das bolas reais. */}
                    <circle cx="50" cy="50" r="49" fill="#000000" />
                    <circle cx="70" cy="50" r="9" fill="#FEE100" />
                  </>
                ) : (
                  <>
                    <circle cx="50" cy="50" r="49" fill="currentColor" />
                    {/* Costura da bola: duas curvas simétricas que arqueiam para o
                        centro (a "linha em S" clássica da bola de tênis/padel/beach). */}
                    <path
                      d="M22 10 C40 33 40 67 22 90"
                      fill="none"
                      stroke={`var(${bgVar})`}
                      strokeOpacity={0.5}
                      strokeWidth={4}
                      strokeLinecap="round"
                    />
                    <path
                      d="M78 10 C60 33 60 67 78 90"
                      fill="none"
                      stroke={`var(${bgVar})`}
                      strokeOpacity={0.5}
                      strokeWidth={4}
                      strokeLinecap="round"
                    />
                  </>
                )}
              </svg>
            )}
          </span>

          {/* Troca de sacador: SÓ antes do 1º ponto e SÓ no bloco de quem saca
              (após o início, o sacador não muda — o motor rejeita). O indicador
              visual de saque agora é a BOLA GRANDE abaixo; este chip é só o
              controle discreto para escolher quem começa sacando. */}
          {initialServingSet && isServing && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                toggleServing()
              }}
              title="Toque para trocar quem saca primeiro (só antes do 1º ponto)"
              aria-label="Trocar sacador"
              className="serve-toggle shrink-0"
              style={{ color: `var(${txtVar})` }}
            >
              <ArrowLeftRight className="h-3 w-3" />
              saque
            </button>
          )}
        </div>

        {/* Número gigante */}
        <div className={`giant-number text-center px-2 ${animating ? "score-animation" : ""}`}>{bigNumber(side)}</div>

        {/* Rodapé do bloco: tiebreak / vencedor (discretos) */}
        {(isTiebreak || (finished && isWinner)) && (
          <div className="absolute bottom-0 left-0 right-0 pb-3 text-center text-xs md:text-sm font-bold tracking-[0.2em] opacity-80">
            {finished && isWinner ? "VENCEDOR" : "TIEBREAK"}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={`relative flex flex-col h-[100dvh] overflow-hidden mono-tabular ${themeClassName(theme)}`}
      style={{ backgroundColor: "var(--palco-fundo)", color: "var(--palco-discreto)" }}
    >
      {/* Palco: dois blocos ocupando a tela INTEIRA (sem barras). A direção segue
          a ORIENTAÇÃO (não a largura): empilhados em retrato, lado a lado em
          paisagem — ver .palco-main. */}
      <main
        className={`palco-main flex-1 flex min-h-0 ${mirrored ? "mirrored" : ""}`}
        // touch-action:none → o navegador não rouba o swipe horizontal (scroll/
        // gesto de "voltar"); o toque simples continua gerando click normalmente.
        style={{ gap: "1px", backgroundColor: "var(--palco-divisor)", touchAction: "none" }}
        // SWIPE horizontal p/ espelhar (A1). Pointer events na mão (sem lib):
        // registra o início e, no release, se o gesto foi PREDOMINANTEMENTE
        // horizontal e passou do limiar, marca `swipedRef` (o click seguinte
        // aborta o ponto) e vira. Horizontal em AMBAS as orientações — é o gesto
        // universal de "virar". Toque parado (ponto/duplo-toque) não vira: o
        // deslocamento fica abaixo do limiar.
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
        {renderBlock("blue")}
        {renderBlock("red")}
      </main>

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

      {/* TOPO-CENTRO: assinatura do CLUBE (quando a partida veio da jornada de
          contexto) + PLACAR GERAL. O logo do clube fica ACIMA da chip, pequeno e
          discreto (estilo Wimbledon/US Open); a chip desceu um pouco para caber.
          Sem clube, mostra só a chip (jogo genérico). O container é
          pointer-events-none e só a chip recebe toque. */}
      <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5">
        {clube && clubBySlug(clube)?.logo && (
          <div className="relative aspect-square h-10 md:h-12 rounded-full overflow-hidden ring-1 ring-white/15 shadow-md">
            <Image
              src={clubBySlug(clube)!.logo}
              alt={clubBySlug(clube)!.nome}
              fill
              sizes="56px"
              className="object-cover"
            />
          </div>
        )}

        {/* PLACAR CENTRAL — VARIANTE PAISAGEM (larga-e-baixa): pílula VERTICAL
            no TOPO-CENTRO, INALTERADA. É `portrait:hidden`, então em retrato dá
            lugar à faixa horizontal logo abaixo (sobre a divisória). Em paisagem
            (larga-e-baixa) permanece EXATAMENTE como antes.
            Pílula ÚNICA com GLASS (vidro fumê legível sobre o
            bloco claro e o escuro do tema), envolvendo uma TRILHA DE UNIDADES —
            o ÚNICO elemento (não há mais linhas fixas "SETS"/"GAMES"). Uma
            FILEIRA por unidade possível (1..bestOf), EMPILHADAS de cima p/ baixo
            (flex-col, não row). Cada fileira = 3 elementos horizontais no grid
            [1fr auto 1fr]: [lado A] · [dash "-" centralizado] · [lado B] — os
            dashes centrais formam uma coluna alinhada no meio da pílula. COR por
            fileira, da unidade ESPECÍFICA (buildScoreCols: c.played/c.current):
              - encerrada (played && !current) → BRANCO (placar final, ex 6 - 4);
              - EM ANDAMENTO (current)          → AMARELO #FEE100 (ao vivo, 2 - 1);
              - futura (!played)                → "–" nos dois lados, esmaecido.
            O amarelo pertence à fileira current — "anda" p/ a próxima quando um
            set termina (a que terminou vira branca com o placar final). Rally/
            side-out usam a MESMA estrutura (unidades = games). Toca p/ abrir o
            overview. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            openOverview()
          }}
          aria-label="Ver placar geral"
          className="glass pointer-events-auto rounded-2xl px-3.5 py-2 min-w-[3.75rem] flex flex-col items-stretch gap-0.5
            active:scale-95 transition-transform portrait:hidden"
        >
          {broadcastCols.map((c) => {
            const color = !c.played ? "rgba(255,255,255,0.35)" : c.current ? "#FEE100" : "#ffffff"
            return (
              <span
                key={c.setNum}
                className="grid grid-cols-[1fr_auto_1fr] items-baseline gap-x-2.5 leading-none tabular-nums font-bold text-sm md:text-base"
              >
                <span className="text-right" style={{ color }}>
                  {pillCell(c, mirrored ? "b" : "a")}
                </span>
                <span className="text-center text-white/40">-</span>
                <span className="text-left" style={{ color }}>
                  {pillCell(c, mirrored ? "a" : "b")}
                </span>
              </span>
            )
          })}
          {isTiebreak && (
            <span
              className="text-center font-bold tracking-widest text-[9px] md:text-[10px]"
              style={{ color: "#FEE100" }}
            >
              TB
            </span>
          )}
        </button>
      </div>

      {/* PLACAR CENTRAL — VARIANTE RETRATO (estreita-e-alta): FAIXA HORIZONTAL
          ancorada na LINHA DIVISÓRIA entre os dois blocos empilhados (meio da
          tela, top-1/2), NÃO no topo-centro. Estrutura em DUAS LINHAS, uma por
          jogador (sem bloco de placar central separado):
            - LINHA 1: nome do JOGADOR 1 (lado A/azul) à esquerda + os números de
              c.a de cada coluna de buildScoreCols (na ordem, com "–" p/ futuras);
            - LINHA 2: nome do JOGADOR 3 (lado B/vermelho) à esquerda + os números
              de c.b, na MESMA ordem.
          Um ÚNICO GRID [nome | col×N] com auto-flow em linha garante que o número
          de cada unidade fique em COLUNA alinhada verticalmente entre as duas
          linhas (set 1 de cima exatamente acima do set 1 de baixo, etc.): a 1ª
          coluna é o nome (minmax(0,1fr), truncável) e as N seguintes têm LARGURA
          FIXA por unidade. Cor por UNIDADE (não por jogador): branco encerrada,
          amarelo current (aplicada ao número daquela unidade nas DUAS linhas),
          dash esmaecido futura — direto de buildScoreCols. Os nomes vieram dos
          cantos (que ficam livres p/ a bola de saque). Mesmo GLASS da pílula de
          paisagem; tocar na pílula abre o overview (div role=button, os nomes dão
          stopPropagation p/ editar); tocar num nome edita.
          `landscape:hidden` → em paisagem (larga-e-baixa) esta faixa NÃO existe e
          vale a pílula vertical do topo (inalterada). */}
      <div className="landscape:hidden pointer-events-none absolute left-1/2 top-1/2 z-30 flex w-full -translate-x-1/2 -translate-y-1/2 justify-center px-3">
        <div
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            openOverview()
          }}
          aria-label="Ver placar geral"
          className="glass pointer-events-auto grid max-w-full items-center gap-x-3 gap-y-1 rounded-2xl px-3.5 py-2
            active:scale-[0.98] transition-transform"
          style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${broadcastCols.length}, 1.35rem)` }}
        >
          {/* Duas linhas (uma por jogador): nome + números da sua unidade. Quando
              ESPELHADO, a ORDEM das linhas troca (lado B em cima), acompanhando os
              blocos que se cruzam. Fragment é transparente ao grid (auto-flow). */}
          {(mirrored
            ? ([["red", "b"], ["blue", "a"]] as const)
            : ([["blue", "a"], ["red", "b"]] as const)
          ).map(([team, key]) => (
            <Fragment key={team}>
              <div className="min-w-0">{renderNamePills(team, "col")}</div>
              {broadcastCols.map((c) => {
                const color = !c.played
                  ? "rgba(255,255,255,0.35)"
                  : c.current
                    ? "#FEE100"
                    : "#ffffff"
                return (
                  <span
                    key={`${key}-${c.setNum}`}
                    className="text-center leading-none tabular-nums font-bold text-sm"
                    style={{ color }}
                  >
                    {pillCell(c, key)}
                  </span>
                )
              })}
            </Fragment>
          ))}

          {isTiebreak && (
            <span
              className="col-span-full text-center font-bold tracking-widest text-[9px]"
              style={{ color: "#FEE100" }}
            >
              TB
            </span>
          )}
        </div>
      </div>

      {/* BARRA DE CONTROLES no RODAPÉ: três posições (grid-cols-3) que nunca se
          sobrepõem — ESQUERDA: voltar · CENTRO: contagem · DIREITA: voz + config.
          O container é pointer-events-none (vãos passam o toque); cada controle é
          pointer-events-auto. Config/voz saíram do canto p/ esta barra, sem
          sobrepor o toggle. Rótulos do toggle curtos p/ caber em telas estreitas. */}
      <div className="pointer-events-none absolute inset-x-3 bottom-4 z-20 grid grid-cols-3 items-center">
        {/* ESQUERDA: COMPARTILHAR + VOLTAR (undo). O undo é SEMPRE renderizado:
            quando não há o que desfazer, fica DESABILITADO (esmaecido +
            não-clicável), nunca some — o jogador vê que a função existe. */}
        <div className="justify-self-start flex items-center gap-2">
          {/* COMPARTILHAR: destaque (fundo sólido, ver SHARE_BTN_STYLE) para se
              diferenciar dos demais botões glass — é o convite a colaborar. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setShareOpen(true)
            }}
            aria-label="Compartilhar partida"
            title="Compartilhar partida"
            style={SHARE_BTN_STYLE}
            className="pointer-events-auto rounded-full p-2.5 shadow-lg ring-1 ring-black/10
              active:scale-95 transition-transform"
          >
            <Share2 className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              undoLastPoint()
            }}
            disabled={!started}
            aria-label="Desfazer último ponto"
            title={started ? "Desfazer último ponto" : "Nada para desfazer"}
            className="glass pointer-events-auto rounded-full p-2.5
              active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
          >
            <Undo2 className="h-5 w-5" />
          </button>

          {/* Indicador de aparelhos conectados (placar compartilhado). Discreto,
              só aparece quando há OUTRO aparelho no jogo (editorCount > 1) e a
              sala está conectada — sozinho ou offline não mostra nada
              (degradação silenciosa, coerente com o offline-first). N/3 inclui
              este aparelho (modelo do marcador de tecido). pointer-events-none:
              é só display, nunca rouba o toque de marcar ponto. */}
          {rt.status === "connected" && rt.editorCount > 1 && (
            <span
              className="glass pointer-events-none inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold tabular-nums"
              title={`${rt.editorCount} de 3 aparelhos conectados`}
              aria-label={`${rt.editorCount} de 3 aparelhos conectados`}
            >
              <Users className="h-3.5 w-3.5" />
              {rt.editorCount}/3
            </span>
          )}
        </div>

        {/* CENTRO: CONTAGEM ponto-a-ponto vs por games — acessível NO JOGO (um
            juiz/amigo entra no meio e troca). Segmentado: modo ATIVO destacado.
            Trocar não zera o placar (o motor tem os dois modos). */}
        <div
          className="glass pointer-events-auto justify-self-center rounded-full p-1 flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {([
            ["pontos", "Pontos"],
            ["games", "Games"],
          ] as const).map(([mode, label]) => {
            const on = gameConfig.scoreType === mode
            return (
              <button
                key={mode}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (!on) toggleScoreType()
                }}
                aria-pressed={on}
                title={mode === "pontos" ? "Contar ponto a ponto" : "Contar por games"}
                className={`px-3 py-1 rounded-full text-[10px] md:text-xs font-bold uppercase tracking-wide
                  transition-colors ${on ? "central-seg-on" : "opacity-60"}`}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* DIREITA: VOZ + CONFIG (saíram do canto para o rodapé, sem sobrepor). */}
        <div className="justify-self-end flex items-center gap-2">
          {/* VOZ: liga/desliga o anúncio (mute/unmute); o ícone reflete o estado. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              toggleVoice()
            }}
            aria-label={voiceEnabled ? "Desligar voz" : "Ligar voz"}
            aria-pressed={voiceEnabled}
            title={voiceEnabled ? "Voz ligada" : "Voz desligada"}
            className="glass pointer-events-auto rounded-full p-2.5 active:scale-95 transition-transform"
          >
            {voiceEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5 opacity-70" />}
          </button>

          {/* CONFIG: abre a mesma tela de setup. */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setSetupOpen(true)
            }}
            aria-label="Configurações"
            className="glass pointer-events-auto rounded-full p-2.5 active:scale-95 transition-transform"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </div>

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
          duplas={cfg.gameType === "duplas"}
          initialNames={[
            playersOf(editingSide)[0] ?? "",
            playersOf(editingSide)[1] ?? "",
          ]}
          onSave={(p1, p2) => saveNames(editingSide, p1, p2)}
          onClose={() => setEditingSide(null)}
        />
      )}
    </div>
  )
}
