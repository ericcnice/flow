/**
 * Testes do módulo de squash (rally scoring / PARS).
 *
 * Cobre a mecânica própria do squash: fechar game em 11 por 2, deuce em 10-10
 * indo a 12-10, fechar a partida em melhor de 5 (3 games), conceder game direto
 * via awardGame e o formato alternativo de 15 pontos.
 *
 * Test runner: nativo do Node (`node:test`). Rode com:  npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { ScoringEngine } from "../engine.ts"
import { squashModule } from "../sports/squash.ts"
import type { ScoringEvent, ScoringEventType, Side, SquashRules } from "../types"

// ---------- helpers (mesmo estilo dos demais testes) ----------

function makeEngine(partial?: Partial<SquashRules>): ScoringEngine<SquashRules> {
  const rules: SquashRules = { ...squashModule.defaultRules(), ...partial }
  return new ScoringEngine(squashModule, rules)
}

function score(engine: ScoringEngine<SquashRules>, side: Side, n = 1): ScoringEvent[] {
  let ev: ScoringEvent[] = []
  for (let i = 0; i < n; i++) ev = engine.pointFor(side)
  return ev
}

function has(events: ScoringEvent[], type: ScoringEventType): boolean {
  return events.some((e) => e.type === type)
}

// ---------- defaults ----------

test("defaultRules refletem o PARS moderno", () => {
  const r = squashModule.defaultRules()
  assert.equal(r.target, 11)
  assert.equal(r.winBy, 2)
  assert.equal(r.bestOf, 5)
})

// ---------- rally scoring básico ----------

test("cada rally marca 1 ponto para o vencedor (contagem corrida)", () => {
  const engine = makeEngine()
  const ev = score(engine, "A")
  assert.ok(has(ev, "POINT"))
  assert.equal(ev[0].detail, "1-0")
  const s = engine.getState()
  assert.equal(s.A.points, 1)
  assert.equal(s.A.games, 0)
  assert.equal(s.A.sets, 0, "squash não usa sets (campo inerte)")
  assert.equal(s.isTiebreak, false)
})

// ---------- 1) Fechar game em 11 por 2 (11-9) ----------

test("fecha game em 11-9 (11 por 2)", () => {
  const engine = makeEngine()
  score(engine, "A", 10) // 10-0
  score(engine, "B", 9) // 10-9
  assert.equal(engine.getState().completedSets.length, 0, "10-9 não fecha")

  const ev = score(engine, "A", 1) // 11-9 → fecha (diff 2)
  assert.ok(has(ev, "GAME"))
  const s = engine.getState()
  assert.equal(s.A.games, 1)
  assert.equal(s.A.points, 0, "contagem corrida zera no novo game")
  assert.equal(s.B.points, 0)
  assert.equal(s.currentSet, 2, "avança para o game 2")
  assert.deepEqual(s.completedSets[0], { set: 1, A: 11, B: 9 })
  assert.equal(s.finished, false)
})

test("10-10 não fecha (precisa de 2 de diferença)", () => {
  const engine = makeEngine()
  score(engine, "A", 10)
  const ev = score(engine, "B", 10) // 10-10
  assert.ok(has(ev, "DEUCE"), "10-10 emite deuce")
  assert.equal(engine.getState().completedSets.length, 0)

  score(engine, "A", 1) // 11-10 → ainda não (diff 1)
  assert.equal(engine.getState().completedSets.length, 0)
  assert.equal(engine.getState().A.points, 11)
})

// ---------- 2) Deuce em 10-10 indo a 12-10 ----------

test("deuce em 10-10 → 12-10 fecha", () => {
  const engine = makeEngine()
  score(engine, "A", 10) // 10-0
  const evDeuce = score(engine, "B", 10) // 10-10
  assert.ok(has(evDeuce, "DEUCE"))
  assert.equal(evDeuce.find((e) => e.type === "DEUCE")?.detail, "10-10")

  score(engine, "A", 1) // 11-10 (não fecha)
  const ev = score(engine, "A", 1) // 12-10 → fecha
  assert.ok(has(ev, "GAME"))
  const s = engine.getState()
  assert.equal(s.A.games, 1)
  assert.deepEqual(s.completedSets[0], { set: 1, A: 12, B: 10 })
})

// ---------- 3) Fechar a partida em melhor de 5 (3 games) ----------

/** Vence um game "limpo" (target a 0) para `side`. */
function cleanGame(engine: ScoringEngine<SquashRules>, side: Side, target = 11): ScoringEvent[] {
  return score(engine, side, target) // target pontos seguidos = target-0
}

