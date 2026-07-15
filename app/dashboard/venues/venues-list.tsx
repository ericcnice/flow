'use client'

/**
 * Listagem de locais com busca e filtro + gatilhos de Adicionar/Editar.
 * Mesmo padrão da lista de pessoas: filtro client-side (a lista já veio inteira
 * do Server Component e o volume é baixo), tabela no desktop e cards no mobile.
 *
 * A RLS de `venues` continua sendo a tranca: isto é UI sobre dados que o
 * servidor já autorizou.
 */

import { useMemo, useState } from 'react'
import { MapPin, Pencil, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TIPOS } from './constants'
import { VenueActiveToggle } from './active-toggle'
import { VenueFormModal, type VenueFormData } from './venue-form'

export type Venue = VenueFormData & { active: boolean }

type Modal = { tipo: 'fechado' } | { tipo: 'novo' } | { tipo: 'editar'; venue: Venue }

const ROTULO_TIPO: Record<string, string> = Object.fromEntries(
  TIPOS.map((t) => [t.valor, t.rotulo]),
)

/** Cidade sai do address jsonb; "—" quando não há endereço cadastrado. */
function cidadeDe(venue: Venue): string {
  const cidade = venue.address?.cidade
  const uf = venue.address?.uf
  if (!cidade) return '—'
  return uf ? `${cidade}/${uf}` : cidade
}

function Tipo({ type }: { type: string }) {
  return (
    <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs font-medium">
      {ROTULO_TIPO[type] ?? type}
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

/**
 * Avatar do local. A maioria dos locais não tem logo_url — o fallback (inicial
 * do nome) é o caso NORMAL, não a exceção. Se a URL existir mas não carregar,
 * cai no mesmo fallback via onError, então um link quebrado nunca vira imagem
 * rasgada na tabela.
 */
function Avatar({ v }: { v: Venue }) {
  const [falhou, setFalhou] = useState(false)
  const mostraImagem = Boolean(v.logo_url) && !falhou

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background">
      {mostraImagem ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={v.logo_url as string}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFalhou(true)}
        />
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">
          {v.name.trim().charAt(0).toUpperCase() || '?'}
        </span>
      )}
    </div>
  )
}

function Nome({ v }: { v: Venue }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar v={v} />
      <div className="flex flex-col">
        <span className="font-medium">{v.name}</span>
        <span className="font-mono text-xs text-muted-foreground">/c/{v.slug}</span>
      </div>
    </div>
  )
}

function BotaoEditar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
      title="Editar local"
    >
      <Pencil className="h-3.5 w-3.5" />
      Editar
    </button>
  )
}

export function VenuesList({ venues }: { venues: Venue[] }) {
  const [busca, setBusca] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState('todos')
  const [modal, setModal] = useState<Modal>({ tipo: 'fechado' })

  // Ao contrário do filtro de clube em /players, aqui as opções são as TRÊS
  // fixas do CHECK do banco: são um domínio fechado, não valores que emergem
  // dos dados.
  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return venues.filter((v) => {
      if (tipoFiltro !== 'todos' && v.type !== tipoFiltro) return false
      if (!termo) return true
      return `${v.name} ${v.slug}`.toLowerCase().includes(termo)
    })
  }, [venues, busca, tipoFiltro])

  const fecharModal = () => setModal({ tipo: 'fechado' })

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Locais</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtrados.length === venues.length
              ? `${venues.length} ${venues.length === 1 ? 'local cadastrado' : 'locais cadastrados'}`
              : `${filtrados.length} de ${venues.length} ${venues.length === 1 ? 'local' : 'locais'}`}
          </p>
        </div>
        <Button
          onClick={() => setModal({ tipo: 'novo' })}
          className="bg-primary font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Adicionar Local
        </Button>
      </div>

      {venues.length > 0 && (
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
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            aria-label="Filtrar por tipo"
            className="h-10 rounded-md border border-border bg-card px-3 text-sm sm:w-56"
          >
            <option value="todos">Todos os tipos</option>
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </div>
      )}

      {venues.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
          <MapPin className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhum local cadastrado ainda. Use “Adicionar Local” para começar.
          </p>
        </div>
      )}

      {venues.length > 0 && filtrados.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum local encontrado com esses filtros.
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
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Cidade</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtrados.map((v) => (
                  <tr
                    key={v.id}
                    className={`border-b border-border last:border-0 ${v.active ? '' : 'opacity-50'}`}
                  >
                    <td className="px-4 py-3">
                      <Nome v={v} />
                    </td>
                    <td className="px-4 py-3">
                      <Tipo type={v.type} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{cidadeDe(v)}</td>
                    <td className="px-4 py-3">
                      <Status active={v.active} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <BotaoEditar onClick={() => setModal({ tipo: 'editar', venue: v })} />
                        <VenueActiveToggle id={v.id} active={v.active} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards. */}
          <div className="mt-6 flex flex-col gap-3 md:hidden">
            {filtrados.map((v) => (
              <div
                key={v.id}
                className={`rounded-xl border border-border bg-card p-4 ${v.active ? '' : 'opacity-50'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <Nome v={v} />
                  <Status active={v.active} />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Tipo type={v.type} />
                    <span className="text-xs text-muted-foreground">{cidadeDe(v)}</span>
                  </div>
                  <div className="flex gap-2">
                    <BotaoEditar onClick={() => setModal({ tipo: 'editar', venue: v })} />
                    <VenueActiveToggle id={v.id} active={v.active} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* `key` força remontar ao trocar de local: sem isso o formulário
          manteria os defaultValue do anterior. */}
      {modal.tipo !== 'fechado' && (
        <VenueFormModal
          key={modal.tipo === 'editar' ? modal.venue.id : 'novo'}
          venue={modal.tipo === 'editar' ? modal.venue : null}
          onFechar={fecharModal}
        />
      )}
    </>
  )
}
