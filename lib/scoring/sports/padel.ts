/**
 * Módulo de padel — implementa SportModule.
 *
 * Mesma mecânica de racquete de tênis/beach (vive em ./racket-core), com uma
 * diferença de vocabulário: o "ponto de ouro" (golden point / punto de oro).
 * Quando `goldenPoint` é true (padrão do padel profissional), o 40-40 é ponto
 * seco — no motor isso é exatamente `advantage: false`. Quando false, vale a
 * vantagem tradicional. Este arquivo converte PadelRules → RacketRules antes
 * de delegar; toda a lógica de games/sets/tiebreak é a compartilhada.
 *
 * Padel é sempre em duplas na prática, mas o motor conta por lado (A/B); quem
 * são os jogadores é assunto da UI. O lado do saque no ponto de ouro também é
 * assunto de saque/UI, não do motor.
 */

import { awardGame, createInitialState, scorePoint } from "./racket-core.ts"
import type { GameState, PadelRules, RacketRules, ScoreResult, Side, SportModule } from "../types"

// Reexport por compatibilidade (helpers de exibição vivem no core).
export { gameScoreText, pointLabel } from "./racket-core.ts"

/**
 * Converte as regras de padel para a forma canônica do núcleo. O único ajuste
 * é o ponto de ouro: goldenPoint === true significa SEM vantagem (no-ad).
 */
function toRacketRules(rules: PadelRules): RacketRules {
  return {
    gamesPerSet: rules.gamesPerSet,
    advantage: !rules.goldenPoint,
    tiebreakMode: rules.tiebreakMode,
    bestOf: rules.bestOf,
  }
}

export const padelModule: SportModule<PadelRules> = {
  id: "padel",
  name: "Padel",

  defaultRules(): PadelRules {
    return {
      gamesPerSet: 6,
      goldenPoint: true, // padrão real: ponto de ouro (no-ad) no 40-40
      tiebreakMode: "tb7",
      bestOf: 3,
    }
  },

  createInitialState(_rules: PadelRules, firstServer: Side = "A"): GameState {
    return createInitialState(firstServer)
  },

  scorePoint(state: GameState, side: Side, rules: PadelRules): ScoreResult {
    return scorePoint(state, side, toRacketRules(rules))
  },

  awardGame(state: GameState, side: Side, rules: PadelRules): ScoreResult {
    return awardGame(state, side, toRacketRules(rules))
  },
}
