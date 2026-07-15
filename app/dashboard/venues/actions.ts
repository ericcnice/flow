'use server'

/**
 * Server Actions do cadastro de locais (tabela `venues`).
 *
 * ⚠️ CADA ACTION RECHECA O PAPEL. Uma Server Action é um ENDPOINT HTTP público:
 * quem descobre o id dela chama direto, sem passar pela nossa tela e sem o
 * middleware no caminho. "O botão só aparece para admin" não é autorização.
 * Por isso requireSuperAdmin() é a PRIMEIRA linha de cada função.
 *
 * Última tranca: a RLS de `venues` só libera super_admin (idêntica à de
 * `members`). Mesmo que estas camadas falhassem, o Postgres recusaria.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSuperAdmin } from '../guard'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { SLUG_REGEX } from './constants'

export type FormState = { ok: boolean; erro?: string }

const vazioParaNulo = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

const venueSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório.'),
  // Slug é obrigatório aqui (ao contrário do de members): ele é a URL pública
  // do local, então um local sem slug não teria como ser acessado.
  slug: z
    .string()
    .trim()
    .min(1, 'Slug é obrigatório.')
    .regex(SLUG_REGEX, 'Slug: use só minúsculas, números e hífen.'),
  type: z.enum(['club', 'condominio', 'publica'], { message: 'Tipo inválido.' }),
  // URLs de imagens já hospedadas (não há upload). Campo vazio precisa virar
  // NULL, não '': a listagem decide se mostra o avatar por "tem valor?", e ''
  // passaria no teste e renderizaria um <img src=""> quebrado.
  //
  // Sem validação de formato de propósito (decisão registrada junto com o SQL):
  // o banco não tem CHECK, e o preview no formulário é quem dá o feedback.
  logo_url: z.preprocess(vazioParaNulo, z.string().trim().nullable()),
  photo_url: z.preprocess(vazioParaNulo, z.string().trim().nullable()),
})

/** Lê e valida o formulário. Compartilhado por addVenue e updateVenue. */
function lerFormulario(formData: FormData) {
  return venueSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    type: formData.get('type'),
    logo_url: formData.get('logo_url'),
    photo_url: formData.get('photo_url'),
  })
}

/** address é jsonb: monta um objeto e omite o que veio vazio. */
function montarEndereco(formData: FormData): Record<string, string> | null {
  const campos = ['cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf'] as const
  const endereco: Record<string, string> = {}
  for (const campo of campos) {
    const valor = String(formData.get(campo) ?? '').trim()
    if (valor) endereco[campo] = valor
  }
  return Object.keys(endereco).length > 0 ? endereco : null
}

function traduzirErro(error: { code?: string; message: string }): string {
  // 23505 = unique_violation. O slug é o único campo único de venues.
  if (error.code === '23505') return 'Esse slug já está em uso. Escolha outro.'
  // 23514 = check_violation: rede de segurança caso o regex do client e o
  // CHECK do banco saiam de sincronia.
  if (error.code === '23514') return 'Valor fora do formato aceito pelo banco.'
  return error.message
}

export async function addVenue(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperAdmin() // ← autorização ANTES de qualquer leitura do input

  const parsed = lerFormulario(formData)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('venues').insert({
    ...parsed.data,
    address: montarEndereco(formData),
    active: true,
  })

  if (error) return { ok: false, erro: traduzirErro(error) }

  revalidatePath('/dashboard/venues')
  return { ok: true }
}

/**
 * Edita um local existente. Mesma validação do cadastro — o modal é o mesmo.
 *
 * `id` vem via .bind() no client, NÃO de um campo do formulário: um hidden
 * input seria editável pelo DevTools, e o alvo do UPDATE é exatamente o que
 * não pode ser escolhido pelo cliente sem checagem.
 *
 * `active` fica de fora de propósito: quem manda nele é o botão Remover/
 * Reativar. Salvar uma edição não deve ressuscitar um local desativado.
 */
export async function updateVenue(
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
  const { error } = await supabase
    .from('venues')
    .update({ ...parsed.data, address: montarEndereco(formData) })
    .eq('id', id)

  if (error) return { ok: false, erro: traduzirErro(error) }

  revalidatePath('/dashboard/venues')
  return { ok: true }
}

/** "Remover da lista" sem apagar: vira active=false, preservando o histórico. */
export async function setVenueActive(id: string, active: boolean): Promise<FormState> {
  await requireSuperAdmin() // ← idem

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, erro: 'Id inválido.' }
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('venues').update({ active }).eq('id', id)

  if (error) return { ok: false, erro: error.message }

  revalidatePath('/dashboard/venues')
  return { ok: true }
}
