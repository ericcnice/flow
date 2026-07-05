/**
 * Testes do módulo de padel.
 *
 * Foco no que é próprio do padel: o ponto de ouro (golden point) no 40-40 e o
 * toggle para vantagem tradicional. A mecânica compartilhada (games, sets,
 * tiebreak, super tiebreak, awardGame, undo) já é coberta pelos testes de
 * tênis/beach — que exercitam o mesmo racket-core.
 *
 * Test runner: nativo do Node (`node:test`). Rode com:  npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { ScoringEngine } from "../engine.ts"
import { padelModule } from "../sports/padel.ts"
import type { PadelRules, ScoringEvent, ScoringEventType, Side } from "../types"

// ---------- helpers (mesmo estilo dos demais testes) ----------

function makeEngine(partial?: Partial<PadelRules>): ScoringEngine<PadelRules> {
  const rules: PadelRules = { ...padelModule.defaultRules(), ...partial }
  return new ScoringEngine(padelModule, rules)
}

function score(engine: ScoringEngine<PadelRules>, side: Side, n = 1): ScoringEvent[] {
  let ev: ScoringEvent[] = []
  for (let i = 0; i < n; i++) ev = engine.pointFor(side)
  return ev
}

function cleanGame(engine: ScoringEngine<PadelRules>, side: Side): ScoringEvent[] {
  return score(engine, side, 4)
}

function has(events: ScoringEvent[], type: ScoringEventType): boolean {
  return events.some((e) => e.type === type)
}

// ---------- defaults do esporte ----------

test("defaultRules refletem o padrão real do padel", () => {
  const r = padelModule.defaultRules()
  assert.equal(r.gamesPerSet, 6)
  assert.equal(r.goldenPoint, true, "golden point ligado por padrão")
  assert.equal(r.tiebreak.enabled, true)
  assert.equal(r.superTiebreak.enabled, false)
  assert.equal(r.bestOf, 3)
})

// ---------- 1) Golden point (padrão) ----------

test("golden point (padrão): 40-40 → próximo ponto fecha o game, sem vantagem", () => {
  const engine = makeEngine()

  score(engine, "A", 3) // 40-0
  const evDeuce = score(engine, "B", 3) // 40-40
  assert.ok(has(evDeuce, "DEUCE"))
  let s = engine.getState()
  assert.equal(s.A.points, 3)
  assert.equal(s.B.points, 3)

  const ev = engine.pointFor("A") // ponto de ouro
  assert.ok(has(ev, "GAME"), "o próximo ponto no 40-40 fecha o game")
  assert.ok(!has(ev, "ADVANTAGE"), "golden point não passa por vantagem")

  s = engine.getState()
  assert.equal(s.A.games, 1)
  assert.equal(s.A.advantage, false)
  assert.equal(s.B.advantage, false)
  assert.equal(s.A.points, 0)
})

test("golden point: o outro lado também decide no ponto seco", () => {
  const engine = makeEngine()
  score(engine, "A", 3) // 40-0
  score(engine, "B", 3) // 40-40
  const ev = engine.pointFor("B") // B leva o ponto de ouro
  assert.ok(has(ev, "GAME"))
  assert.equal(engine.getState().B.games, 1)
})

// ---------- 2) Golden point desligado → vantagem tradicional ----------

test("golden point desligado: 40-40 vira deuce/vantagem tradicional (toggle)", () => {
  const engine = makeEngine({ goldenPoint: false })

  score(engine, "A", 3) // 40-0
  score(engine, "B", 3) // 40-40
  assert.equal(engine.getState().A.advantage, false)

  let ev = engine.pointFor("A") // vantagem A (NÃO fecha o game)
  assert.ok(has(ev, "ADVANTAGE"), "sem golden point, o ponto no deuce dá AD")
  assert.ok(!has(ev, "GAME"))
  assert.equal(engine.getState().A.advantage, true)
  assert.equal(engine.getState().A.games, 0)

  ev = engine.pointFor("B") // volta a deuce
  assert.ok(has(ev, "DEUCE"))
  assert.equal(engine.getState().A.advantage, false)

  engine.pointFor("A") // vantagem A de novo
  ev = engine.pointFor("A") // agora fecha
  assert.ok(has(ev, "GAME"))
  assert.equal(engine.getState().A.games, 1)
})

// ---------- 3) Set fechando normalmente ----------

test("set fecha normalmente em 6-0", () => {
  const engine = makeEngine()
  let ev: ScoringEvent[] = []
  for (let i = 0; i < 6; i++) ev = cleanGame(engine, "A")

  assert.ok(has(ev, "SET"))
  const s = engine.getState()
  assert.equal(s.A.sets, 1)
  assert.equal(s.currentSet, 2)
  assert.deepEqual(s.completedSets[0], { set: 1, A: 6, B: 0 })
  assert.equal(s.finished, false, "melhor de 3: partida não acabou")
})

test("set fecha em 7-5 (2 de diferença após 5-5)", () => {
  const engine = makeEngine()
  for (let i = 0; i < 5; i++) {
    cleanGame(engine, "A")
    cleanGame(engine, "B")
  }
  cleanGame(engine, "A") // 6-5
  assert.equal(engine.getState().completedSets.length, 0)
  const ev = cleanGame(engine, "A") // 7-5
  assert.ok(has(ev, "SET"))
  assert.deepEqual(engine.getState().completedSets[0], { set: 1, A: 7, B: 5 })
})

// ---------- 4) Granularidade e tiebreak também valem no padel ----------

test("awardGame concede game direto no padel (via racket-core)", () => {
  const engine = makeEngine()
  let ev: ScoringEvent[] = []
  for (let i = 0; i < 6; i++) ev = engine.awardGameFor("A")
  assert.ok(has(ev, "SET"))
  assert.equal(engine.getState().A.sets, 1)
})

test("tiebreak em 6-6 no padel", () => {
  const engine = makeEngine()
  for (let i = 0; i < 5; i++) {
    cleanGame(engine, "A")
    cleanGame(engine, "B")
  }
  cleanGame(engine, "A") // 6-5
  const evTb = cleanGame(engine, "B") // 6-6 → tiebreak
  assert.ok(has(evTb, "TIEBREAK_START"))
  assert.equal(engine.getState().isTiebreak, true)

  const ev = score(engine, "A", 7) // 7-0 fecha
  assert.ok(has(ev, "SET"))
  assert.deepEqual(engine.getState().completedSets[0], { set: 1, A: 7, B: 6, tiebreak: true })
})
