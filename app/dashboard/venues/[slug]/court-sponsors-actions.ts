'use server'

/**
 * Server Actions da associação patrocinador POR QUADRA + default do clube
 * (peça C.2). court_sponsors tem RLS com ZERO policies, então NÃO há escrita
 * direta — tudo passa pelas RPCs SECURITY DEFINER (set/remove_court_sponsor,
 * set_venue_default_sponsor), que recheca o papel no banco e ABORTA com raise
 * exception. O supabase-js devolve isso em error.message (já legível, pt-BR).
 *
 * ⚠️ `sport` aqui é o sportId CANÔNICO ('tennis','beach','tabletennis'…), não o
 * slug de URL — é o que a jornada grava e o que get_sponsor_for_court recebe. A
 * conversão slug→canônico é feita no componente (sportIdFromSlug) ANTES de
 * chamar estas actions.
 *
 * requireSuperAdmin() é a 1ª linha de cada uma: Server Action é endpoint público.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSuperAdmin } from '../../guard'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export type FormState = { ok: boolean; erro?: string }

const idSchema = z.string().uuid()

/** Revalida a página de detalhe do venue após uma escrita. */
function revalidarVenue(venueSlug: string) {
  revalidatePath(`/dashboard/venues/${venueSlug}`)
}

export async function setCourtSponsor(
  venueId: string,
  venueSlug: string,
  sport: string,
  courtSlug: string,
  sponsorId: string,
): Promise<FormState> {
  await requireSuperAdmin()

  if (!idSchema.safeParse(venueId).success || !idSchema.safeParse(sponsorId).success) {
    return { ok: false, erro: 'Id inválido.' }
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.rpc('set_court_sponsor', {
    p_venue_id: venueId,
    p_sport: sport,
    p_court_slug: courtSlug,
    p_sponsor_id: sponsorId,
  })

  if (error) return { ok: false, erro: error.message }

  revalidarVenue(venueSlug)
  return { ok: true }
}

export async function removeCourtSponsor(
  venueId: string,
  venueSlug: string,
  sport: string,
  courtSlug: string,
): Promise<FormState> {
  await requireSuperAdmin()

  if (!idSchema.safeParse(venueId).success) {
    return { ok: false, erro: 'Id inválido.' }
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.rpc('remove_court_sponsor', {
    p_venue_id: venueId,
    p_sport: sport,
    p_court_slug: courtSlug,
  })

  if (error) return { ok: false, erro: error.message }

  revalidarVenue(venueSlug)
  return { ok: true }
}

/** p_sponsor_id null = limpar o default do clube. */
export async function setVenueDefaultSponsor(
  venueId: string,
  venueSlug: string,
  sponsorId: string | null,
): Promise<FormState> {
  await requireSuperAdmin()

  if (!idSchema.safeParse(venueId).success) {
    return { ok: false, erro: 'Id inválido.' }
  }
  if (sponsorId !== null && !idSchema.safeParse(sponsorId).success) {
    return { ok: false, erro: 'Id inválido.' }
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.rpc('set_venue_default_sponsor', {
    p_venue_id: venueId,
    p_sponsor_id: sponsorId,
  })

  if (error) return { ok: false, erro: error.message }

  revalidarVenue(venueSlug)
  return { ok: true }
}
