/**
 * Testes do FORMATO PADRÃO por esporte (defaultGameTypeFor).
 *
 * POR QUE EXISTEM: o padrão é lido em TRÊS portas independentes — a jornada de
 * QR (club-opening), a tela de setup (sport-setup) e o join de link antigo
 * (/jogo). Não há uma tela só onde conferir, e a validação deste projeto é por
 * teste e build, nunca por navegador. Estes testes SÃO o QA dos itens 1 a 5.
 *
 * ⚠️ O que NÃO se testa aqui, porque não é o que este mapa faz: nada trava o
 * formato. O toggle Simples/Duplas segue editável em todos os esportes, e o
 * motor não consulta este campo — ver a nota em SportMeta.defaultGameType.
 *
 * Runner: node:test via TSX (alias `@/`). Rodar:  npm run test:catalog
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { SPORTS, defaultGameTypeFor } from "@/lib/sports-catalog"

test("um contra um: squash, ping pong e tênis abrem em SIMPLES", () => {
  assert.equal(defaultGameTypeFor("squash"), "simples")
  assert.equal(defaultGameTypeFor("tabletennis"), "simples")
  assert.equal(defaultGameTypeFor("tennis"), "simples")
})

test("quatro em quadra: beach, padel e pickleball abrem em DUPLAS", () => {
  assert.equal(defaultGameTypeFor("beach"), "duplas")
  assert.equal(defaultGameTypeFor("padel"), "duplas")
  assert.equal(defaultGameTypeFor("pickleball"), "duplas")
})

/**
 * A armadilha registrada no CLAUDE.md: o SLUG de URL ('pingpong') não é o ID
 * canônico ('tabletennis'). Passar o slug aqui cairia no fallback (tênis) sem
 * erro nenhum — e só 'squash' acertaria, por coincidência de nome.
 */
test("id desconhecido cai no fallback do catálogo, sem quebrar", () => {
  assert.equal(defaultGameTypeFor("pingpong"), defaultGameTypeFor("tennis"))
  assert.equal(defaultGameTypeFor("naoexiste"), defaultGameTypeFor("tennis"))
  assert.equal(defaultGameTypeFor(null), defaultGameTypeFor("tennis"))
  assert.equal(defaultGameTypeFor(undefined), defaultGameTypeFor("tennis"))
})

test("TODO esporte do catálogo declara um formato padrão válido", () => {
  // Guarda para o futuro: esporte novo entra no catálogo sem o campo e o
  // TypeScript pega — mas se alguém escrever qualquer string, isto pega também.
  for (const s of SPORTS) {
    assert.ok(
      s.defaultGameType === "simples" || s.defaultGameType === "duplas",
      `${s.id} tem defaultGameType inválido: ${s.defaultGameType}`,
    )
  }
})
