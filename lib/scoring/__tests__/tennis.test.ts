/**
 * Testes do módulo de tênis + núcleo do motor.
 *
 * Test runner: nativo do Node (`node:test` + `node:assert`), sem dependências
 * novas. Rode com:  node --test lib/scoring/__tests__/
 *
 * Observação sobre imports: como o Node executa TypeScript por "type stripping",
 * imports de RUNTIME usam extensão .ts explícita; imports só de TIPO usam
 * `import type` (que é apagado em runtime).
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { ScoringEngine } from "../engine.ts"
import { tennisModule } from "../sports/tennis.ts"
import { resolveTiebreakMode, migrateRacketRules } from "../sports/racket-core.ts"
import type { ScoringEvent, ScoringEventType, Side, TennisRules } from "../types"

// ---------- helpers ----------

function makeEngine(partial?: Partial<TennisRules>): ScoringEngine<TennisRules> {
  const rules: TennisRules = { ...tennisModule.defaultRules(), ...partial }
  return new ScoringEngine(tennisModule, rules)
}

/** Marca `n` pontos seguidos para `side`. Retorna os eventos do último ponto. */
function score(engine: ScoringEngine<TennisRules>, side: Side, n = 1): ScoringEvent[] {
  let ev: ScoringEvent[] = []
  for (let i = 0; i < n; i++) ev = engine.pointFor(side)
  return ev
}

/** Vence um game "limpo" (4 pontos) para `side`, assumindo 0-0 no game. */
function cleanGame(engine: ScoringEngine<TennisRules>, side: Side): ScoringEvent[] {
  return score(engine, side, 4)
}

/** true se a lista de eventos contém um evento do tipo dado. */
function has(events: ScoringEvent[], type: ScoringEventType): boolean {
  return events.some((e) => e.type === type)
}

// ---------- 1) Game simples: 0 → 15 → 30 → 40 → game ----------

test("game simples: 0→15→30→40→game", () => {
  const engine = makeEngine()

  let ev = engine.pointFor("A")
  assert.equal(engine.getState().A.points, 1, "15")
  assert.equal(ev[0].detail, "15-0")

  engine.pointFor("A")
  assert.equal(engine.getState().A.points, 2, "30")

  engine.pointFor("A")
  assert.equal(engine.getState().A.points, 3, "40")

  ev = engine.pointFor("A")
  assert.ok(has(ev, "GAME"), "quarto ponto fecha o game")

  const s = engine.getState()
  assert.equal(s.A.games, 1, "A tem 1 game")
  assert.equal(s.A.points, 0, "pontos zerados após o game")
  assert.equal(s.B.points, 0)
  assert.equal(s.server, "B", "sacador alterna a cada game")
})

// ---------- 2) Deuce e vantagem ----------

test("deuce → vantagem → volta a deuce → game", () => {
  const engine = makeEngine() // advantage: true

  score(engine, "A", 3) // 40-0
  let ev = score(engine, "B", 3) // 40-40
  assert.ok(has(ev, "DEUCE"), "chegar a 40-40 emite DEUCE")
  let s = engine.getState()
  assert.equal(s.A.points, 3)
  assert.equal(s.B.points, 3)
  assert.equal(s.A.advantage, false)

  ev = engine.pointFor("A") // vantagem A
  assert.ok(has(ev, "ADVANTAGE"))
  assert.equal(engine.getState().A.advantage, true)

  ev = engine.pointFor("B") // B empata → volta a deuce
  assert.ok(has(ev, "DEUCE"))
  s = engine.getState()
  assert.equal(s.A.advantage, false, "vantagem de A removida")
  assert.equal(s.B.advantage, false)

  engine.pointFor("B") // vantagem B
  assert.equal(engine.getState().B.advantage, true)

  ev = engine.pointFor("B") // B fecha o game
  assert.ok(has(ev, "GAME"))
  s = engine.getState()
  assert.equal(s.B.games, 1)
  assert.equal(s.A.advantage, false)
  assert.equal(s.B.advantage, false)
})

