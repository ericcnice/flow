/**
 * LEITURA DO ESTADO das partidas ligadas ao telão. **SERVER-ONLY.**
 *
 * ⚠️ Existe para que o `view_token` NÃO precise chegar ao navegador. O cartão
 * do carrossel mostra o placar de cada quadra; se o cliente fosse buscar esse
 * placar, ele precisaria do token de cada sala — e o telão passaria a
 * distribuir as credenciais de leitura de todas as transmissões do clube. Aqui
 * o servidor lê, resume e manda só nomes e números.
 *
 * ⚠️ CHAVE ANÔNIMA, e não service_role: `get_live_match_state` é a mesma RPC
 * que o /placar chama do navegador, e a autorização dela é POSSE DO TOKEN, não
 * identidade. Usar a chave anônima mantém o modelo idêntico ao que já existe e
 * dispensa migração e grant novo. O service_role daria um poder que esta
 * leitura não precisa.
 */

import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * ⚠️ TETO DE ESPERA, e ele é o ponto mais importante deste arquivo. Este
 * módulo entra no caminho de RENDERIZAÇÃO da página do telão — sem teto, uma
 * sala lenta seguraria a TV inteira, incluindo o vídeo e o placar do destaque,
 * para desenhar uma faixa de navegação. É a mesma disciplina da resolução de
 * patrocinador: fallback e prazo curto, nunca pendurar na rede.
 */
const TETO_MS = 2000

function leitor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** A RPC devolve ora um objeto, ora uma linha dentro de um array. */
function primeiraLinha(data: unknown): Record<string, unknown> | null {
  if (data == null) return null
  const alvo = Array.isArray(data) ? data[0] : data
  return alvo && typeof alvo === 'object' ? (alvo as Record<string, unknown>) : null
}

function comTeto<T>(p: PromiseLike<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>
  // Resolve em `null` no estouro em vez de rejeitar: "não deu tempo" e "deu
  // erro" levam ao mesmo lugar (cartão sem placar), e tratar como valor evita
  // uma rejeição não capturada se a promessa original falhar depois do teto.
  const prazo = new Promise<null>((r) => {
    timer = setTimeout(() => r(null), ms)
  })
  return Promise.race([Promise.resolve(p), prazo]).finally(() => clearTimeout(timer))
}

/**
 * O `state` cru de várias salas, em paralelo, indexado pelo slug da quadra.
 *
 * Quadra que falhar, demorar ou não existir simplesmente NÃO ENTRA no mapa — o
 * cartão dela cai no texto de sempre. Uma quadra com problema nunca derruba as
 * outras nem a página.
 */
export async function lerEstados(
  salas: { quadra: string; viewToken: string }[],
): Promise<Map<string, unknown>> {
  const fora = new Map<string, unknown>()
  const db = leitor()
  if (!db || salas.length === 0) return fora

  const respostas = await Promise.all(
    salas.map(async ({ quadra, viewToken }) => {
      try {
        const r = await comTeto(db.rpc('get_live_match_state', { p_token: viewToken }), TETO_MS)
        if (!r || r.error) return null
        const linha = primeiraLinha(r.data)
        return linha?.state ? ([quadra, linha.state] as const) : null
      } catch {
        return null
      }
    }),
  )

  for (const r of respostas) if (r) fora.set(r[0], r[1])
  return fora
}
