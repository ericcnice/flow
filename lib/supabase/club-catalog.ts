/**
 * Catálogo de CLUBES/QUADRAS vindo do banco (Fatia 3a da unificação).
 *
 * Espelha o padrão comprovado de `lib/supabase/sponsors.ts`: cache local +
 * fetch com timeout + leitura defensiva + versão de formato. O objetivo é a
 * mesma resiliência offline-first — a jornada nunca pode pendurar na rede nem
 * quebrar sem sinal.
 *
 * ⚠️ CAMINHO MORTO nesta fatia. Nada aqui é importado pela jornada ainda: o
 * club-opening continua validando pelo CLUBS estático (bundle puro). A Fatia 3b
 * é que liga isto na resolução, em UNIÃO com o bundle (o bundle é o PISO que
 * protege o QR impresso; este cache/banco só ACRESCENTA clubes novos).
 *
 * ⚠️ Importa o supabase — por isso mora aqui e NÃO em clubs-config (puro,
 * síncrono, importado pelo caminho de scoring). Dependência de mão única:
 * club-catalog.ts → clubs-config (só o tipo SportId).
 */

import { supabase } from "@/lib/supabase/client"
import { clubBySlug } from "@/lib/clubs-config"
import type { SportId } from "@/lib/sports-catalog"

/**
 * Catálogo de um clube, já normalizado para o que a resolução em camadas (3b)
 * vai consumir. `logoUrl` pode ser null (venue sem logo cadastrado — o 3b cai no
 * path do bundle / inicial do nome). `quadrasPorEsporte` guarda o vínculo
 * esporte→quadras que o CLUBS plano não expressa; `esportes` é derivado dele.
 */
export type ClubCatalog = {
  slug: string
  nome: string
  logoUrl: string | null
  esportes: SportId[]
  quadrasPorEsporte: Record<string, string[]>
}

/**
 * A RPC não tem timeout próprio (o supabase-js não impõe nenhum). Numa rede de
 * clube instável a promise penduraria — e como o 3b vai gatear a jornada nisso,
 * pendurar congelaria a Tela 1. 3s dá folga (a Tela 1 dura 4s) e é um pouco mais
 * generoso que os 2s do sponsor porque aqui a resolução gateia a jornada inteira.
 */
const RPC_TIMEOUT_MS = 3000

/**
 * Versão do formato cacheado. Subir invalida entradas antigas sem bug de cache
 * velho (ex.: se o ClubCatalog ganhar um campo novo, entradas v:1 são ignoradas
 * em vez de lidas torto). Mesmo mecanismo do CACHE_VERSION de sponsors.ts.
 */
const CACHE_VERSION = 1

const cacheKey = (slug: string) => `club_${slug}`

/**
 * Leitura DEFENSIVA: entrada corrompida, de outra versão ou com shape errado é
 * tratada como "não tem cache". Um JSON.parse solto derrubaria a jornada por uma
 * string estragada no localStorage. O try/catch também cobre Safari em aba
 * privada, que lança até na LEITURA.
 */
export function readClubCache(slug: string | null | undefined): ClubCatalog | null {
  if (!slug) return null
  try {
    const raw = localStorage.getItem(cacheKey(slug.toLowerCase()))
    if (!raw) return null
    const p = JSON.parse(raw)
    if (p?.v !== CACHE_VERSION) return null
    if (typeof p.slug !== "string" || typeof p.nome !== "string") return null
    if (!Array.isArray(p.esportes)) return null
    if (typeof p.quadrasPorEsporte !== "object" || p.quadrasPorEsporte === null) return null
    return {
      slug: p.slug,
      nome: p.nome,
      logoUrl: typeof p.logoUrl === "string" ? p.logoUrl : null,
      esportes: p.esportes as SportId[],
      quadrasPorEsporte: p.quadrasPorEsporte as Record<string, string[]>,
    }
  } catch {
    return null
  }
}

