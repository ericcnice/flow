"use client"

/**
 * Rota de contexto de clube SEM anúncio: /[clube]/[esporte]/[quadra]
 * (ex.: /spac/beachtennis/q1). Mostra a Tela 1 e vai direto pro jogo.
 */

import { ClubOpening } from "@/components/club-opening"

export default function ClubQuadraPage() {
  return <ClubOpening hasAd={false} />
}
