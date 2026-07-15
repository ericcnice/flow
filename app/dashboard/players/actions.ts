'use server'

/**
 * Server Actions da gestão de pessoas (tabela `members`).
 *
 * ⚠️ CADA ACTION RECHECA O PAPEL. Uma Server Action é um ENDPOINT HTTP público:
 * qualquer um que descubra o id dela pode chamá-la direto, sem passar pela
 * nossa tela e sem o middleware no caminho. "O botão só aparece para admin"
 * não é autorização — é decoração. Por isso o requireSuperAdmin() é a PRIMEIRA
 * linha de cada função aqui, antes de ler o formulário.
 *
 * Última tranca: a RLS de `members` só libera super_admin. Mesmo que estas
 * duas camadas falhassem, o Postgres recusaria a escrita.
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSuperAdmin } from '../guard'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export type FormState = { ok: boolean; erro?: string }

const vazioParaNulo = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v)

const memberSchema = z.object({
  name: z.string().trim().min(1, 'Nome é obrigatório.'),
  last_name: z.preprocess(vazioParaNulo, z.string().trim().nullable()),
  // Mesmo formato dos slugs de clube: minúsculas, números e hífen.
  slug: z.preprocess(
    vazioParaNulo,
    z
      .string()
      .trim()
      .regex(/^[a-z0-9-]+$/, 'Slug: use só minúsculas, números e hífen.')
      .nullable(),
  ),
  email: z.preprocess(vazioParaNulo, z.string().email('Email inválido.').nullable()),
  phone: z.preprocess(vazioParaNulo, z.string().trim().nullable()),
  role: z.enum(['player', 'coach'], { message: 'Papel inválido.' }),
  club_slug: z.preprocess(vazioParaNulo, z.string().trim().nullable()),
  // URLs de imagens já hospedadas (não há upload). Vazio precisa virar NULL e
  // não '': a listagem decide o avatar por "tem valor?", e '' passaria no teste
  // e renderizaria um <img src=""> quebrado.
  //
  // Sem validação de formato de propósito: o banco não tem CHECK, e o preview
  // no formulário é quem dá o feedback.
  avatar_url: z.preprocess(vazioParaNulo, z.string().trim().nullable()),
  // ⚠️ Só existe para coach. Quando o papel é player o campo nem é montado no
  // formulário, então não vem no FormData, vira null aqui e é GRAVADO como
  // null — ou seja, mudar um coach para player APAGA o logo de patrocinador
  // dele. É intencional (patrocinador não se aplica a player), mas é perda de
  // dado silenciosa se alguém trocar o papel por engano e salvar.
  sponsor_logo_url: z.preprocess(vazioParaNulo, z.string().trim().nullable()),
})

/** address é jsonb: montamos um objeto e omitimos o que veio vazio. */
function montarEndereco(formData: FormData): Record<string, string> | null {
  const campos = ['cep', 'rua', 'numero', 'complemento', 'bairro', 'cidade', 'uf'] as const
  const endereco: Record<string, string> = {}
  for (const campo of campos) {
    const valor = String(formData.get(campo) ?? '').trim()
    if (valor) endereco[campo] = valor
  }
  return Object.keys(endereco).length > 0 ? endereco : null
}

/** Lê e valida o formulário. Compartilhado por addMember e updateMember. */
function lerFormulario(formData: FormData) {
  return memberSchema.safeParse({
    name: formData.get('name'),
    last_name: formData.get('last_name'),
    slug: formData.get('slug'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    role: formData.get('role'),
    club_slug: formData.get('club_slug'),
    avatar_url: formData.get('avatar_url'),
    sponsor_logo_url: formData.get('sponsor_logo_url'),
  })
}

/** Traduz o erro do Postgres em algo acionável para quem preencheu o form. */
function traduzirErro(error: { code?: string; message: string }): string {
  // 23505 = unique_violation. O slug é o único campo único de members.
  if (error.code === '23505') return 'Esse slug já está em uso. Escolha outro.'
  return error.message
}

export async function addMember(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperAdmin() // ← autorização ANTES de qualquer leitura do input

  const parsed = lerFormulario(formData)
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' }
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('members').insert({
    ...parsed.data,
    address: montarEndereco(formData),
    active: true,
  })

  if (error) return { ok: false, erro: traduzirErro(error) }

  revalidatePath('/dashboard/players')
  return { ok: true }
}

/**
 * Edita uma pessoa existente. Mesma validação do cadastro — o modal é o mesmo,
 * então as regras precisam ser as mesmas.
 *
 * `id` vem via .bind() no client, NÃO de um campo do formulário: um hidden
 * input seria editável pelo DevTools, e o alvo do UPDATE é exatamente o que
 * não pode ser escolhido pelo cliente sem checagem.
 *
 * `active` fica de fora de propósito: quem manda nele é o botão Remover/
 * Reativar (setMemberActive). Salvar uma edição não deve ressuscitar
 * silenciosamente alguém que foi removido da lista.
 */
export async function updateMember(
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
    .from('members')
    .update({ ...parsed.data, address: montarEndereco(formData) })
    .eq('id', id)

  if (error) return { ok: false, erro: traduzirErro(error) }

  revalidatePath('/dashboard/players')
  return { ok: true }
}

/**
 * "Remover da lista" sem apagar: vira active=false. Preserva o histórico e
 * qualquer vínculo futuro com profiles (profile_id).
 */
export async function setMemberActive(id: string, active: boolean): Promise<FormState> {
  await requireSuperAdmin() // ← idem: endpoint público, recheca sempre

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, erro: 'Id inválido.' }
  }

  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.from('members').update({ active }).eq('id', id)

  if (error) return { ok: false, erro: error.message }

  revalidatePath('/dashboard/players')
  return { ok: true }
}