/** Escrita: só no sucesso da RPC. `at` grava o instante (base p/ um TTL futuro). */
function writeClubCache(club: ClubCatalog): void {
  try {
    localStorage.setItem(
      cacheKey(club.slug),
      JSON.stringify({ v: CACHE_VERSION, ...club, at: Date.now() }),
    )
  } catch {
    // Cota estourada / aba privada: seguir sem cache é degradação aceitável.
  }
}

/** Linha crua de cada quadra no jsonb da RPC. */
type RawCourt = { sport?: unknown; slug?: unknown; name?: unknown }

/** Normaliza o jsonb da RPC ({slug,name,logo_url,courts[]}) para ClubCatalog. */
function normalize(raw: unknown): ClubCatalog | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as { slug?: unknown; name?: unknown; logo_url?: unknown; courts?: unknown }
  if (typeof r.slug !== "string" || typeof r.name !== "string") return null

  const quadrasPorEsporte: Record<string, string[]> = {}
  const courts = Array.isArray(r.courts) ? (r.courts as RawCourt[]) : []
  for (const c of courts) {
    if (!c || typeof c.sport !== "string" || typeof c.slug !== "string") continue
    ;(quadrasPorEsporte[c.sport] ??= []).push(c.slug)
  }

  return {
    slug: r.slug,
    nome: r.name,
    logoUrl: typeof r.logo_url === "string" ? r.logo_url : null,
    esportes: Object.keys(quadrasPorEsporte) as SportId[],
    quadrasPorEsporte,
  }
}

/**
 * Busca o catálogo de UM clube no banco (RPC get_public_club), com timeout de 3s.
 * Sucesso → normaliza, popula o cache e devolve. Erro/timeout/clube inexistente
 * → null (silencioso, NUNCA lança). Só sucesso é cacheado — nunca o "não achei"
 * (um clube cadastrado enquanto o device estava sem rede precisa aparecer na
 * próxima tentativa).
 */
export async function fetchPublicClub(slug: string | null | undefined): Promise<ClubCatalog | null> {
  if (!slug) return null
  const key = slug.toLowerCase()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS)
  try {
    // returns jsonb → data é o objeto (ou null), não array. Nome do arg: p_slug.
    const { data, error } = await supabase
      .rpc("get_public_club", { p_slug: key })
      .abortSignal(controller.signal)

    if (error) return null
    const club = normalize(data)
    if (!club) return null

    writeClubCache(club)
    return club
  } catch {
    // Rede caída / abort que escape como exceção: mesmo fallback gracioso.
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Nome + logo do clube para superfícies FORA da jornada (tela de fim do /jogo,
 * logo do espectador no broadcast). BUNDLE primeiro (piso): clube do bundle
 * mostra o logo local de sempre (spac inalterado). Cache como FALLBACK: um clube
 * NOVO (só no banco) usa o logo do cache — quente porque a jornada acabou de o
 * gravar. Cache frio / clube desconhecido → null (o caller já trata: sem logo).
 * Só LÊ (bundle síncrono + localStorage); nunca busca rede.
 */
export function clubFromCacheOrBundle(
  slug: string | null | undefined,
): { nome: string; logo: string } | null {
  const bundle = clubBySlug(slug)
  if (bundle) return { nome: bundle.nome, logo: bundle.logo }
  const cat = readClubCache(slug)
  if (cat) return { nome: cat.nome, logo: cat.logoUrl ?? "" }
  return null
}

/**
 * SWR combinado (o padrão que a Fatia 3b vai consumir): devolve o cache local
 * IMEDIATAMENTE (síncrono, offline-safe) e dispara o refresh em BACKGROUND
 * (fire-and-forget) para atualizar o cache para o próximo acesso. A leitura
 * nunca bloqueia por rede/TTL. Sem cache → null síncrono (o 3b então decide:
 * cai no bundle, ou espera o fetch se for um clube desconhecido com rede).
 */
export function getClubCatalog(slug: string | null | undefined): ClubCatalog | null {
  if (!slug) return null
  const cached = readClubCache(slug)
  // Revalida em background — não aguardado, erro engolido pelo próprio fetch.
  void fetchPublicClub(slug)
  return cached
}
