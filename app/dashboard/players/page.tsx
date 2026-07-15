/**
 * Gestão de pessoas (roster administrativo, tabela `members`).
 *
 * Server Component: a query roda com a sessão do usuário, então a RLS de
 * `members` (super_admin exclusivo) é aplicada pelo Postgres. O
 * requireSuperAdmin() abaixo é a camada de UI/UX — a tranca real é a RLS.
 *
 * Layout responsivo no padrão do V10 (tabela no desktop, cards no mobile),
 * escrito do zero: o projeto não tem componente de Table.
 */

import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import { CLUBS, clubBySlug } from '@/lib/clubs-config'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '../guard'
import { MemberForm } from './member-form'
import { ActiveToggle } from './active-toggle'

type Member = {
  id: string
  name: string
  last_name: string | null
  slug: string | null
  email: string | null
  phone: string | null
  role: string
  club_slug: string | null
  active: boolean
}

function NomeCompleto({ m }: { m: Member }) {
  return (
    <div className="flex flex-col">
      <span className="font-medium">{[m.name, m.last_name].filter(Boolean).join(' ')}</span>
      {m.slug && <span className="font-mono text-xs text-muted-foreground">@{m.slug}</span>}
    </div>
  )
}

function Contato({ m }: { m: Member }) {
  if (!m.email && !m.phone) return <span className="text-muted-foreground">—</span>
  return (
    <div className="flex flex-col text-sm">
      {m.email && <span className="truncate">{m.email}</span>}
      {m.phone && <span className="text-muted-foreground">{m.phone}</span>}
    </div>
  )
}

function Papel({ role }: { role: string }) {
  return (
    <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs font-medium capitalize">
      {role}
    </span>
  )
}

function Status({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${
        active ? 'text-primary' : 'text-muted-foreground'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-primary' : 'bg-muted-foreground'}`}
      />
      {active ? 'Ativo' : 'Inativo'}
    </span>
  )
}

/** Nome amigável do clube; cai no slug cru se não estiver no clubs-config. */
function nomeClube(slug: string | null) {
  if (!slug) return '—'
  return clubBySlug(slug)?.nome ?? slug
}

export default async function PlayersPage() {
  await requireSuperAdmin()

  const supabase = await createServerSupabaseClient()
  const { data, error } = await supabase
    .from('members')
    .select('id, name, last_name, slug, email, phone, role, club_slug, active')
    .order('active', { ascending: false })
    .order('created_at', { ascending: false })

  const members = (data ?? []) as Member[]
  const clubes = Object.values(CLUBS).map((c) => ({ slug: c.id, nome: c.nome }))

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Painel
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Players</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {members.length} {members.length === 1 ? 'pessoa cadastrada' : 'pessoas cadastradas'}
          </p>
        </div>
        <MemberForm clubes={clubes} />
      </div>

      {error && (
        <p role="alert" className="mt-8 rounded-lg border border-destructive/40 p-4 text-sm text-destructive">
          Não foi possível carregar a lista: {error.message}
        </p>
      )}

      {!error && members.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
          <Users className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Ninguém cadastrado ainda. Use “Adicionar Pessoa” para começar.
          </p>
        </div>
      )}

      {members.length > 0 && (
        <>
          {/* Desktop: tabela. */}
          <div className="mt-8 hidden overflow-x-auto rounded-2xl border border-border md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-card">
                <tr className="text-xs uppercase tracking-widest text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">Contato</th>
                  <th className="px-4 py-3 font-medium">Papel</th>
                  <th className="px-4 py-3 font-medium">Clube</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr
                    key={m.id}
                    className={`border-b border-border last:border-0 ${m.active ? '' : 'opacity-50'}`}
                  >
                    <td className="px-4 py-3">
                      <NomeCompleto m={m} />
                    </td>
                    <td className="max-w-[16rem] px-4 py-3">
                      <Contato m={m} />
                    </td>
                    <td className="px-4 py-3">
                      <Papel role={m.role} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{nomeClube(m.club_slug)}</td>
                    <td className="px-4 py-3">
                      <Status active={m.active} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <ActiveToggle id={m.id} active={m.active} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards. */}
          <div className="mt-8 flex flex-col gap-3 md:hidden">
            {members.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl border border-border bg-card p-4 ${m.active ? '' : 'opacity-50'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <NomeCompleto m={m} />
                  <Status active={m.active} />
                </div>
                <div className="mt-3">
                  <Contato m={m} />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Papel role={m.role} />
                    <span className="text-xs text-muted-foreground">{nomeClube(m.club_slug)}</span>
                  </div>
                  <ActiveToggle id={m.id} active={m.active} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  )
}