test("sem vantagem (no-ad): ponto seco no 40-40 fecha o game", () => {
  const engine = makeEngine({ advantage: false })

  score(engine, "A", 3) // 40-0
  score(engine, "B", 3) // 40-40
  assert.equal(engine.getState().A.advantage, false)

  const ev = engine.pointFor("A") // ponto seco
  assert.ok(has(ev, "GAME"), "no-ad: vence direto no deuce")
  assert.equal(engine.getState().A.games, 1)
})

// ---------- 3) Fechar um set ----------

test("fechar set 6-0 (2 de diferença)", () => {
  const engine = makeEngine()
  let ev: ScoringEvent[] = []
  for (let i = 0; i < 6; i++) ev = cleanGame(engine, "A")

  assert.ok(has(ev, "SET"), "sexto game fecha o set")
  const s = engine.getState()
  assert.equal(s.A.sets, 1)
  assert.equal(s.A.games, 0, "games zerados no novo set")
  assert.equal(s.B.games, 0)
  assert.equal(s.currentSet, 2)
  assert.equal(s.completedSets.length, 1)
  assert.deepEqual(s.completedSets[0], { set: 1, A: 6, B: 0 })
  assert.equal(s.finished, false, "melhor de 3: partida não acabou")
})

test("fechar set 7-5", () => {
  const engine = makeEngine()
  // 5-5
  for (let i = 0; i < 5; i++) {
    cleanGame(engine, "A")
    cleanGame(engine, "B")
  }
  cleanGame(engine, "A") // 6-5, ainda não fecha
  assert.equal(engine.getState().A.games, 6)
  assert.equal(engine.getState().completedSets.length, 0)

  const ev = cleanGame(engine, "A") // 7-5 → fecha
  assert.ok(has(ev, "SET"))
  assert.deepEqual(engine.getState().completedSets[0], { set: 1, A: 7, B: 5 })
})

// ---------- 4) Tiebreak em 6-6 ----------

test("tiebreak em 6-6 e vitória por 2", () => {
  const engine = makeEngine()
  // chegar a 6-6
  for (let i = 0; i < 5; i++) {
    cleanGame(engine, "A")
    cleanGame(engine, "B")
  }
  cleanGame(engine, "A") // 6-5
  const evTb = cleanGame(engine, "B") // 6-6 → tiebreak
  assert.ok(has(evTb, "TIEBREAK_START"))
  assert.equal(engine.getState().isTiebreak, true)

  // 6-6 no tiebreak: nem ao chegar a 7-6 fecha (precisa de 2)
  score(engine, "A", 6)
  score(engine, "B", 6) // 6-6 nos pontos de tiebreak
  score(engine, "A", 1) // 7-6 → não fecha (diff 1)
  assert.equal(engine.getState().isTiebreak, true, "7-6 no tiebreak não fecha")
  assert.equal(engine.getState().A.games, 6)

  const ev = score(engine, "A", 1) // 8-6 → fecha
  assert.ok(has(ev, "SET"))
  const s = engine.getState()
  assert.equal(s.A.sets, 1)
  assert.equal(s.isTiebreak, false)
  assert.deepEqual(s.completedSets[0], { set: 1, A: 7, B: 6, tiebreak: true })
})

// ---------- 5) Modo super10: tiebreak de 10 no 6-6 ----------

