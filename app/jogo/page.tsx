"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Settings, Volume2, VolumeX, Undo2, BarChart2, RotateCcw, LogOut } from "lucide-react"
import { ThirdSetModal } from "@/components/third-set-modal"
// Superfície de configuração ÚNICA: a MESMA tela de setup (esporte + regras),
// aberta agora também DE DENTRO do jogo pelo botão de config (aposenta o GameMenu
// antigo neste fluxo).
import { SportSetup } from "@/components/sport-setup"

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
import { sportById, familyOf, formatPoint, defaultRulesFor, type SportId } from "@/lib/sports-catalog"
import { themeClassName, type ThemeId } from "@/lib/themes"
import type { GameState, Side } from "@/lib/scoring/types"

type GameConfig = {
  quadra: string
  /** Esporte escolhido na tela de setup (define o módulo do motor). */
  sport?: SportId
  /** Tema de cor do placar (default Neutro). Personalização por partida. */
  theme?: ThemeId
  gameType: string
  scoreType: string
  players: {
    blue1: string
    blue2: string
    red1: string
    red2: string
  }
  startTime: string
  maxSets?: number
}

// Ação registrada para persistência: o estado do motor é reconstruído por
// replay (o engine não expõe setter de estado — ver lib/scoring/engine.ts).
type Action = { kind: "point" | "game"; side: Side }

// Mapa de lados: a tela usa blue/red; o motor usa A/B.
const sideOf = (team: "blue" | "red"): Side => (team === "blue" ? "A" : "B")

// Janela do DUPLO-TOQUE (desfazer por gesto). Curta o bastante para não colidir
// com dois pontos legítimos consecutivos no mesmo lado (que, na marcação real,
// nunca acontecem em <300ms).
const DOUBLE_TAP_MS = 300

