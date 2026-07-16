/**
 * Resolução do PATROCINADOR da jornada de QR (segmento /[ad] da URL).
 *
 * Ponto ÚNICO de resolução: os três lugares que mostram patrocinador (a Tela 2
 * da abertura, o "Oferecimento" da tela de fim e a marca d'água do /placar)
 * chamam só `resolveSponsor` — a ordem das fontes vive aqui, não triplicada.
 *
 * A ordem existe para proteger QR JÁ IMPRESSO. Um cartaz na quadra não pode
 * depender de rede nem de banco:
 *
 *   1. ADS estático (lib/clubs-config) — sem rede, sem cache, sem I/O. Os slugs
 *      já impressos (ad1, ad2) NUNCA saem daqui e nunca chegam na RPC.
 *   2. Cache local (localStorage) — um coach já resolvido volta offline.
 *   3. RPC get_sponsor_by_slug — uma vez, com TIMEOUT de 2s (ver abaixo).
 *
 * Falha NUNCA é cacheada: só sucesso entra no localStorage. Um coach cadastrado
 * enquanto o tablet estava sem rede precisa aparecer na próxima tentativa; se
 * cacheássemos o "não achei", ele ficaria invisível para sempre naquele device.
 *
 * Fallback: qualquer caminho que não resolva devolve `null` — exatamente o que
 * `adBySlug` já devolvia para slug desconhecido. Quem chama já trata null como
 * "sem patrocinador" (pula a Tela 2, não desenha o cartão). Nada trava.
 *
 * ⚠️ Este módulo importa o supabase — por isso mora aqui e NÃO em clubs-config,
 * que é puro/síncrono/sem dependências e é importado pelo caminho de scoring.
 * A dependência é de mão única: sponsors.ts → clubs-config.ts.
 */

import { adBySlug } from "@/lib/clubs-config"
import { supabase } from "@/lib/supabase/client"

/** Patrocinador resolvido, já normalizado (venha do ADS ou do banco). */
export type Sponsor = {
  name: string
  /**
   * SLUG DE URL — nunca um id de banco. Ele faz round-trip: a abertura grava
   * este valor na config (`ad`), que vira `&ad=` no link de espectador, que o
   * /placar usa para resolver o mesmo patrocinador no aparelho de quem assiste.
   * Um uuid aqui quebraria esse link.
   */
  slug: string
  logoUrl: string
}

/**
 * A RPC não tem timeout próprio: o supabase-js não impõe nenhum, então numa
 * rede de clube instável (ou atrás de portal cativo) a promise pode pendurar
 * por dezenas de segundos. Como a abertura só arma os timers das telas DEPOIS
 * de resolver o patrocinador, pendurar aqui congelaria a Tela 1 — coisa que o
 * `adBySlug` síncrono nunca fez. 2s cabe folgado dentro dos 4s da Tela 1.
 */
const RPC_TIMEOUT_MS = 2000

/**
 * Versão do formato cacheado. Serve para invalidar entradas antigas sem bug de
 * cache velho: se um dia o Sponsor ganhar campo novo (ex.: logo escuro), basta
 * subir para 2 e as entradas v:1 passam a ser ignoradas em vez de lidas torto.
 */
const CACHE_VERSION = 1

const cacheKey = (slug: string) => `sponsor_${slug}`

/**
 * Leitura DEFENSIVA: entrada corrompida, de outra versão ou sem logo é tratada
 * como "não tem cache" e cai para a RPC. Um JSON.parse solto aqui derrubaria a
 * abertura inteira por causa de uma string estragada no localStorage.
 * O try/catch também cobre Safari em aba privada, que lança até na LEITURA.
 */
function readCache(slug: string): Sponsor | null {
  try {
    const raw = localStorage.getItem(cacheKey(slug))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.v !== CACHE_VERSION) return null
    if (typeof parsed.name !== "string" || typeof parsed.logoUrl !== "string") return null
    if (!parsed.logoUrl) return null
    return { name: parsed.name, slug, logoUrl: parsed.logoUrl }
  } catch {
    return null
  }
}

/**
 * `at` (quando foi cacheado) não é lido hoje — o cache não expira. Fica gravado
 * porque custa zero agora e destrava um TTL depois sem precisar de outra versão
 * de formato. Consequência de não ter TTL: um patrocinador que TROCAR de logo
 * não atualiza num device que já cacheou. Aceito por ora.
 */
function writeCache(sponsor: Sponsor): void {
  try {
    localStorage.setItem(
      cacheKey(sponsor.slug),
      JSON.stringify({ v: CACHE_VERSION, ...sponsor, at: Date.now() }),
    )
  } catch {
    // Cota estourada / aba privada: seguir sem cache é degradação aceitável.
  }
}