test("modo super10: 6-6 abre tiebreak até 10 (diff 2), fecha 7-6 e a partida avança", () => {
  const engine = makeEngine({ tiebreakMode: "super10" })

  for (let i = 0; i < 6; i++) {
    cleanGame(engine, "A")
    cleanGame(engine, "B")
  } // 6-6
  let s = engine.getState()
  assert.equal(s.isTiebreak, true, "6-6 entra em tiebreak")
  assert.equal(s.isSuperTiebreak, true, "modo super10 → super")

  score(engine, "A", 9) // 9-0
  assert.equal(engine.getState().isTiebreak, true, "9-0 não fecha (precisa 10)")
  const ev = score(engine, "A", 1) // 10-0 → fecha (diff 2)
  assert.ok(has(ev, "SET"), "chegar a 10 com diff 2 fecha o set")
  s = engine.getState()
  assert.equal(s.isTiebreak, false)
  assert.equal(s.A.sets, 1)
  assert.deepEqual(s.completedSets[0], { set: 1, A: 7, B: 6, tiebreak: true }, "set fecha 7-6")
  assert.equal(s.currentSet, 2, "partida avança")
})

test("partida ignora pontos após terminar", () => {
  const engine = makeEngine({ gamesPerSet: 2, bestOf: 3, tiebreakMode: "advantage" })
  // gamesPerSet 2: 2 games limpos fecham cada set.
  cleanGame(engine, "A")
  cleanGame(engine, "A") // set 1
  cleanGame(engine, "A")
  const ev = cleanGame(engine, "A") // set 2 → partida
  assert.ok(has(ev, "MATCH"))
  assert.equal(engine.getState().finished, true)

  const after = engine.pointFor("B")
  assert.deepEqual(after, [], "nenhum evento após o fim")
  assert.equal(engine.getState().winner, "A", "vencedor inalterado")
})

// ---------- 6) Undo (voltar ponto) ----------

test("undo retrocede pontos dentro do game", () => {
  const engine = makeEngine()
  engine.pointFor("A") // 15
  engine.pointFor("A") // 30
  assert.equal(engine.getState().A.points, 2)

  assert.equal(engine.undo(), true)
  assert.equal(engine.getState().A.points, 1, "voltou para 15")

  assert.equal(engine.undo(), true)
  assert.equal(engine.getState().A.points, 0, "voltou para 0")

  assert.equal(engine.canUndo(), false)
  assert.equal(engine.undo(), false, "nada mais para desfazer")
})

test("undo atravessa a fronteira de um game", () => {
  const engine = makeEngine()
  cleanGame(engine, "A") // A ganha o game (1-0)
  assert.equal(engine.getState().A.games, 1)

  engine.undo() // desfaz o ponto que fechou o game
  const s = engine.getState()
  assert.equal(s.A.games, 0, "game retrocedido")
  assert.equal(s.A.points, 3, "volta para 40-0")
  assert.equal(s.server, "A", "saque restaurado")
})

test("undo reverte o fim da partida", () => {
  const engine = makeEngine({ gamesPerSet: 2, bestOf: 3, tiebreakMode: "advantage" })
  cleanGame(engine, "A")
  cleanGame(engine, "A") // set 1
  cleanGame(engine, "A")
  cleanGame(engine, "A") // set 2 → partida encerrada
  assert.equal(engine.getState().finished, true)

  assert.equal(engine.undo(), true)
  const s = engine.getState()
  assert.equal(s.finished, false, "fim de partida revertido")
  assert.equal(s.winner, undefined, "vencedor limpo")
})

test("undo profundo: sequência de pontos volta ao estado inicial", () => {
  const engine = makeEngine()
  const seq: Side[] = ["A", "B", "A", "A", "B", "A", "B", "B"]
  seq.forEach((s) => engine.pointFor(s))
  // desfaz tudo
  for (let i = 0; i < seq.length; i++) assert.equal(engine.undo(), true)
  const s = engine.getState()
  assert.deepEqual(s.A, { points: 0, games: 0, sets: 0, advantage: false, tiebreakPoints: 0 })
  assert.deepEqual(s.B, { points: 0, games: 0, sets: 0, advantage: false, tiebreakPoints: 0 })
  assert.equal(s.currentSet, 1)
  assert.equal(engine.canUndo(), false)
})

