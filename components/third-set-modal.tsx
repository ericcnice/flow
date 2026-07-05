"use client"

import { Button } from "@/components/ui/button"

interface ThirdSetModalProps {
  isOpen: boolean
  onClose: (playTiebreak: boolean) => void
}

export function ThirdSetModal({ isOpen, onClose }: ThirdSetModalProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#696969] rounded-lg p-6 max-w-sm w-full">
        <h2 className="text-xl font-bold text-[#FEE100] mb-4 text-center">Escolha o formato do terceiro set</h2>

        <p className="text-white mb-6 text-center">
          Como cada jogador ganhou um set, como deseja jogar o terceiro set?
        </p>

        <div className="flex flex-col gap-4">
          <Button
            className="w-full py-4 text-lg bg-[#FEE100] text-[#383838] hover:bg-[#e6cb00]"
            onClick={() => onClose(false)}
          >
            Set Normal
          </Button>

          <Button
            className="w-full py-4 text-lg bg-[#FEE100] text-[#383838] hover:bg-[#e6cb00]"
            onClick={() => onClose(true)}
          >
            Tiebreak
          </Button>
        </div>
      </div>
    </div>
  )
}
