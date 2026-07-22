'use server'

/**
 * Server Actions do CRUD de quadras (tabela `courts`, Fatia 2 da unificação).
 *
 * courts tem RLS com policies super_admin (Fatia 1), então — como members/venues
 * — a escrita é DIRETA com a sessão (.from('courts')), sem RPC. (RPC só é
 * necessário nas tabelas da jornada anônima, RLS zero-policies, ex.:
 * court_sponsors.) requireSuperAdmin() é a 1ª linha de cada action: Server Action
 * é endpoint público; "o botão só aparece p/ admin" não é autorização. Última
 * tranca: a RLS de courts recusa quem não for super_admin.
 *
 * EIXO desta fatia: SLUG IMUTÁVEL + SOFT-DELETE.
 *  - O slug vive em QR IMPRESSO e na telemetria histórica (court_visits/
 *    court_sponsors guardam sport+court_slug como texto, sem FK). Renomear o slug
 *    orfanaria os dois → o slug NÃO é editável após a criação (só o `name`).
 *  - "Remover" é soft-delete (active=false): preserva histórico e a associação de
 *    patrocinador. DELETE definitivo fica para o futuro (quadra criada por engano,
 *    zero acessos) — NÃO implementado aqui.
 *
 * `sport` é sempre o id CANÔNICO ('tennis','beach',…) — o mesmo da telemetria.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSuperAdmin } from '../../guard'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { SLUG_REGEX } from '../constants'
import { SPORTS } from '@/lib/sports-catalog'

export type FormState = { ok: boolean; erro?: string }

const idSchema = z.string().uuid()

// Os 6 esportes canônicos aceitos — trava o `sport` no que o catálogo/agrupamento
// do painel entendem (sportById/CANONICAL_TO_SLUG assumem um dos 6).
const SPORT_IDS = SPORTS.map((s) => s.id) as string[]

const slugSchema = z
  .string()
  .trim()
  .min(1, 'Slug é obrigatório.')
  .max(40, 'Slug muito longo.')
  .regex(SLUG_REGEX, 'Slug: use só minúsculas, números e hífen.')

const nameSchema = z.string().trim().min(1, 'Nome é obrigatório.').max(60, 'Nome muito longo.')

function revalidarVenue(venueSlug: string) {
  revalidatePath(`/dashboard/venues/${venueSlug}`)
}

function traduzirErro(error: { code?: string; message: string }): string {
  // 23505 = unique_violation → o único unique de courts é (venue_id, sport, slug).
  if (error.code === '23505') return 'Esse slug já existe nesse esporte.'
  if (error.code === '23514') return 'Valor fora do formato aceito pelo banco.'
  return error.message
}

/**
 * Adiciona uma quadra. `sort` = max(sort)+1 do esporte (vai para o fim da lista).
 * slug validado (formato) + unique(venue_id,sport,slug) no banco (23505).
 */