// ---------- Tiebreak de SET no 6-6 (bug do gatilho + regressão de tipo) --------
// Cobre exatamente o bug relatado: no 6-6 o tiebreak de set precisa abrir, contar
// 1-0/2-1..., fechar em 7 com 2 de diferença (seguindo em 7-6, 8-7 quando preciso),
// o set fechar 7-6 e a partida avançar. O super tiebreak sempre funcionou; aqui é
// o tiebreak COMUM de set.

test("tiebreak de set: 6-6 abre tiebreak, conta 1-0/2-1 e fecha 7-6", () => {
  const engine = makeEngine() // gamesPerSet 6, tiebreak 7 by-two, bestOf 3
  // Chega a 6-6 concedendo games alternados (mais rápido; mesmo caminho de winGame).
  for (let i = 0; i < 6; i++) {
    engine.awardGameFor("A")
    engine.awardGameFor("B")
  }
  let s = engine.getState()
  assert.equal(s.isTiebreak, true, "6-6 ENTRA em tiebreak de set")
  assert.equal(s.isSuperTiebreak, false, "é tiebreak comum, não super")
  assert.equal(s.A.games, 6)
  assert.equal(s.B.games, 6)

  // Conta os pontos do tiebreak: 1-0, 2-1...
  score(engine, "A", 1) // 1-0
  score(engine, "B", 1) // 1-1
  score(engine, "A", 1) // 2-1
  s = engine.getState()
  assert.equal(s.A.tiebreakPoints, 2)
  assert.equal(s.B.tiebreakPoints, 1)
  assert.equal(s.isTiebreak, true, "ainda no tiebreak")

  // Fecha em 7 com 2 de diferença. A já tem 2; leva a 7-1.
  const ev = score(engine, "A", 5) // 7-1
  assert.ok(has(ev, "SET"), "tiebreak de 7 fecha o set")
  s = engine.getState()
  assert.equal(s.isTiebreak, false, "tiebreak encerrado")
  assert.equal(s.A.sets, 1, "set contabilizado")
  assert.deepEqual(s.completedSets[0], { set: 1, A: 7, B: 6, tiebreak: true }, "set fecha 7-6")
  assert.equal(s.currentSet, 2, "a partida avança para o próximo set")
})

test("tiebreak de set exige 2 de diferença: 7-6 e 8-7 não fecham; 8-6/9-7 fecham", () => {
  const engine = makeEngine()
  for (let i = 0; i < 6; i++) {
    engine.awardGameFor("A")
    engine.awardGameFor("B")
  }
  assert.equal(engine.getState().isTiebreak, true)

  score(engine, "A", 6) // 6-0
  score(engine, "B", 6) // 6-6
  score(engine, "A", 1) // 7-6 → NÃO fecha (diff 1)
  assert.equal(engine.getState().isTiebreak, true, "7-6 no tiebreak não fecha")
  score(engine, "B", 1) // 7-7
  score(engine, "B", 1) // 7-8 → NÃO fecha (diff 1 do outro lado)
  assert.equal(engine.getState().isTiebreak, true, "8-7 no tiebreak não fecha")
  const ev = score(engine, "B", 1) // 7-9 → fecha (diff 2)
  assert.ok(has(ev, "SET"))
  const s = engine.getState()
  assert.equal(s.isTiebreak, false)
  assert.deepEqual(s.completedSets[0], { set: 1, A: 6, B: 7, tiebreak: true }, "set fecha 6-7 (lado B)")
})

test("REGRESSÃO: gamesPerSet como STRING ('6') ainda abre o tiebreak no 6-6", () => {
  // Reproduz o bug: config vindo como string fazia `me.games === gps` (6 === "6")
  // falhar e o tiebreak NÃO abrir. A coerção Number() no gatilho corrige.
  const engine = makeEngine({ gamesPerSet: "6" as unknown as number })
  for (let i = 0; i < 6; i++) {
    engine.awardGameFor("A")
    engine.awardGameFor("B")
  }
  const s = engine.getState()
  assert.equal(s.isTiebreak, true, "string '6' também dispara o tiebreak de set no 6-6")
  assert.equal(s.A.games, 6)
  assert.equal(s.B.games, 6)
})