test("fecha a partida em melhor de 5 ao chegar a 3 games", () => {
  const engine = makeEngine() // bestOf 5
  cleanGame(engine, "A") // game 1 (11-0)
  cleanGame(engine, "A") // game 2
  assert.equal(engine.getState().finished, false, "2 games ainda não fecha")

  const ev = cleanGame(engine, "A") // game 3 → partida
  assert.ok(has(ev, "MATCH"))
  const s = engine.getState()
  assert.equal(s.finished, true)
  assert.equal(s.winner, "A")
  assert.equal(s.A.games, 3)
})

test("melhor de 3 fecha em 2 games (configurável)", () => {
  const engine = makeEngine({ bestOf: 3 })
  cleanGame(engine, "A")
  const ev = cleanGame(engine, "A") // 2 games → partida
  assert.ok(has(ev, "MATCH"))
  assert.equal(engine.getState().winner, "A")
  assert.equal(engine.getState().A.games, 2)
})

// ---------- 4) Conceder game direto via awardGame ----------

test("awardGame concede um game direto ao lado", () => {
  const engine = makeEngine()
  const ev = engine.awardGameFor("A")
  assert.ok(has(ev, "GAME"))
  const s = engine.getState()
  assert.equal(s.A.games, 1)
  assert.equal(s.A.points, 0, "contagem corrida zerada")
  assert.deepEqual(s.completedSets[0], { set: 1, A: 11, B: 0 }, "registra vitória válida")
})

test("awardGame concede games até fechar a partida (melhor de 5)", () => {
  const engine = makeEngine()
  engine.awardGameFor("A")
  engine.awardGameFor("A")
  assert.equal(engine.getState().finished, false)
  const ev = engine.awardGameFor("A") // 3º game → partida
  assert.ok(has(ev, "MATCH"))
  assert.equal(engine.getState().finished, true)
  assert.equal(engine.getState().winner, "A")
})

test("awardGame após pontos em curso registra placar de vitória coerente", () => {
  const engine = makeEngine()
  score(engine, "B", 9) // 0-9 no game em curso
  const ev = engine.awardGameFor("A") // concede a A
  assert.ok(has(ev, "GAME"))
  // A premiado deve superar B por winBy: max(11, 9+2) = 11
  assert.deepEqual(engine.getState().completedSets[0], { set: 1, A: 11, B: 9 })
})

test("undo reverte um game concedido no squash", () => {
  const engine = makeEngine()
  engine.awardGameFor("A")
  assert.equal(engine.getState().A.games, 1)
  assert.equal(engine.undo(), true)
  const s = engine.getState()
  assert.equal(s.A.games, 0, "game revertido")
  assert.equal(s.completedSets.length, 0)
  assert.equal(s.currentSet, 1)
})

// ---------- 5) Formato alternativo de 15 pontos ----------

test("formato de 15 pontos: game vai até 15", () => {
  const engine = makeEngine({ target: 15 })
  score(engine, "A", 11) // 11-0 — NÃO fecha (alvo é 15)
  assert.equal(engine.getState().completedSets.length, 0)
  assert.equal(engine.getState().A.points, 11)

  score(engine, "A", 3) // 14-0
  score(engine, "B", 13) // 14-13
  assert.equal(engine.getState().completedSets.length, 0, "14-13 não fecha")

  const ev = score(engine, "A", 1) // 15-13 → fecha
  assert.ok(has(ev, "GAME"))
  assert.deepEqual(engine.getState().completedSets[0], { set: 1, A: 15, B: 13 })
})
