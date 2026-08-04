/**
 * Testes do PLACAR-RESUMO do telão (lib/telao-resumo).
 *
 * POR QUE ELES EXISTEM: o resumo dos cartões do carrossel não passa pelo
 * iframe do /placar — ele reexecuta as ações no motor por conta própria. Se a
 * conta divergir, o cartão mostra um placar diferente do palco, NA MESMA TELA,
 * e ninguém confia mais em nenhum dos dois. Como a validação deste projeto é
 * por teste e build (nunca por navegador), estes testes SÃO a conferência.
 *
 * Runner: node:test via TSX (o módulo usa o alias `@/`). Rodar:
 *
 *   npm run test:catalog
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { resumoDoState } from "@/lib/telao-resumo"

/** Uma sala como o banco a devolve: config na raiz, ações em lista. */
function sala(over: Record<string, unknown> = {}) {
  return {
    players: { blue1: "Eric", red1: "Rodrigo" },
    firstServer: "A",
    actions: [],
    ...over,
  }
}

const pontos = (lado: "A" | "B", n: number) =>
  Array.from({ length: n }, () => ({ kind: "point", side: lado }))

test("sala vazia: placar zerado, nomes lidos, saque no primeiro sacador", () => {
  const r = resumoDoState(sala(), "squash")
  assert.ok(r)
  assert.equal(r.A.nome, "Eric")
  assert.equal(r.B.nome, "Rodrigo")
  assert.equal(r.A.ponto, "0")
  assert.equal(r.B.ponto, "0")
  assert.equal(r.A.saca, true)
  assert.equal(r.B.saca, false)
  assert.equal(r.finalizada, false)
})

test("squash: 5 pontos de A e 3 de B aparecem como pontos do game atual", () => {
  const r = resumoDoState(sala({ actions: [...pontos("A", 5), ...pontos("B", 3)] }), "squash")
  assert.ok(r)
  assert.equal(r.A.ponto, "5")
  assert.equal(r.B.ponto, "3")
  assert.equal(r.A.encerradas.length, 0)
})

/**
 * REGRESSÃO de EXIBIÇÃO, e foi este teste que a pegou: fora do tênis a
 * "unidade em andamento" É a contagem de pontos. Se `atual` viesse preenchido,
 * o cartão imprimiria o mesmo número duas vezes ("5 5") — que quem olha de
 * longe leria como um placar.
 */
test("rally (squash): a unidade em andamento é null para não repetir o ponto", () => {
  const r = resumoDoState(sala({ actions: pontos("A", 5) }), "squash")
  assert.ok(r)
  assert.equal(r.A.atual, null)
  assert.equal(r.A.ponto, "5")
})

test("squash: game fechado em 11 vira unidade ENCERRADA e o placar reinicia", () => {
  const r = resumoDoState(sala({ actions: pontos("A", 11) }), "squash")
  assert.ok(r)
  // 11, e não 1: no rally o motor guarda o PLACAR do game encerrado, não a
  // contagem de games. O cartão mostra o que o motor guardou.
  assert.deepEqual(r.A.encerradas, [11])
  assert.deepEqual(r.B.encerradas, [0])
  // O game novo começa do zero — se isto quebrar, o cartão somaria games.
  assert.equal(r.A.ponto, "0")
  assert.equal(r.B.ponto, "0")
})

test("tênis: pontos viram 15/30/40, não 1/2/3", () => {
  const r = resumoDoState(sala({ actions: [...pontos("A", 2), ...pontos("B", 1)] }), "tennis")
  assert.ok(r)
  assert.equal(r.A.ponto, "30")
  assert.equal(r.B.ponto, "15")
})

test("tênis: game vencido conta na UNIDADE ATUAL (games do set), não em encerradas", () => {
  const r = resumoDoState(sala({ actions: pontos("A", 4) }), "tennis")
  assert.ok(r)
  assert.equal(r.A.atual, 1) // 1 game no set em andamento
  assert.deepEqual(r.A.encerradas, []) // nenhum SET encerrado ainda
  assert.equal(r.A.ponto, "0")
})

test("tênis: vantagem aparece como AD", () => {
  // 3 pontos cada = 40-40; mais um de A = vantagem de A.
  const r = resumoDoState(
    sala({ actions: [...pontos("A", 3), ...pontos("B", 3), ...pontos("A", 1)] }),
    "tennis",
  )
  assert.ok(r)
  assert.equal(r.A.ponto, "AD")
})

test("partida encerrada: marca o vencedor e ninguém fica sacando", () => {
  // Squash padrão: melhor de 5, games de 11 → 3 games (33 pontos) fecham.
  // Sem `rules` no state, de propósito: mandar um objeto PARCIAL substituiria
  // as regras inteiras e o esporte jogaria com alvo indefinido.
  const r = resumoDoState(sala({ actions: pontos("A", 33) }), "squash")
  assert.ok(r)
  assert.equal(r.finalizada, true)
  assert.equal(r.A.venceu, true)
  assert.equal(r.B.venceu, false)
  assert.equal(r.A.saca, false)
  assert.equal(r.B.saca, false)
})

test("ação de GAME concedido é reexecutada como concessão, não ignorada", () => {
  const r = resumoDoState(sala({ actions: [{ kind: "game", side: "A" }] }), "squash")
  assert.ok(r)
  // O game concedido entra com o placar cheio (11), igual ao motor faz — se a
  // ação fosse ignorada, `encerradas` viria vazio.
  assert.deepEqual(r.A.encerradas, [11])
})

test("lixo no state não derruba: ações inválidas são descartadas", () => {
  const r = resumoDoState(
    sala({ actions: [{ kind: "sabotagem" }, null, 42, { kind: "point", side: "A" }] }),
    "squash",
  )
  assert.ok(r)
  assert.equal(r.A.ponto, "1")
})

test("sem nomes no state, cai nos rótulos genéricos em vez de vazio", () => {
  const r = resumoDoState(sala({ players: {} }), "squash")
  assert.ok(r)
  assert.equal(r.A.nome, "Jogador 1")
  assert.equal(r.B.nome, "Jogador 2")
})

test("state ausente ou não-objeto devolve null (o cartão mostra 'Sem partida')", () => {
  assert.equal(resumoDoState(null, "squash"), null)
  assert.equal(resumoDoState(undefined, "squash"), null)
  assert.equal(resumoDoState("nada", "squash"), null)
})

test("firstServer 'B' é respeitado — o saque não nasce sempre em A", () => {
  const r = resumoDoState(sala({ firstServer: "B" }), "squash")
  assert.ok(r)
  assert.equal(r.B.saca, true)
  assert.equal(r.A.saca, false)
})
