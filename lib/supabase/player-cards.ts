/**
 * CARTÃO PÚBLICO DO JOGADOR (Fatia 1b.1) — nome + foto de quem tem carteirinha
 * num slot do placar.
 *
 * A 1a fez o `profile_id` de cada slot viajar no state (`playerIds`). Aqui
 * resolvemos esse id em algo exibível. A leitura é a RPC pública
 * `get_public_player_cards` porque `public.profiles` tem RLS self-select:
 * nenhum aparelho lê o profile de outra pessoa direto — e um embed devolveria
 * null EM SILÊNCIO, que é o pior modo de falha possível.
 *
 * INVIOLÁVEIS: isto é ENRIQUECIMENTO. Slot sem `profile_id` (o anônimo, o caso
 * normal) nem chega aqui. Nada neste módulo pode bloquear render, timer ou
 * jogo — offline, falha ou timeout devolvem o que houver em cache, ou vazio, e
 * a UI cai na inicial.
 *
 * DIFERENÇA DELIBERADA para lib/supabase/sponsors.ts: lá o cache de identidade
 * NÃO expira, e o próprio arquivo documenta a dívida ("um patrocinador que
 * TROCAR de logo não atualiza num device que já cacheou"). Foto de PESSOA muda
 * mais que logo de patrocinador, então aqui há TTL + stale-while-revalidate:
 * devolve o cache na hora (render imediato, offline-safe) e revalida por trás.
 *
 * ⚠️ O QUE O TTL SIGNIFICA (corrigido): ele é o limite do que se pode servir
 * OFFLINE — não a licença para ignorar a rede quando ela está disponível. A
 * revalidação de fundo roda para TUDO que veio do cache, fresco ou não, desde
 * que haja conexão. Antes só os vencidos eram revalidados, e uma foto trocada
 * há duas horas ficava velha por até vinte e duas.
 *
 * Usa o client ANÔNIMO (lib/supabase/client), igual sponsors.ts — a RPC é
 * pública e o espectador do /placar tipicamente não tem sessão.
 */

import { supabase } from "@/lib/supabase/client"

export type PlayerCard = {
  id: string
  /** profiles.name — o mesmo nome que já viaja como string em `players`. */
  displayName: string | null
  /** URL pública do Storage. Google é ignorado: só o próprio dono enxerga o
   *  user_metadata, então uma foto do Google nunca serviria aos OUTROS. */
  avatarUrl: string | null
}

/**
 * Versão do formato cacheado. Subir invalida entradas antigas em vez de lê-las
 * torto (mesma disciplina do cache de patrocinador).
 */
const CACHE_VERSION = 1

/** Cartão vence em 24h — foto/nome mudam, e a revalidação é barata. */
const TTL_MS = 24 * 60 * 60 * 1000

/**
 * O supabase-js não impõe timeout: numa rede de clube instável (ou atrás de
 * portal cativo) a promise pendura por dezenas de segundos. Aqui não é caminho
 * crítico — mas promessa pendurada é o padrão de falha da casa, então vale a
 * mesma tranca de 2s do sponsors.ts.
 */
const RPC_TIMEOUT_MS = 2000

/** Teto de lote, espelhando o guard da RPC (que devolve vazio acima de 8). */
const MAX_IDS = 8

const cacheKey = (id: string) => `player_card_${id}`

type Cached = { card: PlayerCard; fresco: boolean }

/**
 * Leitura DEFENSIVA: entrada corrompida ou de outra versão vira "não tem cache".
 * O try/catch também cobre Safari em aba privada, que lança até na LEITURA.
 */
function readCache(id: string): Cached | null {
  try {
    const raw = localStorage.getItem(cacheKey(id))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.v !== CACHE_VERSION) return null
    if (typeof parsed.at !== "number") return null
    const card: PlayerCard = {
      id,
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : null,
      avatarUrl: typeof parsed.avatarUrl === "string" ? parsed.avatarUrl : null,
    }
    return { card, fresco: Date.now() - parsed.at < TTL_MS }
  } catch {
    return null
  }
}

function writeCache(card: PlayerCard): void {
  try {
    localStorage.setItem(
      cacheKey(card.id),
      JSON.stringify({
        v: CACHE_VERSION,
        displayName: card.displayName,
        avatarUrl: card.avatarUrl,
        at: Date.now(),
      }),
    )
  } catch {
    // Cota estourada / aba privada: seguir sem cache é degradação aceitável.
  }
}

/** Race com timeout: rede pendurada nunca segura quem chamou. */
function comTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T | null> {
  return Promise.race([
    Promise.resolve(p).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ])
}

/**
 * Busca na RPC e grava no cache. SÓ SUCESSO é cacheado — se cacheássemos o
 * "não achei", uma foto subida enquanto o aparelho estava sem rede ficaria
 * invisível para sempre naquele device.
 *
 * Ids que a RPC não devolve (conta excluída, id inexistente) simplesmente não
 * entram no Map: para a UI, é o mesmo que não ter carteirinha.
 */
