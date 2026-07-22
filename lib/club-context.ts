/**
 * Resolução de contexto da jornada em UNIÃO COM PISO (Fatia 3b).
 *
 * Valida (clube, esporte, quadra) se o BUNDLE (CLUBS estático) OU o CATÁLOGO
 * (cache local do banco, da Fatia 3a) reconhecerem a tripla — união, não
 * substituição. O BUNDLE é PISO: nunca é sobrescrito "para menos", então o QR
 * IMPRESSO do SPAC resolve EXATAMENTE como hoje, sem rede. O catálogo só
 * ACRESCENTA clubes/quadras novos (criados no dashboard).
 *
 * PURA e SÍNCRONA: recebe o `catalog` já lido como parâmetro (o caller lê o
 * localStorage). Sem localStorage, sem supabase, sem env aqui → 100% testável.
 * `import type` do ClubCatalog é apagado em runtime (não puxa o supabase).
 */

import {
  resolveClubContext,
  clubBySlug,
  sportIdFromSlug,
  quadraLabel,
  type ClubConfig,
  type ClubContext,
} from "@/lib/clubs-config"
import { sportById } from "@/lib/sports-catalog"
import type { ClubCatalog } from "@/lib/supabase/club-catalog"

export type LayeredResult = {
  /** Contexto validado (bundle OU catálogo), ou null se nenhum reconheceu. */
  ctx: ClubContext | null
  /**
   * Logos candidatos EM ORDEM para a Tela 1: logo do banco/cache primeiro, path
   * do bundle como PISO. O componente tenta em cascata (onError) e cai na inicial
   * do nome se todos falharem — a Tela 1 nunca fica vazia.
   */
  logoCascade: string[]
}

/** Valida a tripla contra o catálogo do banco (cache) e monta um ClubContext. */
function resolveFromCatalog(
  clube: string | null | undefined,
  esporte: string | null | undefined,
  quadra: string | null | undefined,
  catalog: ClubCatalog,
): ClubContext | null {
  if (!clube || !esporte || !quadra) return null
  if (catalog.slug.toLowerCase() !== clube.toLowerCase()) return null

  const sportId = sportIdFromSlug(esporte)
  if (!sportId || !catalog.esportes.includes(sportId)) return null

  const q = quadra.toLowerCase()
  const quadras = catalog.quadrasPorEsporte[sportId] ?? []
  if (!quadras.some((x) => x.toLowerCase() === q)) return null

  const club: ClubConfig = {
    id: catalog.slug,
    nome: catalog.nome,
    logo: catalog.logoUrl ?? "",
    esportes: catalog.esportes,
    // Lista plana de todas as quadras (formato do ClubConfig do bundle).
    quadras: Object.values(catalog.quadrasPorEsporte).flat(),
  }
  return { club, sportId, sportName: sportById(sportId).name, quadra: q, quadraNum: quadraLabel(q) }
}

/**
 * Resolução em camadas. `opts.catalog` = catálogo do cache/banco (ou null).
 * Precedência do CONTEXTO: bundle primeiro (piso), catálogo só se o bundle não
 * reconhecer. Precedência do LOGO: banco/cache primeiro, bundle como piso.
 */
export function resolveClubContextLayered(
  clube: string | null | undefined,
  esporte: string | null | undefined,
  quadra: string | null | undefined,
  opts?: { catalog?: ClubCatalog | null },
): LayeredResult {
  // 1) BUNDLE (piso) — puro, síncrono, offline. Idêntico a hoje.
  const bundleCtx = resolveClubContext(clube, esporte, quadra)
  const bundleClub = clubBySlug(clube)

  // 2) CATÁLOGO (cache/banco) — só ACRESCENTA.
  const catalog = opts?.catalog ?? null
  const catCtx = bundleCtx ? null : catalog ? resolveFromCatalog(clube, esporte, quadra, catalog) : null

  const ctx = bundleCtx ?? catCtx
  if (!ctx) return { ctx: null, logoCascade: [] }

  // Cascata do logo: banco/cache → path do bundle. dedup preserva a ordem.
  const cascade: string[] = []
  for (const src of [catalog?.logoUrl, bundleClub?.logo]) {
    if (src && !cascade.includes(src)) cascade.push(src)
  }
  return { ctx, logoCascade: cascade }
}