/**
 * ⚠️ LOGO DE PATROCINADOR PRECISA ESTAR NO SUPABASE STORAGE. Não é preferência
 * de organização — é requisito funcional da tela de COMPARTILHAR.
 *
 * A tela de fim vira PNG via html-to-image (app/jogo/page.tsx), que embute cada
 * imagem fazendo `fetch` + FileReader. Esse fetch é cross-origin e exige que o
 * host responda `Access-Control-Allow-Origin`. O Supabase Storage (bucket
 * público) responde `*`; um link genérico de terceiro (site do patrocinador,
 * Google Drive, Imgur…) tipicamente não.
 *
 * E o modo de falha é SILENCIOSO, que é o que torna isso perigoso: o
 * html-to-image captura o erro do fetch e troca a imagem por `imagePlaceholder
 * || ''` — um src vazio. O PNG é gerado normalmente, só que SEM o logo. Ou
 * seja: o patrocinador some exatamente da peça pela qual ele está pagando, e
 * ninguém descobre até alguém conferir uma imagem compartilhada.
 *
 * Daí este aviso. Ele NÃO bloqueia: a URL segue sendo usada e o logo aparece
 * normal nas telas (lá é um <img> comum, sem CORS). O que ele faz é deixar
 * rastro no console para quem for investigar "por que o logo sumiu do print".
 */
function warnIfNotSupabaseStorage(logoUrl: string, slug: string): void {
  try {
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!base) return
    const url = new URL(logoUrl)
    const isSupabaseHost = url.host === new URL(base).host
    const isPublicObject = url.pathname.includes("/storage/v1/object/public/")
    if (isSupabaseHost && isPublicObject) return
    console.warn(
      `[sponsors] Logo de "${slug}" não parece estar no Supabase Storage (${logoUrl}). ` +
        `Ele vai aparecer nas telas, mas provavelmente SUMIRÁ da imagem de ` +
        `compartilhamento: o html-to-image precisa de CORS para embutir a imagem ` +
        `no PNG, e some em silêncio quando não consegue. Suba o logo num bucket ` +
        `público do Supabase Storage.`,
    )
  } catch {
    // URL inválida: quem valida formato é o form do admin, não este aviso.
  }
}

/**
 * Resolve o patrocinador de um slug de URL. Nunca lança e nunca trava: qualquer
 * problema (slug vazio, sem rede, RPC lenta, coach inexistente) vira `null`.
 *
 * `null | undefined` no parâmetro de propósito — os call sites já passam valores
 * possivelmente ausentes (`gameConfig.ad` é opcional, `adSlug` do /placar é
 * `string | null`), exatamente como o `adBySlug` que esta função substitui.
 */
export async function resolveSponsor(slug: string | null | undefined): Promise<Sponsor | null> {
  if (!slug) return null
  // Minúsculas em TODO o caminho (lookup, cache e retorno): o adBySlug sempre
  // foi case-insensitive, e sem isso /...\/Nicholas e /...\/nicholas virariam
  // duas entradas distintas no localStorage.
  const key = slug.toLowerCase()

  // 1. ADS estático — retorna ANTES de qualquer await/rede/localStorage.
  const ad = adBySlug(key)
  if (ad) return { name: ad.nome, slug: ad.id, logoUrl: ad.logo }

  // 2. Cache local.
  const cached = readCache(key)
  if (cached) return cached

  // 3. RPC, uma vez, com timeout.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS)
  try {
    // A RPC é SET-RETURNING: o PostgREST devolve ARRAY ([] ou [linha]), não
    // objeto. O nome do argumento é `p_slug` (com `slug` a RPC responde
    // PGRST202). Ela já filtra role='coach' + active=true no banco.
    const { data, error } = await supabase
      .rpc("get_sponsor_by_slug", { p_slug: key })
      .abortSignal(controller.signal)

    // Erro, timeout (abort vira erro aqui) ou coach sem logo: null e NÃO cacheia.
    if (error) return null
    const row = data?.[0]
    if (!row?.sponsor_logo_url) return null

    const sponsor: Sponsor = {
      name: row.name,
      slug: key,
      logoUrl: row.sponsor_logo_url,
    }
    warnIfNotSupabaseStorage(sponsor.logoUrl, key)
    writeCache(sponsor) // só sucesso entra no cache
    return sponsor
  } catch {
    // Rede caída / abort que escape como exceção: mesmo fallback gracioso.
    return null
  } finally {
    clearTimeout(timer)
  }
}
