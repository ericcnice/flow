/**
 * Testes do módulo de beach tennis.
 *
 * Foco no que DIFERE do tênis: no-ad por padrão (ponto de ouro), formato de
 * 4 games, tiebreak em 4-4, e o toggle de vantagem. A mecânica compartilhada
 * (0/15/30/40, sets, super tiebreak, undo) já é coberta pelos testes de tênis.
 *
 * Test runner: nativo do Node (`node:test`). Rode com:  npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { ScoringEngine } from "../engine.ts"
import { beachModule } from "../sports/beach.ts"
import type { BeachRules, ScoringEvent, ScoringEventType, Side } from "../types"

// ---------- helpers (mesmo estilo dos testes de tênis) ----------

function makeEngine(partial?: Partial<BeachRules>): ScoringEngine<BeachRules> {
  const rules: BeachRules = { ...beachModule.defaultRules(), ...partial }
  return new ScoringEngine(beachModule, rules)
}

function score(engine: ScoringEngine<BeachRules>, side: Side, n = 1): ScoringEvent[] {
  let ev: ScoringEvent[] = []
  for (let i = 0; i < n; i++) ev = engine.pointFor(side)
  return ev
}

/** Vence um game "limpo" (4 pontos) para `side`, assumindo 0-0 no game. */
function cleanGame(engine: ScoringEngine<BeachRules>, side: Side): ScoringEvent[] {
  return score(engine, side, 4)
}

function has(events: ScoringEvent[], type: ScoringEventType): boolean {
  return events.some((e) => e.type === type)
}

// ---------- defaults do esporte ----------

test("defaultRules refletem o padrão real do beach", () => {
  const r = beachModule.defaultRules()
  assert.equal(r.gamesPerSet, 6)
  assert.equal(r.advantage, false, "no-ad por padrão")
  assert.equal(r.tiebreakMode, "tb7", "desempate padrão = tiebreak de 7")
  assert.equal(r.bestOf, 3)
})

// ---------- 1) No-ad: ponto de ouro no 40-40 ----------

test("no-ad (padrão): 40-40 → próximo ponto fecha o game, sem vantagem", () => {
  const engine = makeEngine()

  score(engine, "A", 3) // 40-0
  const evDeuce = score(engine, "B", 3) // 40-40
  assert.ok(has(evDeuce, "DEUCE"))
  let s = engine.getState()
  assert.equal(s.A.points, 3)
  assert.equal(s.B.points, 3)

  const ev = engine.pointFor("A") // ponto de ouro
  assert.ok(has(ev, "GAME"), "próximo ponto no 40-40 fecha o game")
  assert.ok(!has(ev, "ADVANTAGE"), "no-ad não passa por vantagem")

  s = engine.getState()
  assert.equal(s.A.games, 1)
  assert.equal(s.A.advantage, false)
  assert.equal(s.B.advantage, false)
  assert.equal(s.A.points, 0, "pontos zerados após o game")
})

test("no-ad: o outro lado também fecha no ponto de ouro", () => {
  const engine = makeEngine()
  score(engine, "A", 3) // 40-0
  score(engine, "B", 3) // 40-40
  const ev = engine.pointFor("B") // B leva o ponto de ouro
  assert.ok(has(ev, "GAME"))
  assert.equal(engine.getState().B.games, 1)
})

// ---------- 2) Formato de 4 games ----------

test("formato de 4 games: set fecha em 4 com 2 de diferença", () => {
  const engine = makeEngine({ gamesPerSet: 4 })

  cleanGame(engine, "A") // 1-0
  cleanGame(engine, "A") // 2-0
  cleanGame(engine, "A") // 3-0
  assert.equal(engine.getState().completedSets.length, 0, "3-0 ainda não fecha")

  const ev = cleanGame(engine, "A") // 4-0 → fecha
  assert.ok(has(ev, "SET"))
  const s = engine.getState()
  assert.equal(s.A.sets, 1)
  assert.deepEqual(s.completedSets[0], { set: 1, A: 4, B: 0 })
  assert.equal(s.currentSet, 2)
})

test("formato de 4 games: 4-3 NÃO fecha (precisa de 2 de diferença) → vai a 5-3", () => {
  const engine = makeEngine({ gamesPerSet: 4 })
  // chega a 3-3
  for (let i = 0; i < 3; i++) {
    cleanGame(engine, "A")
    cleanGame(engine, "B")
  }
  cleanGame(engine, "A") // 4-3
  assert.equal(engine.getState().completedSets.length, 0, "4-3 não fecha")
  assert.equal(engine.getState().A.games, 4)

  const ev = cleanGame(engine, "A") // 5-3 → fecha (diff 2)
  assert.ok(has(ev, "SET"))
  assert.deepEqual(engine.getState().completedSets[0], { set: 1, A: 5, B: 3 })
})

// ---------- 3) Tiebreak no formato de 4 games (em 4-4) ----------

test("formato de 4 games: tiebreak dispara em 4-4", () => {
  const engine = makeEngine({ gamesPerSet: 4 })
  // 3-3
  for (let i = 0; i < 3; i++) {
    cleanGame(engine, "A")
    cleanGame(engine, "B")
  }
  cleanGame(engine, "A") // 4-3
  const evTb = cleanGame(engine, "B") // 4-4 → tiebreak
  assert.ok(has(evTb, "TIEBREAK_START"))
  assert.equal(engine.getState().isTiebreak, true)

  // Tiebreak até 7 por 2 (default). A vence 7-0.
  const ev = score(engine, "A", 7)
  assert.ok(has(ev, "SET"))
  const s = engine.getState()
  assert.equal(s.A.sets, 1)
  assert.equal(s.isTiebreak, false)
  assert.deepEqual(s.completedSets[0], { set: 1, A: 5, B: 4, tiebreak: true })
})

// ---------- 4) Toggle de vantagem ligado ----------

test("com vantagem ligada: 40-40 vira deuce/vantagem como no tênis", () => {
  const engine = makeEngine({ advantage: true })

  score(engine, "A", 3) // 40-0
  score(engine, "B", 3) // 40-40
  assert.equal(engine.getState().A.advantage, false)

  let ev = engine.pointFor("A") // vantagem A (NÃO fecha o game)
  assert.ok(has(ev, "ADVANTAGE"), "com vantagem, o ponto no deuce dá AD")
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

// ---------- 5) Modo super10: desempate de 10 no 6-6 (mesma mecânica do tênis) ----

test("modo super10: 6-6 abre tiebreak até 10 (diff 2) e fecha o set 7-6", () => {
  const engine = makeEngine({ tiebreakMode: "super10" })

  for (let i = 0; i < 6; i++) {
    cleanGame(engine, "A")
    cleanGame(engine, "B")
  } // 6-6
  let s = engine.getState()
  assert.equal(s.isTiebreak, true, "6-6 entra em tiebreak")
  assert.equal(s.isSuperTiebreak, true, "modo super10 → super")

  score(engine, "A", 8) // 8-0
  score(engine, "B", 8) // 8-8
  score(engine, "A", 1) // 9-8 → não fecha (precisa 10 e diff 2)
  assert.equal(engine.getState().isTiebreak, true, "9-8 no super10 não fecha")
  score(engine, "A", 1) // 10-8 → fecha
  s = engine.getState()
  assert.equal(s.isTiebreak, false)
  assert.deepEqual(s.completedSets[0], { set: 1, A: 7, B: 6, tiebreak: true }, "set fecha 7-6")
})
