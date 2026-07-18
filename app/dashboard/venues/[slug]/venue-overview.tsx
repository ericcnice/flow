/**
 * Overview de acessos do CLUBE (peça E) — extraído do antigo visit-stats.tsx no
 * redesign. Server Component de LEITURA: recebe as linhas já agregadas pela RPC
 * get_venue_visit_stats e monta os rollups de CLUBE (total, 7d, com/sem
 * patrocínio, por patrocinador) com os helpers de lib/venue-stats.
 *
 * A parte POR-QUADRA que o visit-stats tinha migrou para os cards do
 * <CourtsPanel>. Aqui fica só o resumo do clube — compacto, sem interatividade.
 *
 * ⚠️ "acessos", nunca "visitantes": cada linha é uma ABERTURA (o throttle de
 * 30min corta refresh, mas dois aparelhos na mesma quadra são dois acessos).
 * Zero é estado legítimo — mostramos 0.
 */

import {
  comSemPatrocinador,
  porPatrocinador,
  somaTotal,
  SPONSOR_LABELS,
  type VisitRow,
} from '@/lib/venue-stats'

/** "142 · 23 em 7d" — total forte, janela de 7 dias discreta ao lado. */
function ParTotais({ total, d7 }: { total: number; d7: number }) {
  return (
    <span className="tabular-nums">
      <span className="font-medium">{total}</span>
      <span className="text-muted-foreground"> · {d7} em 7d</span>
    </span>
  )
}

export function VenueOverview({
  rowsTotal,
  rows7d,
  coaches,
}: {
  rowsTotal: VisitRow[]
  rows7d: VisitRow[]
  coaches: { slug: string; nome: string }[]
}) {
  const totalClube = somaTotal(rowsTotal)
  const total7d = somaTotal(rows7d)
  const comSem = comSemPatrocinador(rowsTotal)

  const sponsorTotal = porPatrocinador(rowsTotal)
  const sponsor7d = porPatrocinador(rows7d)

  // Nome de exibição do patrocinador: nome real do coach (já carregado) →
  // rótulo estático de marca → o próprio slug como último recurso.
  const nomeCoach = new Map(coaches.map((c) => [c.slug, c.nome]))
  const nomeSponsor = (slug: string) => nomeCoach.get(slug) ?? SPONSOR_LABELS[slug] ?? slug

  // União das chaves total ∪ 7d, ordenada pelo total desc.
  const sponsorSlugs = [...new Set([...sponsorTotal.keys(), ...sponsor7d.keys()])].sort(
    (a, b) => (sponsorTotal.get(b) ?? 0) - (sponsorTotal.get(a) ?? 0),
  )

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">Acessos</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Aberturas ao escanear o QR da quadra — contagem de acessos, não de visitantes únicos.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Total
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{totalClube}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Últimos 7 dias
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{total7d}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Patrocínio
          </div>
          <div className="mt-1 text-sm tabular-nums">
            <span className="text-2xl font-semibold">{comSem.com}</span>
            <span className="text-muted-foreground"> com · {comSem.sem} sem</span>
          </div>
        </div>
      </div>

      {/* Por patrocinador — só quando há algum acesso com patrocinador */}
      {sponsorSlugs.length > 0 && (
        <div className="mt-4 rounded-xl border border-border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Por patrocinador
          </h3>
          <div className="mt-3 flex flex-col divide-y divide-border text-sm">
            {sponsorSlugs.map((slug) => (
              <div key={slug} className="flex items-center justify-between gap-3 py-1.5">
                <span>{nomeSponsor(slug)}</span>
                <ParTotais total={sponsorTotal.get(slug) ?? 0} d7={sponsor7d.get(slug) ?? 0} />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
