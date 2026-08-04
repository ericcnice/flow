/**
 * ACESSO À LIGAÇÃO QUADRA → PARTIDA do telão. **SERVER-ONLY.**
 *
 * ⚠️ Usa SERVICE_ROLE, que bypassa RLS — este arquivo NUNCA pode ser importado
 * por um Client Component. A tabela `telao_links` guarda `view_token`, e é por
 * isso que ela tem RLS fechada e zero policies: a leitura passa obrigatoriamente
 * por aqui, no servidor, e o segredo não fica descobrível pelo cliente.
 *
 * Mesma técnica do /api/avatar: chave server-only (sem NEXT_PUBLIC), cliente
 * criado sob demanda, sem sessão.
 */

import 'server-only'
import { createClient } from '@supabase/supabase-js'

export type TelaoLink = {
  courtSlug: string
  viewToken: string
  matchId: string | null
  updatedAt: string
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** A partida ligada a uma quadra. null = ninguém ligou nada ainda. */
export async function lerLink(venue: string, court: string): Promise<TelaoLink | null> {
  const db = admin()
  if (!db) return null
  const { data, error } = await db
    .from('telao_links')
    .select('court_slug, view_token, match_id, updated_at')
    .eq('venue_slug', venue)
    .eq('court_slug', court)
    .maybeSingle()
  if (error || !data) return null
  return {
    courtSlug: data.court_slug,
    viewToken: data.view_token,
    matchId: data.match_id,
    updatedAt: data.updated_at,
  }
}

/** Todas as ligações de um clube — para a tela de operação mostrar o estado. */
export async function lerLinks(venue: string): Promise<TelaoLink[]> {
  const db = admin()
  if (!db) return []
  const { data, error } = await db
    .from('telao_links')
    .select('court_slug, view_token, match_id, updated_at')
    .eq('venue_slug', venue)
  if (error || !data) return []
  return data.map((d) => ({
    courtSlug: d.court_slug,
    viewToken: d.view_token,
    matchId: d.match_id,
    updatedAt: d.updated_at,
  }))
}

/** Liga (ou re-liga) uma quadra a uma partida. */
export async function gravarLink(
  venue: string,
  court: string,
  viewToken: string,
  matchId: string | null,
): Promise<boolean> {
  const db = admin()
  if (!db) return false
  const { error } = await db.from('telao_links').upsert(
    {
      venue_slug: venue,
      court_slug: court,
      view_token: viewToken,
      match_id: matchId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'venue_slug,court_slug' },
  )
  return !error
}

/** Desliga a quadra (o telão volta a "aguardando partida"). */
export async function apagarLink(venue: string, court: string): Promise<boolean> {
  const db = admin()
  if (!db) return false
  const { error } = await db
    .from('telao_links')
    .delete()
    .eq('venue_slug', venue)
    .eq('court_slug', court)
  return !error
}
