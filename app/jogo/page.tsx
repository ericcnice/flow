"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Settings } from "lucide-react"
import { GameMenu } from "@/components/game-menu"
import { ThirdSetModal } from "@/components/third-set-modal"

// >>> Fase 0: a tela agora consome o motor de scoring (lib/scoring) em vez da
// lógica de pontuação embutida. Apenas TÊNIS nesta etapa.
import { ScoringEngine } from "@/lib/scoring/engine"
import { tennisModule, pointLabel } from "@/lib/scoring/sports/tennis"
import type { GameState, Side, TennisRules } from "@/lib/scoring/types"

type GameConfig = {
  quadra: string
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

export default function JogoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const quadra = searchParams.get("quadra") || "1"

  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null)

  // Motor de scoring: o engine é a fonte de verdade; espelhamos o GameState em
  // estado do React para disparar re-render. actions/rules/firstServer guardam
  // o necessário para persistir e reconstruir por replay.
  const engineRef = useRef<ScoringEngine<TennisRules> | null>(null)
  const actionsRef = useRef<Action[]>([])
  const rulesRef = useRef<TennisRules>(tennisModule.defaultRules())
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [showOverview, setShowOverview] = useState(false)
  const overviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showThirdSetModal, setShowThirdSetModal] = useState(false)
  const [blueCardBlinking, setBlueCardBlinking] = useState(false)
  const [redCardBlinking, setRedCardBlinking] = useState(false)
  const [maxSets, setMaxSets] = useState(3)

  const openScoreboard = () => {
    // Garantir que a URL tenha o parâmetro quadra corretamente
    const placarUrl = `/placar?quadra=${quadra}`
    window.open(placarUrl, "_blank")
  }

  // Deriva as regras de tênis a partir da config da partida (Fase 0: só bestOf).
  const rulesFromConfig = (config: GameConfig): TennisRules => ({
    ...tennisModule.defaultRules(),
    bestOf: (config.maxSets || 3) === 5 ? 5 : 3,
  })

  // (Re)constrói o engine aplicando as ações por replay e reflete no estado.
  const rebuildEngine = (rules: TennisRules, firstServer: Side, actions: Action[]) => {
    const engine = new ScoringEngine(tennisModule, rules, firstServer)
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

  const handleScoreClick = (team: "blue" | "red") => {
    const engine = engineRef.current
    if (!engine || engine.getState().finished) {
      return
    }

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

    // Animate the score
    if (team === "blue") {
      setAnimatingBlue(true)
      setTimeout(() => setAnimatingBlue(false), 300)
    } else {
      setAnimatingRed(true)
      setTimeout(() => setAnimatingRed(false), 300)
    }

    // Piscar o card do vencedor quando um game/set/partida é fechado.
    const won = engine.getLastEvents().find((e) => e.type === "GAME" || e.type === "SET" || e.type === "MATCH")
    if (won?.side === "A") {
      setBlueCardBlinking(true)
      setTimeout(() => setBlueCardBlinking(false), 1500)
    } else if (won?.side === "B") {
      setRedCardBlinking(true)
      setTimeout(() => setRedCardBlinking(false), 1500)
    }
  }

  const undoLastPoint = () => {
    const engine = engineRef.current
    if (!engine || !engine.canUndo()) return
    engine.undo()
    actionsRef.current.pop()
    setGameState(engine.getState())
    persist()
  }

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

  const updateGameConfig = (config: GameConfig) => {
    setGameConfig(config)
    setBluePlayerName(
      config.gameType === "simples" ? config.players.blue1 : `${config.players.blue1}/${config.players.blue2}`,
    )
    setRedPlayerName(
      config.gameType === "simples" ? config.players.red1 : `${config.players.red1}/${config.players.red2}`,
    )
    if (config.maxSets) {
      setMaxSets(config.maxSets)
    }
  }

  const changeMaxSets = (newMaxSets: number) => {
    setMaxSets(newMaxSets)
    if (gameConfig) {
      const newConfig = { ...gameConfig, maxSets: newMaxSets }
      setGameConfig(newConfig)
      localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(newConfig))
    }
    // Reflete no motor (bestOf) reconstruindo com as ações já jogadas.
    const newRules: TennisRules = { ...rulesRef.current, bestOf: newMaxSets === 5 ? 5 : 3 }
    rebuildEngine(newRules, firstServerRef.current, actionsRef.current)
    persist()
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

  // Formato da partida: total de sets possíveis (bestOf) e quantos faltam.
  // Usado no placar geral expandido para desenhar "● ● – – –".
  const bestOf = maxSets === 5 ? 5 : 3
  // Colunas set-a-set: sets já encerrados + o set em andamento (se não acabou).
  const setColumns = [
    ...gs.completedSets.map((s) => ({ label: s.set, a: s.A, b: s.B, tb: s.tiebreak, current: false })),
    ...(finished ? [] : [{ label: gs.currentSet, a: gs.A.games, b: gs.B.games, tb: isTiebreak, current: true }]),
  ]
  // Bolinhas de sets ganhos vs. possíveis (por lado), até bestOf.
  const setDots = (side: Side) =>
    Array.from({ length: bestOf }, (_, i) => (i < gs[side].sets ? "●" : "–")).join(" ")

  // Número grande de cada card: pontos do game (0/15/30/40/AD), ou tiebreak,
  // ou o total de games no modo "games".
  const bigNumber = (side: Side): string => {
    if (isTiebreak) return gs[side].tiebreakPoints.toString()
    if (gameConfig.scoreType === "games") return gs[side].games.toString()
    return pointLabel(gs[side]) // "0" | "15" | "30" | "40" | "AD"
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
        {/* Canto: nome do jogador (pequeno) + indicador de saque */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-start justify-between gap-2 px-4 pt-3 md:px-5 md:pt-4">
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
      className="relative flex flex-col h-[100dvh] overflow-hidden mono-tabular"
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

      {/* Placar central na ZONA SEGURA: fica no CENTRO exato da tela, sobre a
          linha divisória entre os dois blocos (em retrato a divisa é horizontal,
          em paisagem é vertical — o centro cai na linha nos dois casos). É a
          região onde ninguém toca pra marcar ponto. stopPropagation garante que
          tocar aqui NÃO marca ponto — apenas abre o placar geral. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          openOverview()
        }}
        aria-label="Ver placar geral"
        className="glass absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20
          rounded-full px-4 py-2 flex items-center gap-3 text-sm md:text-base font-semibold tracking-wide
          active:scale-95 transition-transform"
      >
        <span className="flex items-baseline gap-1">
          <span className="opacity-60 text-[10px] md:text-xs uppercase">sets</span>
          <span className="tabular-nums">
            {gs.A.sets}-{gs.B.sets}
          </span>
        </span>
        <span className="opacity-30">·</span>
        <span className="flex items-baseline gap-1">
          <span className="opacity-60 text-[10px] md:text-xs uppercase">games</span>
          <span className="tabular-nums">
            {isTiebreak ? `${gs.A.tiebreakPoints}-${gs.B.tiebreakPoints}` : `${gs.A.games}-${gs.B.games}`}
          </span>
        </span>
        {isTiebreak && <span className="opacity-90 font-bold tracking-widest text-xs">TB</span>}
      </button>

      {/* Botão de CONFIGURAÇÃO: único botão glass flutuante, canto inferior.
          Também é exceção à zona de "tocar marca ponto" (stopPropagation). */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setMenuOpen(true)
        }}
        aria-label="Configurações"
        className="glass absolute bottom-4 right-4 z-20 rounded-full p-3 active:scale-95 transition-transform"
      >
        <Settings className="h-5 w-5" />
      </button>

      {/* Placar geral expandido: overlay glass de tela cheia. Aparece ao tocar no
          placar central, some sozinho após ~5s ou ao tocar fora do painel. */}
      {showOverview && (
        <div
          className="glass-overlay glass-overlay-anim absolute inset-0 z-30 flex items-center justify-center p-6"
          onClick={closeOverview}
          role="dialog"
          aria-label="Placar geral"
        >
          <div
            className="glass-panel-anim w-full max-w-md flex flex-col items-center gap-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Cabeçalho: quadra + cronômetro */}
            <div className="w-full flex items-center justify-between text-xs uppercase tracking-widest opacity-70">
              <span>Quadra {gameConfig.quadra}</span>
              <span className="tabular-nums">{elapsedTime}</span>
            </div>

            {/* Sets ganhos vs. possíveis, conforme o formato (melhor de {bestOf}) */}
            <div className="w-full flex flex-col gap-3">
              {(["A", "B"] as Side[]).map((side) => {
                const name = side === "A" ? bluePlayerName : redPlayerName
                return (
                  <div key={side} className="flex items-center justify-between gap-4">
                    <span className="truncate font-semibold uppercase tracking-wide text-sm md:text-base max-w-[55%]">
                      {name}
                    </span>
                    <span className="tabular-nums tracking-[0.35em] text-lg md:text-xl">{setDots(side)}</span>
                  </div>
                )
              })}
            </div>

            {/* Placar set-a-set (games por set). Set em andamento marcado com "·". */}
            <div className="w-full overflow-x-auto">
              <table className="w-full text-center tabular-nums border-separate border-spacing-y-1">
                <thead>
                  <tr className="text-[10px] uppercase tracking-widest opacity-50">
                    <th className="text-left font-normal">Set</th>
                    {setColumns.map((c, i) => (
                      <th key={i} className="font-normal px-1">
                        {c.label}
                        {c.current ? "·" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-base md:text-lg font-semibold">
                  <tr>
                    <td className="text-left text-xs uppercase tracking-wide opacity-70 truncate max-w-[6rem]">
                      {bluePlayerName}
                    </td>
                    {setColumns.map((c, i) => (
                      <td key={i} className="px-1">
                        {c.a}
                        {c.tb && !c.current ? <sup className="text-[9px] opacity-60">tb</sup> : null}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="text-left text-xs uppercase tracking-wide opacity-70 truncate max-w-[6rem]">
                      {redPlayerName}
                    </td>
                    {setColumns.map((c, i) => (
                      <td key={i} className="px-1">
                        {c.b}
                        {c.tb && !c.current ? <sup className="text-[9px] opacity-60">tb</sup> : null}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {finished && (
              <div className="text-sm font-bold uppercase tracking-[0.2em] opacity-90">
                Vencedor: {blueWinner ? bluePlayerName : redPlayerName}
              </div>
            )}

            <span className="text-[10px] uppercase tracking-widest opacity-40">toque fora para fechar</span>
          </div>
        </div>
      )}

      {/* Menu Modal */}
      <GameMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        onResetGame={resetGame}
        onToggleScoreType={toggleScoreType}
        onUndoLastPoint={undoLastPoint}
        scoreType={gameConfig.scoreType}
        quadra={quadra}
        gameConfig={gameConfig}
        updateGameConfig={updateGameConfig}
        openScoreboard={openScoreboard}
        maxSets={maxSets}
        onChangeMaxSets={changeMaxSets}
      />

      {/* Third Set Choice Modal */}
      <ThirdSetModal isOpen={showThirdSetModal} onClose={handleThirdSetChoice} />
    </div>
  )
}
