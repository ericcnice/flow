/**
 * Configuração de CLUBES para a jornada de contexto via URL
 * (/[clube]/[esporte]/[quadra][/ad]). NÃO altera lib/scoring nem o catálogo de
 * esportes — só descreve, por clube, qual branding/quadras/esportes existem, e
 * traduz o SLUG de esporte da URL (uma palavra, sem hífen) para o id curto do
 * catálogo (lib/sports-catalog).
 *
 * Extensível: para um novo clube, basta acrescentar uma entrada em CLUBS.
 */

import { sportById, type SportId } from "@/lib/sports-catalog"

export type ClubConfig = {
  /** id estável = slug do clube na URL (ex.: "spac"). */
  id: string
  /** Nome amigável exibido na abertura. */
  nome: string
  /** Caminho do logo em /public (ex.: "/spac.png"). */
  logo: string
  /** Esportes habilitados (ids do catálogo) — restringe o que a URL aceita. */
  esportes: SportId[]
  /** Quadras válidas (slugs da URL, ex.: "q1".."q6"). */
  quadras: string[]
}

/** Clubes cadastrados, indexados pelo slug de URL. */
export const CLUBS: Record<string, ClubConfig> = {
  spac: {
    id: "spac",
    nome: "SPAC",
    logo: "/spac.png",
    esportes: ["tennis", "beach", "squash", "tabletennis"],
    quadras: ["q1", "q2", "q3", "q4", "q5", "q6"],
  },
}

/**
 * Mapa SLUG-de-URL (uma palavra, sem hífen) → id do catálogo. A URL usa a forma
 * "de uma palavra"; o motor/catálogo usa os ids curtos. Ex.: "beachtennis"→"beach".
 */
export const SPORT_SLUG_TO_ID: Record<string, SportId> = {
  tenis: "tennis",
  beachtennis: "beach",
  padel: "padel",
  squash: "squash",
  pingpong: "tabletennis",
  pickleball: "pickleball",
}

/** Um ANÚNCIO/PATROCINADOR da jornada de contexto (segmento /[ad] da URL). */
export type AdConfig = {
  /** id estável = slug do anúncio na URL (ex.: "ad1"). */
  id: string
  /** Nome amigável do patrocinador. */
  nome: string
  /** Logo em /public. Versão de FUNDO BRANCO (assenta bem num cartão claro,
   *  ex.: a tela de fim de jogo que vira imagem de compartilhamento). */
  logo: string
}

/** Anúncios cadastrados, indexados pelo slug de URL (ex.: "ad1" = Nicholas). */
export const ADS: Record<string, AdConfig> = {
  ad1: { id: "ad1", nome: "Nicholas", logo: "/nicholas-light.png" },
  ad2: { id: "ad2", nome: "PWER Squash", logo: "/ad2-light.png" },
}

/** Clube pelo slug (case-insensitive). null se não existir. */
export function clubBySlug(slug: string | null | undefined): ClubConfig | null {
  if (!slug) return null
  return CLUBS[slug.toLowerCase()] ?? null
}

/** Anúncio/patrocinador pelo slug (case-insensitive). null se ausente/vazio. */
export function adBySlug(slug: string | null | undefined): AdConfig | null {
  if (!slug) return null
  return ADS[slug.toLowerCase()] ?? null
}

/** id do esporte a partir do slug de URL. null se o slug não for reconhecido. */
export function sportIdFromSlug(slug: string | null | undefined): SportId | null {
  if (!slug) return null
  return SPORT_SLUG_TO_ID[slug.toLowerCase()] ?? null
}

/** Número exibível da quadra a partir do slug (ex.: "q1" → "1"). */
export function quadraLabel(quadra: string): string {
  const digits = quadra.replace(/\D/g, "")
  return digits || quadra
}

/** Contexto resolvido de uma rota de clube (tudo validado). */
export type ClubContext = {
  club: ClubConfig
  sportId: SportId
  /** Nome amigável do esporte (do catálogo), ex.: "Beach Tennis". */
  sportName: string
  /** Slug da quadra na URL, usado como chave (ex.: "q1"). */
  quadra: string
  /** Número exibível (ex.: "1"). */
  quadraNum: string
}

/**
 * Valida e resolve (clube, esporte, quadra) da URL. Retorna null se:
 *  - o clube não existe;
 *  - o slug de esporte não é reconhecido OU não pertence ao clube;
 *  - a quadra não pertence ao clube.
 * Quem chama redireciona para "/" quando vem null.
 */
export function resolveClubContext(
  clubeSlug: string | null | undefined,
  esporteSlug: string | null | undefined,
  quadraSlug: string | null | undefined,
): ClubContext | null {
  const club = clubBySlug(clubeSlug)
  if (!club) return null

  const sportId = sportIdFromSlug(esporteSlug)
  if (!sportId || !club.esportes.includes(sportId)) return null

  const quadra = (quadraSlug ?? "").toLowerCase()
  if (!club.quadras.includes(quadra)) return null

  return {
    club,
    sportId,
    sportName: sportById(sportId).name,
    quadra,
    quadraNum: quadraLabel(quadra),
  }
}
