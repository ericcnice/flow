/**
 * Módulo de tênis de mesa (ping pong) — implementa SportModule.
 *
 * MESMA FAMÍLIA do squash: rally scoring (pontos corridos). Cada rally vale 1
 * ponto para quem vencer; o game vai até `target` (11) por `winBy` (2), com
 * 10-10 seguindo até abrir 2; a partida é melhor de 5 ou 7 games.
 *
 * Autocontido de propósito: como ainda são só dois esportes de rally (este e o
 * squash) e o tênis de mesa diverge na troca de saque, a lógica é duplicada de
 * forma clara em vez de extraída para um "rally-core" prematuro. A extração fica
 * para quando houver um terceiro consumidor genuíno da mesma mecânica.
 *
 * Reaproveita o GameState pela mesma reinterpretação do squash (ver types.ts):
 *  - `points` = contagem corrida do game atual; `games` = games ganhos;
 *  - `currentSet` = nº do game atual; `completedSets` = games encerrados;
 *  - `sets`, `advantage`, `tiebreakPoints`, `isTiebreak*` ficam inertes.
 *
 * Não conhece a UI nem modela jogadores.
 */

import type { GameState, ScoreResult, ScoringEvent, Side, SideState, SportModule, TableTennisRules } from "../types"

/** O outro lado. */
function other(side: Side): Side {
  return side === "A" ? "B" : "A"
}

/** Placar do game atual em contagem corrida, ex.: "10-9". */
function rallyScoreText(state: GameState): string {
  return `${state.A.points}-${state.B.points}`
}

/** Quantos games são necessários para vencer a partida (melhor de N). */
function gamesToWin(rules: TableTennisRules): number {
  return Math.ceil(rules.bestOf / 2)
}

/** `side` fechou o game atual? (atingiu o alvo com a diferença mínima) */
function gameWon(me: SideState, opp: SideState, rules: TableTennisRules): boolean {
  return me.points >= rules.target && me.points - opp.points >= rules.winBy
}

/**
 * Quem saca o próximo ponto (best-effort). Regra do tênis de mesa: o saque troca
 * a cada 2 pontos; a partir do deuce (ambos em target-1, ex.: 10-10) troca a
 * cada 1 ponto. `totalPlayed` é o total de pontos já jogados no game = índice do
 * próximo ponto. O primeiro sacador do game é `firstServer`.
 */
function serverForNextPoint(totalPlayed: number, rules: TableTennisRules, firstServer: Side): Side {
  const deuceStart = 2 * (rules.target - 1) // ex.: 20 para alvo 11
  if (totalPlayed >= deuceStart) {
    // No deuce, alterna a cada ponto (parity contínua com os blocos de 2).
    return (totalPlayed - deuceStart) % 2 === 0 ? firstServer : other(firstServer)
  }
  const block = Math.floor(totalPlayed / 2)
  return block % 2 === 0 ? firstServer : other(firstServer)
}

export const tableTennisModule: SportModule<TableTennisRules> = {
  id: "tabletennis",
  name: "Tênis de Mesa",

  defaultRules(): TableTennisRules {
    return {
      target: 11,
      winBy: 2,
      bestOf: 5,
    }
  },

  createInitialState(_rules: TableTennisRules, firstServer: Side = "A"): GameState {
    const blank = (): SideState => ({
      points: 0,
      games: 0,
      sets: 0, // inerte
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

  scorePoint(prev: GameState, side: Side, rules: TableTennisRules): ScoreResult {
    const state = structuredClone(prev)
    const events: ScoringEvent[] = []

    if (state.finished) {
      return { state, events }
    }

    const me = state[side]
    const opp = state[other(side)]

    // Rally scoring: o vencedor do rally marca 1 ponto.
    me.points += 1

    if (gameWon(me, opp, rules)) {
      concludeGame(state, side, rules, events)
      return { state, events }
    }

    // Atualiza quem saca o próximo ponto (troca a cada 2 pontos; 1 no deuce).
    state.server = serverForNextPoint(state.A.points + state.B.points, rules, state.firstServer)

    events.push({ type: "POINT", side, detail: rallyScoreText(state) })

    // 10-10 (ou 11-11, 12-12…): empate a partir de target-1 → "deuce".
    if (me.points >= rules.target - 1 && me.points === opp.points) {
      events.push({ type: "DEUCE", detail: rallyScoreText(state) })
    }

    return { state, events }
  },

  awardGame(prev: GameState, side: Side, rules: TableTennisRules): ScoreResult {
    const state = structuredClone(prev)
    const events: ScoringEvent[] = []

    if (state.finished) {
      return { state, events }
    }

    const me = state[side]
    const opp = state[other(side)]

    // Conceder o game direto (modo game-a-game): registra um placar de vitória
    // válido do lado premiado (alvo, respeitando o "por 2").
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
function concludeGame(state: GameState, side: Side, rules: TableTennisRules, events: ScoringEvent[]): void {
  state.completedSets.push({
    set: state.currentSet, // nº do game
    A: state.A.points,
    B: state.B.points,
  })

  state[side].games += 1
  events.push({ type: "GAME", side, detail: `${state.A.games}-${state.B.games}` })

  // Zera a contagem corrida e reinicia o saque para o próximo game.
  state.A.points = 0
  state.B.points = 0
  state.currentSet += 1
  state.server = state.firstServer

  // Partida encerrada? (primeiro a gamesToWin)
  if (state[side].games >= gamesToWin(rules)) {
    state.finished = true
    state.winner = side
    events.push({ type: "MATCH", side })
  }
}
