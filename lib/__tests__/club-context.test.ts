/**
 * Testes da resolução em UNIÃO COM PISO (Fatia 3b) — resolveClubContextLayered.
 *
 * Runner: node:test, mas rodado via TSX (não `node --test`), porque este módulo
 * importa lib/clubs-config, que usa o alias `@/` (o `node --test` puro dos 78
 * testes de scoring não resolve aliases; o scoring é todo relativo). Rodar:
 *
 *   npm run test:catalog
 *
 * `import type` do ClubCatalog é apagado em runtime → NÃO puxa o supabase (que
 * exigiria env). A resolução em si é pura e síncrona (o catálogo entra por arg).
 */

import { test } from "node:test"
import assert from "node:assert/strict"

import { resolveClubContextLayered } from "@/lib/club-context"
import type { ClubCatalog } from "@/lib/supabase/club-catalog"
import type { SportId } from "@/lib/sports-catalog"

// Clube NOVO (não está no bundle CLUBS) — só existe no "catálogo do banco".
const newclub: ClubCatalog = {
  slug: "newclub",
  nome: "New Club",
  logoUrl: "https://x.supabase.co/storage/v1/object/public/logos/new.png",
  esportes: ["padel", "pickleball"] as SportId[],
  quadrasPorEsporte: { padel: ["q1", "q2"], pickleball: ["q1"] },
}

// Catálogo do SPAC (que TAMBÉM está no bundle) — para o teste de precedência.
const spacCat: ClubCatalog = {
  slug: "spac",
  nome: "SPAC",
  logoUrl: "https://x.supabase.co/storage/v1/object/public/logos/spac.png",
  esportes: ["beach"] as SportId[],
  quadrasPorEsporte: { beach: ["q1", "q2"] },
}

test("bundle-only: SPAC resolve pelo piso, sem catálogo", () => {
  const { ctx, logoCascade } = resolveClubContextLayered("spac", "beachtennis", "q1", { catalog: null })
  assert.ok(ctx)
  assert.equal(ctx!.club.id, "spac")
  assert.equal(ctx!.sportId, "beach")
  assert.equal(ctx!.quadra, "q1")
  // Sem catálogo → cascata só com o logo do bundle.
  assert.deepEqual(logoCascade, ["/spac.png"])
})

test("cache-only: clube NOVO resolve pelo catálogo (não está no bundle)", () => {
  const { ctx, logoCascade } = resolveClubContextLayered("newclub", "padel", "q1", { catalog: newclub })
  assert.ok(ctx)
  assert.equal(ctx!.club.id, "newclub")
  assert.equal(ctx!.sportId, "padel")
  assert.equal(ctx!.quadra, "q1")
  // Clube fora do bundle → cascata só com o logo do banco.
  assert.deepEqual(logoCascade, [newclub.logoUrl])
})

test("ambos presentes: o BUNDLE vence (piso), catálogo não sobrescreve", () => {
  const { ctx, logoCascade } = resolveClubContextLayered("spac", "beachtennis", "q1", { catalog: spacCat })
  assert.ok(ctx)
  assert.equal(ctx!.club.id, "spac")
  // Logo em cascata: banco PRIMEIRO, path do bundle como PISO.
  assert.deepEqual(logoCascade, [spacCat.logoUrl, "/spac.png"])
})

test("nenhum reconhece → null (clube desconhecido, sem catálogo)", () => {
  const { ctx, logoCascade } = resolveClubContextLayered("naoexiste", "tenis", "q1", { catalog: null })
  assert.equal(ctx, null)
  assert.deepEqual(logoCascade, [])
})

test("cache ausente/corrompido (catalog null) → cai no bundle (piso protege o QR)", () => {
  // readClubCache devolve null p/ entrada corrompida → catalog null. O SPAC segue
  // resolvendo pelo bundle (idêntico a hoje).
  const { ctx } = resolveClubContextLayered("spac", "tenis", "q1-saibro", { catalog: null })
  assert.ok(ctx)
  assert.equal(ctx!.sportId, "tennis")
  assert.equal(ctx!.quadra, "q1-saibro")
  // E um clube NOVO sem catálogo NÃO resolve (nada no piso).
  assert.equal(resolveClubContextLayered("newclub", "padel", "q1", { catalog: null }).ctx, null)
})

test("case-insensitive no bundle e no catálogo", () => {
  assert.ok(resolveClubContextLayered("SPAC", "BEACHTENNIS", "Q1", { catalog: null }).ctx)
  assert.ok(resolveClubContextLayered("NEWCLUB", "padel", "Q1", { catalog: newclub }).ctx)
})

test("catálogo presente mas tripla inválida → null", () => {
  // Quadra que não existe naquele esporte do catálogo.
  assert.equal(resolveClubContextLayered("newclub", "padel", "q9", { catalog: newclub }).ctx, null)
  // Esporte que o catálogo não oferece (squash não está em newclub.esportes).
  assert.equal(resolveClubContextLayered("newclub", "squash", "q1", { catalog: newclub }).ctx, null)
})