// ---------- Modo 'advantage': sem tiebreak, set por vantagem de games ----------

test("modo advantage: 6-6 NÃO fecha; segue 7-6, 8-6 (vantagem de 2 games)", () => {
  const engine = makeEngine({ tiebreakMode: "advantage" })
  for (let i = 0; i < 6; i++) {
    cleanGame(engine, "A")
    cleanGame(engine, "B")
  } // 6-6
  let s = engine.getState()
  assert.equal(s.isTiebreak, false, "advantage: 6-6 NÃO entra em tiebreak")
  assert.equal(s.A.games, 6)
  assert.equal(s.B.games, 6)

  cleanGame(engine, "A") // 7-6 → não fecha (diff 1)
  assert.equal(engine.getState().isTiebreak, false)
  assert.equal(engine.getState().A.sets, 0, "7-6 não fecha o set")

  const ev = cleanGame(engine, "A") // 8-6 → fecha (diff 2)
  assert.ok(has(ev, "SET"), "8-6 fecha o set por vantagem")
  s = engine.getState()
  assert.deepEqual(s.completedSets[0], { set: 1, A: 8, B: 6 }, "set 8-6, SEM flag tiebreak")
})

// ---------- Migração de config legada → tiebreakMode ----------

test("migração: flags legados (tiebreak/superTiebreak) mapeiam para tiebreakMode", () => {
  const tb = { enabled: true, target: 7, mode: "by-two" }
  const sup = { enabled: true, target: 10, mode: "by-two" }
  const off = { enabled: false, target: 7, mode: "by-two" }

  // super ligado → super10 (prioridade, cobre "ambos ligados")
  assert.equal(resolveTiebreakMode({ gamesPerSet: 6, tiebreak: tb, superTiebreak: sup }), "super10")
  assert.equal(resolveTiebreakMode({ gamesPerSet: 6, tiebreak: off, superTiebreak: sup }), "super10")
  // tiebreak ligado e super desligado → tb7
  assert.equal(resolveTiebreakMode({ gamesPerSet: 6, tiebreak: tb, superTiebreak: off }), "tb7")
  // ambos desligados → advantage
  assert.equal(resolveTiebreakMode({ gamesPerSet: 6, tiebreak: off, superTiebreak: off }), "advantage")
  // ausência total → tb7 (tolerante)
  assert.equal(resolveTiebreakMode({ gamesPerSet: 6 }), "tb7")
  // já novo → idempotente
  assert.equal(resolveTiebreakMode({ gamesPerSet: 6, tiebreakMode: "super10" }), "super10")

  // migrateRacketRules injeta o campo (tênis) e é no-op fora da família (sem gamesPerSet)
  assert.equal(migrateRacketRules({ gamesPerSet: 6, tiebreak: tb } as any).tiebreakMode, "tb7")
  const rally = { target: 11, winBy: 2 }
  assert.deepEqual(migrateRacketRules(rally), rally, "rally (sem gamesPerSet) não é tocado")

  // Legado que reproduz o BUG relatado (tiebreak ligado, super desligado) roda
  // no motor via migração e DISPARA o tiebreak no 6-6:
  const legacy = { gamesPerSet: 6, advantage: true, tiebreak: tb, superTiebreak: off, bestOf: 3 }
  const engine = new ScoringEngine(tennisModule, migrateRacketRules(legacy) as unknown as TennisRules)
  for (let i = 0; i < 6; i++) {
    engine.awardGameFor("A")
    engine.awardGameFor("B")
  }
  assert.equal(engine.getState().isTiebreak, true, "config legada migrada → 6-6 entra em tiebreak")
})
