"use client"

/**
 * Tela de SETUP integrada — aparece ANTES do jogo (home → setup → jogo) para
 * partidas NOVAS. Reusa a superfície de configuração única (SportSetup): a
 * MESMA que o botão de config dentro do jogo abre. Aqui o contexto é "new": o
 * botão primário é "JOGO!" e sempre inicia a partida escolhida.
 *
 * Ao iniciar, grava a config da partida (com o esporte) e uma "semente" do motor
 * com as regras escolhidas, e navega para /jogo?quadra=X&sport=ID. A tela de jogo
 * instancia o ScoringEngine com o MÓDULO do esporte (ver app/jogo/page.tsx).
 *
 * NÃO altera lib/scoring: só consome os módulos via o catálogo.
 */

import { Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { SportSetup } from "@/components/sport-setup"
import { defaultRulesFor, type SportId } from "@/lib/sports-catalog"
import { DEFAULT_THEME, type ThemeId } from "@/lib/themes"

// useSearchParams() exige uma fronteira de Suspense na geração estática do Next
// (CSR bailout). O conteúdo real fica em SetupScreen.
export default function SetupPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Carregando...</div>}>
      <SetupScreen />
    </Suspense>
  )
}

function SetupScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const quadra = searchParams.get("quadra") || "1"

  const startGame = (sport: SportId, rules: any, theme: ThemeId) => {
    // Config da partida (mantém as MESMAS chaves do fluxo atual — placar/QR leem
    // `tennis_match_${quadra}` — apenas acrescenta os campos `sport` e `theme`).
    const config = {
      quadra,
      sport,
      theme,
      gameType: "simples",
      scoreType: "pontos",
      players: {
        blue1: "Jogador 1",
        blue2: "Jogador 2",
        red1: "Jogador 3",
        red2: "Jogador 4",
      },
      startTime: new Date().toISOString(),
      maxSets: rules.bestOf ?? 3,
    }
    localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(config))

    // Semente do motor com as regras ESCOLHIDAS (a tela de jogo reconstrói a
    // partir daqui; sem ações ainda) — faz o placar contar como o esporte certo
    // desde o primeiro ponto.
    localStorage.setItem(
      `tennis_engine_${quadra}`,
      JSON.stringify({ rules, firstServer: "A", actions: [] }),
    )
    localStorage.removeItem(`tennis_score_${quadra}`)

    router.push(`/jogo?quadra=${quadra}&sport=${sport}`)
  }

  return (
    <div className="h-[100dvh]">
      <SportSetup
        initialSport="tennis"
        initialRules={defaultRulesFor("tennis")}
        initialTheme={DEFAULT_THEME}
        context="new"
        onConfirm={(sport, rules, _sportChanged, theme) => startGame(sport, rules, theme)}
      />
    </div>
  )
}
