"use client"

/**
 * Rota de contexto de clube COM anúncio: /[clube]/[esporte]/[quadra]/[ad]
 * (ex.: /spac/beachtennis/q1/ad1). Após a Tela 1, mostra a Tela 2 (Nicholas +
 * botão JOGAR) antes de iniciar o jogo.
 */

import { ClubOpening } from "@/components/club-opening"

export default function ClubQuadraAdPage() {
  return <ClubOpening hasAd={true} />
}