async function buscarNaRpc(ids: string[]): Promise<Map<string, PlayerCard>> {
  const out = new Map<string, PlayerCard>()
  if (ids.length === 0) return out

  const res = await comTimeout(
    supabase.rpc("get_public_player_cards", { p_ids: ids }),
    RPC_TIMEOUT_MS,
  )
  const linhas = (res && !res.error ? res.data : null) as
    | Array<{ id: string; display_name: string | null; avatar_url: string | null }>
    | null
  if (!Array.isArray(linhas)) return out

  for (const l of linhas) {
    if (!l?.id) continue
    const card: PlayerCard = {
      id: l.id,
      displayName: l.display_name ?? null,
      avatarUrl: l.avatar_url ?? null,
    }
    out.set(card.id, card)
    writeCache(card)
  }
  return out
}

/**
 * Resolve os cartões dos ids pedidos.
 *
 * COMPORTAMENTO (stale-while-revalidate):
 *  - cache FRESCO      → volta na hora, sem rede;
 *  - cache VENCIDO     → volta na hora (stale) E revalida por trás;
 *  - SEM cache         → aguarda a RPC (é o único jeito de ter o dado).
 *
 * `onRevalidado` (opcional) recebe o mapa completo quando a revalidação de
 * fundo termina COM MUDANÇA — assim quem já renderizou o stale pode atualizar
 * sem re-chamar. Nunca é chamado se nada mudou.
 *
 * NUNCA lança: qualquer falha devolve o que houver (possivelmente vazio).
 */
/**
 * APAGA o cartão cacheado de UMA pessoa neste aparelho.
 *
 * Serve ao momento em que alguém troca a própria foto: a revalidação de fundo
 * já corrigiria isso, mas só na PRÓXIMA vez que a tela pedisse os cartões — e
 * quem acabou de subir uma foto quer vê-la agora, não na próxima partida.
 * Apagando a entrada, a leitura seguinte cai em `semCache` e vai à rede.
 *
 * Mora AQUI, e não no uploader, porque o formato da chave é assunto deste
 * módulo: espalhar `player_card_${id}` pelo código é como o cache de
 * patrocinador acumulou dívida.
 */
export function invalidatePlayerCard(id: string): void {
  try {
    localStorage.removeItem(cacheKey(id))
  } catch {
    // Aba privada / cota: sem cache para apagar, e a revalidação cobre.
  }
}

export async function resolvePlayerCards(
  ids: string[],
  onRevalidado?: (cards: Map<string, PlayerCard>) => void,
): Promise<Map<string, PlayerCard>> {
  const out = new Map<string, PlayerCard>()

  // Dedup + teto de lote (o mesmo da RPC: acima dele ela devolve vazio).
  const unicos = Array.from(new Set(ids.filter((s) => typeof s === "string" && s))).slice(0, MAX_IDS)
  if (unicos.length === 0) return out

  const semCache: string[] = []
  const doCache: string[] = []

  for (const id of unicos) {
    const c = readCache(id)
    if (!c) {
      semCache.push(id)
      continue
    }
    out.set(id, c.card)
    doCache.push(id)
  }

  // Sem cache: precisa da rede para ter QUALQUER coisa. Falha/timeout → o id
  // fica de fora do mapa e a UI cai na inicial.
  if (semCache.length > 0) {
    const novos = await buscarNaRpc(semCache)
    for (const [id, card] of novos) out.set(id, card)
  }

  // REVALIDAÇÃO DE TUDO QUE VEIO DO CACHE — inclusive do que ainda está DENTRO
  // do TTL. Antes só os VENCIDOS eram revalidados, e era esse o buraco: uma
  // foto trocada há duas horas continuava velha por até vinte e duas, porque
  // `fresco: true` significava "nem pergunta". O TTL virou o que deveria ter
  // sido desde o início — o limite do que se pode servir OFFLINE, não a licença
  // para ignorar a rede quando ela está ali.
  //
  // O offline-first não muda em nada: o cache já foi devolvido acima, na hora.
  // Isto aqui é fire-and-forget, não segura render nenhum, e a guarda de
  // `onLine` evita bater numa rede que não existe. Lote único, teto de 8 e
  // timeout de 2s continuam valendo — é UMA requisição por abertura de tela,
  // não uma por jogador.
  const online = typeof navigator === "undefined" || navigator.onLine !== false
  if (doCache.length > 0 && online) {
    void (async () => {
      const frescos = await buscarNaRpc(doCache)
      if (frescos.size === 0) return
      let mudou = false
      for (const [id, card] of frescos) {
        const antigo = out.get(id)
        if (antigo?.displayName !== card.displayName || antigo?.avatarUrl !== card.avatarUrl) {
          mudou = true
        }
        out.set(id, card)
      }
      if (mudou) onRevalidado?.(new Map(out))
    })()
  }

  return out
}
