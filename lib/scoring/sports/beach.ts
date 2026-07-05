/**
 * Módulo de beach tennis — implementa SportModule.
 *
 * O beach compartilha a mecânica de racquete do tênis (0/15/30/40, games,
 * sets por 2 de diferença, tiebreak, super tiebreak). O algoritmo é o mesmo;
 * o que muda são os PADRÕES do esporte:
 *  - no-ad por padrão: no 40-40 o próximo ponto decide (ponto de ouro),
 *  - melhor de 3, super tiebreak desligado por padrão,
 *  - games por set 6 por padrão, com opção de 4 (formato de vila/clube).
 *
 * A lógica é mantida autocontida aqui (não reusa um core compartilhado) porque,
 * enquanto sports/tennis.ts não puder ser tocado, uma extração deduplicaria
 * apenas parcialmente e criaria um "core" com um único consumidor. A extração
 * correta é um refactor futuro, com tênis e beach migrados juntos.
 *
 * Não conhece a UI: recebe (estado, lado, regras) e devolve (estado, eventos).
 */

import type {
  BeachRules,
  GameState,
  ScoreResult,
  ScoringEvent,
  Side,
  SideState,
  SportModule,
  TiebreakMode,
} from "../types"

const POINT_LABELS = ["0", "15", "30", "40"] as const

/** O outro lado. */
function other(side: Side): Side {
  return side === "A" ? "B" : "A"
}

/** Rótulo de exibição de um lado no game: 0/15/30/40/AD. */
export function pointLabel(sideState: SideState): string {
  if (sideState.advantage) return "AD"
  return POINT_LABELS[Math.min(sideState.points, 3)]
}

/** Placar do game atual, ex.: "30-15", "40-40", "AD-40". */
export function gameScoreText(state: GameState): string {
  return `${pointLabel(state.A)}-${pointLabel(state.B)}`
}

/** Placar do tiebreak atual, ex.: "5-4". */
function tiebreakScoreText(state: GameState): string {
  return `${state.A.tiebreakPoints}-${state.B.tiebreakPoints}`
}

/** Quantos sets são necessários para vencer a partida. */
function setsToWin(rules: BeachRules): number {
  return Math.ceil(rules.bestOf / 2)
}

/** Verifica se um tiebreak foi vencido, respeitando o modo (por-2 ou seco). */
function tiebreakWon(mine: number, theirs: number, target: number, mode: TiebreakMode): boolean {
  if (mine < target) return false
  if (mode === "sudden-death") return true
  return mine - theirs >= 2
}

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

  createInitialState(rules: BeachRules, firstServer: Side = "A"): GameState {
    const blank = (): SideState => ({
      points: 0,
      games: 0,
      sets: 0,
      advantage: false,
      tiebreakPoints: 0,
    })
    return {
      A: blank(),
      B: blank(),
      currentSet: 1,
      isTiebreak: false,
      isSuperTiebreak: false,
      server: firstServer,
      firstServer,
      completedSets: [],
      finished: false,
    }
  },

  scorePoint(prev: GameState, side: Side, rules: BeachRules): ScoreResult {
    const state = structuredClone(prev)
    const events: ScoringEvent[] = []

    if (state.finished) {
      return { state, events }
    }

    if (state.isTiebreak) {
      scoreTiebreakPoint(state, side, rules, events)
      return { state, events }
    }

    scoreGamePoint(state, side, rules, events)
    return { state, events }
  },

  awardGame(prev: GameState, side: Side, rules: BeachRules): ScoreResult {
    const state = structuredClone(prev)
    const events: ScoringEvent[] = []

    if (state.finished) {
      return { state, events }
    }

    // Em tiebreak, conceder o game = conceder o tiebreak/set.
    if (state.isTiebreak) {
      concludeTiebreak(state, side, rules, events)
      return { state, events }
    }

    // Fora do tiebreak: conceder um game é o desfecho de um game vencido —
    // zera pontos em curso, incrementa o game e dispara set/partida.
    winGame(state, side, rules, events)
    return { state, events }
  },
}

/** Marca um ponto de game normal (fora de tiebreak). */
function scoreGamePoint(state: GameState, side: Side, rules: BeachRules, events: ScoringEvent[]): void {
  const me = state[side]
  const opp = state[other(side)]

  // 1) Já tenho vantagem → vence o game (só ocorre se advantage estiver ligado).
  if (me.advantage) {
    winGame(state, side, rules, events)
    return
  }

  // 2) Oponente tem vantagem → volta para deuce.
  if (opp.advantage) {
    opp.advantage = false
    events.push({ type: "DEUCE", detail: "40-40" })
    return
  }

  // 3) Deuce (40-40): no-ad (padrão beach) o próximo ponto fecha o game —
  //    "ponto de ouro". Com vantagem ligada, ganha AD.
  if (me.points === 3 && opp.points === 3) {
    if (rules.advantage) {
      me.advantage = true
      events.push({ type: "ADVANTAGE", side, detail: "AD" })
    } else {
      winGame(state, side, rules, events)
    }
    return
  }

  // 4) Pontuação normal 0→15→30→40 (ainda sem chegar em 40 fechado).
  if (me.points < 3) {
    me.points += 1
    if (me.points === 3 && opp.points === 3) {
      events.push({ type: "DEUCE", detail: "40-40" })
    } else {
      events.push({ type: "POINT", side, detail: gameScoreText(state) })
    }
    return
  }

  // 5) Tenho 40 e o oponente tem menos que 40 → vence o game direto.
  winGame(state, side, rules, events)
}

