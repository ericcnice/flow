/**
 * Testes do módulo de pickleball (side-out scoring — terceira família).
 *
 * Foco no CORAÇÃO da regra: só o lado que saca marca ponto. Também cobre fechar
 * game (11 por 2), deuce 10-10 → 12-10, fechar partida (melhor de 3) e awardGame.
 *
 * Test runner: nativo do Node (`node:test`). Rode com:  npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { ScoringEngine } from "../engine.ts"
import { pickleballModule } from "../sports/pickleball.ts"
import type { PickleballRules, ScoringEvent, ScoringEventType, Side } from "../types"

// ---------- helpers ----------

function makeEngine(partial?: Partial<PickleballRules>): ScoringEngine<PickleballRules> {
  const rules: PickleballRules = { ...pickleballModule.defaultRules(), ...partial }
  return new ScoringEngine(pickleballModule, rules)
}

/** `side` vence `n` rallies seguidos. Retorna os eventos do último. */
function rally(engine: ScoringEngine<PickleballRules>, side: Side, n = 1): ScoringEvent[] {
  let ev: ScoringEvent[] = []
  for (let i = 0; i < n; i++) ev = engine.pointFor(side)
  return ev
}

function has(events: ScoringEvent[], type: ScoringEventType): boolean {
  return events.some((e) => e.type === type)
}

// ---------- defaults ----------

test("defaultRules refletem o padrão (11, por 2, melhor de 3)", () => {
  const r = pickleballModule.defaultRules()
  assert.equal(r.target, 11)
  assert.equal(r.winBy, 2)
  assert.equal(r.bestOf, 3)
})

// ---------- (a) sacador vence → marca ponto e mantém o saque ----------

test("(a) sacador vence o rally → +1 ponto e mantém o saque", () => {
  const engine = makeEngine() // firstServer A
  assert.equal(engine.getState().server, "A")

  const ev = rally(engine, "A") // A (sacador) vence
  assert.ok(has(ev, "POINT"))
  const s = engine.getState()
  assert.equal(s.A.points, 1, "sacador marca ponto")
  assert.equal(s.server, "A", "sacador mantém o saque")

  rally(engine, "A") // A vence de novo
  assert.equal(engine.getState().A.points, 2)
  assert.equal(engine.getState().server, "A")
})

// ---------- (b) recebedor vence → NENHUM ponto, side out ----------

test("(b) recebedor vence o rally → nenhum ponto, saque passa (side out)", () => {
  const engine = makeEngine() // A saca
  const ev = rally(engine, "B") // B (recebedor) vence

  assert.ok(has(ev, "SIDE_OUT"), "emite SIDE_OUT")
  assert.ok(!has(ev, "POINT"), "recebedor NÃO marca ponto")
  const s = engine.getState()
  assert.equal(s.A.points, 0)
  assert.equal(s.B.points, 0, "placar não sobe para o recebedor")
  assert.equal(s.server, "B", "o saque passa para B")
})

test("recebedor que ganha o saque só pontua depois, já como sacador", () => {
  const engine = makeEngine() // A saca
  rally(engine, "B") // side out → B saca, 0-0
  assert.equal(engine.getState().server, "B")
  assert.equal(engine.getState().B.points, 0)

  const ev = rally(engine, "B") // agora B é sacador e vence → pontua
  assert.ok(has(ev, "POINT"))
  assert.equal(engine.getState().B.points, 1)
  assert.equal(engine.getState().server, "B")
})

// ---------- (c) sequência de side-outs sem ninguém pontuar ----------

test("(c) sequência de side-outs: saque troca sem placar subir", () => {
  const engine = makeEngine() // A saca
  rally(engine, "B") // A sacava, B vence → side out para B
  rally(engine, "A") // B sacava, A vence → side out para A
  rally(engine, "B") // A sacava, B vence → side out para B
  rally(engine, "A") // B sacava, A vence → side out para A

  const s = engine.getState()
  assert.equal(s.A.points, 0, "ninguém pontuou")
  assert.equal(s.B.points, 0)
  assert.equal(s.server, "A", "saque de volta em A após 4 side-outs")
  assert.equal(s.completedSets.length, 0)
})

// ---------- (d) fechar game em 11 por 2 ----------

