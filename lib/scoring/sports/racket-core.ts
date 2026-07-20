/**
 * Núcleo de scoring de esportes de racquete.
 *
 * Implementa a mecânica compartilhada por tênis, beach tennis e padel:
 *  - pontos 0/15/30/40, deuce e vantagem (ou no-ad / ponto seco),
 *  - games e sets (games por set configurável, 2 de diferença),
 *  - tiebreak em N-N, super tiebreak substituindo o set decisivo,
 *  - melhor de 3/5, alternância de sacador a cada game,
 *  - concessão direta de game (granularidade "por game").
 *
 * É agnóstico de esporte: recebe {@link RacketRules} (forma canônica). Cada
 * módulo de esporte (tennis.ts, beach.ts, padel.ts) é uma casca fina que
 * fornece id/nome/defaults e, quando necessário, adapta suas regras para esta
 * forma antes de delegar. Não conhece a UI nem modela jogadores.
 */

import type { GameState, RacketRules, ScoreResult, ScoringEvent, Side, SideState, TiebreakMode } from "../types"

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
function setsToWin(rules: RacketRules): number {
  return Math.ceil(rules.bestOf / 2)
}

/** Verifica se um tiebreak foi vencido: atingiu o alvo E abriu 2 de diferença. */
function tiebreakWon(mine: number, theirs: number, target: number): boolean {
  return mine >= target && mine - theirs >= 2
}

/**
 * FONTE ÚNICA do desempate no 6-6 (tiebreakMode). Tolerante a config legada e
 * ausente: se `tiebreakMode` não for um dos três valores válidos, deriva dos
 * flags antigos (super ligado → 'super10' [prioridade, cobre "ambos ligados"];
 * tiebreak ligado e super desligado → 'tb7'; ambos desligados → 'advantage';
 * ausência total → 'tb7'). Assim o motor "se cura" mesmo recebendo rules velhas.
 */
export function resolveTiebreakMode(rules: unknown): TiebreakMode {
  const r = (rules ?? {}) as {
    tiebreakMode?: unknown
    tiebreak?: { enabled?: unknown }
    superTiebreak?: { enabled?: unknown }
  }
  if (r.tiebreakMode === "tb7" || r.tiebreakMode === "super10" || r.tiebreakMode === "advantage") {
    return r.tiebreakMode
  }
  if (r.superTiebreak?.enabled) return "super10"
  if (r.tiebreak?.enabled) return "tb7"
  if (r.tiebreak && r.tiebreak.enabled === false) return "advantage"
  return "tb7"
}

/** Alvo de pontos do tiebreak conforme o modo (super10 = 10, senão 7). */
function tiebreakTarget(mode: TiebreakMode): number {
  return mode === "super10" ? 10 : 7
}

/**
 * MIGRAÇÃO de rules da família tênis (uso no boundary do app: seed persistido /
 * set_config remoto). Só toca objetos que parecem tênis (têm gamesPerSet);
 * normaliza para o campo único `tiebreakMode`. Idempotente para rules já novas.
 */
export function migrateRacketRules<T>(raw: T): T {
  const r = raw as { gamesPerSet?: unknown } | null | undefined
  if (!r || typeof r !== "object" || typeof r.gamesPerSet !== "number") return raw
  return { ...(raw as object), tiebreakMode: resolveTiebreakMode(raw) } as T
}

/** Cria o estado inicial de uma partida de racquete. */
export function createInitialState(firstServer: Side = "A"): GameState {
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
}

/** Marca um ponto para `side`. NÃO muta o estado recebido. */
export function scorePoint(prev: GameState, side: Side, rules: RacketRules): ScoreResult {
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
}

/**
 * Concede um game inteiro a `side`, pulando a contagem de pontos. Em tiebreak,
 * concede o tiebreak/set. NÃO muta o estado recebido.
 */
export function awardGame(prev: GameState, side: Side, rules: RacketRules): ScoreResult {
  const state = structuredClone(prev)
  const events: ScoringEvent[] = []

  if (state.finished) {
    return { state, events }
  }

  // Em tiebreak, conceder o game = conceder o tiebreak/set: reusa o mesmo
  // desfecho de quem vence o tiebreak (fecha set/partida, eventos corretos).
  if (state.isTiebreak) {
    concludeTiebreak(state, side, rules, events)
    return { state, events }
  }

  // Fora do tiebreak: conceder um game é exatamente o desfecho de um game
  // vencido — zera pontos em curso, incrementa o game e dispara set/partida.
  winGame(state, side, rules, events)
  return { state, events }
}

