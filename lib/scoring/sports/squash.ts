/**
 * Módulo de squash — implementa SportModule.
 *
 * FAMÍLIA DIFERENTE do tênis/beach/padel: é rally scoring (PARS), não tem
 * 15/30/40 nem a mecânica de games do tênis. Por isso NÃO reusa o racket-core;
 * a lógica de contagem corrida vive aqui, separada.
 *
 * Mecânica:
 *  - cada rally vale 1 ponto para quem vencer (independente de quem sacou);
 *  - um "game" vai até `target` (11 padrão, ou 15) com vitória por `winBy` (2);
 *    em 10-10 segue até abrir 2 (12-10, 13-11…);
 *  - a partida é melhor de 5 games por padrão (primeiro a 3), configurável 3/5;
 *  - não há tiebreak separado — o "por 2" no próprio game resolve o empate.
 *
 * Reaproveita o GameState por reinterpretação (ver types.ts / SquashRules):
 *  - `points` = contagem corrida do game atual; `games` = games ganhos;
 *  - `currentSet` = nº do game atual; `completedSets` = games encerrados;
 *  - `sets`, `advantage`, `tiebreakPoints`, `isTiebreak*` ficam inertes.
 *
 * Não conhece a UI nem modela jogadores.
 */

import type { GameState, ScoreResult, ScoringEvent, Side, SideState, SportModule, SquashRules } from "../types"

/** O outro lado. */
function other(side: Side): Side {
  return side === "A" ? "B" : "A"
}

/** Placar do game atual em contagem corrida, ex.: "10-9". */
function rallyScoreText(state: GameState): string {
  return `${state.A.points}-${state.B.points}`
}

/** Quantos games são necessários para vencer a partida (melhor de N). */
function gamesToWin(rules: SquashRules): number {
  return Math.ceil(rules.bestOf / 2)
}

/** `side` fechou o game atual? (atingiu o alvo com a diferença mínima) */
function gameWon(me: SideState, opp: SideState, rules: SquashRules): boolean {
  return me.points >= rules.target && me.points - opp.points >= rules.winBy
}

export const squashModule: SportModule<SquashRules> = {
  id: "squash",
  name: "Squash",

  defaultRules(): SquashRules {
    return {
      target: 11, // PARS moderno
      winBy: 2,
      bestOf: 5,
    }
  },

  createInitialState(_rules: SquashRules, firstServer: Side = "A"): GameState {
    const blank = (): SideState => ({
      points: 0,
      games: 0,
      sets: 0, // inerte no squash
      advantage: false, // inerte
      tiebreakPoints: 0, // inerte
    })
    return {
      A: blank(),
      B: blank(),
      currentSet: 1, // = nº do game atual
      isTiebreak: false,
      isSuperTiebreak: false,
      server: firstServer,
      firstServer,
      completedSets: [], // = games encerrados
      finished: false,
    }
  },

  scorePoint(prev: GameState, side: Side, rules: SquashRules): ScoreResult {
    const state = structuredClone(prev)
    const events: ScoringEvent[] = []

    if (state.finished) {
      return { state, events }
    }

    const me = state[side]
    const opp = state[other(side)]

    // Rally scoring: o vencedor do rally marca 1 ponto e passa a sacar.
    me.points += 1
    state.server = side

    if (gameWon(me, opp, rules)) {
      concludeGame(state, side, rules, events)
      return { state, events }
    }

    events.push({ type: "POINT", side, detail: rallyScoreText(state) })

    // 10-10 (ou 11-11, 12-12…): empate a partir de target-1 → "deuce" do squash.
    if (me.points >= rules.target - 1 && me.points === opp.points) {
      events.push({ type: "DEUCE", detail: rallyScoreText(state) })
    }

    return { state, events }
  },

  awardGame(prev: GameState, side: Side, rules: SquashRules): ScoreResult {
    const state = structuredClone(prev)
    const events: ScoringEvent[] = []

    if (state.finished) {
      return { state, events }
    }

    const me = state[side]
    const opp = state[other(side)]

    // Conceder o game direto (modo game-a-game): garante que o placar registrado
    // reflita uma vitória válida do lado premiado (alvo, respeitando o "por 2").
    if (!gameWon(me, opp, rules)) {
      me.points = Math.max(rules.target, opp.points + rules.winBy)
    }

    concludeGame(state, side, rules, events)
    return { state, events }
  },
}

/**
 * Fecha o game atual para `side`: registra o game encerrado, credita o game,
 * zera a contagem corrida e checa o fim da partida. Compartilhado por scorePoint
 * (vitória por rally) e awardGame (concessão direta).
 */
function concludeGame(state: GameState, side: Side, rules: SquashRules, events: ScoringEvent[]): void {
  state.completedSets.push({
    set: state.currentSet, // nº do game
    A: state.A.points,
    B: state.B.points,
  })

  state[side].games += 1
  events.push({ type: "GAME", side, detail: `${state.A.games}-${state.B.games}` })

  // Zera a contagem corrida para o próximo game.
  state.A.points = 0
  state.B.points = 0
  state.currentSet += 1

  // Partida encerrada? (primeiro a gamesToWin)
  if (state[side].games >= gamesToWin(rules)) {
    state.finished = true
    state.winner = side
    events.push({ type: "MATCH", side })
  }
}
