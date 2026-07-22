/**
 * Gestão de pessoas (roster administrativo, tabela `members`).
 *
 * Server Component: a query roda com a sessão do usuário, então a RLS de
 * `members` (super_admin exclusivo) é aplicada pelo Postgres. O
 * requireSuperAdmin() abaixo é a camada de UI/UX — a tranca real é a RLS.
 *
 * A página só BUSCA e autoriza; busca/filtro/tabela/modal vivem em
 * <MembersList>, que é client (precisa de estado de interação).
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '../guard'
import { MembersList, type Member } from './members-list'

export default async function PlayersPage() {
  await requireSuperAdmin()

  const supabase = await createServerSupabaseClient()
  // `address` e `avatar_url` entram no select porque o modal de EDIÇÃO precisa
  // pré-preenchê-los — sem eles, editar alguém apagaria o endereço e a foto já
  // cadastrados. `avatar_url` também alimenta o avatar. `sponsor_logo_url` saiu:
  // o campo foi aposentado do formulário (peça C.1), logos vivem em `sponsors`.
  const { data, error } = await supabase
    .from('members')
    .select(
      'id, name, last_name, slug, email, phone, role, club_slug, address, avatar_url, active',
    )
    .order('active', { ascending: false })
    .order('created_at', { ascending: false })

  const members = (data ?? []) as Member[]
  // Clubes vêm de `venues` (banco), não mais do CLUBS estático (Fatia 3b): o
  // dropdown/rótulos do dashboard passam a refletir os clubes reais, incluindo os
  // criados no dashboard. RLS super_admin (leitura direta com a sessão).
  const { data: venuesData } = await supabase
    .from('venues')
    .select('slug, name')
    .eq('active', true)
    .order('name', { ascending: true })
  const clubes = (venuesData ?? []).map((v) => ({ slug: v.slug as string, nome: v.name as string }))

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
        <MembersList members={members} clubes={clubes} />
      )}
    </main>
  )
}
