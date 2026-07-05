"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { X } from "lucide-react"

interface AppSettingsProps {
  isOpen: boolean
  onClose: () => void
}

export function AppSettings({ isOpen, onClose }: AppSettingsProps) {
  const [courtCount, setCourtCount] = useState(6)
  const [maxSets, setMaxSets] = useState(3)
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)

    // Carregar configurações do localStorage
    const storedSettings = localStorage.getItem("tennis_app_settings")
    if (storedSettings) {
      const settings = JSON.parse(storedSettings)
      setCourtCount(settings.courtCount || 6)
      setMaxSets(settings.maxSets || 3)
    }
  }, [])

  const saveSettings = () => {
    // Salvar configurações no localStorage
    const settings = {
      courtCount,
      maxSets,
    }
    localStorage.setItem("tennis_app_settings", JSON.stringify(settings))
    onClose()

    // Recarregar a página para aplicar as configurações
    window.location.reload()
  }

  if (!isOpen) return null

  // If we're not on the client yet, don't render the settings
  if (!isClient) return null

  return (
    <div className="fixed inset-0 bg-[#383838] z-50 flex flex-col items-center justify-center p-4 overflow-y-auto">
      <Button variant="ghost" size="icon" className="absolute top-4 right-4 text-[#FEE100]" onClick={onClose}>
        <X className="h-8 w-8" />
      </Button>

      <div className="w-full max-w-md space-y-6 bg-[#696969] p-6 rounded-lg">
        <h1 className="text-2xl font-bold text-white text-center">Configurações do Aplicativo</h1>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="courtCount" className="text-white">
              Número de Quadras
            </Label>
            <Input
              id="courtCount"
              type="number"
              min="1"
              max="20"
              value={courtCount}
              onChange={(e) => setCourtCount(Number.parseInt(e.target.value) || 6)}
              className="bg-[#777777] text-white border-[#FEE100]"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-white">Formato de Jogo</Label>
            <RadioGroup
              value={maxSets.toString()}
              onValueChange={(v) => setMaxSets(Number.parseInt(v))}
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
        </div>

        <Button onClick={saveSettings} className="w-full bg-[#FEE100] text-[#383838] hover:bg-[#e6cb00]">
          Salvar Configurações
        </Button>
      </div>
    </div>
  )
}
