/**
 * Gestão de patrocinadores (entidade própria, tabela `sponsors`) — peça C.1.
 *
 * Server Component: só autoriza e busca. A busca vai pela RPC list_sponsors
 * (SECURITY DEFINER, guarda super_admin no banco) porque `sponsors` tem RLS com
 * ZERO policies — .from('sponsors') não leria nada. Erro (ex.: migração ainda
 * não rodada) → data null → lista vazia, e a página renderiza sem quebrar (a RPC
 * não faz throw; o supabase-js devolve { data, error }).
 *
 * A fonte de verdade dos logos que a JORNADA mostra é ESTA tabela (peça A): a
 * get_sponsor_by_slug lê de sponsors.logo_url, não de members. O antigo campo
 * members.sponsor_logo_url foi aposentado da UI (o member-form não o edita mais).
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '../guard'
import { SponsorsList, type Sponsor } from './sponsors-list'
import { type MemberOption } from './sponsor-form'

export default async function SponsorsPage() {
  await requireSuperAdmin()

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase.rpc('list_sponsors')
  const sponsors = (data ?? []) as Sponsor[]

  // Pessoas para o seletor de vínculo do formulário. A RLS de `members` libera
  // super_admin — exatamente quem chega aqui. Sem filtro de role: um patrocinador
  // pode apontar para qualquer pessoa (na prática são coaches), e a própria RPC
  // create/update_sponsor valida a existência do member.
  const { data: membersData } = await supabase
    .from('members')
    .select('id, name, last_name')
    .eq('active', true)
    .order('name')

  const members: MemberOption[] = (membersData ?? []).map((m) => ({
    id: m.id as string,
    nome: [m.name, m.last_name].filter(Boolean).join(' '),
  }))

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Painel
      </Link>

      {error ? (
        <p
          role="alert"
          className="mt-8 rounded-lg border border-destructive/40 p-4 text-sm text-destructive"
        >
          Não foi possível carregar a lista: {error.message}
        </p>
      ) : (
        <SponsorsList sponsors={sponsors} members={members} />
      )}
    </main>
  )
}
