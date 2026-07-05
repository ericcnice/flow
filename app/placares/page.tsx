"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"

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
}

type CourtData = {
  quadra: string
  gameConfig: GameConfig | null
  score: Score | null
  elapsedTime: string
}

export default function PlacaresPage() {
  const router = useRouter()
  const [courts, setCourts] = useState<CourtData[]>([])
  const [courtCount, setCourtCount] = useState(6)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)

    // Carregar configurações do localStorage
    const storedSettings = localStorage.getItem("tennis_app_settings")
    if (storedSettings) {
      const settings = JSON.parse(storedSettings)
      setCourtCount(settings.courtCount || 6)
    }

    // Função para carregar dados de todas as quadras
    const loadCourtsData = () => {
      const courtsData: CourtData[] = []

      for (let i = 1; i <= courtCount; i++) {
        const quadra = i.toString()
        const gameConfigStr = localStorage.getItem(`tennis_match_${quadra}`)
        const scoreStr = localStorage.getItem(`tennis_score_${quadra}`)

        let gameConfig = null
        let score = null
        let elapsedTime = "--:--:--"

        if (gameConfigStr) {
          gameConfig = JSON.parse(gameConfigStr)

          // Calcular tempo decorrido
          const startTime = new Date(gameConfig.startTime)
          const now = new Date()
          const diff = now.getTime() - startTime.getTime()

          const hours = Math.floor(diff / (1000 * 60 * 60))
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
          const seconds = Math.floor((diff % (1000 * 60)) / 1000)

          elapsedTime = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
        }

        if (scoreStr) {
          score = JSON.parse(scoreStr)
        }

        courtsData.push({
          quadra,
          gameConfig,
          score,
          elapsedTime,
        })
      }

      setCourts(courtsData)
    }

    // Carregar dados iniciais
    loadCourtsData()

    // Configurar polling para atualizar os dados
    const interval = setInterval(loadCourtsData, 1000)

    return () => clearInterval(interval)
  }, [courtCount])

  const getPointsDisplay = (gameConfig: GameConfig | null, score: Score | null) => {
    if (!gameConfig || !score) return { blue: "-", red: "-" }

    if (score.isTiebreak) {
      return {
        blue: score.blue.tiebreakPoints.toString(),
        red: score.red.tiebreakPoints.toString(),
      }
    }

    if (gameConfig.scoreType === "games") {
      return {
        blue: score.blue.games.toString(),
        red: score.red.games.toString(),
      }
    }

    // Pontuação normal de tênis
    const bluePoints = (() => {
      switch (score.blue.points) {
        case 0:
          return "0"
        case 1:
          return "15"
        case 2:
          return "30"
        case 3:
          return score.blue.advantage ? "AD" : "40"
        default:
          return score.blue.advantage ? "AD" : "40"
      }
    })()

    const redPoints = (() => {
      switch (score.red.points) {
        case 0:
          return "0"
        case 1:
          return "15"
        case 2:
          return "30"
        case 3:
          return score.red.advantage ? "AD" : "40"
        default:
          return score.red.advantage ? "AD" : "40"
      }
    })()

    return { blue: bluePoints, red: redPoints }
  }

  // Dentro da função renderSets, vamos corrigir a largura dos cards
  const renderSets = (score: Score | null, maxSets = 3) => {
    if (!score) return null

    return Array.from({ length: maxSets }).map((_, index) => {
      const setData = score.history.find((s) => s.set === index + 1)
      const isCompleted = setData !== undefined
      const blueWon = isCompleted && setData.blue > setData.red
      const redWon = isCompleted && setData.red > setData.blue

      return (
        <div key={`set-${index + 1}`} className="flex flex-col items-center mx-1">
          <div
            className={`${maxSets === 3 ? "w-8" : "w-7"} h-8 flex items-center justify-center rounded-md set-block
            ${blueWon ? "bg-[#FEE100]" : "bg-[#696969] border border-[#929292]"}`}
          >
            <span className={`text-sm font-bold ${blueWon ? "text-[#383838]" : "text-[#FEE100]"}`}>
              {isCompleted
                ? setData.blue
                : index < score.currentSet - 1
                  ? "0"
                  : index + 1 === score.currentSet
                    ? score.blue.games
                    : "-"}
            </span>
          </div>
          <div
            className={`${maxSets === 3 ? "w-8" : "w-7"} h-8 flex items-center justify-center rounded-md set-block
            ${redWon ? "bg-[#FEE100]" : "bg-[#696969] border border-[#929292]"}`}
          >
            <span className={`text-sm font-bold ${redWon ? "text-[#383838]" : "text-[#FEE100]"}`}>
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

  // If we're not on the client yet, show a loading state
  if (!isClient) {
    return (
      <div className="min-h-screen bg-[#383838] flex items-center justify-center">
        <h1 className="text-2xl font-bold text-white">Carregando placares...</h1>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#383838] p-4">
      <div className="flex justify-between items-center mb-6">
        <Button variant="ghost" onClick={() => router.push("/")} className="text-[#FEE100]">
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <h1 className="text-2xl font-bold text-white">Placares de Todas as Quadras</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {courts.map((court) => {
          if (!court.gameConfig || !court.score) {
            return (
              <div key={court.quadra} className="bg-[#696969] rounded-lg p-4 opacity-50">
                <h2 className="text-xl font-bold text-white mb-2">Quadra {court.quadra}</h2>
                <p className="text-white">Sem partida em andamento</p>
              </div>
            )
          }

          const points = getPointsDisplay(court.gameConfig, court.score)
          const bluePlayerName =
            court.gameConfig.gameType === "simples"
              ? court.gameConfig.players.blue1
              : `${court.gameConfig.players.blue1}/${court.gameConfig.players.blue2}`
          const redPlayerName =
            court.gameConfig.gameType === "simples"
              ? court.gameConfig.players.red1
              : `${court.gameConfig.players.red1}/${court.gameConfig.players.red2}`
          const maxSets = court.gameConfig.maxSets || 3

          return (
            <div key={court.quadra} className="bg-[#696969] rounded-lg overflow-hidden">
              <div className="bg-[#696969] p-2 border-b border-[#929292] flex justify-between items-center">
                <h2 className="text-lg font-bold text-white">Quadra {court.quadra}</h2>
                <div className="text-sm text-[#FEE100]">{court.elapsedTime}</div>
              </div>

              <div className="p-3">
                <div className="flex mb-2">
                  <div className="w-1/3">
                    <div className="flex items-center">
                      <div
                        className={`w-3 h-3 rounded-full ${court.score.blueServing ? "bg-[#FEE100]" : "bg-[#929292]"} mr-2`}
                      ></div>
                      <span className="text-white text-sm truncate">{bluePlayerName}</span>
                    </div>
                  </div>

                  <div className="w-1/6 flex justify-center">
                    <span className="text-[#FEE100] text-xl">{points.blue}</span>
                  </div>

                  <div className="w-1/2 flex justify-center">
                    <div className="flex">{renderSets(court.score, maxSets)}</div>
                  </div>
                </div>

                <div className="flex">
                  <div className="w-1/3">
                    <div className="flex items-center">
                      <div
                        className={`w-3 h-3 rounded-full ${!court.score.blueServing ? "bg-[#FEE100]" : "bg-[#929292]"} mr-2`}
                      ></div>
                      <span className="text-white text-sm truncate">{redPlayerName}</span>
                    </div>
                  </div>

                  <div className="w-1/6 flex justify-center">
                    <span className="text-[#FEE100] text-xl">{points.red}</span>
                  </div>

                  <div className="w-1/2 flex justify-center">
                    {court.score.isTiebreak && <span className="text-[#FEE100] text-xs font-bold">TIEBREAK</span>}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
