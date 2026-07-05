"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Menu } from "lucide-react"
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

  // Número grande de cada card: pontos do game (0/15/30/40/AD), ou tiebreak,
  // ou o total de games no modo "games".
  const bigNumber = (side: Side): string => {
    if (isTiebreak) return gs[side].tiebreakPoints.toString()
    if (gameConfig.scoreType === "games") return gs[side].games.toString()
    return pointLabel(gs[side]) // "0" | "15" | "30" | "40" | "AD"
  }

  // Renderiza os blocos de sets (a partir de completedSets + set atual do motor)
  const renderSetBlocks = () => {
    return Array.from({ length: maxSets }).map((_, index) => {
      const setNum = index + 1
      const setData = gs.completedSets.find((s) => s.set === setNum)
      const isCompleted = setData !== undefined
      const blueWon = isCompleted && setData.A > setData.B
      const redWon = isCompleted && setData.B > setData.A

      const blueVal = isCompleted
        ? setData.A
        : setNum < gs.currentSet
          ? 0
          : setNum === gs.currentSet
            ? gs.A.games
            : "-"
      const redVal = isCompleted
        ? setData.B
        : setNum < gs.currentSet
          ? 0
          : setNum === gs.currentSet
            ? gs.B.games
            : "-"

      return (
        <div key={`set-${setNum}`} className="flex flex-col items-center">
          {/* Blue score */}
          <div
            className={`${maxSets === 3 ? "w-[80px]" : "w-[60px]"} h-12 flex items-center justify-center rounded-md set-block
            ${blueWon ? "bg-[#FEE100]" : "bg-[#696969] border border-[#929292]"}`}
          >
            <span className={`text-lg font-bold ${blueWon ? "text-[#383838]" : "text-[#FEE100]"}`}>{blueVal}</span>
          </div>

          {/* Red score */}
          <div
            className={`${maxSets === 3 ? "w-[80px]" : "w-[60px]"} h-12 flex items-center justify-center rounded-md set-block
            ${redWon ? "bg-[#FEE100]" : "bg-[#696969] border border-[#929292]"}`}
          >
            <span className={`text-lg font-bold ${redWon ? "text-[#383838]" : "text-[#FEE100]"}`}>{redVal}</span>
          </div>
        </div>
      )
    })
  }

  return (
    <div className="flex flex-col min-h-screen py-6 px-4 bg-[#383838]">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Quadra {gameConfig.quadra}</h1>
          {finished && (
            <p className="text-[#FEE100] font-bold">{blueWinner ? bluePlayerName : redPlayerName} venceu a partida!</p>
          )}
        </div>
        <Button variant="ghost" size="icon" className="text-[#FEE100]" onClick={() => setMenuOpen(true)}>
          <Menu className="h-8 w-8" />
        </Button>
      </div>

      <div className="flex-1 flex flex-col gap-6">
        {/* Blue Player Card */}
        <div
          className={`relative bg-[#696969] rounded-lg p-4 shadow-lg mx-auto w-full max-w-[280px] h-48
            ${blueCardBlinking ? "blink-animation" : ""}
            ${finished && blueWinner ? "bg-[#FEE100]" : ""}`}
        >
          <div className="absolute top-4 right-4 z-10" onClick={toggleServing}>
            <div
              className={`w-6 h-6 rounded-full ${blueServing ? "bg-[#FEE100]" : "bg-[#929292]"} serving-indicator cursor-pointer ${!initialServingSet ? "opacity-50" : ""}`}
              title={
                initialServingSet
                  ? "Clique para alterar o sacador"
                  : "O sacador não pode ser alterado após o início da partida"
              }
            ></div>
          </div>

          {editingBluePlayer ? (
            <div className="mb-4">
              <Input
                value={bluePlayerName}
                onChange={(e) => setBluePlayerName(e.target.value)}
                onBlur={() => {
                  setEditingBluePlayer(false)
                  updatePlayerName("blue", bluePlayerName)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setEditingBluePlayer(false)
                    updatePlayerName("blue", bluePlayerName)
                  }
                }}
                autoFocus
                className="text-2xl font-bold text-white bg-[#696969] border-[#FEE100] player-name"
              />
            </div>
          ) : (
            <h2
              className={`text-2xl font-bold mb-4 player-name cursor-pointer ${finished && blueWinner ? "text-[#383838]" : "text-white"}`}
              onClick={() => setEditingBluePlayer(true)}
            >
              {bluePlayerName}
            </h2>
          )}

          <div
            className={`text-center text-9xl score-number cursor-pointer
              ${animatingBlue ? "score-animation" : ""}
              ${finished && blueWinner ? "text-[#383838]" : "text-[#FEE100]"}`}
            onClick={() => handleScoreClick("blue")}
          >
            {bigNumber("A")}
          </div>

          {isTiebreak && (
            <div
              className={`absolute bottom-2 left-0 right-0 text-center font-bold text-sm ${finished && blueWinner ? "text-[#383838]" : "text-[#FEE100]"}`}
            >
              TIEBREAK
            </div>
          )}
        </div>

        {/* Set Blocks - Centered between player cards */}
        <div className="flex justify-center gap-[20px] my-4 w-full max-w-[280px] mx-auto">{renderSetBlocks()}</div>

        {/* Red Player Card */}
        <div
          className={`relative bg-[#696969] rounded-lg p-4 shadow-lg mx-auto w-full max-w-[280px] h-48
            ${redCardBlinking ? "blink-animation" : ""}
            ${finished && redWinner ? "bg-[#FEE100]" : ""}`}
        >
          <div className="absolute top-4 right-4 z-10" onClick={toggleServing}>
            <div
              className={`w-6 h-6 rounded-full ${!blueServing ? "bg-[#FEE100]" : "bg-[#929292]"} serving-indicator cursor-pointer ${!initialServingSet ? "opacity-50" : ""}`}
              title={
                initialServingSet
                  ? "Clique para alterar o sacador"
                  : "O sacador não pode ser alterado após o início da partida"
              }
            ></div>
          </div>

          {editingRedPlayer ? (
            <div className="mb-4">
              <Input
                value={redPlayerName}
                onChange={(e) => setRedPlayerName(e.target.value)}
                onBlur={() => {
                  setEditingRedPlayer(false)
                  updatePlayerName("red", redPlayerName)
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setEditingRedPlayer(false)
                    updatePlayerName("red", redPlayerName)
                  }
                }}
                autoFocus
                className="text-2xl font-bold text-white bg-[#696969] border-[#FEE100] player-name"
              />
            </div>
          ) : (
            <h2
              className={`text-2xl font-bold mb-4 player-name cursor-pointer ${finished && redWinner ? "text-[#383838]" : "text-white"}`}
              onClick={() => setEditingRedPlayer(true)}
            >
              {redPlayerName}
            </h2>
          )}

          <div
            className={`text-center text-9xl score-number cursor-pointer
              ${animatingRed ? "score-animation" : ""}
              ${finished && redWinner ? "text-[#383838]" : "text-[#FEE100]"}`}
            onClick={() => handleScoreClick("red")}
          >
            {bigNumber("B")}
          </div>

          {isTiebreak && (
            <div
              className={`absolute bottom-2 left-0 right-0 text-center font-bold text-sm ${finished && redWinner ? "text-[#383838]" : "text-[#FEE100]"}`}
            >
              TIEBREAK
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex justify-center">
        <div className="bg-[#696969] px-4 py-2 rounded-md digital-clock text-[#FEE100] text-3xl w-full max-w-[280px] text-center">
          {elapsedTime}
        </div>
      </div>

      {finished && (
        <div className="mt-4 flex justify-center">
          <Button className="bg-[#FEE100] text-[#383838] hover:bg-[#e6cb00]" onClick={() => setMenuOpen(true)}>
            Reiniciar Partida
          </Button>
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
