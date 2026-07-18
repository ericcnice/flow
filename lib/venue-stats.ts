/**
 * Helpers de agregação dos acessos por venue (court_visits, via a RPC
 * get_venue_visit_stats). Extraídos do antigo visit-stats.tsx no redesign da
 * página de detalhe: agora são consumidos tanto pelo <VenueOverview> (server)
 * quanto pela page.tsx, que pré-computa os rollups por-quadra e por-esporte e os
 * passa PRONTOS ao <CourtsPanel> (client). O client fica burro — só lê mapas.
 *
 * ⚠️ `sport` das linhas é o id CANÔNICO ('tennis','beach','tabletennis'), não o
 * slug de URL ('tenis','beachtennis','pingpong'). courtKey usa o canônico; quem
 * parte da GRADE (que é slug de URL) converte com sportIdFromSlug ANTES de
 * consultar — a armadilha do "squash por coincidência" (slug == id só nele).
 */

/** Linha crua da RPC. `visitas` vem como bigint → coagido com Number(). */
export type VisitRow = {
  sport: string
  court_slug: string
  sponsor_slug: string | null
  visitas: number
}

/**
 * Aliases históricos de patrocinador → slug canônico. O mesmo patrocinador grava
 * sob slugs diferentes conforme a rota: a /[ad] impressa do Nicholas loga "ad1"
 * (ADS estático), a resolução por quadra loga "nicholasventura". Aqui "ad1" soma
 * junto com o coach; "ad2" (PWER Squash) fica por si, pois não há coach
 * correspondente. DÍVIDA: este mapa deveria morar na tabela sponsors (peça A).
 */
export const SPONSOR_ALIASES: Record<string, string> = { ad1: 'nicholasventura', ad2: 'ad2' }
/** Rótulo de slugs canônicos que NÃO são coach (sem nome em members). */
export const SPONSOR_LABELS: Record<string, string> = { ad2: 'PWER Squash' }

export const canonicalSponsor = (slug: string) => SPONSOR_ALIASES[slug] ?? slug

/**
 * Chave composta (sportId canônico, court). "|" é separador seguro: nunca
 * aparece num slug, então não há colisão entre "a" + "b|c" e "a|b" + "c". Os dois
 * lados (page.tsx que monta o mapa e o client que o lê) usam esta MESMA função —
 * a chave é interna, só precisa ser consistente.
 */
export const courtKey = (sportId: string, court: string) => `${sportId}|${court}`

export const num = (v: number) => Number(v) || 0

export function somaTotal(rows: VisitRow[]): number {
  return rows.reduce((n, r) => n + num(r.visitas), 0)
}

export function porEsporte(rows: VisitRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) m.set(r.sport, (m.get(r.sport) ?? 0) + num(r.visitas))
  return m
}

export function porQuadra(rows: VisitRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    const k = courtKey(r.sport, r.court_slug)
    m.set(k, (m.get(k) ?? 0) + num(r.visitas))
  }
  return m
}

export function porPatrocinador(rows: VisitRow[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rows) {
    if (!r.sponsor_slug) continue // null = sem patrocinador, não soma em marca
    const k = canonicalSponsor(r.sponsor_slug)
    m.set(k, (m.get(k) ?? 0) + num(r.visitas))
  }
  return m
}

export function comSemPatrocinador(rows: VisitRow[]): { com: number; sem: number } {
  let com = 0
  let sem = 0
  for (const r of rows) {
    if (r.sponsor_slug) com += num(r.visitas)
    else sem += num(r.visitas)
  }
  return { com, sem }
}

/** {total, d7} por quadra (chave courtKey). Pré-computado no server para o client. */
export type ParTotais = { total: number; d7: number }

/**
 * Combina as duas janelas (total e 7d) num Record chaveado — o formato que o
 * client consome. Serve tanto para "por quadra" quanto para "por esporte",
 * conforme a função de rollup passada (porQuadra ou porEsporte).
 */
export function combinarJanelas(
  rollup: (rows: VisitRow[]) => Map<string, number>,
  rowsTotal: VisitRow[],
  rows7d: VisitRow[],
): Record<string, ParTotais> {
  const total = rollup(rowsTotal)
  const d7 = rollup(rows7d)
  const out: Record<string, ParTotais> = {}
  for (const [k, v] of total) out[k] = { total: v, d7: d7.get(k) ?? 0 }
  // Chaves que só existem em 7d (raro, mas possível) entram também.
  for (const [k, v] of d7) if (!(k in out)) out[k] = { total: 0, d7: v }
  return out
}
