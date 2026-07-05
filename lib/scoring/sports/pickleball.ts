/**
 * Módulo de pickleball — implementa SportModule.
 *
 * TERCEIRA família do motor: SIDE-OUT SCORING. Diferente de tudo que veio antes,
 * só o lado que está SACANDO pode marcar ponto:
 *  - se o sacador (state.server) vence o rally → +1 ponto e MANTÉM o saque;
 *  - se o recebedor vence o rally → NENHUM ponto; é "side out": o saque passa
 *    para ele (server = quem venceu). O placar só sobe para quem saca.
 *
 * Autocontido de propósito: a mecânica de side-out é genuinamente diferente do
 * racket-core (família tênis) e do rally scoring (squash/ping pong), então NÃO
 * reusa nenhum deles.
 *
 * Game até `target` (11) por `winBy` (2); 10-10 segue até abrir 2. Partida
 * melhor de N games (padrão 3).
 *
 * Reaproveita o GameState pela mesma reinterpretação dos esportes de game
 * corrido (ver types.ts):
 *  - `points` = pontos do game atual por lado; `games` = games ganhos;
 *  - `currentSet` = nº do game; `completedSets` = games encerrados;
 *  - `sets`, `advantage`, `tiebreakPoints`, `isTiebreak*` ficam inertes.
 *  - `server` = lado que está sacando (central nesta família).
 *
 * Fase 0 SIMPLIFICADA: um único lado sacador por vez; o side-out passa o saque
 * direto ao outro lado. NÃO implementa os dois-sacadores/segundo-saque nem o 3º
 * número do placar de duplas — refinamento futuro. O que importa aqui é o
 * coração da regra: só quem saca pontua.
 *
 * Não conhece a UI nem modela jogadores.
 */

import type { GameState, ScoreResult, ScoringEvent, Side, SideState, SportModule, PickleballRules } from "../types"

/** O outro lado. */
function other(side: Side): Side {
  return side === "A" ? "B" : "A"
}

/** Placar do game atual, ex.: "10-9". */
function scoreText(state: GameState): string {
  return `${state.A.points}-${state.B.points}`
}

/** Quantos games são necessários para vencer a partida (melhor de N). */
function gamesToWin(rules: PickleballRules): number {
  return Math.ceil(rules.bestOf / 2)
}

/** `side` fechou o game atual? (atingiu o alvo com a diferença mínima) */
function gameWon(me: SideState, opp: SideState, rules: PickleballRules): boolean {
  return me.points >= rules.target && me.points - opp.points >= rules.winBy
}

export const pickleballModule: SportModule<PickleballRules> = {
  id: "pickleball",
  name: "Pickleball",

  defaultRules(): PickleballRules {
    return {
      target: 11,
      winBy: 2,
      bestOf: 3,
    }
  },

  createInitialState(_rules: PickleballRules, firstServer: Side = "A"): GameState {
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
      server: firstServer, // lado que saca (central no side-out)
      firstServer,
      completedSets: [], // = games encerrados
      finished: false,
    }
  },

  /**
   * scorePoint(side) = "o lado `side` venceu o rally".
   * Side-out: só marca ponto se `side` for o sacador; senão, o saque passa a ele.
   */
  scorePoint(prev: GameState, side: Side, rules: PickleballRules): ScoreResult {
    const state = structuredClone(prev)
    const events: ScoringEvent[] = []

    if (state.finished) {
      return { state, events }
    }

    // Recebedor venceu o rally → SIDE OUT: nenhum ponto, só troca o saque.
    if (state.server !== side) {
      state.server = side
      events.push({ type: "SIDE_OUT", side, detail: `saque para ${side}` })
      return { state, events }
    }

    // Sacador venceu o rally → marca 1 ponto e MANTÉM o saque.
    const me = state[side]
    const opp = state[other(side)]
    me.points += 1

    if (gameWon(me, opp, rules)) {
      concludeGame(state, side, rules, events)
      return { state, events }
    }

    events.push({ type: "POINT", side, detail: scoreText(state) })

    // 10-10 (ou 11-11…): empate a partir de target-1 → "deuce".
    if (me.points >= rules.target - 1 && me.points === opp.points) {
      events.push({ type: "DEUCE", detail: scoreText(state) })
    }

    return { state, events }
  },

  awardGame(prev: GameState, side: Side, rules: PickleballRules): ScoreResult {
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
 * zera os pontos e checa o fim da partida. O saque volta ao firstServer no novo
 * game. Compartilhado por scorePoint (vitória) e awardGame (concessão direta).
 */
function concludeGame(state: GameState, side: Side, rules: PickleballRules, events: ScoringEvent[]): void {
  state.completedSets.push({
    set: state.currentSet, // nº do game
    A: state.A.points,
    B: state.B.points,
  })

  state[side].games += 1
  events.push({ type: "GAME", side, detail: `${state.A.games}-${state.B.games}` })

  // Zera os pontos e reinicia o saque para o próximo game.
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