export default function JogoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const quadra = searchParams.get("quadra") || "1"

  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null)

  // Esporte da partida (do setup). Fica em estado (para o render decidir família
  // de placar) e em ref (para acesso estável dentro de rebuildEngine, sem closure
  // velha). Default tênis para partidas antigas sem `sport`.
  const [sport, setSport] = useState<SportId>("tennis")
  const sportRef = useRef<SportId>("tennis")

  // Tema de cor do placar (do setup). Aplicado como classe no container raiz —
  // o placar (contagem + broadcast) consome as variáveis CSS do tema. Persiste
  // na config da partida. Default Neutro (partidas antigas sem `theme`).
  const [theme, setTheme] = useState<ThemeId>("neutro")

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
  const [editingBluePlayer, setEditingBluePlayer] = useState(false)
  const [editingRedPlayer, setEditingRedPlayer] = useState(false)
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
  const [showThirdSetModal, setShowThirdSetModal] = useState(false)
  const [blueCardBlinking, setBlueCardBlinking] = useState(false)
  const [redCardBlinking, setRedCardBlinking] = useState(false)
  const [maxSets, setMaxSets] = useState(3)

  // Último toque de marcação (lado + instante), para reconhecer o DUPLO-TOQUE
  // que desfaz. Não dispara re-render (é só detecção de gesto) → fica em ref.
  const lastTapRef = useRef<{ team: "blue" | "red"; time: number } | null>(null)

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
  const rebuildEngine = (rules: any, firstServer: Side, actions: Action[]) => {
    const module = sportById(sportRef.current).module
    const engine = new ScoringEngine(module, rules, firstServer)
    for (const a of actions) {
      if (a.kind === "game") engine.awardGameFor(a.side)
      else engine.pointFor(a.side)
    }
    engineRef.current = engine
    actionsRef.current = [...actions]
    rulesRef.current = rules
    firstServerRef.current = firstServer
    setGameState(engine.getState())
  }

  // Persiste o suficiente para reconstruir o motor por quadra.
  const persist = () => {
    localStorage.setItem(
      `tennis_engine_${quadra}`,
      JSON.stringify({ rules: rulesRef.current, firstServer: firstServerRef.current, actions: actionsRef.current }),
    )
  }

  useEffect(() => {
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
    } else {
      // Redirect to configuration if no game is set up
      router.push(`/`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quadra, router])

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

  // Voz (client-only): instancia o speaker e restaura a preferência salva.
  // Default DESLIGADO (não surpreender o usuário com som — precisa optar).
  useEffect(() => {
    speakerRef.current = createSpeechSynthesisSpeaker()
    if (localStorage.getItem("voice_enabled") === "1") setVoiceEnabled(true)
    return () => speakerRef.current?.cancel()
  }, [])

  const toggleVoice = () => {
    setVoiceEnabled((prev) => {
      const next = !prev
      localStorage.setItem("voice_enabled", next ? "1" : "0")
      if (!next) speakerRef.current?.cancel() // ao mutar, corta a fala em curso
      return next
    })
  }

  const handleScoreClick = (team: "blue" | "red") => {
    const engine = engineRef.current
    if (!engine) return

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

    // Granularidade: modo "games" concede o game inteiro; senão, marca 1 ponto.
    if (gameConfig?.scoreType === "games") {
      engine.awardGameFor(side)
      actionsRef.current.push({ kind: "game", side })
    } else {
      engine.pointFor(side)
      actionsRef.current.push({ kind: "point", side })
    }

    setGameState(engine.getState())
    persist()

    // Arma o duplo-toque: registra este toque (que REALMENTE marcou) para que um
    // 2º toque rápido no mesmo lado seja reconhecido como "desfazer".
    lastTapRef.current = { team, time: now }

    // Animate the score
    if (team === "blue") {
      setAnimatingBlue(true)
      setTimeout(() => setAnimatingBlue(false), 300)
    } else {
      setAnimatingRed(true)
      setTimeout(() => setAnimatingRed(false), 300)
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

    // Voz ao desfazer (se ligada): palavra curta de correção + placar corrigido
    // recantado, pelo MESMO caminho isolado (announcer + speaker). Igual ao
    // anúncio normal, é não-bloqueante e desacoplado por queueMicrotask.
    if (voiceEnabled) {
      const speech = announceUndo(state, { lang: "pt-BR", sport })
      if (speech) {
        const speaker = speakerRef.current
        queueMicrotask(() => speaker?.speak(speech.text, { lang: "pt-BR" }))
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
    }
  }

  const toggleScoreType = () => {
    if (!gameConfig) return

    const newConfig = { ...gameConfig }
    newConfig.scoreType = newConfig.scoreType === "pontos" ? "games" : "pontos"

    setGameConfig(newConfig)
    localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(newConfig))
  }

  const handleThirdSetChoice = (_playTiebreak: boolean) => {
    // Fase 0: a escolha de tiebreak/super tiebreak do set decisivo ainda não é
    // exposta ao motor (refinamento futuro). Apenas fecha o modal.
    setShowThirdSetModal(false)
  }

  const updatePlayerName = (team: "blue" | "red", name: string) => {
    if (!gameConfig) return

    const newConfig = { ...gameConfig }

    if (team === "blue") {
      if (gameConfig.gameType === "simples") {
        newConfig.players.blue1 = name
      } else {
        // Split the name by / for doubles
        const names = name.split("/")
        if (names.length > 0) newConfig.players.blue1 = names[0]
        if (names.length > 1) newConfig.players.blue2 = names[1]
      }
    } else {
      if (gameConfig.gameType === "simples") {
        newConfig.players.red1 = name
      } else {
        // Split the name by / for doubles
        const names = name.split("/")
        if (names.length > 0) newConfig.players.red1 = names[0]
        if (names.length > 1) newConfig.players.red2 = names[1]
      }
    }

    setGameConfig(newConfig)
    localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(newConfig))
  }

  const resetGame = () => {
    if (confirm("Tem certeza que deseja reiniciar o jogo? Todos os dados serão perdidos.")) {
      localStorage.removeItem(`tennis_engine_${quadra}`)
      rebuildEngine(rulesRef.current, "A", [])
      persist()
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
  const startNewMatch = (nextSport: SportId, nextRules: any, nextTheme: ThemeId) => {
    sportRef.current = nextSport
    setSport(nextSport)
    setTheme(nextTheme)

    const now = new Date()
    setStartTime(now)
    setMaxSets(nextRules.bestOf ?? 3)

    if (gameConfig) {
      const newConfig: GameConfig = {
        ...gameConfig,
        sport: nextSport,
        theme: nextTheme,
        startTime: now.toISOString(),
        maxSets: nextRules.bestOf ?? 3,
      }
      setGameConfig(newConfig)
      localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(newConfig))
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
  const onSetupConfirm = (nextSport: SportId, nextRules: any, sportChanged: boolean, nextTheme: ThemeId) => {
    if (!sportChanged) {
      // O tema é personalização: aplica SEM recomeçar a partida (só recolore).
      rebuildEngine(nextRules, firstServerRef.current, actionsRef.current)
      setTheme(nextTheme)
      if (gameConfig) {
        const newConfig: GameConfig = {
          ...gameConfig,
          theme: nextTheme,
          maxSets: nextRules.bestOf ?? gameConfig.maxSets,
        }
        setGameConfig(newConfig)
        localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(newConfig))
      }
      setMaxSets(nextRules.bestOf ?? maxSets)
      persist()
      setSetupOpen(false)
      return
    }
    if (confirm("Trocar de esporte vai iniciar uma nova partida. Continuar?")) {
      startNewMatch(nextSport, nextRules, nextTheme)
      setSetupOpen(false)
    }
  }

  if (!gameConfig || !gameState) {
    return <div className="flex items-center justify-center min-h-screen">Carregando...</div>
  }

  // --- Derivações de exibição a partir do GameState do motor (blue=A, red=B) ---
  const gs = gameState
  const finished = gs.finished
  const blueWinner = gs.winner === "A"
  const redWinner = gs.winner === "B"
  const blueServing = gs.server === "A"
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
  // O valor da coluna corrente muda por família: games (tênis) vs. pontos corridos.
  const broadcastCols = Array.from({ length: totalUnits }, (_, i) => {
    const done = gs.completedSets[i]
    if (done) {
      return { setNum: i + 1, played: true, current: false, a: done.A, b: done.B, tb: !!done.tiebreak }
    }
    if (!finished && i === gs.completedSets.length) {
      const a = isTennisFamily ? gs.A.games : gs.A.points
      const b = isTennisFamily ? gs.B.games : gs.B.points
      return { setNum: i + 1, played: true, current: true, a, b, tb: isTiebreak }
    }
    return { setNum: i + 1, played: false, current: false, a: null as number | null, b: null as number | null, tb: false }
  })

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

  // --- Bloco de um lado (ScoreBot): número gigante + nome/sacador no canto ---
  // Toda a área é tocável e marca ponto para o lado (engine.pointFor via
  // handleScoreClick). O nome e o indicador de saque param a propagação para não
  // marcarem ponto quando editados/alternados. Cores vêm de variáveis CSS P&B.
  const renderBlock = (team: "blue" | "red") => {
    const side: Side = sideOf(team)
    const isA = team === "blue"
    const name = isA ? bluePlayerName : redPlayerName
    const setName = isA ? setBluePlayerName : setRedPlayerName
    const editing = isA ? editingBluePlayer : editingRedPlayer
    const setEditing = isA ? setEditingBluePlayer : setEditingRedPlayer
    const animating = isA ? animatingBlue : animatingRed
    const blinking = isA ? blueCardBlinking : redCardBlinking
    const isServing = isA ? blueServing : !blueServing
    const isWinner = isA ? blueWinner : redWinner
    const bgVar = isA ? "--lado-a-bg" : "--lado-b-bg"
    const txtVar = isA ? "--lado-a-texto" : "--lado-b-texto"

    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={`Marcar ponto para ${name}`}
        onClick={() => handleScoreClick(team)}
        className={`relative flex-1 basis-0 flex flex-col items-stretch justify-center overflow-hidden cursor-pointer select-none
          ${blinking ? "win-blink" : ""}`}
        style={{ backgroundColor: `var(${bgVar})`, color: `var(${txtVar})` }}
      >
        {/* Canto: nome do jogador (pequeno) + indicador de saque.
            RETRATO (blocos empilhados): nome à esquerda, saque à direita
            (justify-between) — inalterado. PAISAGEM (blocos lado a lado): o
            grupo nome+saque foge do CENTRO (onde fica o placar geral no topo) e
            huga a borda EXTERNA de cada bloco — lado A à esquerda, lado B à
            direita — para o placar central não cobrir o nome do lado direito. */}
        <div
          className={`absolute top-0 left-0 right-0 z-10 flex items-start justify-between gap-2 px-4 pt-3 md:px-5 md:pt-4
            ${isA ? "landscape:justify-start" : "landscape:justify-end"}`}
        >
          {editing ? (
            <Input
              value={name}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                setEditing(false)
                updatePlayerName(team, name)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setEditing(false)
                  updatePlayerName(team, name)
                }
              }}
              autoFocus
              className="h-8 max-w-[70%] bg-transparent border-current/40 text-base font-semibold player-name"
              style={{ color: `var(${txtVar})` }}
            />
          ) : (
            <span
              onClick={(e) => {
                e.stopPropagation()
                setEditing(true)
              }}
              className="player-name truncate text-sm md:text-base font-semibold uppercase tracking-wide opacity-90 max-w-[75%]"
            >
              {name}
            </span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              toggleServing()
            }}
            title={
              initialServingSet
                ? "Toque para alterar o sacador"
                : "O sacador não pode ser alterado após o início da partida"
            }
            aria-label="Indicador de saque"
            className="shrink-0 -mt-0.5"
          >
            <span
              className={`block w-3.5 h-3.5 rounded-full serving-indicator ${!initialServingSet ? "opacity-60" : ""}`}
              style={{
                backgroundColor: isServing ? "currentColor" : "transparent",
                border: "2px solid currentColor",
                opacity: isServing ? 1 : 0.35,
              }}
            />
          </button>
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
        className="palco-main flex-1 flex min-h-0"
        style={{ gap: "1px", backgroundColor: "var(--palco-divisor)" }}
      >
        {renderBlock("blue")}
        {renderBlock("red")}
      </main>

      {/* Controles nas BORDAS (topo + rodapé), NUNCA no meio: o miolo da tela —
          onde vivem os números gigantes dos dois blocos — fica LIVRE de controle
          em qualquer orientação. Regra fixa (retrato e paisagem):
            - PLACAR GERAL: sempre no TOPO, centralizado.
            - Barra de controles (voltar · contagem · voz/config): sempre no RODAPÉ.
          Cada controle é pointer-events-auto + stopPropagation; os containers de
          borda são pointer-events-none, então seus vãos deixam o toque passar e o
          resto da tela (os blocos) continua sendo a área de marcar ponto. */}

      {/* PLACAR GERAL no TOPO: só o PANORAMA que os blocos NÃO mostram (o ponto
          atual já é GIGANTE). Tênis: SETS + GAMES; rally/sideout (sem sets): só
          GAMES ganhos. Tiebreak vira o selo TB. Toca pra abrir o placar geral. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          openOverview()
        }}
        aria-label="Ver placar geral"
        className="glass pointer-events-auto absolute top-3 left-1/2 -translate-x-1/2 z-20
          rounded-2xl px-4 py-1.5 flex items-end gap-3.5 active:scale-95 transition-transform"
      >
        {isTennisFamily && (
          <span className="flex flex-col items-center leading-none">
            <span className="opacity-60 text-[9px] md:text-[10px] uppercase tracking-wider mb-0.5">sets</span>
            <span className="tabular-nums font-bold text-2xl md:text-3xl leading-none">
              {gs.A.sets}-{gs.B.sets}
            </span>
          </span>
        )}
        {isTennisFamily && <span className="opacity-25 text-xl md:text-2xl leading-none pb-0.5">·</span>}
        <span className="flex flex-col items-center leading-none">
          <span className="opacity-60 text-[9px] md:text-[10px] uppercase tracking-wider mb-0.5">games</span>
          <span className="tabular-nums font-bold text-2xl md:text-3xl leading-none">
            {gs.A.games}-{gs.B.games}
          </span>
        </span>
        {isTiebreak && (
          <span className="self-center font-bold tracking-widest text-[10px] md:text-xs opacity-90">TB</span>
        )}
      </button>

      {/* BARRA DE CONTROLES no RODAPÉ: três posições (grid-cols-3) que nunca se
          sobrepõem — ESQUERDA: voltar · CENTRO: contagem · DIREITA: voz + config.
          O container é pointer-events-none (vãos passam o toque); cada controle é
          pointer-events-auto. Config/voz saíram do canto p/ esta barra, sem
          sobrepor o toggle. Rótulos do toggle curtos p/ caber em telas estreitas. */}
      <div className="pointer-events-none absolute inset-x-3 bottom-4 z-20 grid grid-cols-3 items-center">
        {/* ESQUERDA: VOLTAR (undo). SEMPRE renderizado/visível: quando não há o
            que desfazer, fica DESABILITADO (esmaecido + não-clicável), nunca some
            — o jogador vê que a função existe. (O sumiço reportado era o badge de
            DEV do Next no canto inferior-esquerdo; movido em next.config.) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            undoLastPoint()
          }}
          disabled={!started}
          aria-label="Desfazer último ponto"
          title={started ? "Desfazer último ponto" : "Nada para desfazer"}
          className="glass pointer-events-auto justify-self-start rounded-full p-2.5
            active:scale-95 transition-transform disabled:opacity-40 disabled:pointer-events-none"
        >
          <Undo2 className="h-5 w-5" />
        </button>

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
                GAME (set corrente destacado) → PONTO (ponta direita, grande). */}
            <div className="w-full overflow-x-auto">
              <table className="scoreboard-broadcast">
                <thead>
                  <tr className="text-[9px] md:text-xs uppercase tracking-widest opacity-45">
                    <th className="text-left font-normal">Jogador</th>
                    {broadcastCols.map((c) => (
                      <th key={c.setNum} className="font-normal">
                        {c.current ? (isTennisFamily ? "Game" : "Pts") : `${unitLabel} ${c.setNum}`}
                      </th>
                    ))}
                    <th className="font-normal">Ponto</th>
                  </tr>
                </thead>
                <tbody>
                  {(["A", "B"] as Side[]).map((side) => {
                    const name = side === "A" ? bluePlayerName : redPlayerName
                    const isServing = gs.server === side
                    const isWinner = gs.winner === side
                    return (
                      <tr key={side} data-side={side.toLowerCase()} className={isWinner ? "sb-winner" : ""}>
                        <td className="sb-name">
                          <span className={`sb-dot ${isServing ? "on" : ""}`} aria-hidden />
                          <span>{name}</span>
                        </td>
                        {broadcastCols.map((c) => {
                          const games = side === "A" ? c.a : c.b
                          return (
                            <td
                              key={c.setNum}
                              className={`sb-set ${c.current ? "sb-current" : ""} ${!c.played ? "sb-future" : ""}`}
                            >
                              {c.played ? games : "–"}
                              {c.tb && !c.current ? <sup className="sb-tb">tb</sup> : null}
                            </td>
                          )
                        })}
                        <td className="sb-point">{pointOf(side)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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
            initialRules={rulesRef.current}
            initialTheme={theme}
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

      {/* Third Set Choice Modal */}
      <ThirdSetModal isOpen={showThirdSetModal} onClose={handleThirdSetChoice} />
    </div>
  )
}
