'use client'

/**
 * Listagem com busca e filtro + os gatilhos de Adicionar/Editar.
 *
 * Filtro é CLIENT-SIDE de propósito: o volume atual é baixo (dezenas), a lista
 * já veio inteira do Server Component, e filtrar em memória dá resposta
 * instantânea sem round-trip nem estado na URL. Quando o roster crescer a ponto
 * de a página inteira pesar, o corte natural é mover busca/filtro para a query
 * (.ilike/.eq no Supabase) e paginar — a forma dos dados aqui não muda.
 *
 * A RLS de members continua sendo a tranca: isto é UI sobre dados que o
 * servidor já autorizou.
 */

import { useMemo, useState } from 'react'
import { Pencil, Plus, Search, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { clubBySlug } from '@/lib/clubs-config'
import { ActiveToggle } from './active-toggle'
import { MemberFormModal, type MemberFormData } from './member-form'

export type Member = MemberFormData & { active: boolean }

/** Estado do modal: fechado | novo cadastro | editando alguém. */
type Modal = { tipo: 'fechado' } | { tipo: 'novo' } | { tipo: 'editar'; member: Member }

/**
 * Avatar da pessoa. A maioria não tem avatar_url — o fallback (inicial do nome)
 * é o caso NORMAL, não a exceção. URL presente mas quebrada cai no mesmo
 * fallback via onError, então link morto nunca vira imagem rasgada na tabela.
 * Mesmo padrão do avatar de /dashboard/venues.
 */
function Avatar({ m }: { m: Member }) {
  const [falhou, setFalhou] = useState(false)
  const mostraImagem = Boolean(m.avatar_url) && !falhou

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
      {mostraImagem ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={m.avatar_url as string}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFalhou(true)}
        />
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">
          {m.name.trim().charAt(0).toUpperCase() || '?'}
        </span>
      )}
    </div>
  )
}

function NomeCompleto({ m }: { m: Member }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar m={m} />
      <div className="flex flex-col">
        <span className="font-medium">{[m.name, m.last_name].filter(Boolean).join(' ')}</span>
        {m.slug && <span className="font-mono text-xs text-muted-foreground">@{m.slug}</span>}
      </div>
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
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-primary' : 'bg-muted-foreground'}`} />
      {active ? 'Ativo' : 'Inativo'}
    </span>
  )
}

function BotaoEditar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
      title="Editar cadastro"
    >
      <Pencil className="h-3.5 w-3.5" />
      Editar
    </button>
  )
}

/** Nome amigável do clube; cai no slug cru se não estiver no clubs-config. */
function nomeClube(slug: string | null) {
  if (!slug) return '—'
  return clubBySlug(slug)?.nome ?? slug
}

export function MembersList({
  members,
  clubes,
}: {
  members: Member[]
  clubes: { slug: string; nome: string }[]
}) {
  const [busca, setBusca] = useState('')
  const [clubeFiltro, setClubeFiltro] = useState('todos')
  const [modal, setModal] = useState<Modal>({ tipo: 'fechado' })

  // Opções do filtro = os club_slug DISTINTOS que existem nos registros, não o
  // catálogo inteiro: filtrar por um clube sem ninguém cadastrado só produziria
  // uma lista vazia. "sem clube" entra como opção própria quando aplicável.
  const opcoesClube = useMemo(() => {
    const slugs = new Set(members.map((m) => m.club_slug).filter(Boolean) as string[])
    return Array.from(slugs)
      .map((slug) => ({ valor: slug, rotulo: nomeClube(slug) }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
  }, [members])

  const temSemClube = useMemo(() => members.some((m) => !m.club_slug), [members])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return members.filter((m) => {
      if (clubeFiltro === 'sem-clube' && m.club_slug) return false
      if (clubeFiltro !== 'todos' && clubeFiltro !== 'sem-clube' && m.club_slug !== clubeFiltro) {
        return false
      }
      if (!termo) return true
      // Busca por nome, sobrenome, nome completo ou slug.
      const alvo = [m.name, m.last_name, [m.name, m.last_name].filter(Boolean).join(' '), m.slug]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return alvo.includes(termo)
    })
  }, [members, busca, clubeFiltro])

  const fecharModal = () => setModal({ tipo: 'fechado' })

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Players</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtrados.length === members.length
              ? `${members.length} ${members.length === 1 ? 'pessoa cadastrada' : 'pessoas cadastradas'}`
              : `${filtrados.length} de ${members.length} ${members.length === 1 ? 'pessoa' : 'pessoas'}`}
          </p>
        </div>
        <Button
          onClick={() => setModal({ tipo: 'novo' })}
          className="bg-primary font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Adicionar Pessoa
        </Button>
      </div>

      {members.length > 0 && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou slug…"
              aria-label="Buscar por nome ou slug"
              className="border-border bg-card pl-9"
            />
          </div>
          <select
            value={clubeFiltro}
            onChange={(e) => setClubeFiltro(e.target.value)}
            aria-label="Filtrar por clube"
            className="h-10 rounded-md border border-border bg-card px-3 text-sm sm:w-56"
          >
            <option value="todos">Todos os clubes</option>
            {opcoesClube.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
            {temSemClube && <option value="sem-clube">— sem clube —</option>}
          </select>
        </div>
      )}

      {members.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
          <Users className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Ninguém cadastrado ainda. Use “Adicionar Pessoa” para começar.
          </p>
        </div>
      )}

      {members.length > 0 && filtrados.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma pessoa encontrada com esses filtros.
          </p>
        </div>
      )}

      {filtrados.length > 0 && (
        <>
          {/* Desktop: tabela. */}
          <div className="mt-6 hidden overflow-x-auto rounded-2xl border border-border md:block">
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
                {filtrados.map((m) => (
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
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <BotaoEditar onClick={() => setModal({ tipo: 'editar', member: m })} />
                        <ActiveToggle id={m.id} active={m.active} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards. */}
          <div className="mt-6 flex flex-col gap-3 md:hidden">
            {filtrados.map((m) => (
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
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Papel role={m.role} />
                    <span className="text-xs text-muted-foreground">{nomeClube(m.club_slug)}</span>
                  </div>
                  <div className="flex gap-2">
                    <BotaoEditar onClick={() => setModal({ tipo: 'editar', member: m })} />
                    <ActiveToggle id={m.id} active={m.active} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* `key` força remontar ao trocar de pessoa: sem isso o formulário
          manteria os defaultValue da pessoa anterior. */}
      {modal.tipo !== 'fechado' && (
        <MemberFormModal
          key={modal.tipo === 'editar' ? modal.member.id : 'novo'}
          member={modal.tipo === 'editar' ? modal.member : null}
          clubes={clubes}
          onFechar={fecharModal}
        />
      )}
    </>
  )
}
