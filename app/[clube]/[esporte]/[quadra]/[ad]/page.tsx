"use client"

/**
 * Rota de contexto de clube COM anúncio: /[clube]/[esporte]/[quadra]/[ad]
 * (ex.: /spac/beachtennis/q1/ad1). Após a Tela 1, mostra a Tela 2 (Nicholas +
 * botão JOGAR) antes de iniciar o jogo.
 */

import { useParams } from "next/navigation"
import { ClubOpening } from "@/components/club-opening"

export default function ClubQuadraAdPage() {
  // Passa o VALOR real do anúncio (ex.: "ad1"): a presença de `ad` faz o
  // ClubOpening resolver por SLUG (legado, cartaz impresso), não por quadra.
  const params = useParams<{ ad: string }>()
  return <ClubOpening ad={params?.ad} />
}
