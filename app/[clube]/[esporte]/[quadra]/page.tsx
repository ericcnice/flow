"use client"

/**
 * Rota de contexto de clube SEM /[ad] na URL: /[clube]/[esporte]/[quadra]
 * (ex.: /spac/beachtennis/q1). Sem `ad`, o ClubOpening resolve o patrocinador
 * POR QUADRA (court_sponsors + patrocinador geral do clube). Se houver, mostra
 * a Tela 2; se não, a Tela 1 vai direto pro jogo.
 */

import { ClubOpening } from "@/components/club-opening"

export default function ClubQuadraPage() {
  return <ClubOpening />
}
