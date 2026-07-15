/**
 * Cadastro de locais (clubes, condomínios, quadras públicas — tabela `venues`).
 *
 * Server Component: a query roda com a sessão do usuário, então a RLS de
 * `venues` (super_admin exclusivo, igual a `members`) é aplicada pelo Postgres.
 * O requireSuperAdmin() é a camada de UI/UX — a tranca real é a RLS.
 *
 * COEXISTE com lib/clubs-config.ts, sem substituí-lo: o config estático
 * continua servindo a jornada de QR (/[clube]/[esporte]/[quadra]), que funciona
 * sem banco e está validada em quadra. Esta tabela serve o cadastro e, na
 * Fatia 2, o telão público em /c/[slug] — que ainda NÃO existe.
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '../guard'
import { VenuesList, type Venue } from './venues-list'

export default async function VenuesPage() {
  await requireSuperAdmin()

  const supabase = await createServerSupabaseClient()
  // `address` entra no select porque o modal de EDIÇÃO precisa pré-preencher o
  // endereço — sem ele, editar um local apagaria o endereço já cadastrado.
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, slug, type, address, active')
    .order('active', { ascending: false })
    .order('created_at', { ascending: false })

  const venues = (data ?? []) as Venue[]

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
        <VenuesList venues={venues} />
      )}
    </main>
  )
}
