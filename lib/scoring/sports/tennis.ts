/**
 * Módulo de tênis — implementa SportModule.
 *
 * Reproduz a lógica que hoje vive em app/jogo/page.tsx: pontos 0/15/30/40,
 * deuce/vantagem (configurável), games, sets com 2 de diferença, tiebreak em
 * 6-6, super tiebreak no set decisivo, melhor de 3/5, alternância de saque.
 *
 * A mecânica em si mora em ./racket-core (compartilhada com beach e padel).
 * Este arquivo é a casca fina do tênis: id/nome, defaults e delegação. Como
 * TennisRules é estruturalmente compatível com RacketRules (usa `advantage`),
 * as regras são passadas direto, sem adaptação.
 */

import { awardGame, createInitialState, scorePoint } from "./racket-core.ts"
import type { GameState, ScoreResult, Side, SportModule, TennisRules } from "../types"

// Reexport por compatibilidade (helpers de exibição vivem agora no core).
export { gameScoreText, pointLabel } from "./racket-core.ts"

export const tennisModule: SportModule<TennisRules> = {
  id: "tennis",
  name: "Tênis",

  defaultRules(): TennisRules {
    return {
      gamesPerSet: 6,
      advantage: true,
      tiebreakMode: "tb7",
      bestOf: 3,
    }
  },

  createInitialState(_rules: TennisRules, firstServer: Side = "A"): GameState {
    return createInitialState(firstServer)
  },

  scorePoint(state: GameState, side: Side, rules: TennisRules): ScoreResult {
    return scorePoint(state, side, rules)
  },

  awardGame(state: GameState, side: Side, rules: TennisRules): ScoreResult {
    return awardGame(state, side, rules)
  },
}
