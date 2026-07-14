"use client"

/**
 * /placar — tela de ESPECTADOR (somente leitura) da partida ao vivo.
 *
 * Substitui a antiga tela local (localStorage + polling). Agora é uma casca
 * fina sobre <BroadcastView>, que reaproveita o MESMO fluxo remote-first +
 * Realtime já provado no /jogo, porém SEMPRE como viewer: nenhum bloco de
 * marcar ponto, nenhum controle de edição. Toda a lógica (conexão, sync,
 * layout de transmissão, logos) vive no componente compartilhado.
 */

import { Suspense } from "react"
import { BroadcastView } from "@/components/broadcast-view"

export default function PlacarPage() {
  // Suspense: <BroadcastView> usa useSearchParams (client hook que exige limite
  // de Suspense no App Router para a prerenderização).
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Carregando...</div>}>
      <BroadcastView />
    </Suspense>
  )
}
