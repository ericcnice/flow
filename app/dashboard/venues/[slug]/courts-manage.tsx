'use client'

/**
 * Seção "Gerenciar quadras" (Fatia 2) — GESTÃO estrutural, separada da OPERAÇÃO
 * (os CourtCards de acessos/patrocínio/QR ficam intocados no CourtsPanel).
 * Collapsible no mesmo molde do "Gerar URLs de campanha".
 *
 * EIXO: SLUG IMUTÁVEL + SOFT-DELETE. O slug aparece read-only (vive em QR impresso
 * + telemetria histórica); "remover" é desativar (active=false), reversível.
 *
 * As escritas vão pelas Server Actions (courts-actions.ts → .from('courts') com
 * RLS super_admin). Elas dão revalidatePath do venue, então após cada ação o
 * server re-renderiza e estas props (courtGroups) chegam atualizadas — sem estado
 * otimista aqui (a gestão não precisa da resposta instantânea da operação).
 */

import { useState } from 'react'
import { ChevronDown, ChevronUp, Loader2, Lock, Plus, Settings2 } from 'lucide-react'
import { SPORTS } from '@/lib/sports-catalog'
import type { CourtGroup } from './courts-panel'
import { addCourt, renameCourt, setCourtActive, reorderCourt } from './courts-actions'

const SPORT_OPTIONS = SPORTS.map((s) => ({ id: s.id as string, nome: s.name }))

export function ManageCourts({
  venueId,
  venueSlug,
  courtGroups,
}: {
  venueId: string
  venueSlug: string
  courtGroups: CourtGroup[]
}) {
  const [aberto, setAberto] = useState(false)

  // Uma operação salvando por vez (chave = id da quadra, ou 'add'). Erros por chave.
  const [busy, setBusy] = useState<string | null>(null)
  const [erros, setErros] = useState<Record<string, string>>({})

  // Renomear inline: id em edição + rascunho do nome.
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')

  // Form de adicionar.
  const [novoSport, setNovoSport] = useState<string>(SPORT_OPTIONS[0]?.id ?? 'tennis')
  const [novoSlug, setNovoSlug] = useState('')
  const [novoNome, setNovoNome] = useState('')

  async function run(key: string, fn: () => Promise<{ ok: boolean; erro?: string }>, onOk?: () => void) {
    setBusy(key)
    setErros((e) => {
      const { [key]: _drop, ...rest } = e
      return rest
    })
    try {
      const r = await fn()
      if (r.ok) onOk?.()
      else setErros((e) => ({ ...e, [key]: r.erro ?? 'Erro ao salvar.' }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        <Settings2 className="h-4 w-4" />
        Gerenciar quadras
      </button>

      {aberto && (
        <div className="mt-2 flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          {/* AVISO HONESTO: gestão vale para dashboard + telemetria, NÃO para o QR
              ainda (a jornada lê o config estático — Fatia 3 futura). */}
          <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-500">
            Alterações aqui valem para o dashboard e a telemetria. A jornada de QR ainda lê a
            configuração estática — uma quadra nova só abre no QR após a atualização do config.
          </p>

          {/* LISTA por esporte (TODAS as quadras: ativas + inativas). */}
          {courtGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma quadra ainda. Adicione abaixo ou use “Criar quadras padrão”.
            </p>
          ) : (
            courtGroups.map((g) => (
              <div key={g.sport}>
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {g.nome}
                </h4>
                <div className="mt-2 flex flex-col gap-1.5">
                  {g.quadras.map((c, i) => {
                    const editando = editId === c.id
                    const salvando = busy === c.id
                    return (
                      <div
                        key={c.id}
                        className={`flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 ${
                          c.active ? '' : 'opacity-60'
                        }`}
                      >
                        {/* Nome (editável) */}
                        {editando ? (
                          <input
                            value={editNome}
                            onChange={(e) => setEditNome(e.target.value)}
                            autoFocus
                            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-sm"
                          />
                        ) : (
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {c.name}
                            {!c.active && (
                              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                inativa
                              </span>
                            )}
                          </span>
                        )}

                        {/* Slug IMUTÁVEL (read-only). */}
                        <span
                          className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground"
                          title="O slug é fixo após a criação (vive em QR impresso e na telemetria)."
                        >
                          <Lock className="h-3 w-3" />
                          {c.slug}
                        </span>

                        {/* Reordenar */}
                        <div className="flex items-center">
                          <button
                            type="button"
                            aria-label="Subir"
                            disabled={i === 0 || salvando}
                            onClick={() => run(c.id, () => reorderCourt(c.id, venueSlug, 'up'))}
                            className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label="Descer"
                            disabled={i === g.quadras.length - 1 || salvando}
                            onClick={() => run(c.id, () => reorderCourt(c.id, venueSlug, 'down'))}
                            className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Ações: renomear (salvar/cancelar) + ativar/desativar */}
                        {editando ? (
                          <>
                            <button
                              type="button"
                              disabled={salvando || editNome.trim() === ''}
                              onClick={() =>
                                run(
                                  c.id,
                                  () => renameCourt(c.id, venueSlug, editNome.trim()),
                                  () => setEditId(null),
                                )
                              }
                              className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                            >
                              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Salvar'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditId(null)}
                              className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditId(c.id)
                                setEditNome(c.name)
                              }}
                              className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                            >
                              Renomear
                            </button>
                            <button
                              type="button"
                              disabled={salvando}
                              onClick={() => run(c.id, () => setCourtActive(c.id, venueSlug, !c.active))}
                              className="rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                            >
                              {salvando ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : c.active ? (
                                'Desativar'
                              ) : (
                                'Reativar'
                              )}
                            </button>
                          </>
                        )}

                        {erros[c.id] && (
                          <p role="alert" className="w-full text-xs text-destructive">
                            {erros[c.id]}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}

          {/* ADICIONAR quadra. slug editável AQUI (só na criação). */}
          <div className="rounded-lg border border-dashed border-border p-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Adicionar quadra
            </h4>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Esporte
                <select
                  value={novoSport}
                  onChange={(e) => setNovoSport(e.target.value)}
                  className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                >
                  {SPORT_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Slug (fixo)
                <input
                  value={novoSlug}
                  onChange={(e) => setNovoSlug(e.target.value)}
                  placeholder="q1"
                  className="h-9 w-24 rounded-md border border-border bg-background px-2 font-mono text-sm"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Nome
                <input
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  placeholder="Quadra 1"
                  className="h-9 w-40 rounded-md border border-border bg-background px-2 text-sm"
                />
              </label>
              <button
                type="button"
                disabled={busy === 'add' || novoSlug.trim() === '' || novoNome.trim() === ''}
                onClick={() =>
                  run(
                    'add',
                    () => addCourt(venueId, venueSlug, novoSport, novoSlug.trim(), novoNome.trim()),
                    () => {
                      setNovoSlug('')
                      setNovoNome('')
                    },
                  )
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Adicionar
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              O <span className="font-mono">slug</span> vira a URL do QR e é FIXO depois de criado
              (aparece com cadeado na lista). Escolha com cuidado — para mudar, desative e crie outra.
            </p>
            {erros['add'] && (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {erros['add']}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
