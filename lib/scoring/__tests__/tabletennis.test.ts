/**
 * Testes do módulo de tênis de mesa (rally scoring, mesma família do squash).
 *
 * Cobre: fechar game em 11-9, deuce em 10-10 indo a 12-10, fechar partida em
 * melhor de 5 (3 games), formato melhor de 7 (4 games) e conceder game via
 * awardGame. Toca de leve na troca de saque (best-effort).
 *
 * Test runner: nativo do Node (`node:test`). Rode com:  npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { ScoringEngine } from "../engine.ts"
import { tableTennisModule } from "../sports/tabletennis.ts"
import type { ScoringEvent, ScoringEventType, Side, TableTennisRules } from "../types"

// ---------- helpers (mesmo estilo dos demais testes) ----------

function makeEngine(partial?: Partial<TableTennisRules>): ScoringEngine<TableTennisRules> {
  const rules: TableTennisRules = { ...tableTennisModule.defaultRules(), ...partial }
  return new ScoringEngine(tableTennisModule, rules)
}

function score(engine: ScoringEngine<TableTennisRules>, side: Side, n = 1): ScoringEvent[] {
  let ev: ScoringEvent[] = []
  for (let i = 0; i < n; i++) ev = engine.pointFor(side)
  return ev
}

/** Vence um game "limpo" (target a 0) para `side`. */
function cleanGame(engine: ScoringEngine<TableTennisRules>, side: Side, target = 11): ScoringEvent[] {
  return score(engine, side, target)
}

function has(events: ScoringEvent[], type: ScoringEventType): boolean {
  return events.some((e) => e.type === type)
}

// ---------- defaults ----------

test("defaultRules refletem o padrão real (11, por 2, melhor de 5)", () => {
  const r = tableTennisModule.defaultRules()
  assert.equal(r.target, 11)
  assert.equal(r.winBy, 2)
  assert.equal(r.bestOf, 5)
})

// ---------- 1) Fechar game em 11-9 ----------

test("fecha game em 11-9 (11 por 2)", () => {
  const engine = makeEngine()
  score(engine, "A", 10) // 10-0
  score(engine, "B", 9) // 10-9
  assert.equal(engine.getState().completedSets.length, 0, "10-9 não fecha")

  const ev = score(engine, "A", 1) // 11-9 → fecha
  assert.ok(has(ev, "GAME"))
  const s = engine.getState()
  assert.equal(s.A.games, 1)
  assert.equal(s.A.points, 0, "contagem corrida zera no novo game")
  assert.equal(s.B.points, 0)
  assert.equal(s.currentSet, 2)
  assert.deepEqual(s.completedSets[0], { set: 1, A: 11, B: 9 })
  assert.equal(s.finished, false)
})

// ---------- 2) Deuce em 10-10 indo a 12-10 ----------

test("deuce em 10-10 → 11-10 não fecha → 12-10 fecha", () => {
  const engine = makeEngine()
  score(engine, "A", 10) // 10-0
  const evDeuce = score(engine, "B", 10) // 10-10
  assert.ok(has(evDeuce, "DEUCE"))
  assert.equal(evDeuce.find((e) => e.type === "DEUCE")?.detail, "10-10")

  score(engine, "A", 1) // 11-10 (diff 1, não fecha)
  assert.equal(engine.getState().completedSets.length, 0)

  const ev = score(engine, "A", 1) // 12-10 → fecha
  assert.ok(has(ev, "GAME"))
  assert.deepEqual(engine.getState().completedSets[0], { set: 1, A: 12, B: 10 })
})

// ---------- 3) Fechar partida em melhor de 5 (3 games) ----------

test("fecha a partida em melhor de 5 ao chegar a 3 games", () => {
  const engine = makeEngine() // bestOf 5
  cleanGame(engine, "A") // game 1
  cleanGame(engine, "A") // game 2
  assert.equal(engine.getState().finished, false, "2 games ainda não fecha")

  const ev = cleanGame(engine, "A") // game 3 → partida
  assert.ok(has(ev, "MATCH"))
  const s = engine.getState()
  assert.equal(s.finished, true)
  assert.equal(s.winner, "A")
  assert.equal(s.A.games, 3)
})

// ---------- 4) Formato melhor de 7 (4 games) ----------

test("melhor de 7 fecha em 4 games", () => {
  const engine = makeEngine({ bestOf: 7 })
  for (let i = 0; i < 3; i++) cleanGame(engine, "A")
  assert.equal(engine.getState().finished, false, "3 games não fecha em melhor de 7")

  const ev = cleanGame(engine, "A") // 4º game → partida
  assert.ok(has(ev, "MATCH"))
  const s = engine.getState()
  assert.equal(s.finished, true)
  assert.equal(s.winner, "A")
  assert.equal(s.A.games, 4)
})

// ---------- 5) Conceder game via awardGame ----------

test("awardGame concede um game direto ao lado", () => {
  const engine = makeEngine()
  const ev = engine.awardGameFor("B")
  assert.ok(has(ev, "GAME"))
  const s = engine.getState()
  assert.equal(s.B.games, 1)
  assert.equal(s.B.points, 0)
  assert.deepEqual(s.completedSets[0], { set: 1, A: 0, B: 11 }, "registra vitória válida de B")
})

test("awardGame concede games até fechar a partida (melhor de 5)", () => {
  const engine = makeEngine()
  engine.awardGameFor("A")
  engine.awardGameFor("A")
  assert.equal(engine.getState().finished, false)
  const ev = engine.awardGameFor("A") // 3º game → partida
  assert.ok(has(ev, "MATCH"))
  assert.equal(engine.getState().winner, "A")
})

test("undo reverte um game concedido no tênis de mesa", () => {
  const engine = makeEngine()
  engine.awardGameFor("A")
  assert.equal(engine.getState().A.games, 1)
  assert.equal(engine.undo(), true)
  const s = engine.getState()
  assert.equal(s.A.games, 0)
  assert.equal(s.completedSets.length, 0)
  assert.equal(s.currentSet, 1)
})

// ---------- troca de saque (best-effort) ----------

test("saque troca a cada 2 pontos e a cada 1 no deuce", () => {
  const engine = makeEngine() // firstServer A
  assert.equal(engine.getState().server, "A", "A saca o 1º ponto")

  score(engine, "A", 1) // total 1 → ainda A (bloco 0)
  assert.equal(engine.getState().server, "A")
  score(engine, "A", 1) // total 2 → passa a B
  assert.equal(engine.getState().server, "B")
  score(engine, "A", 1) // total 3 → ainda B
  assert.equal(engine.getState().server, "B")
  score(engine, "A", 1) // total 4 → volta a A
  assert.equal(engine.getState().server, "A")

  // Leva ao deuce 10-10 e confirma alternância a cada ponto.
  score(engine, "A", 6) // A a 10 (total 10)
  score(engine, "B", 10) // B a 10 → 10-10 (total 20, deuce)
  const atDeuce = engine.getState().server
  score(engine, "A", 1) // total 21 → troca
  assert.notEqual(engine.getState().server, atDeuce, "no deuce troca a cada ponto")
})
