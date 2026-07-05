"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Menu } from "lucide-react"
import { GameMenu } from "@/components/game-menu"
import { ThirdSetModal } from "@/components/third-set-modal"

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
  lastAction?: {
    type: string
    team?: "blue" | "red"
    data?: any
  }
  gameFinished?: boolean
  winner?: "blue" | "red"
}

export default function JogoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const quadra = searchParams.get("quadra") || "1"

  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null)
  const [score, setScore] = useState<Score>({
    blue: { points: 0, games: 0, sets: 0, advantage: false, tiebreakPoints: 0 },
    red: { points: 0, games: 0, sets: 0, advantage: false, tiebreakPoints: 0 },
    currentSet: 1,
    isTiebreak: false,
    finalSetTiebreak: false,
    blueServing: true,
    history: [],
    initialServingSet: true,
  })
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

      // Load score if exists
      const storedScore = localStorage.getItem(`tennis_score_${quadra}`)
      if (storedScore) {
        const parsedScore = JSON.parse(storedScore)
        // Add properties if they don't exist
        if (parsedScore.blueServing === undefined) {
          parsedScore.blueServing = true
        }
        if (parsedScore.finalSetTiebreak === undefined) {
          parsedScore.finalSetTiebreak = false
        }
        if (parsedScore.initialServingSet === undefined) {
          parsedScore.initialServingSet = true
        }
        setScore(parsedScore)
      }
    } else {
      // Redirect to configuration if no game is set up
      router.push(`/`)
    }
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

  useEffect(() => {
    // Save score to localStorage whenever it changes
    if (gameConfig) {
      localStorage.setItem(`tennis_score_${quadra}`, JSON.stringify(score))
    }
  }, [score, quadra, gameConfig])

  const getPointsDisplay = (points: number, hasAdvantage: boolean, tiebreakPoints: number, isTiebreak: boolean) => {
    if (gameConfig?.scoreType === "games") {
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

  const handleScoreClick = (team: "blue" | "red") => {
    // Se o jogo já terminou, não faz nada
    if (score.gameFinished) {
      return
    }

    // Adicionar ponto
    addPoint(team)

    // Animate the score
    if (team === "blue") {
      setAnimatingBlue(true)
      setTimeout(() => setAnimatingBlue(false), 300)
    } else {
      setAnimatingRed(true)
      setTimeout(() => setAnimatingRed(false), 300)
    }
  }

  const toggleServing = () => {
    // Só permite alteração do saque no início da partida
    if (score.initialServingSet) {
      setScore((prev) => ({
        ...prev,
        blueServing: !prev.blueServing,
      }))
    }
  }

  const toggleScoreType = () => {
    if (!gameConfig) return

    const newConfig = { ...gameConfig }
    newConfig.scoreType = newConfig.scoreType === "pontos" ? "games" : "pontos"

    setGameConfig(newConfig)
    localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(newConfig))
  }

  const handleThirdSetChoice = (playTiebreak: boolean) => {
    setScore((prev) => ({
      ...prev,
      finalSetTiebreak: playTiebreak,
      isTiebreak: playTiebreak, // Se escolher tiebreak, já inicia o tiebreak imediatamente
    }))
    setShowThirdSetModal(false)
  }

  const undoLastPoint = () => {
    setScore((prevScore) => {
      // Se não houver ação anterior, não faz nada
      if (!prevScore.lastAction) return prevScore

      const newScore = { ...prevScore }

      // Se o jogo estava finalizado, remove o status de finalizado
      if (newScore.gameFinished) {
        newScore.gameFinished = false
        newScore.winner = undefined
      }

      // Dependendo do tipo de ação, desfaz a ação
      if (newScore.lastAction.type === "point" && newScore.lastAction.team) {
        const team = newScore.lastAction.team
        const oppositeTeam = team === "blue" ? "red" : "blue"

        // Se estiver em tiebreak
        if (newScore.isTiebreak) {
          if (newScore[team].tiebreakPoints > 0) {
            newScore[team].tiebreakPoints -= 1
          }
        }
        // Se estiver em modo de pontos
        else if (gameConfig?.scoreType === "pontos") {
          // Se tiver vantagem, remove a vantagem
          if (newScore[team].advantage) {
            newScore[team].advantage = false
          }
          // Se o oponente tiver vantagem e o ponto foi para o time atual, restaura a vantagem do oponente
          else if (newScore.lastAction.data?.oppositeAdvantage) {
            newScore[oppositeTeam].advantage = true
          }
          // Caso contrário, reduz os pontos
          else if (newScore[team].points > 0) {
            newScore[team].points -= 1
          }
        }
        // Se estiver em modo de games
        else {
          // Se foi um game completo, reduz o game
          if (newScore.lastAction.data?.completedGame) {
            newScore[team].games -= 1

            // Se foi um set completo, reduz o set e restaura os games
            if (newScore.lastAction.data?.completedSet) {
              newScore[team].sets -= 1
              newScore.currentSet -= 1

              // Restaurar os games do set anterior
              const lastSetHistory = newScore.history.pop()
              if (lastSetHistory) {
                newScore.blue.games = lastSetHistory.blue
                newScore.red.games = lastSetHistory.red

                // Se o set anterior era tiebreak, restaurar o modo tiebreak
                if (lastSetHistory.tiebreak) {
                  newScore.isTiebreak = true
                }
              }
            }

            // Restaurar os pontos se necessário
            if (newScore.lastAction.data?.bluePoints !== undefined) {
              newScore.blue.points = newScore.lastAction.data.bluePoints
              newScore.blue.advantage = newScore.lastAction.data.blueAdvantage || false
            }

            if (newScore.lastAction.data?.redPoints !== undefined) {
              newScore.red.points = newScore.lastAction.data.redPoints
              newScore.red.advantage = newScore.lastAction.data.redAdvantage || false
            }

            // Restaurar o sacador
            if (newScore.lastAction.data?.blueServing !== undefined) {
              newScore.blueServing = newScore.lastAction.data.blueServing
            }
          }
        }
      }

      // Limpar a última ação
      newScore.lastAction = undefined

      return newScore
    })
  }

  const addPoint = (team: "blue" | "red") => {
    setScore((prevScore) => {
      const newScore = { ...prevScore }
      const oppositeTeam = team === "blue" ? "red" : "blue"

      // Salvar o estado atual para possível desfazer
      const lastAction = {
        type: "point",
        team,
        data: {
          bluePoints: newScore.blue.points,
          redPoints: newScore.red.points,
          blueAdvantage: newScore.blue.advantage,
          redAdvantage: newScore.red.advantage,
          blueServing: newScore.blueServing,
          oppositeAdvantage: newScore[oppositeTeam].advantage,
        },
      }

      // Marcar que o jogo já começou (não pode mais mudar o saque inicial)
      if (newScore.initialServingSet) {
        newScore.initialServingSet = false
      }

      // Caso esteja em tiebreak
      if (newScore.isTiebreak) {
        // Incrementa os pontos de tiebreak
        newScore[team].tiebreakPoints += 1

        // Verifica se o tiebreak foi ganho (primeiro a chegar a 7 com diferença de 2)
        if (
          newScore[team].tiebreakPoints >= 7 &&
          newScore[team].tiebreakPoints - newScore[oppositeTeam].tiebreakPoints >= 2
        ) {
          // Tiebreak ganho, incrementa o game
          newScore[team].games += 1

          // Registra o histórico do set
          newScore.history.push({
            set: newScore.currentSet,
            blue: newScore.blue.games,
            red: newScore.red.games,
            tiebreak: true,
          })

          // Atualizar lastAction com informações adicionais
          lastAction.data.completedGame = true
          lastAction.data.completedSet = true

          // Incrementa o set e reseta para o próximo set
          newScore[team].sets += 1
          newScore.blue.games = 0
          newScore.red.games = 0
          newScore.blue.tiebreakPoints = 0
          newScore.red.tiebreakPoints = 0
          newScore.currentSet += 1
          newScore.isTiebreak = false

          // Alterna o sacador
          newScore.blueServing = !newScore.blueServing

          // Ativar animação de piscar para o time vencedor
          if (team === "blue") {
            setBlueCardBlinking(true)
            setTimeout(() => setBlueCardBlinking(false), 1500) // 3 piscadas de 0.5s = 1.5s
          } else {
            setRedCardBlinking(true)
            setTimeout(() => setRedCardBlinking(false), 1500)
          }

          // Verificar se o jogo terminou
          checkGameFinished(newScore, team)
        }

        newScore.lastAction = lastAction
        return newScore
      }

      // Lógica normal de pontuação
      if (gameConfig?.scoreType === "pontos") {
        // Caso de vantagem
        if (newScore[team].advantage) {
          // Ganhou o game após ter vantagem
          lastAction.data.completedGame = true

          newScore[team].points = 0
          newScore[oppositeTeam].points = 0
          newScore[team].advantage = false
          newScore[oppositeTeam].advantage = false
          newScore[team].games += 1

          // Alterna o sacador
          lastAction.data.blueServing = newScore.blueServing
          newScore.blueServing = !newScore.blueServing

          // Verifica se precisa iniciar tiebreak ou se ganhou o set
          checkSetStatus(newScore, team, oppositeTeam, lastAction)

          newScore.lastAction = lastAction
          return newScore
        }

        // Caso o oponente tenha vantagem
        if (newScore[oppositeTeam].advantage) {
          // Volta para deuce
          lastAction.data.oppositeAdvantage = true
          newScore[oppositeTeam].advantage = false

          newScore.lastAction = lastAction
          return newScore
        }

        // Caso de deuce (40-40)
        if (newScore[team].points === 3 && newScore[oppositeTeam].points === 3) {
          // Ganha vantagem
          newScore[team].advantage = true

          newScore.lastAction = lastAction
          return newScore
        }

        // Caso normal de pontuação
        if (newScore[team].points < 3) {
          // Incrementa pontos normalmente (0->15->30->40)
          newScore[team].points += 1

          newScore.lastAction = lastAction
          return newScore
        }

        // Caso tenha 40 (3 pontos) e o oponente tenha menos que 40
        if (newScore[team].points === 3 && newScore[oppositeTeam].points < 3) {
          // Ganha o game diretamente
          lastAction.data.completedGame = true

          newScore[team].points = 0
          newScore[oppositeTeam].points = 0
          newScore[team].games += 1

          // Alterna o sacador
          lastAction.data.blueServing = newScore.blueServing
          newScore.blueServing = !newScore.blueServing

          // Verifica se precisa iniciar tiebreak ou se ganhou o set
          checkSetStatus(newScore, team, oppositeTeam, lastAction)

          newScore.lastAction = lastAction
          return newScore
        }
      } else {
        // Modo de contagem por games
        lastAction.data.completedGame = true
        newScore[team].games += 1

        // Alterna o sacador
        lastAction.data.blueServing = newScore.blueServing
        newScore.blueServing = !newScore.blueServing

        // Verifica se precisa iniciar tiebreak ou se ganhou o set
        checkSetStatus(newScore, team, oppositeTeam, lastAction)
      }

      newScore.lastAction = lastAction
      return newScore
    })
  }

  // Função para verificar se o jogo terminou
  const checkGameFinished = (newScore: Score, winner: "blue" | "red") => {
    const setsToWin = Math.ceil(maxSets / 2)

    if (newScore[winner].sets >= setsToWin) {
      newScore.gameFinished = true
      newScore.winner = winner
    }
  }

  // Função auxiliar para verificar o status do set após um game
  const checkSetStatus = (newScore: Score, team: "blue" | "red", oppositeTeam: "blue" | "red", lastAction: any) => {
    // Verifica se chegou a 6-6 (tiebreak)
    if (newScore[team].games === 6 && newScore[oppositeTeam].games === 6) {
      // Se for o último set e finalSetTiebreak for false, não inicia tiebreak
      if (newScore.currentSet === maxSets && !newScore.finalSetTiebreak) {
        return
      }

      console.log("Iniciando tiebreak!")
      newScore.isTiebreak = true
      return
    }

    // Verifica se ganhou o set (6 games com 2 de diferença ou 7-5)
    if (
      (newScore[team].games >= 6 && newScore[team].games - newScore[oppositeTeam].games >= 2) ||
      (newScore[team].games === 7 && newScore[oppositeTeam].games === 5)
    ) {
      // Registra o histórico do set
      newScore.history.push({
        set: newScore.currentSet,
        blue: newScore.blue.games,
        red: newScore.red.games,
      })

      // Atualizar lastAction com informações adicionais
      lastAction.completedSet = true

      // Incrementa o set e reseta para o próximo set
      newScore[team].sets += 1
      newScore.blue.games = 0
      newScore.red.games = 0
      newScore.currentSet += 1
      newScore.isTiebreak = false

      // Ativar animação de piscar para o time vencedor
      if (team === "blue") {
        setBlueCardBlinking(true)
        setTimeout(() => setBlueCardBlinking(false), 1500) // 3 piscadas de 0.5s = 1.5s
      } else {
        setRedCardBlinking(true)
        setTimeout(() => setRedCardBlinking(false), 1500)
      }

      // Verificar se o jogo terminou
      checkGameFinished(newScore, team)

      // Verifica se precisa mostrar o modal de escolha do terceiro set
      if (newScore.currentSet === 3 && newScore.blue.sets === 1 && newScore.red.sets === 1) {
        setTimeout(() => {
          setShowThirdSetModal(true)
        }, 500)
      }
    }
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
      localStorage.removeItem(`tennis_score_${quadra}`)
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
  }

  if (!gameConfig) {
    return <div className="flex items-center justify-center min-h-screen">Carregando...</div>
  }

  // Renderiza os blocos de sets
  const renderSetBlocks = () => {
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

  return (
    <div className="flex flex-col min-h-screen py-6 px-4 bg-[#383838]">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Quadra {gameConfig.quadra}</h1>
          {score.gameFinished && (
            <p className="text-[#FEE100] font-bold">
              {score.winner === "blue" ? bluePlayerName : redPlayerName} venceu a partida!
            </p>
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
            ${score.gameFinished && score.winner === "blue" ? "bg-[#FEE100]" : ""}`}
        >
          <div className="absolute top-4 right-4 z-10" onClick={toggleServing}>
            <div
              className={`w-6 h-6 rounded-full ${score.blueServing ? "bg-[#FEE100]" : "bg-[#929292]"} serving-indicator cursor-pointer ${!score.initialServingSet ? "opacity-50" : ""}`}
              title={
                score.initialServingSet
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
              className={`text-2xl font-bold mb-4 player-name cursor-pointer ${score.gameFinished && score.winner === "blue" ? "text-[#383838]" : "text-white"}`}
              onClick={() => setEditingBluePlayer(true)}
            >
              {bluePlayerName}
            </h2>
          )}

          <div
            className={`text-center text-9xl score-number cursor-pointer 
              ${animatingBlue ? "score-animation" : ""} 
              ${score.gameFinished && score.winner === "blue" ? "text-[#383838]" : "text-[#FEE100]"}`}
            onClick={() => handleScoreClick("blue")}
          >
            {score.isTiebreak
              ? score.blue.tiebreakPoints.toString()
              : gameConfig.scoreType === "games"
                ? score.blue.games.toString()
                : getPointsDisplay(
                    score.blue.points,
                    score.blue.advantage,
                    score.blue.tiebreakPoints,
                    score.isTiebreak,
                  )}
          </div>

          {score.isTiebreak && (
            <div
              className={`absolute bottom-2 left-0 right-0 text-center font-bold text-sm ${score.gameFinished && score.winner === "blue" ? "text-[#383838]" : "text-[#FEE100]"}`}
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
            ${score.gameFinished && score.winner === "red" ? "bg-[#FEE100]" : ""}`}
        >
          <div className="absolute top-4 right-4 z-10" onClick={toggleServing}>
            <div
              className={`w-6 h-6 rounded-full ${!score.blueServing ? "bg-[#FEE100]" : "bg-[#929292]"} serving-indicator cursor-pointer ${!score.initialServingSet ? "opacity-50" : ""}`}
              title={
                score.initialServingSet
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
              className={`text-2xl font-bold mb-4 player-name cursor-pointer ${score.gameFinished && score.winner === "red" ? "text-[#383838]" : "text-white"}`}
              onClick={() => setEditingRedPlayer(true)}
            >
              {redPlayerName}
            </h2>
          )}

          <div
            className={`text-center text-9xl score-number cursor-pointer 
              ${animatingRed ? "score-animation" : ""} 
              ${score.gameFinished && score.winner === "red" ? "text-[#383838]" : "text-[#FEE100]"}`}
            onClick={() => handleScoreClick("red")}
          >
            {score.isTiebreak
              ? score.red.tiebreakPoints.toString()
              : gameConfig.scoreType === "games"
                ? score.red.games.toString()
                : getPointsDisplay(score.red.points, score.red.advantage, score.red.tiebreakPoints, score.isTiebreak)}
          </div>

          {score.isTiebreak && (
            <div
              className={`absolute bottom-2 left-0 right-0 text-center font-bold text-sm ${score.gameFinished && score.winner === "red" ? "text-[#383838]" : "text-[#FEE100]"}`}
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

      {score.gameFinished && (
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