/** Marca um ponto de game normal (fora de tiebreak). */
function scoreGamePoint(state: GameState, side: Side, rules: RacketRules, events: ScoringEvent[]): void {
  const me = state[side]
  const opp = state[other(side)]

  // 1) Já tenho vantagem → vence o game (só ocorre com vantagem habilitada).
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

  // 3) Deuce (40-40): com vantagem ganha AD; sem vantagem (no-ad / ponto de
  //    ouro), o próximo ponto fecha o game.
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

/** Fecha um game para `side`: zera pontos, incrementa o game, alterna saque. */
function winGame(state: GameState, side: Side, rules: RacketRules, events: ScoringEvent[]): void {
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
function checkSetStatus(state: GameState, side: Side, rules: RacketRules, events: ScoringEvent[]): void {
  const me = state[side]
  const opp = state[other(side)]
  // COERÇÃO NUMÉRICA (bug do tiebreak de set): `gamesPerSet` pode chegar como
  // STRING ("6") por config persistida/legada ou set_config externo. O gatilho do
  // 6-6 comparava com `===` estrito, e `6 === "6"` é false → o tiebreak de set NÃO
  // abria e o set seguia por vantagem (7-6, 8-6...). O super tiebreak nunca sofreu
  // porque compara `currentSet` (number) com `bestOf` (number). Number() faz o 6-6
  // disparar o MESMO caminho de tiebreak que o super já usa. Number(6) === 6 →
  // nada muda para regras já numéricas.
  const gps = Number(rules.gamesPerSet)

  // Empate em gamesPerSet-gamesPerSet (ex.: 6-6 ou 4-4): o DESEMPATE é roteado
  // pelo campo único `tiebreakMode` (fonte de verdade). 'tb7'/'super10' abrem o
  // MESMO mecanismo de tiebreak (só muda o alvo: 7 vs 10); 'advantage' segue por
  // games. `isSuperTiebreak` fica só para exibição (rótulo "super"/voz).
  if (me.games === gps && opp.games === gps) {
    const mode = resolveTiebreakMode(rules)
    if (mode !== "advantage") {
      state.isTiebreak = true
      state.isSuperTiebreak = mode === "super10"
      events.push({ type: "TIEBREAK_START", ...(mode === "super10" ? { detail: "super" } : {}) })
    }
    // 'advantage': sem tiebreak, segue jogando até 2 de diferença (8-6, 9-7...).
    return
  }

  // Vence o set com >= gamesPerSet e 2 de diferença (cobre 7-5).
  if (me.games >= gps && me.games - opp.games >= 2) {
    completeSet(state, side, rules, events, false)
  }
}

/** Marca um ponto de tiebreak. O alvo (7 ou 10) vem do `tiebreakMode` das rules. */
function scoreTiebreakPoint(state: GameState, side: Side, rules: RacketRules, events: ScoringEvent[]): void {
  const me = state[side]
  const opp = state[other(side)]

  me.tiebreakPoints += 1
  events.push({ type: "POINT", side, detail: tiebreakScoreText(state) })

  const target = tiebreakTarget(resolveTiebreakMode(rules))

  if (tiebreakWon(me.tiebreakPoints, opp.tiebreakPoints, target)) {
    concludeTiebreak(state, side, rules, events)
  }
}

/**
 * Desfecho de um tiebreak vencido por `side`: conta como um game (7-6, ou 1-0
 * no super tiebreak decisivo) e fecha o set. Reusado por scorePoint (vitória
 * no tiebreak) e por awardGame (conceder o game durante o tiebreak).
 */
function concludeTiebreak(state: GameState, side: Side, rules: RacketRules, events: ScoringEvent[]): void {
  state[side].games += 1
  events.push({ type: "GAME", side, detail: `${state.A.games}-${state.B.games}` })
  state.server = other(state.server)
  completeSet(state, side, rules, events, true)
}

/** Fecha o set para `side`: registra histórico, incrementa set, prepara o próximo. */
function completeSet(
  state: GameState,
  side: Side,
  rules: RacketRules,
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
  // (O super tiebreak deixou de ser "substituir o set decisivo": agora é o modo
  //  'super10' do desempate no 6-6, roteado em checkSetStatus. A combinação
  //  "tb7 nos sets + super10 só no decisivo" é a Etapa 2.)
}
