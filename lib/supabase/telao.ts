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
  /** null = quadra sem partida ligada (o estado normal ENTRE jogos). */
  viewToken: string | null
  matchId: string | null
  /** Vídeo PRÓPRIO desta quadra. null = cai no canal do clube. */
  videoUrl: string | null
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
    .select('court_slug, view_token, match_id, video_url, updated_at')
    .eq('venue_slug', venue)
    .eq('court_slug', court)
    .maybeSingle()
  if (error || !data) return null
  return {
    courtSlug: data.court_slug,
    viewToken: data.view_token,
    matchId: data.match_id,
    videoUrl: data.video_url,
    updatedAt: data.updated_at,
  }
}

/** Todas as ligações de um clube — para a tela de operação mostrar o estado. */
export async function lerLinks(venue: string): Promise<TelaoLink[]> {
  const db = admin()
  if (!db) return []
  const { data, error } = await db
    .from('telao_links')
    .select('court_slug, view_token, match_id, video_url, updated_at')
    .eq('venue_slug', venue)
  if (error || !data) return []
  return data.map((d) => ({
    courtSlug: d.court_slug,
    viewToken: d.view_token,
    matchId: d.match_id,
    videoUrl: d.video_url,
    updatedAt: d.updated_at,
  }))
}

/**
 * Liga (ou re-liga) uma quadra a uma partida.
 *
 * ⚠️ Upsert PARCIAL: mexe só na partida. `video_url` é config, e a partida
 * troca a cada jogo — se o upsert mandasse a linha inteira, ligar o próximo
 * jogo apagaria o vídeo configurado da quadra.
 */
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

/** O VÍDEO próprio da quadra. Vazio = a quadra volta a usar o canal do clube. */
export async function gravarVideoDaQuadra(
  venue: string,
  court: string,
  videoUrl: string | null,
): Promise<boolean> {
  const db = admin()
  if (!db) return false
  const { error } = await db.from('telao_links').upsert(
    {
      venue_slug: venue,
      court_slug: court,
      video_url: videoUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'venue_slug,court_slug' },
  )
  return !error
}

/**
 * Desliga a PARTIDA da quadra — o telão volta a "aguardando partida".
 *
 * ⚠️ Zera os campos em vez de DELETAR a linha (que era o que fazia antes): a
 * linha agora também guarda o vídeo da quadra, e apagá-la levaria junto uma
 * config que ninguém pediu para remover.
 */
export async function apagarLink(venue: string, court: string): Promise<boolean> {
  const db = admin()
  if (!db) return false
  const { error } = await db
    .from('telao_links')
    .update({ view_token: null, match_id: null, updated_at: new Date().toISOString() })
    .eq('venue_slug', venue)
    .eq('court_slug', court)
  return !error
}

/** O canal do YouTube do CLUBE (fallback de todas as quadras). */
export async function lerCanal(venue: string): Promise<string | null> {
  const db = admin()
  if (!db) return null
  const { data, error } = await db
    .from('telao_config')
    .select('youtube_channel_id')
    .eq('venue_slug', venue)
    .maybeSingle()
  if (error || !data) return null
  return data.youtube_channel_id
}

export async function gravarCanal(venue: string, channelId: string | null): Promise<boolean> {
  const db = admin()
  if (!db) return false
  const { error } = await db.from('telao_config').upsert(
    { venue_slug: venue, youtube_channel_id: channelId, updated_at: new Date().toISOString() },
    { onConflict: 'venue_slug' },
  )
  return !error
}
