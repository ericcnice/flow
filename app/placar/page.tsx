"use client"

import { useState, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { RotateCw } from "lucide-react"
import { HorizontalScoreboard } from "@/components/horizontal-scoreboard"

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

type Score = {
  blue: {
    points: number
    games: number
    sets: number
    advantage: boolean
    tiebreakPoints: number
  }
  red: {
    points: number
    games: number
    sets: number
    advantage: boolean
    tiebreakPoints: number
  }
  currentSet: number
  isTiebreak: boolean
  finalSetTiebreak: boolean
  blueServing: boolean
  history: Array<{
    set: number
    blue: number
    red: number
    tiebreak?: boolean
  }>
  initialServingSet: boolean
  gameFinished?: boolean
  winner?: "blue" | "red"
}

export default function PlacarPage() {
  const searchParams = useSearchParams()
  const quadra = searchParams.get("quadra") || "1"

  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null)
  const [score, setScore] = useState<Score | null>(null)
  const [elapsedTime, setElapsedTime] = useState("00:00:00")
  const [startTime, setStartTime] = useState<Date | null>(null)
  const [bluePlayerName, setBluePlayerName] = useState("")
  const [redPlayerName, setRedPlayerName] = useState("")
  const [isHorizontal, setIsHorizontal] = useState(false)
  const [maxSets, setMaxSets] = useState(3)

  useEffect(() => {
    // Load game configuration from localStorage
    const storedConfig = localStorage.getItem(`tennis_match_${quadra}`)
    console.log("Quadra:", quadra, "Config:", storedConfig)

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

      // Load score if exists
      const storedScore = localStorage.getItem(`tennis_score_${quadra}`)
      console.log("Quadra:", quadra, "Score:", storedScore)

      if (storedScore) {
        setScore(JSON.parse(storedScore))
      } else {
        // Se não houver pontuação, mas houver configuração, inicialize com pontuação zerada
        setScore({
          blue: { points: 0, games: 0, sets: 0, advantage: false, tiebreakPoints: 0 },
          red: { points: 0, games: 0, sets: 0, advantage: false, tiebreakPoints: 0 },
          currentSet: 1,
          isTiebreak: false,
          finalSetTiebreak: false,
          blueServing: true,
          history: [],
          initialServingSet: true,
        })
      }
    }

    // Set up polling to refresh score
    const interval = setInterval(() => {
      const refreshedScore = localStorage.getItem(`tennis_score_${quadra}`)
      if (refreshedScore) {
        setScore(JSON.parse(refreshedScore))
      }

      const refreshedConfig = localStorage.getItem(`tennis_match_${quadra}`)
      if (refreshedConfig) {
        const config = JSON.parse(refreshedConfig)
        setBluePlayerName(
          config.gameType === "simples" ? config.players.blue1 : `${config.players.blue1}/${config.players.blue2}`,
        )
        setRedPlayerName(
          config.gameType === "simples" ? config.players.red1 : `${config.players.red1}/${config.players.red2}`,
        )
        setMaxSets(config.maxSets || 3)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [quadra])

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

  // Atualize a função getPointsDisplay para mostrar os pontos de tiebreak quando necessário
  const getPointsDisplay = (points: number, hasAdvantage: boolean, tiebreakPoints: number, isTiebreak: boolean) => {
    if (!gameConfig || !score) return "-"

    if (gameConfig.scoreType === "games") {
      return "-"
    }

    if (isTiebreak) {
      return tiebreakPoints.toString()
    }

    switch (points) {
      case 0:
        return "0"
      case 1:
        return "15"
      case 2:
        return "30"
      case 3:
        return hasAdvantage ? "AD" : "40"
      default:
        return hasAdvantage ? "AD" : "40"
    }
  }

  // Renderiza os blocos de sets
  const renderSetBlocks = () => {
    if (!score) return null

    return Array.from({ length: maxSets }).map((_, index) => {
      const setData = score.history.find((s) => s.set === index + 1)
      const isCompleted = setData !== undefined
      const blueWon = isCompleted && setData.blue > setData.red
      const redWon = isCompleted && setData.red > setData.blue

      return (
        <div key={`set-${index + 1}`} className="flex flex-col items-center">
          {/* Blue score */}
          <div
            className={`${maxSets === 3 ? "w-[80px]" : "w-[60px]"} h-12 flex items-center justify-center rounded-md set-block
            ${blueWon ? "bg-[#FEE100]" : "bg-[#696969] border border-[#929292]"}`}
          >
            <span className={`text-lg font-bold ${blueWon ? "text-[#383838]" : "text-[#FEE100]"}`}>
              {isCompleted
                ? setData.blue
                : index < score.currentSet - 1
                  ? "0"
                  : index + 1 === score.currentSet
                    ? score.blue.games
                    : "-"}
            </span>
          </div>

          {/* Red score */}
          <div
            className={`${maxSets === 3 ? "w-[80px]" : "w-[60px]"} h-12 flex items-center justify-center rounded-md set-block
            ${redWon ? "bg-[#FEE100]" : "bg-[#696969] border border-[#929292]"}`}
          >
            <span className={`text-lg font-bold ${redWon ? "text-[#383838]" : "text-[#FEE100]"}`}>
              {isCompleted
                ? setData.red
                : index < score.currentSet - 1
                  ? "0"
                  : index + 1 === score.currentSet
                    ? score.red.games
                    : "-"}
            </span>
          </div>
        </div>
      )
    })
  }

  if (!gameConfig) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#383838]">
        <div className="w-full max-w-md bg-[#696969] rounded-lg p-4">
          <h1 className="text-center text-2xl font-bold text-white">Nenhuma partida em andamento na Quadra {quadra}</h1>
        </div>
      </div>
    )
  }

  // Se estiver no modo horizontal, renderize o componente horizontal
  if (isHorizontal) {
    return (
      <div className="relative">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 z-10 text-[#FEE100]"
          onClick={() => setIsHorizontal(false)}
        >
          <RotateCw className="h-6 w-6" />
        </Button>
        <HorizontalScoreboard gameConfig={gameConfig} score={score} elapsedTime={elapsedTime} maxSets={maxSets} />
      </div>
    )
  }

  // Renderização vertical padrão
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#383838] p-4">
      <div className="w-full max-w-[280px]">
        <div className="bg-[#696969] rounded-lg shadow-lg overflow-hidden mb-6">
          <div className="bg-[#696969] p-4 border-b border-[#929292]">
            <h1 className="text-2xl font-bold text-white text-center">Quadra {gameConfig.quadra}</h1>
            {score?.isTiebreak && !score?.gameFinished && (
              <p className="text-[#FEE100] font-bold mt-1 text-center">TIEBREAK EM ANDAMENTO</p>
            )}
            {score?.gameFinished && (
              <p className="text-[#FEE100] font-bold mt-1 text-center">
                {score.winner === "blue" ? bluePlayerName : redPlayerName} venceu a partida!
              </p>
            )}
          </div>

          {/* Blue player */}
          <div className={`p-4 ${score?.gameFinished && score?.winner === "blue" ? "bg-[#FEE100]" : "bg-[#696969]"}`}>
            <div className="flex items-center justify-between mb-4">
              <h2
                className={`text-2xl font-bold player-name ${score?.gameFinished && score?.winner === "blue" ? "text-[#383838]" : "text-white"}`}
              >
                {bluePlayerName}
              </h2>
              <div
                className={`w-6 h-6 rounded-full ${score?.blueServing ? "bg-[#FEE100]" : "bg-[#929292]"} serving-indicator`}
              ></div>
            </div>
            <div className="flex justify-center">
              <div className="text-center">
                <div
                  className={`text-9xl score-number ${score?.gameFinished && score?.winner === "blue" ? "text-[#383838]" : "text-[#FEE100]"}`}
                >
                  {score?.isTiebreak
                    ? score.blue.tiebreakPoints.toString()
                    : gameConfig.scoreType === "games"
                      ? score?.blue.games.toString()
                      : getPointsDisplay(
                          score?.blue.points || 0,
                          score?.blue.advantage || false,
                          score?.blue.tiebreakPoints || 0,
                          score?.isTiebreak || false,
                        )}
                </div>
              </div>
            </div>

            {score?.isTiebreak && (
              <div
                className={`text-center font-bold text-sm mt-2 ${score?.gameFinished && score?.winner === "blue" ? "text-[#383838]" : "text-[#FEE100]"}`}
              >
                TIEBREAK
              </div>
            )}
          </div>

          {/* Set Blocks - Centered */}
          <div className="flex justify-center gap-[20px] py-3 bg-[#383838]">{renderSetBlocks()}</div>

          {/* Red player */}
          <div className={`p-4 ${score?.gameFinished && score?.winner === "red" ? "bg-[#FEE100]" : "bg-[#696969]"}`}>
            <div className="flex items-center justify-between mb-4">
              <h2
                className={`text-2xl font-bold player-name ${score?.gameFinished && score?.winner === "red" ? "text-[#383838]" : "text-white"}`}
              >
                {redPlayerName}
              </h2>
              <div
                className={`w-6 h-6 rounded-full ${!score?.blueServing ? "bg-[#FEE100]" : "bg-[#929292]"} serving-indicator`}
              ></div>
            </div>
            <div className="flex justify-center">
              <div className="text-center">
                <div
                  className={`text-9xl score-number ${score?.gameFinished && score?.winner === "red" ? "text-[#383838]" : "text-[#FEE100]"}`}
                >
                  {score?.isTiebreak
                    ? score.red.tiebreakPoints.toString()
                    : gameConfig.scoreType === "games"
                      ? score?.red.games.toString()
                      : getPointsDisplay(
                          score?.red.points || 0,
                          score?.red.advantage || false,
                          score?.red.tiebreakPoints || 0,
                          score?.isTiebreak || false,
                        )}
                </div>
              </div>
            </div>

            {score?.isTiebreak && (
              <div
                className={`text-center font-bold text-sm mt-2 ${score?.gameFinished && score?.winner === "red" ? "text-[#383838]" : "text-[#FEE100]"}`}
              >
                TIEBREAK
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-center">
          <div className="bg-[#696969] px-4 py-2 rounded-md digital-clock text-[#FEE100] text-3xl w-full text-center">
            {elapsedTime}
          </div>
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="absolute bottom-4 right-4 text-[#FEE100]"
        onClick={() => setIsHorizontal(true)}
      >
        <RotateCw className="h-6 w-6" />
      </Button>
    </div>
  )
}
