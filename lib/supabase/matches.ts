'use client'

/**
 * Gravação do HISTÓRICO de partidas (A1.3a). SELF-INSERT em public.matches (a
 * RLS `with check owner_id = auth.uid()` é a tranca). Usa o browser-client
 * (sessão em cookie) — NUNCA o client.ts do Realtime.
 *
 * OFFLINE-FIRST: o save é FIRE-AND-FORGET — nunca bloqueia a tela de fim. Falha/
 * offline → enfileira em localStorage e dá flush no próximo load com sessão+rede.
 * Idempotência: cada item da fila tem um `localId`; o flush remove no SUCESSO
 * (removal-on-success) e um guard de concorrência (`flushing`) impede flush
 * duplo. A RLS ainda protege: um item com owner_id != auth.uid() falha o insert
 * e FICA na fila até o dono certo logar (sem contaminação entre usuários).
 */

import { createBrowserSupabaseClient } from '@/lib/supabase/browser-client'

/** Linha de public.matches (owner_id = quem encerrou logado). */
export type MatchRow = {
  owner_id: string
  sport: string
  venue_slug: string | null
  court_slug: string | null
  game_type: string | null
  result: unknown
  started_at: string | null
}

type QueueItem = MatchRow & { localId: string }

const QUEUE_KEY = 'pending_matches'
type SaveResult = 'saved' | 'queued'

function readQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as QueueItem[]) : []
  } catch {
    return []
  }
}

function writeQueue(items: QueueItem[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(QUEUE_KEY)
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(items))
  } catch {
    // Cota / aba privada: seguir sem fila é degradação aceitável.
  }
}

function enqueue(row: MatchRow): void {
  const localId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 1e9)}`
  writeQueue([...readQueue(), { ...row, localId }])
}

/**
 * Salva uma partida. Sucesso → 'saved'. Erro/offline → enfileira e devolve
 * 'queued'. NUNCA lança (o caller mostra o estado no CTA).
 */
export async function saveMatch(row: MatchRow): Promise<SaveResult> {
  try {
    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase.from('matches').insert(row)
    if (error) throw error
    return 'saved'
  } catch {
    enqueue(row)
    return 'queued'
  }
}

let flushing = false

/**
 * Tenta gravar a fila pendente. Só o dono certo (auth.uid()) consegue inserir
 * cada item (RLS); os demais ficam na fila. Guard anti-concorrência. NUNCA lança.
 */
export async function flushPendingMatches(): Promise<void> {
  if (flushing) return
  const fila = readQueue()
  if (fila.length === 0) return
  flushing = true
  try {
    const supabase = createBrowserSupabaseClient()
    const restantes: QueueItem[] = []
    for (const item of fila) {
      const { localId: _localId, ...row } = item
      try {
        const { error } = await supabase.from('matches').insert(row)
        if (error) restantes.push(item) // ex.: offline / owner != sessão → fica
      } catch {
        restantes.push(item)
      }
    }
    writeQueue(restantes)
  } finally {
    flushing = false
  }
}
