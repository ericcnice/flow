"use client"

import { useEffect, useState } from "react"
import { QRCodeGenerator } from "@/components/qr-code"

interface DynamicQRCodeProps {
  quadra: string
  className?: string
  adminMode?: boolean
}

export function DynamicQRCode({ quadra, className = "", adminMode = true }: DynamicQRCodeProps) {
  const [qrValue, setQrValue] = useState("")

  useEffect(() => {
    // Gerar URL completa para a página desejada
    const baseUrl = window.location.origin
    // Se adminMode for true, direciona para a página de administração, caso contrário para o placar
    const targetUrl = adminMode ? `${baseUrl}/jogo?quadra=${quadra}` : `${baseUrl}/placar?quadra=${quadra}`
    setQrValue(targetUrl)
  }, [quadra, adminMode])

  if (!qrValue) return null

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <QRCodeGenerator value={qrValue} size={120} />
      <p className="text-xs text-white mt-1">
        {adminMode ? "Escaneie para administrar" : "Escaneie para ver o placar"}
      </p>
    </div>
  )
}
