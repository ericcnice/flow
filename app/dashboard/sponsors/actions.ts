'use server'

/**
 * Server Actions da administração de patrocinadores (tabela `sponsors`).
 *
 * ⚠️ DIFERENÇA CRÍTICA para members/venues: `sponsors` tem RLS com ZERO policies,
 * então `.from('sponsors').insert/update()` NÃO escreve nada — nem para
 * super_admin. Toda escrita passa pelas RPCs SECURITY DEFINER (create_sponsor /
 * update_sponsor / set_sponsor_active), que recheca o papel no banco e ABORTA
 * com raise exception. O supabase-js devolve isso em `error.message`, já em
 * pt-BR (as RPCs levantam mensagens legíveis), então repassamos direto ao form.
 *
 * Mesmo assim requireSuperAdmin() é a 1ª linha de cada action: Server Action é
 * um ENDPOINT HTTP público — "o botão só aparece para admin" não é autorização.
 * A guarda no corpo da RPC é a última tranca.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSuperAdmin } from '../guard'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export type FormState = { ok: boolean; erro?: string }

const vazioParaNulo = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

const sponsorSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório.').max(120, 'Nome muito longo (máx. 120).'),
  // Slug obrigatório: é a chave canônica que viaja na URL e no cache do cliente.
  slug: z
    .string()
    .trim()
    .min(1, 'Slug é obrigatório.')
    .regex(/^[a-z0-9-]+$/, 'Slug: use só minúsculas, números e hífen.')
    .max(64, 'Slug muito longo (máx. 64).'),
  // Logo por URL já hospedada (não há upload — mesmo padrão de members/venues).
  // https:// obrigatório: espelha a validação da RPC e o requisito de CORS da
  // tela de compartilhar (ver o aviso em lib/supabase/sponsors.ts). O preview do
  // ImageUrlField dá o feedback visual.
  logo_url: z
    .string()
    .trim()
    .min(1, 'Logo é obrigatório.')
    .regex(/^https:\/\//, 'A URL do logo precisa começar com https://.')
    .max(500, 'URL do logo muito longa (máx. 500).'),
  // Vínculo OPCIONAL com uma pessoa (coach). Vazio = marca solta (member_id null).
  member_id: z.preprocess(vazioParaNulo, z.string().uuid('Pessoa inválida.').nullable()),
})

/** Lê e valida o formulário. Compartilhado por addSponsor e updateSponsor. */
function lerFormulario(formData: FormData) {
  return sponsorSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    logo_url: formData.get('logo_url'),
    member_id: formData.get('member_id'),
  })
}

export async function addSponsor(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperAdmin() // ← autorização ANTES de qualquer leitura do input

  const parsed = lerFormulario(formData)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.rpc('create_sponsor', {
    p_slug: parsed.data.slug,
    p_name: parsed.data.name,
    p_logo_url: parsed.data.logo_url,
    p_member_id: parsed.data.member_id,
  })

  // A RPC levanta mensagem legível (slug já existe, pessoa não encontrada…).
  if (error) return { ok: false, erro: error.message }

  revalidatePath('/dashboard/sponsors')
  return { ok: true }
}

/**
 * Edita um patrocinador existente. Mesma validação do cadastro — o modal é o
 * mesmo. `id` vem via .bind() no client, NÃO de um campo do formulário: um
 * hidden input seria editável pelo DevTools, e o alvo do UPDATE é exatamente o
 * que não pode ser escolhido pelo cliente sem checagem.
 *
 * `active` fica de fora de propósito: quem manda nele é o botão Remover/Reativar
 * (setSponsorActive). Salvar uma edição não deve ressuscitar um sponsor inativo.
 */
export async function updateSponsor(
  id: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireSuperAdmin() // ← idem: endpoint público, recheca sempre

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, erro: 'Id inválido.' }
  }

  const parsed = lerFormulario(formData)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.rpc('update_sponsor', {
    p_id: id,
    p_slug: parsed.data.slug,
    p_name: parsed.data.name,
    p_logo_url: parsed.data.logo_url,
    p_member_id: parsed.data.member_id,
  })

  if (error) return { ok: false, erro: error.message }

  revalidatePath('/dashboard/sponsors')
  return { ok: true }
}

/**
 * "Remover da lista" sem apagar: vira active=false. Nunca delete real — as FKs
 * (sponsors.member_id, court_sponsors.sponsor_id) tornam delete destrutivo.
 * Desativar tira o patrocinador da jornada (quadras associadas ficam sem logo).
 */
export async function setSponsorActive(id: string, active: boolean): Promise<FormState> {
  await requireSuperAdmin() // ← idem

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, erro: 'Id inválido.' }
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.rpc('set_sponsor_active', { p_id: id, p_active: active })

  if (error) return { ok: false, erro: error.message }

  revalidatePath('/dashboard/sponsors')
  return { ok: true }
}
