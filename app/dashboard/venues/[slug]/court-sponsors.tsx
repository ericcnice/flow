'use client'

/**
 * Associação de patrocinador POR QUADRA + patrocinador geral do clube (peça C.2).
 *
 * Client component: salva por mudança direta no dropdown (sem botão), com
 * feedback de salvando/erro por linha. As escritas vão por Server Action → RPC
 * SECURITY DEFINER (court_sponsors tem RLS com zero policies). Mantém estado
 * local das associações para refletir a mudança na hora, sem refetch.
 *
 * ⚠️ IDENTIFICADOR: a GRADE (lib/courts-grid) usa slug de URL ("tenis",
 * "beachtennis", "pingpong"); court_sponsors grava o sportId CANÔNICO ("tennis",
 * "beach", "tabletennis") — é o que get_sponsor_for_court recebe da jornada
 * (ctx.sportId). Convertemos com sportIdFromSlug ao casar a grade com as
 * associações E ao chamar as RPCs. Sem isso, só "squash" casa por coincidência
 * (slug == id) e o resto some — o mesmo bug que o visit-stats evita.
 *
 * PRECEDÊNCIA (da get_sponsor_for_court, honesta na UI): quadra com associação
 * própria → default do clube → nada. Um patrocinador INATIVO associado a uma
 * quadra resulta em vazio — NÃO cai no default. A UI alerta quando isso acontece.
 */

import { useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { sportIdFromSlug } from '@/lib/clubs-config'
import { GRADE } from '@/lib/courts-grid'
import {
  removeCourtSponsor,
  setCourtSponsor,
  setVenueDefaultSponsor,
  type FormState,
} from './court-sponsors-actions'

/** Patrocinador para os dropdowns (subconjunto da list_sponsors). */
export type SponsorOption = {
  id: string
  name: string
  slug: string
  active: boolean
}

/** Associação atual de uma quadra (da list_court_sponsors; sport é CANÔNICO). */
export type CourtAssoc = {
  sport: string
  court_slug: string
  sponsor_id: string
  sponsor_active: boolean
}

/** Estado local de uma associação. */
type Assoc = { sponsorId: string; active: boolean }

const chave = (sportId: string, court: string) => `${sportId}|${court}`

const DEFAULT_KEY = '__default__'

export function CourtSponsors({
  venueId,
  venueSlug,
  sponsors,
  defaultSponsorId,
  associations,
}: {
  venueId: string
  venueSlug: string
  sponsors: SponsorOption[]
  defaultSponsorId: string | null
  associations: CourtAssoc[]
}) {
  // Estado local das associações, chaveado por (sportId canônico, court).
  const [assoc, setAssoc] = useState<Record<string, Assoc>>(() => {
    const m: Record<string, Assoc> = {}
    for (const a of associations) {
      m[chave(a.sport, a.court_slug)] = { sponsorId: a.sponsor_id, active: a.sponsor_active }
    }
    return m
  })
  const [defId, setDefId] = useState<string | null>(defaultSponsorId)

  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const sponsorById = new Map(sponsors.map((s) => [s.id, s]))

  /** Roda uma action, tratando saving/erro por linha. */
  async function salvar(key: string, fn: () => Promise<FormState>, onOk: () => void) {
    setSavingKey(key)
    setErrors((e) => {
      const { [key]: _drop, ...rest } = e
      return rest
    })
    const res = await fn()
    if (res.ok) onOk()
    else setErrors((e) => ({ ...e, [key]: res.erro ?? 'Erro ao salvar.' }))
    setSavingKey(null)
  }

  function onChangeCourt(sportId: string, court: string, value: string) {
    const key = chave(sportId, court)
    const tinha = Boolean(assoc[key])

    if (value === '') {
      if (!tinha) return // já estava "Nenhum": nada a fazer
      salvar(
        key,
        () => removeCourtSponsor(venueId, venueSlug, sportId, court),
        () =>
          setAssoc((m) => {
            const { [key]: _drop, ...rest } = m
            return rest
          }),
      )
      return
    }

    const s = sponsorById.get(value)
    salvar(
      key,
      () => setCourtSponsor(venueId, venueSlug, sportId, court, value),
      () => setAssoc((m) => ({ ...m, [key]: { sponsorId: value, active: s?.active ?? true } })),
    )
  }

  function onChangeDefault(value: string) {
    const novo = value === '' ? null : value
    salvar(
      DEFAULT_KEY,
      () => setVenueDefaultSponsor(venueId, venueSlug, novo),
      () => setDefId(novo),
    )
  }

  const rotulo = (s: SponsorOption) => `${s.name}${s.active ? '' : ' (inativo)'}`

  const defSponsor = defId ? sponsorById.get(defId) : undefined
  const defInativo = Boolean(defSponsor && !defSponsor.active)

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">Patrocínio por quadra</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Mudanças aparecem nas quadras em até 10 minutos (cache dos aparelhos).
      </p>

      {/* TOPO: patrocinador geral do clube (fallback das quadras sem associação). */}
      <div className="mt-4 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Patrocinador geral do clube
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Aparece em todas as quadras sem patrocinador próprio.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {savingKey === DEFAULT_KEY && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            <select
              value={defId ?? ''}
              disabled={savingKey === DEFAULT_KEY}
              onChange={(e) => onChangeDefault(e.target.value)}
              aria-label="Patrocinador geral do clube"
              className="h-10 min-w-[12rem] rounded-md border border-border bg-background px-3 text-sm disabled:opacity-50"
            >
              <option value="">Nenhum</option>
              {sponsors.map((s) => (
                <option key={s.id} value={s.id}>
                  {rotulo(s)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {errors[DEFAULT_KEY] && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {errors[DEFAULT_KEY]}
          </p>
        )}
        {defInativo && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Patrocinador inativo: as quadras sem patrocinador próprio ficam SEM logo.
          </p>
        )}
      </div>

      {/* ABAIXO: a grade de quadras, agrupada por esporte (como no visit-stats). */}
      <div className="mt-4 flex flex-col gap-4">
        {GRADE.map((g) => {
          const sportId = sportIdFromSlug(g.esporte)
          return (
            <div key={g.esporte} className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {g.nome}
              </h3>

              <div className="mt-3 flex flex-col divide-y divide-border">
                {g.quadras.map((court) => {
                  const key = sportId ? chave(sportId, court) : `sem-sport|${court}`
                  const atual = sportId ? assoc[key] : undefined
                  const salvando = savingKey === key
                  const inativoAssociado = Boolean(atual && !atual.active)

                  return (
                    <div key={court} className="py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-xs text-muted-foreground">{court}</span>
                        <div className="flex items-center gap-2">
                          {salvando && (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                          <select
                            value={atual?.sponsorId ?? ''}
                            // Sem sportId (slug fora do catálogo) a associação não
                            // teria como ser gravada com a chave certa — trava o
                            // controle em vez de gravar torto.
                            disabled={salvando || !sportId}
                            onChange={(e) => sportId && onChangeCourt(sportId, court, e.target.value)}
                            aria-label={`Patrocinador da quadra ${court} (${g.nome})`}
                            className="h-9 min-w-[12rem] rounded-md border border-border bg-background px-3 text-sm disabled:opacity-50"
                          >
                            <option value="">Nenhum</option>
                            {sponsors.map((s) => (
                              <option key={s.id} value={s.id}>
                                {rotulo(s)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {errors[key] && (
                        <p role="alert" className="mt-1.5 text-right text-sm text-destructive">
                          {errors[key]}
                        </p>
                      )}
                      {inativoAssociado && (
                        <p className="mt-1.5 flex items-start justify-end gap-1.5 text-right text-xs text-amber-600 dark:text-amber-500">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          Patrocinador inativo: a quadra fica SEM logo (não cai no geral do clube).
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
