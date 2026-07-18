'use client'

/**
 * Listagem de patrocinadores com busca + os gatilhos de Adicionar/Editar.
 *
 * Filtro é CLIENT-SIDE de propósito: o volume é baixo e a lista já veio inteira
 * do Server Component (via RPC list_sponsors). Mesmo molde de members/venues.
 *
 * A guarda de super_admin (na RPC, no banco) é a tranca: isto é UI sobre dados
 * que o servidor já autorizou.
 */

import { useMemo, useState } from 'react'
import { ImageOff, Megaphone, Pencil, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ActiveToggle } from './active-toggle'
import { SponsorFormModal, type MemberOption, type SponsorFormData } from './sponsor-form'

/** Linha da RPC list_sponsors (grão: um patrocinador + nome da pessoa vinculada). */
export type Sponsor = SponsorFormData & {
  member_name: string | null
  active: boolean
  created_at: string
}

/** Estado do modal: fechado | novo cadastro | editando alguém. */
type Modal = { tipo: 'fechado' } | { tipo: 'novo' } | { tipo: 'editar'; sponsor: Sponsor }

/**
 * Logo em miniatura. Sem logo é raro (logo_url é obrigatório), mas URL quebrada
 * cai no fallback via onError — link morto nunca vira imagem rasgada na tabela.
 * object-contain: logo panorâmico não é esticado dentro do quadrado.
 */
function LogoMini({ s }: { s: Sponsor }) {
  const [falhou, setFalhou] = useState(false)
  const mostra = Boolean(s.logo_url) && !falhou

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
      {mostra ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={s.logo_url}
          alt=""
          className="h-full w-full object-contain"
          onError={() => setFalhou(true)}
        />
      ) : (
        <ImageOff className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  )
}

function NomeComLogo({ s }: { s: Sponsor }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMini s={s} />
      <div className="flex flex-col">
        <span className="font-medium">{s.name}</span>
        <span className="font-mono text-xs text-muted-foreground">/{s.slug}</span>
      </div>
    </div>
  )
}

/** Vínculo com pessoa: nome do coach, ou "Marca" quando member_id é null. */
function Vinculo({ s }: { s: Sponsor }) {
  if (!s.member_id) {
    return (
      <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
        Marca
      </span>
    )
  }
  return <span className="text-sm">{s.member_name ?? '—'}</span>
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
      title="Editar patrocinador"
    >
      <Pencil className="h-3.5 w-3.5" />
      Editar
    </button>
  )
}

export function SponsorsList({
  sponsors,
  members,
}: {
  sponsors: Sponsor[]
  members: MemberOption[]
}) {
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState<Modal>({ tipo: 'fechado' })

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return sponsors
    return sponsors.filter((s) => {
      const alvo = [s.name, s.slug, s.member_name].filter(Boolean).join(' ').toLowerCase()
      return alvo.includes(termo)
    })
  }, [sponsors, busca])

  const fecharModal = () => setModal({ tipo: 'fechado' })

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Patrocinadores</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtrados.length === sponsors.length
              ? `${sponsors.length} ${sponsors.length === 1 ? 'patrocinador cadastrado' : 'patrocinadores cadastrados'}`
              : `${filtrados.length} de ${sponsors.length} patrocinadores`}
          </p>
        </div>
        <Button
          onClick={() => setModal({ tipo: 'novo' })}
          className="bg-primary font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Adicionar Patrocinador
        </Button>
      </div>

      {sponsors.length > 0 && (
        <div className="mt-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, slug ou pessoa…"
              aria-label="Buscar patrocinador"
              className="border-border bg-card pl-9"
            />
          </div>
        </div>
      )}

      {sponsors.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border p-12 text-center">
          <Megaphone className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhum patrocinador ainda. Use “Adicionar Patrocinador” para começar.
          </p>
        </div>
      )}

      {sponsors.length > 0 && filtrados.length === 0 && (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhum patrocinador encontrado com essa busca.
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
                  <th className="px-4 py-3 font-medium">Patrocinador</th>
                  <th className="px-4 py-3 font-medium">Pessoa</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtrados.map((s) => (
                  <tr
                    key={s.id}
                    className={`border-b border-border last:border-0 ${s.active ? '' : 'opacity-50'}`}
                  >
                    <td className="px-4 py-3">
                      <NomeComLogo s={s} />
                    </td>
                    <td className="px-4 py-3">
                      <Vinculo s={s} />
                    </td>
                    <td className="px-4 py-3">
                      <Status active={s.active} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <BotaoEditar onClick={() => setModal({ tipo: 'editar', sponsor: s })} />
                        <ActiveToggle id={s.id} active={s.active} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: cards. */}
          <div className="mt-6 flex flex-col gap-3 md:hidden">
            {filtrados.map((s) => (
              <div
                key={s.id}
                className={`rounded-xl border border-border bg-card p-4 ${s.active ? '' : 'opacity-50'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <NomeComLogo s={s} />
                  <Status active={s.active} />
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <Vinculo s={s} />
                  <div className="flex gap-2">
                    <BotaoEditar onClick={() => setModal({ tipo: 'editar', sponsor: s })} />
                    <ActiveToggle id={s.id} active={s.active} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* `key` força remontar ao trocar de patrocinador: sem isso o formulário
          manteria os defaultValue do anterior. */}
      {modal.tipo !== 'fechado' && (
        <SponsorFormModal
          key={modal.tipo === 'editar' ? modal.sponsor.id : 'novo'}
          sponsor={modal.tipo === 'editar' ? modal.sponsor : null}
          members={members}
          onFechar={fecharModal}
        />
      )}
    </>
  )
}
