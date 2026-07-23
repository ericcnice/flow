'use client'

/**
 * CONSENTIMENTOS (A1.3d) — leitura/gravação do estado atual em public.consents
 * (RLS self). Aceite de T&C versionado + opt-in de marketing (separado). Os
 * upserts parciais tocam SÓ as colunas do respectivo consentimento (o
 * ON CONFLICT do PostgREST atualiza apenas as colunas enviadas), então marketing
 * e T&C não se sobrescrevem.
 */

import { createBrowserSupabaseClient } from './browser-client'

export type Consent = {
  tosVersion: string | null
  tosAcceptedAt: string | null
  marketingOptIn: boolean
}

/** Lê o consentimento do próprio usuário (null se ainda não houver linha). */
export async function getConsent(userId: string): Promise<Consent | null> {
  const supabase = createBrowserSupabaseClient()
  const { data, error } = await supabase
    .from('consents')
    .select('tos_version, tos_accepted_at, marketing_opt_in')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return {
    tosVersion: data.tos_version ?? null,
    tosAcceptedAt: data.tos_accepted_at ?? null,
    marketingOptIn: Boolean(data.marketing_opt_in),
  }
}

/** Aceite INICIAL (cadastro): grava versão de T&C + timestamp e o marketing. */
export async function saveConsentInitial(
  userId: string,
  { tosVersion, marketing }: { tosVersion: string; marketing: boolean },
): Promise<{ error: string | null }> {
  const supabase = createBrowserSupabaseClient()
  const now = new Date().toISOString()
  const { error } = await supabase.from('consents').upsert(
    {
      user_id: userId,
      tos_version: tosVersion,
      tos_accepted_at: now,
      marketing_opt_in: marketing,
      marketing_updated_at: now,
      updated_at: now,
    },
    { onConflict: 'user_id' },
  )
  return { error: error?.message ?? null }
}

/** Re-aceite dos termos (quando a versão mudou) — toca só as colunas de T&C. */
export async function acceptTos(userId: string, tosVersion: string): Promise<{ error: string | null }> {
  const supabase = createBrowserSupabaseClient()
  const now = new Date().toISOString()
  const { error } = await supabase.from('consents').upsert(
    { user_id: userId, tos_version: tosVersion, tos_accepted_at: now, updated_at: now },
    { onConflict: 'user_id' },
  )
  return { error: error?.message ?? null }
}

/** Alterna o marketing — toca só as colunas de marketing. */
export async function setMarketing(userId: string, optIn: boolean): Promise<{ error: string | null }> {
  const supabase = createBrowserSupabaseClient()
  const now = new Date().toISOString()
  const { error } = await supabase.from('consents').upsert(
    { user_id: userId, marketing_opt_in: optIn, marketing_updated_at: now, updated_at: now },
    { onConflict: 'user_id' },
  )
  return { error: error?.message ?? null }
}
