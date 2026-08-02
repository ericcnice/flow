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
/**
 * Config inicial opcional da sala. É gravada pela RPC DIRETAMENTE como o `state`
 * inicial da partida (create_live_match faz `state := coalesce(p_initial_config,
 * '{}')`), então a sala já nasce com scoreType/firstServer/rules/players — sem
 * depender de set_config depois. `sport` é opcional (também viaja pela URL).
 */
export interface LiveMatchInitialState {
  scoreType?: string
  firstServer?: string
  rules?: any
  players?: Record<string, string>
  sport?: string
}

/**
 * RPC: create_live_match(p_club_slug text, p_initial_config jsonb)
 *      -> { id, view_token, edit_token }
 * Lança um erro claro em caso de falha (criar sala é uma operação crítica).
 *
 * Passamos SEMPRE os dois parâmetros: enviar só `p_club_slug` seria ambíguo
 * (o banco tem duas overloads e `p_initial_config` tem DEFAULT), o que faz o
 * PostgREST não escolher candidato (PGRST203). Fornecer `p_initial_config`
 * casa exclusivamente a overload de 2 args.
 */
export async function createLiveMatch(
  clubSlug: string = 'flow',
  initialConfig?: LiveMatchInitialState,
): Promise<LiveMatchRoom> {
  const { data, error } = await supabase.rpc('create_live_match', {
    p_club_slug: clubSlug,
    p_initial_config: initialConfig ?? {},
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

/**
 * CÓDIGO CURTO do controle remoto — o celular pede, o relógio resolve.
 *
 * A URL de editor tem 100+ caracteres; ninguém digita isso num relógio. O
 * código de 6 dígitos é a ponte. As três defesas (expira em 10min, uso único,
 * um ativo por partida) vivem na RPC — aqui é só o cliente.
 *
 * Devolve null em qualquer falha: sem código, a tela mostra a URL/QR de sempre.
 */
export async function createRemoteCode(
  matchId: string,
  editToken: string,
  extras?: { sport?: string; theme?: string; scoreType?: string },
): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_remote_code', {
    p_match_id: matchId,
    p_edit_token: editToken,
    p_sport: extras?.sport ?? null,
    p_theme: extras?.theme ?? null,
    p_score_type: extras?.scoreType ?? null,
  })
  if (error) {
    console.error('createRemoteCode failed:', error.message)
    return null
  }
  return typeof data === 'string' && data ? data : null
}

/** O que o controle recebe ao trocar o código pelos tokens. */
export type RemoteCodeResolved = {
  matchId: string
  editToken: string
  sport: string | null
  theme: string | null
  scoreType: string | null
}

/**
 * Troca o código pelos tokens. null = inválido, EXPIRADO ou JÁ USADO — a RPC
 * não distingue os três de propósito: dizer "existe mas expirou" a quem chuta
 * confirmaria que o chute acertou um código real.
 */
export async function resolveRemoteCode(code: string): Promise<RemoteCodeResolved | null> {
  const { data, error } = await supabase.rpc('resolve_remote_code', { p_code: code })
  if (error) {
    console.error('resolveRemoteCode failed:', error.message)
    return null
  }
  const row = firstRow<{
    match_id: string
    edit_token: string
    sport: string | null
    theme: string | null
    score_type: string | null
  }>(data)
  if (!row?.match_id || !row?.edit_token) return null
  return {
    matchId: row.match_id,
    editToken: row.edit_token,
    sport: row.sport,
    theme: row.theme,
    scoreType: row.score_type,
  }
}