export async function addCourt(
  venueId: string,
  venueSlug: string,
  sport: string,
  slug: string,
  name: string,
): Promise<FormState> {
  await requireSuperAdmin()

  if (!idSchema.safeParse(venueId).success) return { ok: false, erro: 'Id inválido.' }
  if (!SPORT_IDS.includes(sport)) return { ok: false, erro: 'Esporte inválido.' }

  const s = slugSchema.safeParse(slug)
  if (!s.success) return { ok: false, erro: s.error.issues[0]?.message ?? 'Slug inválido.' }
  const n = nameSchema.safeParse(name)
  if (!n.success) return { ok: false, erro: n.error.issues[0]?.message ?? 'Nome inválido.' }

  const supabase = await createServerSupabaseClient()

  // Próximo `sort` do esporte (fim da lista). Sem linhas → 1.
  const { data: maxRow } = await supabase
    .from('courts')
    .select('sort')
    .eq('venue_id', venueId)
    .eq('sport', sport)
    .order('sort', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sort = (maxRow?.sort ?? 0) + 1

  const { error } = await supabase
    .from('courts')
    .insert({ venue_id: venueId, sport, slug: s.data, name: n.data, sort })

  if (error) return { ok: false, erro: traduzirErro(error) }

  revalidarVenue(venueSlug)
  return { ok: true }
}

/**
 * Renomeia uma quadra — SÓ o `name`. O slug é IMUTÁVEL (QR impresso + telemetria
 * histórica); não há caminho para editá-lo.
 */
export async function renameCourt(
  courtId: string,
  venueSlug: string,
  name: string,
): Promise<FormState> {
  await requireSuperAdmin()

  if (!idSchema.safeParse(courtId).success) return { ok: false, erro: 'Id inválido.' }
  const n = nameSchema.safeParse(name)
  if (!n.success) return { ok: false, erro: n.error.issues[0]?.message ?? 'Nome inválido.' }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('courts').update({ name: n.data }).eq('id', courtId)

  if (error) return { ok: false, erro: error.message }

  revalidarVenue(venueSlug)
  return { ok: true }
}

/** Soft-delete / reativação: liga/desliga `active`. NÃO apaga a linha. */
export async function setCourtActive(
  courtId: string,
  venueSlug: string,
  active: boolean,
): Promise<FormState> {
  await requireSuperAdmin()

  if (!idSchema.safeParse(courtId).success) return { ok: false, erro: 'Id inválido.' }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('courts').update({ active }).eq('id', courtId)

  if (error) return { ok: false, erro: error.message }

  revalidarVenue(venueSlug)
  return { ok: true }
}

/**
 * Reordena: troca o `sort` com o vizinho do MESMO esporte (dois updates). 'up' =
 * vizinho de sort imediatamente menor; 'down' = imediatamente maior. Sem vizinho
 * (já no topo/fundo) = no-op. Não é atômico, mas `sort` não é único e o admin é
 * um só — um race raro só embaralharia a ordem, nunca corromperia dado.
 */
export async function reorderCourt(
  courtId: string,
  venueSlug: string,
  direction: 'up' | 'down',
): Promise<FormState> {
  await requireSuperAdmin()

  if (!idSchema.safeParse(courtId).success) return { ok: false, erro: 'Id inválido.' }

  const supabase = await createServerSupabaseClient()
  const { data: cur } = await supabase
    .from('courts')
    .select('id, venue_id, sport, sort')
    .eq('id', courtId)
    .maybeSingle()
  if (!cur) return { ok: false, erro: 'Quadra não encontrada.' }

  let q = supabase
    .from('courts')
    .select('id, sort')
    .eq('venue_id', cur.venue_id)
    .eq('sport', cur.sport)
  q =
    direction === 'up'
      ? q.lt('sort', cur.sort).order('sort', { ascending: false })
      : q.gt('sort', cur.sort).order('sort', { ascending: true })
  const { data: neigh } = await q.limit(1).maybeSingle()

  if (!neigh) return { ok: true } // já no topo/fundo: nada a fazer

  const u1 = await supabase.from('courts').update({ sort: neigh.sort }).eq('id', cur.id)
  if (u1.error) return { ok: false, erro: u1.error.message }
  const u2 = await supabase.from('courts').update({ sort: cur.sort }).eq('id', neigh.id)
  if (u2.error) return { ok: false, erro: u2.error.message }

  revalidarVenue(venueSlug)
  return { ok: true }
}

/**
 * Semeia q1 e q2 para os SEIS esportes canônicos (opt-in, botão do estado vazio).
 * Idempotente: upsert com ignoreDuplicates (= insert ... on conflict do nothing),
 * então reclicar não duplica nem falha.
 */
export async function seedDefaultCourts(venueId: string, venueSlug: string): Promise<FormState> {
  await requireSuperAdmin()

  if (!idSchema.safeParse(venueId).success) return { ok: false, erro: 'Id inválido.' }

  const rows = SPORT_IDS.flatMap((sport) => {
    const unidade = sport === 'tabletennis' ? 'Mesa' : 'Quadra'
    return [
      { venue_id: venueId, sport, slug: 'q1', name: `${unidade} 1`, sort: 1 },
      { venue_id: venueId, sport, slug: 'q2', name: `${unidade} 2`, sort: 2 },
    ]
  })

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase
    .from('courts')
    .upsert(rows, { onConflict: 'venue_id,sport,slug', ignoreDuplicates: true })

  if (error) return { ok: false, erro: error.message }

  revalidarVenue(venueSlug)
  return { ok: true }
}
