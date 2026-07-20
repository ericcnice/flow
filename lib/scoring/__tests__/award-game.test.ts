/**
 * Testes da granularidade "por game": conceder um game inteiro a um lado
 * (engine.awardGameFor / module.awardGame), pulando a contagem de pontos.
 *
 * Cobre tênis e beach: conceder games até fechar um set, conceder até fechar a
 * partida, o caso do tiebreak (conceder = conceder o tiebreak/set) e o undo
 * revertendo um game concedido. Também confirma que a granularidade convive
 * com pointFor no mesmo estado.
 *
 * Test runner: nativo do Node (`node:test`). Rode com:  npm test
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { ScoringEngine } from "../engine.ts"
import { tennisModule } from "../sports/tennis.ts"
import { beachModule } from "../sports/beach.ts"
import type { BeachRules, ScoringEvent, ScoringEventType, Side, SportModule, TennisRules } from "../types"

function has(events: ScoringEvent[], type: ScoringEventType): boolean {
  return events.some((e) => e.type === type)
}

// ---------- Tênis ----------

test("tênis: conceder games fecha o set (6-0) e emite GAME/SET", () => {
  const engine = new ScoringEngine(tennisModule, tennisModule.defaultRules())

  let ev: ScoringEvent[] = []
  for (let i = 0; i < 6; i++) ev = engine.awardGameFor("A")

  assert.ok(has(ev, "GAME"), "cada concessão emite GAME")
  assert.ok(has(ev, "SET"), "o sexto game fecha o set")
  const s = engine.getState()
  assert.equal(s.A.sets, 1)
  assert.equal(s.A.games, 0, "games zerados no novo set")
  assert.equal(s.currentSet, 2)
  assert.deepEqual(s.completedSets[0], { set: 1, A: 6, B: 0 })
  assert.equal(s.finished, false)
})

test("tênis: conceder games fecha a partida (melhor de 3) e emite MATCH", () => {
  const engine = new ScoringEngine(tennisModule, tennisModule.defaultRules())

  for (let i = 0; i < 6; i++) engine.awardGameFor("A") // set 1
  let ev: ScoringEvent[] = []
  for (let i = 0; i < 6; i++) ev = engine.awardGameFor("A") // set 2 → partida

  assert.ok(has(ev, "MATCH"))
  const s = engine.getState()
  assert.equal(s.finished, true)
  assert.equal(s.winner, "A")
  assert.equal(s.A.sets, 2)
})

test("tênis: conceder game convive com pontos (mistura de granularidade)", () => {
  const engine = new ScoringEngine(tennisModule, tennisModule.defaultRules())

  // Marca 30-15 por pontos e então CONCEDE o game — pontos são descartados.
  engine.pointFor("A")
  engine.pointFor("A")
  engine.pointFor("B")
  assert.equal(engine.getState().A.points, 2)

  const ev = engine.awardGameFor("A")
  assert.ok(has(ev, "GAME"))
  const s = engine.getState()
  assert.equal(s.A.games, 1)
  assert.equal(s.A.points, 0, "pontos em curso zerados ao conceder o game")
  assert.equal(s.B.points, 0)
})

test("tênis: conceder game em tiebreak concede o tiebreak/set", () => {
  const engine = new ScoringEngine(tennisModule, tennisModule.defaultRules())

  // Leva a 6-6 concedendo games alternados → dispara tiebreak.
  for (let i = 0; i < 5; i++) {
    engine.awardGameFor("A")
    engine.awardGameFor("B")
  }
  engine.awardGameFor("A") // 6-5
  engine.awardGameFor("B") // 6-6 → tiebreak
  assert.equal(engine.getState().isTiebreak, true)

  const ev = engine.awardGameFor("A") // concede o tiebreak
  assert.ok(has(ev, "GAME"))
  assert.ok(has(ev, "SET"), "conceder o game no tiebreak fecha o set")
  const s = engine.getState()
  assert.equal(s.A.sets, 1)
  assert.equal(s.isTiebreak, false)
  assert.deepEqual(s.completedSets[0], { set: 1, A: 7, B: 6, tiebreak: true })
})

test("tênis: conceder game em tiebreak super10 (6-6) fecha o set 7-6", () => {
  const engine = new ScoringEngine(tennisModule, {
    ...tennisModule.defaultRules(),
    tiebreakMode: "super10",
  })

  for (let i = 0; i < 6; i++) {
    engine.awardGameFor("A")
    engine.awardGameFor("B")
  } // 6-6 → tiebreak super10
  assert.equal(engine.getState().isTiebreak, true, "6-6 abre tiebreak")
  assert.equal(engine.getState().isSuperTiebreak, true, "modo super10")

  const ev = engine.awardGameFor("A") // concede o tiebreak
  assert.ok(has(ev, "SET"), "conceder o game no tiebreak fecha o set")
  const s = engine.getState()
  assert.equal(s.isTiebreak, false)
  assert.deepEqual(s.completedSets[0], { set: 1, A: 7, B: 6, tiebreak: true })
})

// ---------- Undo ----------

test("undo reverte um game concedido (igual a um ponto)", () => {
  const engine = new ScoringEngine(tennisModule, tennisModule.defaultRules())

  engine.awardGameFor("A") // 1-0
  engine.awardGameFor("A") // 2-0
  assert.equal(engine.getState().A.games, 2)

  assert.equal(engine.undo(), true)
  assert.equal(engine.getState().A.games, 1, "voltou para 1-0")

  assert.equal(engine.undo(), true)
  assert.equal(engine.getState().A.games, 0, "voltou para 0-0")
  assert.equal(engine.canUndo(), false)
})

test("undo reverte o set/partida fechados por concessão de game", () => {
  const engine = new ScoringEngine(tennisModule, tennisModule.defaultRules())

  for (let i = 0; i < 6; i++) engine.awardGameFor("A") // set 1 → 1-0 em sets
  for (let i = 0; i < 6; i++) engine.awardGameFor("A") // set 2 → partida
  assert.equal(engine.getState().finished, true)

  assert.equal(engine.undo(), true) // desfaz o game que fechou a partida
  const s = engine.getState()
  assert.equal(s.finished, false, "fim de partida revertido")
  assert.equal(s.winner, undefined)
  assert.equal(s.A.sets, 1, "volta a 1 set e 5-0 no set 2")
  assert.equal(s.A.games, 5)
})

// ---------- Beach ----------

test("beach: conceder games fecha set no formato de 4 games", () => {
  const rules: BeachRules = { ...beachModule.defaultRules(), gamesPerSet: 4 }
  const engine = new ScoringEngine(beachModule, rules)

  let ev: ScoringEvent[] = []
  for (let i = 0; i < 4; i++) ev = engine.awardGameFor("A") // 4-0 → set

  assert.ok(has(ev, "SET"))
  const s = engine.getState()
  assert.equal(s.A.sets, 1)
  assert.deepEqual(s.completedSets[0], { set: 1, A: 4, B: 0 })
})

test("beach: conceder games fecha a partida (melhor de 3, 4 games)", () => {
  const rules: BeachRules = { ...beachModule.defaultRules(), gamesPerSet: 4 }
  const engine = new ScoringEngine(beachModule, rules)

  for (let i = 0; i < 4; i++) engine.awardGameFor("A") // set 1
  let ev: ScoringEvent[] = []
  for (let i = 0; i < 4; i++) ev = engine.awardGameFor("A") // set 2 → partida

  assert.ok(has(ev, "MATCH"))
  assert.equal(engine.getState().finished, true)
  assert.equal(engine.getState().winner, "A")
})

test("beach: conceder game em tiebreak (4-4) fecha o set", () => {
  const rules: BeachRules = { ...beachModule.defaultRules(), gamesPerSet: 4 }
  const engine = new ScoringEngine(beachModule, rules)

  for (let i = 0; i < 3; i++) {
    engine.awardGameFor("A")
    engine.awardGameFor("B")
  }
  engine.awardGameFor("A") // 4-3
  engine.awardGameFor("B") // 4-4 → tiebreak
  assert.equal(engine.getState().isTiebreak, true)

  const ev = engine.awardGameFor("B") // concede o tiebreak
  assert.ok(has(ev, "SET"))
  const s = engine.getState()
  assert.equal(s.B.sets, 1)
  assert.deepEqual(s.completedSets[0], { set: 1, A: 4, B: 5, tiebreak: true })
})

// ---------- Genérico via SportModule ----------

test("awardGame é parte do contrato SportModule (tênis e beach)", () => {
  const mods: SportModule<TennisRules | BeachRules>[] = [tennisModule, beachModule]
  for (const mod of mods) {
    assert.equal(typeof mod.awardGame, "function", `${mod.id} implementa awardGame`)
    const state = mod.createInitialState(mod.defaultRules(), "A")
    const { state: next, events } = mod.awardGame(state, "A", mod.defaultRules() as never)
    assert.equal(next.A.games, 1)
    assert.ok(has(events, "GAME"))
  }
})

// ---------- Partida encerrada é no-op ----------

test("awardGameFor após o fim é no-op", () => {
  const engine = new ScoringEngine(tennisModule, tennisModule.defaultRules())
  for (let i = 0; i < 6; i++) engine.awardGameFor("A")
  for (let i = 0; i < 6; i++) engine.awardGameFor("A") // partida encerrada
  assert.equal(engine.getState().finished, true)

  const after = engine.awardGameFor("B")
  assert.deepEqual(after, [], "nenhum evento após o fim")
  assert.equal(engine.getState().winner, "A", "vencedor inalterado")
})
