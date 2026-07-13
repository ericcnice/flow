import { supabase } from '@/lib/supabase/client'

// Tipos de retorno das RPCs já existentes no banco (não recriamos, só consumimos).
export interface LiveMatchRoom {
  id: string
  viewToken: string
  editToken: string
}

export interface LiveMatchState {
  id: string
  state: any
  status: string
}

export interface LiveMatchAction {
  kind: string // "point" | "game" | "undo" | "reset"
  side?: string // "A" | "B"
}

// As RPCs podem devolver um objeto único ou uma linha dentro de um array,
// dependendo de como o Postgres serializa a função. Normalizamos aqui.
function firstRow<T>(data: unknown): T | null {
  if (data == null) return null
  if (Array.isArray(data)) return (data[0] as T) ?? null
  return data as T
}

/**
 * Cria uma nova sala de partida ao vivo.
 * RPC: create_live_match(p_club_slug text) -> { id, view_token, edit_token }
 * Lança um erro claro em caso de falha (criar sala é uma operação crítica).
 */
export async function createLiveMatch(clubSlug: string = 'flow'): Promise<LiveMatchRoom> {
  const { data, error } = await supabase.rpc('create_live_match', {
    p_club_slug: clubSlug,
  })

  if (error) {
    throw new Error(`createLiveMatch failed: ${error.message}`)
  }

  const row = firstRow<{ id: string; view_token: string; edit_token: string }>(data)
  if (!row) {
    throw new Error('createLiveMatch: RPC returned no data')
  }

  return {
    id: row.id,
    viewToken: row.view_token,
    editToken: row.edit_token,
  }
}

/**
 * Lê o estado atual de uma partida.
 * RPC: get_live_match_state(p_token text) -> { id, state, status }
 * Aceita view_token OU edit_token.
 * Retorna null (sem quebrar) em caso de erro ou sala inexistente.
 */
export async function getLiveMatchState(token: string): Promise<LiveMatchState | null> {
  const { data, error } = await supabase.rpc('get_live_match_state', {
    p_token: token,
  })

  if (error) {
    console.error('getLiveMatchState failed:', error.message)
    return null
  }

  const row = firstRow<LiveMatchState>(data)
  if (!row) return null

  return { id: row.id, state: row.state, status: row.status }
}

/**
 * Aplica uma ação numa partida (point/game/undo/reset).
 * RPC: apply_live_match_action(p_edit_token text, p_match_id uuid, p_action jsonb)
 *      -> { id, state, status }
 * A RPC também dispara o broadcast no canal live_match:<hash>.
 * Retorna null (sem quebrar) em caso de erro.
 */
export async function applyLiveMatchAction(
  editToken: string,
  matchId: string,
  action: LiveMatchAction,
): Promise<LiveMatchState | null> {
  const { data, error } = await supabase.rpc('apply_live_match_action', {
    p_edit_token: editToken,
    p_match_id: matchId,
    p_action: action,
  })

  if (error) {
    console.error('applyLiveMatchAction failed:', error.message)
    return null
  }

  const row = firstRow<LiveMatchState>(data)
  if (!row) return null

  return { id: row.id, state: row.state, status: row.status }
}

/**
 * Calcula o nome do canal de broadcast, precisando bater EXATAMENTE com o SQL:
 *   'live_match:' || encode(sha256(view_token || ':' || id), 'hex')
 * Roda no navegador via Web Crypto API (crypto.subtle).
 */
export async function getLiveMatchTopic(viewToken: string, matchId: string): Promise<string> {
  const encoded = new TextEncoder().encode(`${viewToken}:${matchId}`)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `live_match:${hex}`
}
