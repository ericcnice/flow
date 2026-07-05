/**
 * Módulo de beach tennis — implementa SportModule.
 *
 * Mesma mecânica de racquete do tênis (vive em ./racket-core), mas com os
 * PADRÕES do esporte: no-ad por padrão (ponto de ouro no 40-40), melhor de 3,
 * super tiebreak desligado, 6 games por set com opção de 4 (formato de
 * vila/clube). Este arquivo é a casca fina do beach: id/nome, defaults e
 * delegação. BeachRules é estruturalmente compatível com RacketRules (usa
 * `advantage`), então as regras são passadas direto, sem adaptação.
 */

import { awardGame, createInitialState, scorePoint } from "./racket-core.ts"
import type { BeachRules, GameState, ScoreResult, Side, SportModule } from "../types"

// Reexport por compatibilidade (helpers de exibição vivem agora no core).
export { gameScoreText, pointLabel } from "./racket-core.ts"

export const beachModule: SportModule<BeachRules> = {
  id: "beach",
  name: "Beach Tennis",

  defaultRules(): BeachRules {
    return {
      gamesPerSet: 6,
      advantage: false, // no-ad: ponto de ouro no 40-40 (padrão do beach)
      tiebreak: { enabled: true, target: 7, mode: "by-two" },
      superTiebreak: { enabled: false, target: 10, mode: "by-two" },
      bestOf: 3,
    }
  },

  createInitialState(_rules: BeachRules, firstServer: Side = "A"): GameState {
    return createInitialState(firstServer)
  },

  scorePoint(state: GameState, side: Side, rules: BeachRules): ScoreResult {
    return scorePoint(state, side, rules)
  },

  awardGame(state: GameState, side: Side, rules: BeachRules): ScoreResult {
    return awardGame(state, side, rules)
  },
}
