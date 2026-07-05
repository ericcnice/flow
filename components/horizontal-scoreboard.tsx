"use client"

import { useState, useEffect } from "react"

interface HorizontalScoreboardProps {
  gameConfig: any
  score: any
  elapsedTime: string
  maxSets: number
}

export function HorizontalScoreboard({ gameConfig, score, elapsedTime, maxSets = 3 }: HorizontalScoreboardProps) {
  const [bluePlayerName, setBluePlayerName] = useState("")
  const [redPlayerName, setRedPlayerName] = useState("")

  useEffect(() => {
    if (gameConfig) {
      setBluePlayerName(
        gameConfig.gameType === "simples"
          ? gameConfig.players.blue1
          : `${gameConfig.players.blue1}/${gameConfig.players.blue2}`,
      )
      setRedPlayerName(
        gameConfig.gameType === "simples"
          ? gameConfig.players.red1
          : `${gameConfig.players.red1}/${gameConfig.players.red2}`,
      )
    }
  }, [gameConfig])

  const getPointsDisplay = (points: number, hasAdvantage: boolean, tiebreakPoints: number, isTiebreak: boolean) => {
    if (!score || gameConfig?.scoreType === "games") {
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
      const setData = score.history.find((s: any) => s.set === index + 1)
      const isCompleted = setData !== undefined
      const blueWon = isCompleted && setData.blue > setData.red
      const redWon = isCompleted && setData.red > setData.blue

      return (
        <div key={`set-${index + 1}`} className="flex flex-col items-center mx-1">
          <div
            className={`${maxSets === 3 ? "w-12" : "w-10"} h-10 flex items-center justify-center rounded-md set-block
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
          <div
            className={`${maxSets === 3 ? "w-12" : "w-10"} h-10 flex items-center justify-center rounded-md set-block
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
    <div className="bg-[#383838] p-4 min-h-screen flex flex-col justify-center">
      <div className="bg-[#696969] rounded-lg shadow-lg overflow-hidden">
        <div className="bg-[#696969] p-2 border-b border-[#929292] flex justify-between items-center">
          <h1 className="text-xl font-bold text-white">Quadra {gameConfig.quadra}</h1>
          <div className="bg-[#696969] px-2 py-1 rounded-md digital-clock text-[#FEE100] text-xl">{elapsedTime}</div>
          {score?.gameFinished ? (
            <p className="text-[#FEE100] font-bold text-center">
              {score.winner === "blue" ? bluePlayerName : redPlayerName} venceu!
            </p>
          ) : (
            score?.isTiebreak && <p className="text-[#FEE100] font-bold text-center">TIEBREAK</p>
          )}
        </div>

        <div className="flex p-4">
          {/* Player Names */}
          <div className="w-1/4 flex flex-col justify-center">
            <div
              className={`flex items-center mb-4 ${score?.gameFinished && score?.winner === "blue" ? "text-[#FEE100] font-bold" : ""}`}
            >
              <div
                className={`w-4 h-4 rounded-full ${score?.blueServing ? "bg-[#FEE100]" : "bg-[#929292]"} mr-2`}
              ></div>
              <h2 className="text-lg font-bold text-white player-name">{bluePlayerName}</h2>
            </div>
            <div
              className={`flex items-center ${score?.gameFinished && score?.winner === "red" ? "text-[#FEE100] font-bold" : ""}`}
            >
              <div
                className={`w-4 h-4 rounded-full ${!score?.blueServing ? "bg-[#FEE100]" : "bg-[#929292]"} mr-2`}
              ></div>
              <h2 className="text-lg font-bold text-white player-name">{redPlayerName}</h2>
            </div>
          </div>

          {/* Current Points */}
          <div className="w-1/6 flex flex-col justify-center items-center">
            <div
              className={`text-5xl text-[#FEE100] score-number mb-2 ${score?.gameFinished && score?.winner === "blue" ? "text-[#FEE100] font-bold" : ""}`}
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
            <div
              className={`text-5xl text-[#FEE100] score-number ${score?.gameFinished && score?.winner === "red" ? "text-[#FEE100] font-bold" : ""}`}
            >
              {score?.isTiebreak
                ? score?.red.tiebreakPoints.toString()
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

          {/* Set Scores */}
          <div className="w-7/12 flex justify-center items-center">
            <div className="flex">{renderSetBlocks()}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