test("(d) fecha game em 11-9 (só o sacador pontua)", () => {
  const engine = makeEngine() // A saca e mantém o saque enquanto vence
  rally(engine, "A", 10) // 10-0 (A sacando o tempo todo)
  assert.equal(engine.getState().A.points, 10)

  // B precisa do saque para pontuar: side out, depois marca 9.
  rally(engine, "B") // side out → B saca (10-0)
  rally(engine, "B", 9) // B marca até 10-9
  assert.equal(engine.getState().B.points, 9)
  assert.equal(engine.getState().completedSets.length, 0, "10-9 não fecha")

  // Side out de volta para A, que fecha em 11-9.
  rally(engine, "A") // side out → A saca (10-9)
  const ev = rally(engine, "A") // A marca → 11-9 → fecha
  assert.ok(has(ev, "GAME"))
  const s = engine.getState()
  assert.equal(s.A.games, 1)
  assert.deepEqual(s.completedSets[0], { set: 1, A: 11, B: 9 })
  assert.equal(s.finished, false)
})

// ---------- (e) deuce 10-10 → 12-10 ----------

test("(e) deuce em 10-10 → 12-10 fecha", () => {
  const engine = makeEngine()
  rally(engine, "A", 10) // 10-0
  rally(engine, "B") // side out → B saca
  rally(engine, "B", 10) // B a 10 → 10-10 (o 10º ponto de B emite deuce)

  // confirma o deuce no ponto que igualou
  const s1 = engine.getState()
  assert.equal(s1.A.points, 10)
  assert.equal(s1.B.points, 10)

  rally(engine, "A") // side out → A saca (ainda 10-10)
  rally(engine, "A") // A marca → 11-10 (não fecha)
  assert.equal(engine.getState().completedSets.length, 0)
  const ev = rally(engine, "A") // 12-10 → fecha
  assert.ok(has(ev, "GAME"))
  assert.deepEqual(engine.getState().completedSets[0], { set: 1, A: 12, B: 10 })
})

test("emite DEUCE ao igualar em 10-10", () => {
  const engine = makeEngine()
  rally(engine, "A", 10) // 10-0
  rally(engine, "B") // side out
  rally(engine, "B", 9) // 10-9
  const ev = rally(engine, "B") // 10-10 → deuce
  assert.ok(has(ev, "DEUCE"))
  assert.equal(ev.find((e) => e.type === "DEUCE")?.detail, "10-10")
})

// ---------- (f) fechar partida melhor de 3 ----------

test("(f) fecha a partida em melhor de 3 (2 games)", () => {
  const engine = makeEngine()
  // game 1: A saca e vence 11-0 (mantém saque o tempo todo)
  rally(engine, "A", 11)
  assert.equal(engine.getState().A.games, 1)
  assert.equal(engine.getState().server, "A", "saque reinicia no firstServer")

  // game 2: A de novo 11-0
  const ev = rally(engine, "A", 11)
  assert.ok(has(ev, "MATCH"))
  const s = engine.getState()
  assert.equal(s.finished, true)
  assert.equal(s.winner, "A")
  assert.equal(s.A.games, 2)
})

// ---------- (g) awardGame concede game direto ----------

test("(g) awardGame concede um game direto ao lado", () => {
  const engine = makeEngine()
  const ev = engine.awardGameFor("B")
  assert.ok(has(ev, "GAME"))
  const s = engine.getState()
  assert.equal(s.B.games, 1)
  assert.equal(s.B.points, 0)
  assert.deepEqual(s.completedSets[0], { set: 1, A: 0, B: 11 })
})

test("awardGame concede games até fechar a partida (melhor de 3)", () => {
  const engine = makeEngine()
  engine.awardGameFor("A")
  assert.equal(engine.getState().finished, false)
  const ev = engine.awardGameFor("A") // 2º game → partida
  assert.ok(has(ev, "MATCH"))
  assert.equal(engine.getState().winner, "A")
})

test("undo reverte um side out e um ponto", () => {
  const engine = makeEngine() // A saca
  rally(engine, "A") // 1-0, A saca
  rally(engine, "B") // side out → B saca, 1-0
  assert.equal(engine.getState().server, "B")

  assert.equal(engine.undo(), true) // desfaz o side out
  assert.equal(engine.getState().server, "A", "saque volta para A")
  assert.equal(engine.getState().A.points, 1)

  assert.equal(engine.undo(), true) // desfaz o ponto de A
  assert.equal(engine.getState().A.points, 0)
})
