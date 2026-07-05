"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { X, Eye, RotateCcw, Undo2, BarChart2, Settings, LogOut } from "lucide-react"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Card, CardContent } from "@/components/ui/card"
import { AppSettings } from "@/components/app-settings"

interface GameMenuProps {
  isOpen: boolean
  onClose: () => void
  onResetGame: () => void
  onToggleScoreType: () => void
  onUndoLastPoint?: () => void
  scoreType: string
  quadra: string
  gameConfig: any
  updateGameConfig?: (config: any) => void
  isNewGame?: boolean
  openScoreboard?: () => void
  maxSets?: number
  onChangeMaxSets?: (maxSets: number) => void
}

export function GameMenu({
  isOpen,
  onClose,
  onResetGame,
  onToggleScoreType,
  onUndoLastPoint,
  scoreType,
  quadra,
  gameConfig,
  updateGameConfig,
  isNewGame = false,
  openScoreboard,
  maxSets = 3,
  onChangeMaxSets,
}: GameMenuProps) {
  const router = useRouter()
  const [showSettings, setShowSettings] = useState(false)

  const [localGameType, setLocalGameType] = useState(gameConfig?.gameType || "simples")
  const [localScoreType, setLocalScoreType] = useState(gameConfig?.scoreType || "pontos")
  const [localMaxSets, setLocalMaxSets] = useState(maxSets)
  const [players, setPlayers] = useState({
    blue1: gameConfig?.players?.blue1 || "Jogador 1",
    blue2: gameConfig?.players?.blue2 || "Jogador 2",
    red1: gameConfig?.players?.red1 || "Jogador 3",
    red2: gameConfig?.players?.red2 || "Jogador 4",
  })

  const handlePlayerChange = (player: string, value: string) => {
    setPlayers((prev) => ({
      ...prev,
      [player]: value,
    }))
  }

  const handleStartGame = () => {
    // Validate that at least the required players have names
    if (localGameType === "simples" && (!players.blue1 || !players.red1)) {
      alert("Por favor, insira os nomes dos jogadores")
      return
    }

    if (localGameType === "duplas" && (!players.blue1 || !players.blue2 || !players.red1 || !players.red2)) {
      alert("Por favor, insira os nomes de todos os jogadores")
      return
    }

    // Store game configuration in localStorage
    const newGameConfig = {
      quadra,
      gameType: localGameType,
      scoreType: localScoreType,
      players,
      startTime: new Date().toISOString(),
      maxSets: localMaxSets,
    }

    localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(newGameConfig))

    // Clear any existing score
    localStorage.removeItem(`tennis_score_${quadra}`)

    // Update parent component if callback provided
    if (updateGameConfig) {
      updateGameConfig(newGameConfig)
    }

    if (onChangeMaxSets) {
      onChangeMaxSets(localMaxSets)
    }

    onClose()

    // Redirecionar para a página do jogo
    router.push(`/jogo?quadra=${quadra}`)
  }

  if (!isOpen) return null

  // If it's a new game, show the configuration screen
  if (isNewGame) {
    return (
      <div className="fixed inset-0 bg-[#383838] z-50 flex flex-col items-center justify-center p-4 overflow-y-auto">
        <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-[#FEE100]" onClick={onClose}>
          <X className="h-8 w-8" />
        </Button>

        <div className="w-full max-w-md space-y-6 bg-[#696969] p-6 rounded-lg">
          <h1 className="text-2xl font-bold text-white text-center">Nova Partida - Quadra {quadra}</h1>

          <div className="space-y-2">
            <Label className="text-white">Tipo de Jogo</Label>
            <RadioGroup value={localGameType} onValueChange={setLocalGameType} className="flex flex-col space-y-1">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="simples" id="simples" className="border-[#FEE100] text-[#FEE100]" />
                <Label htmlFor="simples" className="text-white">
                  Simples (1 vs 1)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="duplas" id="duplas" className="border-[#FEE100] text-[#FEE100]" />
                <Label htmlFor="duplas" className="text-white">
                  Duplas (2 vs 2)
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-white">Contagem</Label>
            <RadioGroup value={localScoreType} onValueChange={setLocalScoreType} className="flex flex-col space-y-1">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pontos" id="pontos" className="border-[#FEE100] text-[#FEE100]" />
                <Label htmlFor="pontos" className="text-white">
                  Por Pontos (15, 30, 40, Vantagem)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="games" id="games" className="border-[#FEE100] text-[#FEE100]" />
                <Label htmlFor="games" className="text-white">
                  Por Games
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-white">Formato</Label>
            <RadioGroup
              value={localMaxSets.toString()}
              onValueChange={(v) => setLocalMaxSets(Number.parseInt(v))}
              className="flex flex-col space-y-1"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="3" id="sets3" className="border-[#FEE100] text-[#FEE100]" />
                <Label htmlFor="sets3" className="text-white">
                  Melhor de 3 Sets
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="5" id="sets5" className="border-[#FEE100] text-[#FEE100]" />
                <Label htmlFor="sets5" className="text-white">
                  Melhor de 5 Sets
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="blue1" className="text-white">
                Time Azul - Jogador 1
              </Label>
              <Input
                id="blue1"
                value={players.blue1}
                onChange={(e) => handlePlayerChange("blue1", e.target.value)}
                placeholder="Nome do jogador 1"
                className="bg-[#777777] text-white border-[#FEE100]"
              />
            </div>
            {localGameType === "duplas" && (
              <div className="space-y-2">
                <Label htmlFor="blue2" className="text-white">
                  Time Azul - Jogador 2
                </Label>
                <Input
                  id="blue2"
                  value={players.blue2}
                  onChange={(e) => handlePlayerChange("blue2", e.target.value)}
                  placeholder="Nome do jogador 2"
                  className="bg-[#777777] text-white border-[#FEE100]"
                />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="red1" className="text-white">
                Time Vermelho - Jogador 1
              </Label>
              <Input
                id="red1"
                value={players.red1}
                onChange={(e) => handlePlayerChange("red1", e.target.value)}
                placeholder="Nome do jogador 1"
                className="bg-[#777777] text-white border-[#FEE100]"
              />
            </div>
            {localGameType === "duplas" && (
              <div className="space-y-2">
                <Label htmlFor="red2" className="text-white">
                  Time Vermelho - Jogador 2
                </Label>
                <Input
                  id="red2"
                  value={players.red2}
                  onChange={(e) => handlePlayerChange("red2", e.target.value)}
                  placeholder="Nome do jogador 2"
                  className="bg-[#777777] text-white border-[#FEE100]"
                />
              </div>
            )}
          </div>

          <Button onClick={handleStartGame} className="w-full bg-[#FEE100] text-[#383838] hover:bg-[#e6cb00]">
            Iniciar Partida
          </Button>
        </div>
      </div>
    )
  }

  // Regular menu for ongoing game
  return (
    <div className="fixed inset-0 bg-[#383838] z-50 flex flex-col items-center justify-center">
      <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-[#FEE100]" onClick={onClose}>
        <X className="h-8 w-8" />
      </Button>

      <div className="grid grid-cols-2 gap-4 w-full max-w-md px-4">
        <Card className="bg-[#696969] border-[#FEE100] hover:bg-[#777777] transition-colors cursor-pointer">
          <CardContent
            className="p-4 flex flex-col items-center justify-center h-full"
            onClick={() => {
              if (openScoreboard) {
                openScoreboard()
              } else {
                window.open(`/placar?quadra=${quadra}`, "_blank")
              }
              onClose()
            }}
          >
            <Eye className="h-10 w-10 text-[#FEE100] mb-2" />
            <span className="text-white text-center">Ver Placar</span>
          </CardContent>
        </Card>

        <Card className="bg-[#696969] border-[#FEE100] hover:bg-[#777777] transition-colors cursor-pointer">
          <CardContent
            className="p-4 flex flex-col items-center justify-center h-full"
            onClick={() => {
              onToggleScoreType()
              onClose()
            }}
          >
            <BarChart2 className="h-10 w-10 text-[#FEE100] mb-2" />
            <span className="text-white text-center">Contagem por {scoreType === "pontos" ? "Games" : "Pontos"}</span>
          </CardContent>
        </Card>

        {onUndoLastPoint && (
          <Card className="bg-[#696969] border-[#FEE100] hover:bg-[#777777] transition-colors cursor-pointer">
            <CardContent
              className="p-4 flex flex-col items-center justify-center h-full"
              onClick={() => {
                onUndoLastPoint()
                onClose()
              }}
            >
              <Undo2 className="h-10 w-10 text-[#FEE100] mb-2" />
              <span className="text-white text-center">Retornar uma Jogada</span>
            </CardContent>
          </Card>
        )}

        <Card className="bg-[#696969] border-[#FEE100] hover:bg-[#777777] transition-colors cursor-pointer">
          <CardContent
            className="p-4 flex flex-col items-center justify-center h-full"
            onClick={() => {
              onResetGame()
              onClose()
            }}
          >
            <RotateCcw className="h-10 w-10 text-[#FEE100] mb-2" />
            <span className="text-white text-center">Reiniciar</span>
          </CardContent>
        </Card>

        <Card className="bg-[#696969] border-[#FEE100] hover:bg-[#777777] transition-colors cursor-pointer">
          <CardContent
            className="p-4 flex flex-col items-center justify-center h-full"
            onClick={() => {
              setShowSettings(true)
            }}
          >
            <Settings className="h-10 w-10 text-[#FEE100] mb-2" />
            <span className="text-white text-center">Configurações</span>
          </CardContent>
        </Card>

        <Card className="bg-[#FEE100] hover:bg-[#e6cb00] transition-colors cursor-pointer">
          <CardContent
            className="p-4 flex flex-col items-center justify-center h-full"
            onClick={() => {
              if (confirm("Tem certeza que deseja encerrar o jogo? Você será redirecionado para a tela inicial.")) {
                localStorage.removeItem(`tennis_match_${quadra}`)
                localStorage.removeItem(`tennis_score_${quadra}`)
                router.push("/")
                onClose()
              }
            }}
          >
            <LogOut className="h-10 w-10 text-[#383838] mb-2" />
            <span className="text-[#383838] text-center">Encerrar Partida</span>
          </CardContent>
        </Card>
      </div>

      <AppSettings isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}