/** Fecha um game para `side`: zera pontos, incrementa game, alterna saque. */
function winGame(state: GameState, side: Side, rules: BeachRules, events: ScoringEvent[]): void {
  state.A.points = 0
  state.B.points = 0
  state.A.advantage = false
  state.B.advantage = false
  state[side].games += 1

  events.push({
    type: "GAME",
    side,
    detail: `${state.A.games}-${state.B.games}`,
  })

  // Alterna o sacador a cada game.
  state.server = other(state.server)

  checkSetStatus(state, side, rules, events)
}

/** Após um game, decide se abre tiebreak, fecha o set, ou segue jogando. */
function checkSetStatus(state: GameState, side: Side, rules: BeachRules, events: ScoringEvent[]): void {
  const me = state[side]
  const opp = state[other(side)]
  const gps = rules.gamesPerSet

  // Empate em gamesPerSet-gamesPerSet (6-6 ou 4-4) → tiebreak, se habilitado.
  if (me.games === gps && opp.games === gps) {
    if (rules.tiebreak.enabled) {
      state.isTiebreak = true
      events.push({ type: "TIEBREAK_START" })
    }
    // Sem tiebreak: set por vantagem, segue jogando até 2 de diferença.
    return
  }

  // Vence o set com >= gamesPerSet e 2 de diferença.
  if (me.games >= gps && me.games - opp.games >= 2) {
    completeSet(state, side, rules, events, false)
  }
}

/** Marca um ponto de tiebreak / super tiebreak. */
function scoreTiebreakPoint(state: GameState, side: Side, rules: BeachRules, events: ScoringEvent[]): void {
  const me = state[side]
  const opp = state[other(side)]

  me.tiebreakPoints += 1
  events.push({ type: "POINT", side, detail: tiebreakScoreText(state) })

  const cfg = state.isSuperTiebreak ? rules.superTiebreak : rules.tiebreak

  if (tiebreakWon(me.tiebreakPoints, opp.tiebreakPoints, cfg.target, cfg.mode)) {
    concludeTiebreak(state, side, rules, events)
  }
}

/**
 * Desfecho de um tiebreak vencido por `side`: conta como um game (ex.: 7-6, ou
 * 1-0 no super tiebreak) e fecha o set. Reusado por scorePoint (vitória no
 * tiebreak) e por awardGame (conceder o game durante o tiebreak).
 */
function concludeTiebreak(state: GameState, side: Side, rules: BeachRules, events: ScoringEvent[]): void {
  state[side].games += 1
  events.push({ type: "GAME", side, detail: `${state.A.games}-${state.B.games}` })
  state.server = other(state.server)
  completeSet(state, side, rules, events, true)
}

/** Fecha o set para `side`: registra histórico, incrementa set, prepara o próximo. */
function completeSet(
  state: GameState,
  side: Side,
  rules: BeachRules,
  events: ScoringEvent[],
  viaTiebreak: boolean,
): void {
  const me = state[side]

  state.completedSets.push({
    set: state.currentSet,
    A: state.A.games,
    B: state.B.games,
    ...(viaTiebreak ? { tiebreak: true } : {}),
  })

  me.sets += 1
  events.push({
    type: "SET",
    side,
    detail: `set ${state.currentSet}: ${state.A.games}-${state.B.games}`,
  })

  // Reseta o placar de games/tiebreak para o próximo set.
  state.A.games = 0
  state.B.games = 0
  state.A.tiebreakPoints = 0
  state.B.tiebreakPoints = 0
  state.isTiebreak = false
  state.isSuperTiebreak = false
  state.currentSet += 1

  // Partida encerrada?
  if (me.sets >= setsToWin(rules)) {
    state.finished = true
    state.winner = side
    events.push({ type: "MATCH", side })
    return
  }

  // O set decisivo é jogado como super tiebreak, se configurado.
  if (rules.superTiebreak.enabled && state.currentSet === rules.bestOf) {
    state.isTiebreak = true
    state.isSuperTiebreak = true
    events.push({ type: "TIEBREAK_START", detail: "super" })
  }
}
