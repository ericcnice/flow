'use client'

/**
 * O QR DA MARCA — pequeno, num canto do hero.
 *
 * Não é um recurso: é ASSINATURA. O Flow nasceu de um QR na parede da quadra, e
 * "Scan. Play." é a promessa da marca — o QR no hero é essa promessa em objeto,
 * escaneável ali mesmo. Por isso é discreto (72px) e não pede nada.
 *
 * Aponta para a PRÓPRIA landing: escaneado por um amigo ao lado, leva à mesma
 * página no celular dele. `origin` em vez de URL fixa para funcionar igual em
 * produção, preview da Vercel e localhost.
 */

import { useEffect, useState } from 'react'
import { QRCodeGenerator } from '@/components/qr-code'

export function BrandQr() {
  const [url, setUrl] = useState('')

  // Pós-mount: `window` não existe no servidor, e o QR é decorativo — nasce
  // ausente e aparece, sem reservar buraco visual na primeira pintura.
  useEffect(() => setUrl(window.location.origin), [])

  if (!url) return null

  return (
    <div className="flex items-center gap-3">
      <div className="rounded-lg bg-white p-1.5 shadow-lg shadow-black/40">
        <QRCodeGenerator value={url} size={64} className="block h-16 w-16" />
      </div>
      <span className="text-[10px] font-semibold uppercase leading-tight tracking-[0.2em] text-white/45">
        Scan.
        <br />
        Play.
      </span>
    </div>
  )
}
