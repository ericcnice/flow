"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { GameMenu } from "@/components/game-menu"
import { Settings } from "lucide-react"
import { AppSettings } from "@/components/app-settings"
import { DynamicQRCode } from "@/components/dynamic-qr-code"

export default function Home() {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [selectedCourt, setSelectedCourt] = useState("1")
  const [courtCount, setCourtCount] = useState(6)
  const [maxSets, setMaxSets] = useState(3)
  const [showSettings, setShowSettings] = useState(false)
  const [existingMatches, setExistingMatches] = useState<Record<string, boolean>>({})

  useEffect(() => {
    // Carregar configurações do localStorage
    const storedSettings = localStorage.getItem("tennis_app_settings")
    if (storedSettings) {
      const settings = JSON.parse(storedSettings)
      setCourtCount(settings.courtCount || 6)
      setMaxSets(settings.maxSets || 3)
    }

    // Verificar partidas existentes
    const matches: Record<string, boolean> = {}
    for (let i = 1; i <= courtCount; i++) {
      const court = i.toString()
      matches[court] = localStorage.getItem(`tennis_match_${court}`) !== null
    }
    setExistingMatches(matches)
  }, [courtCount])

  const handleCourtSelect = (court: string) => {
    setSelectedCourt(court)

    // Verificar se já existe uma partida para esta quadra
    const existingMatch = localStorage.getItem(`tennis_match_${court}`)

    if (existingMatch) {
      // Se já existe uma partida, redirecionar diretamente para a página do jogo
      router.push(`/jogo?quadra=${court}`)
    } else {
      // Se não existe, criar uma nova partida com configurações padrão
      const newGameConfig = {
        quadra: court,
        gameType: "simples",
        scoreType: "pontos",
        players: {
          blue1: "Jogador 1",
          blue2: "Jogador 2",
          red1: "Jogador 3",
          red2: "Jogador 4",
        },
        startTime: new Date().toISOString(),
        maxSets: maxSets,
      }

      // Salvar a configuração no localStorage
      localStorage.setItem(`tennis_match_${court}`, JSON.stringify(newGameConfig))

      // Limpar qualquer pontuação existente
      localStorage.removeItem(`tennis_score_${court}`)

      // Redirecionar para a página do jogo
      router.push(`/jogo?quadra=${court}`)
    }
  }

  return (
    <div className="container flex flex-col items-center min-h-screen py-12 px-4 bg-[#383838]">
      <div className="w-full max-w-md">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-white">Quadras de Tênis</h1>
          <Button variant="ghost" size="icon" className="text-[#FEE100]" onClick={() => setShowSettings(true)}>
            <Settings className="h-6 w-6" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: courtCount }).map((_, index) => {
            const court = (index + 1).toString()
            const hasExistingMatch = existingMatches[court]

            return (
              <Card key={court} className="bg-[#696969] border-none">
                <CardContent className="p-4 flex flex-col items-center">
                  <h2 className="text-xl font-bold text-white mb-2">Quadra {court}</h2>

                  <div className="mb-3">
                    <DynamicQRCode quadra={court} adminMode={true} />
                  </div>

                  <Button
                    className="w-full bg-[#FEE100] text-[#383838] hover:bg-[#e6cb00]"
                    onClick={() => handleCourtSelect(court)}
                  >
                    {hasExistingMatch ? "Continuar" : "Iniciar"}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      <Button className="mt-8 bg-[#696969] text-white hover:bg-[#777777]" onClick={() => router.push("/placares")}>
        Ver Todos os Placares
      </Button>

      <GameMenu
        isOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        onResetGame={() => {}}
        onToggleScoreType={() => {}}
        scoreType="pontos"
        quadra={selectedCourt}
        gameConfig={null}
        isNewGame={true}
        maxSets={maxSets}
      />

      <AppSettings isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  )
}
