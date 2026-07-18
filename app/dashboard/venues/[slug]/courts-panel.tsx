'use client'

/**
 * Painel unificado de quadras (redesign da página de detalhe do venue).
 * Consolida as três seções que re-enumeravam a grade — acessos (visit-stats),
 * patrocínio por quadra (court-sponsors) e links/QR (share-links) — numa
 * estrutura só: esportes colapsáveis → cards de quadra em acordeão.
 *
 * Client porque tudo aqui é interativo (colapsar, dropdown salvando, share). Os
 * DADOS vêm prontos do server (page.tsx pré-computa os rollups por-quadra e
 * por-esporte); as ESCRITAS vão pelas Server Actions → RPCs inalteradas.
 *
 * ⚠️ IDENTIFICADOR: a GRADE usa slug de URL ("tenis","beachtennis","pingpong");
 * acessos e associações usam o sportId CANÔNICO ("tennis","beach","tabletennis").
 * sportIdFromSlug é a ÚNICA ponte — sem ela só "squash" casa por coincidência.
 *
 * PRECEDÊNCIA (honesta, igual à get_sponsor_for_court): associação ATIVA da
 * quadra → default ATIVO do clube → nada. Associação INATIVA resolve em NADA
 * (não cai no default) — a miniatura reflete isso e o card expandido alerta.
 */

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  Download,
  ImageOff,
  Loader2,
  QrCode,
  Share2,
  TriangleAlert,
} from 'lucide-react'
import { sportIdFromSlug } from '@/lib/clubs-config'
import { GRADE } from '@/lib/courts-grid'
import { courtKey, type ParTotais } from '@/lib/venue-stats'
import { DOMINIO_PUBLICO } from '../constants'
import { QrModal } from './qr-modal'
import {
  removeCourtSponsor,
  setCourtSponsor,
  setVenueDefaultSponsor,
  type FormState,
} from './court-sponsors-actions'

/** Patrocinador para os dropdowns e a miniatura (subconjunto da list_sponsors). */
export type SponsorOption = {
  id: string
  name: string
  slug: string
  logo_url: string
  active: boolean
}

/** Associação atual de uma quadra (da list_court_sponsors; sport é CANÔNICO). */
export type CourtAssoc = {
  sport: string
  court_slug: string
  sponsor_id: string
  sponsor_active: boolean
}

/** Coach elegível ao sufixo /[ad] de campanha (herdado do share-links). */
export type CampaignCoach = { slug: string; nome: string; temLogo: boolean }

type Assoc = { sponsorId: string; active: boolean }
type Efetivo = { sponsor: SponsorOption | null; herdado: boolean }

const DEFAULT_KEY = '__default__'
const LADO_QR_SHARE = 512

/**
 * Gera o PNG do QR (com quiet-zone de 8%, igual ao download do qr-modal) num
 * canvas destacado — sem depender de nenhum canvas na tela. import dinâmico do
 * `qrcode` para mantê-lo fora do bundle inicial (mesmo padrão do html-to-image
 * na tela de jogo). Devolve null se algo falhar (o caller trata).
 */
async function gerarQrBlob(url: string, lado = LADO_QR_SHARE): Promise<Blob | null> {
  const QRCode = (await import('qrcode')).default
  const base = document.createElement('canvas')
  await QRCode.toCanvas(base, url, {
    width: lado,
    margin: 1,
    color: { dark: '#000000', light: '#FFFFFF' },
  })

  const margem = Math.round(base.width * 0.08)
  const saida = document.createElement('canvas')
  saida.width = base.width + margem * 2
  saida.height = base.height + margem * 2
  const ctx = saida.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, saida.width, saida.height)
  ctx.drawImage(base, margem, margem)

  return new Promise<Blob | null>((resolve) => saida.toBlob(resolve, 'image/png'))
}

/** "142 · 23 em 7d" — total forte, janela de 7 dias discreta ao lado. */
function ParTotaisTexto({ total, d7 }: { total: number; d7: number }) {
  return (
    <span className="tabular-nums text-sm">
      <span className="font-medium">{total}</span>
      <span className="text-muted-foreground"> · {d7} em 7d</span>
    </span>
  )
}

/** Miniatura do logo efetivo. Fallback silencioso: URL quebrada some. */
function LogoMini({ ef }: { ef: Efetivo }) {
  const [falhou, setFalhou] = useState(false)
  const mostra = Boolean(ef.sponsor?.logo_url) && !falhou

  if (!ef.sponsor) {
    return <div className="h-8 w-8 shrink-0" aria-hidden />
  }
  return (
    <div className="flex items-center gap-1">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background ${
          ef.herdado ? 'opacity-60' : ''
        }`}
        title={ef.herdado ? `${ef.sponsor.name} (geral do clube)` : ef.sponsor.name}
      >
        {mostra ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={ef.sponsor.logo_url}
            alt=""
            className="h-full w-full object-contain"
            onError={() => setFalhou(true)}
          />
        ) : (
          <ImageOff className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </div>
      {ef.herdado && (
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">geral</span>
      )}
    </div>
  )
}

function CourtCard({
  venueSlug,
  esporteSlug,
  esporteNome,
  court,
  stats,
  sponsors,
  valor,
  onChangeSponsor,
  salvando,
  erro,
  efetivo,
  campanhaSufixo,
}: {
  venueSlug: string
  esporteSlug: string
  esporteNome: string
  court: string
  stats: ParTotais
  sponsors: SponsorOption[]
  valor: string
  onChangeSponsor: (value: string) => void
  salvando: boolean
  erro?: string
  efetivo: Efetivo
  campanhaSufixo: string
}) {
  const [aberto, setAberto] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [compartilhando, setCompartilhando] = useState(false)
  const [baixando, setBaixando] = useState(false)
  const [qrAberto, setQrAberto] = useState(false)

  // URL SEM protocolo (o QrModal e o copiar prefixam https://). Sufixo de
  // campanha reescreve todas as URLs quando o modo está ativo.
  const url = `${DOMINIO_PUBLICO}/${venueSlug}/${esporteSlug}/${court}${campanhaSufixo}`
  const nomeArquivo = `qr-${url.split('/').slice(1).join('-')}.png`

  // A associação selecionada é um sponsor inativo? (dropdown com valor + inativo)
  const selecionado = sponsors.find((s) => s.id === valor)
  const inativoAssociado = Boolean(selecionado && !selecionado.active)

  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(`https://${url}`)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch (err) {
      console.error('Copiar link falhou:', err)
    }
  }

  // Compartilhar: QR como imagem + link no texto, pelo menu NATIVO. Molde do
  // shareResult (app/jogo/page.tsx): canvas → toBlob → File → canShare → share.
  // Fallback (desktop/sem share de arquivo): baixa o PNG. AbortError silencioso.
  const compartilhar = async () => {
    if (compartilhando) return
    setCompartilhando(true)
    try {
      const blob = await gerarQrBlob(url)
      if (!blob) throw new Error('não foi possível gerar o QR')
      const file = new File([blob], nomeArquivo, { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean }

      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({
          files: [file],
          title: `QR — ${esporteNome} ${court}`,
          text: `https://${url}`,
        })
      } else {
        // Fallback: baixa o PNG (link de download temporário).
        const objectUrl = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = objectUrl
        a.download = nomeArquivo
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(objectUrl)
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') console.error('Compartilhar falhou:', err)
    } finally {
      setCompartilhando(false)
    }
  }

  // Baixar QR direto (sem abrir o modal) — usado no fallback desktop.
  const baixarQr = async () => {
    if (baixando) return
    setBaixando(true)
    try {
      const blob = await gerarQrBlob(url)
      if (!blob) throw new Error('não foi possível gerar o QR')
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = nomeArquivo
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (err) {
      console.error('Baixar QR falhou:', err)
    } finally {
      setBaixando(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* CABEÇALHO (fechado): toque generoso, expande/recolhe. */}
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? 'rotate-180' : ''}`}
        />
        <span className="font-mono text-sm">{court}</span>
        <div className="ml-auto flex items-center gap-3">
          <ParTotaisTexto total={stats.total} d7={stats.d7} />
          <LogoMini ef={efetivo} />
        </div>
      </button>

      {aberto && (
        <div className="flex flex-col gap-5 border-t border-border px-4 py-4">
          {/* [slot slotJogoAtual] — reservado para o jogo ao vivo (backlog do
              Telão: depende de status ended real + edit_token). Prop opcional
              ainda não fiada; nada renderiza hoje. Quando existir, entra AQUI,
              no topo do card, antes de Acessos. */}

          {/* ACESSOS */}
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Acessos
            </h4>
            <p className="mt-1">
              <ParTotaisTexto total={stats.total} d7={stats.d7} />
            </p>
          </div>

          {/* PATROCÍNIO */}
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Patrocínio
            </h4>
            <div className="mt-2 flex items-center gap-2">
              {salvando && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              <select
                value={valor}
                disabled={salvando}
                onChange={(e) => onChangeSponsor(e.target.value)}
                aria-label={`Patrocinador da quadra ${court} (${esporteNome})`}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm disabled:opacity-50"
              >
                <option value="">Nenhum{efetivo.herdado ? ' (usa o geral do clube)' : ''}</option>
                {sponsors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.active ? '' : ' (inativo)'}
                  </option>
                ))}
              </select>
            </div>
            {erro && (
              <p role="alert" className="mt-1.5 text-sm text-destructive">
                {erro}
              </p>
            )}
            {inativoAssociado && (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Patrocinador inativo: a quadra fica SEM logo (não cai no geral do clube).
              </p>
            )}
          </div>

          {/* COMPARTILHAR */}
          <div>
            <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Compartilhar
            </h4>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                {url}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={compartilhar}
                disabled={compartilhando}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                {compartilhando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Share2 className="h-3.5 w-3.5" />
                )}
                Compartilhar
              </button>
              <button
                type="button"
                onClick={copiarLink}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              >
                {copiado ? (
                  <Check className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copiado ? 'Copiado' : 'Copiar link'}
              </button>
              <button
                type="button"
                onClick={() => setQrAberto(true)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              >
                <QrCode className="h-3.5 w-3.5" />
                Ver QR
              </button>
              <button
                type="button"
                onClick={baixarQr}
                disabled={baixando}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:opacity-50"
              >
                {baixando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                Baixar QR
              </button>
            </div>
          </div>
        </div>
      )}

      {qrAberto && <QrModal url={url} nomeArquivo={nomeArquivo} onFechar={() => setQrAberto(false)} />}
    </div>
  )
}

export function CourtsPanel({
  venueId,
  venueSlug,
  naJornada,
  sponsors,
  defaultSponsorId,
  associations,
  coaches,
  statsByEsporte,
  statsByCourt,
}: {
  venueId: string
  venueSlug: string
  naJornada: boolean
  sponsors: SponsorOption[]
  defaultSponsorId: string | null
  associations: CourtAssoc[]
  coaches: CampaignCoach[]
  statsByEsporte: Record<string, ParTotais>
  statsByCourt: Record<string, ParTotais>
}) {
  const sponsorById = useMemo(() => new Map(sponsors.map((s) => [s.id, s])), [sponsors])

  // Estado local das associações, chaveado por courtKey(sportId canônico, court).
  const [assoc, setAssoc] = useState<Record<string, Assoc>>(() => {
    const m: Record<string, Assoc> = {}
    for (const a of associations) {
      m[courtKey(a.sport, a.court_slug)] = { sponsorId: a.sponsor_id, active: a.sponsor_active }
    }
    return m
  })
  const [defId, setDefId] = useState<string | null>(defaultSponsorId)

  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Modo campanha (herdado do share-links): recolhido por padrão; ativo, injeta
  // o sufixo /[slug] em TODAS as URLs dos cards.
  const [modoCampanha, setModoCampanha] = useState(false)
  const [campanha, setCampanha] = useState('')
  const campanhaSufixo = modoCampanha && campanha ? `/${campanha}` : ''
  const coachCampanha = coaches.find((c) => c.slug === campanha) ?? null

  // Esportes abertos: por padrão só os que têm acesso OU associação.
  const [abertos, setAbertos] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {}
    for (const g of GRADE) {
      const sportId = sportIdFromSlug(g.esporte)
      if (!sportId) continue
      const temAcesso = (statsByEsporte[sportId]?.total ?? 0) > 0
      const temAssoc = g.quadras.some((court) => Boolean(assoc[courtKey(sportId, court)]))
      m[g.esporte] = temAcesso || temAssoc
    }
    return m
  })

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
    const key = courtKey(sportId, court)
    const tinha = Boolean(assoc[key])

    if (value === '') {
      if (!tinha) return
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

  /** Logo efetivo de uma quadra (precedência honesta da jornada). */
  function efetivoDe(key: string): Efetivo {
    const a = assoc[key]
    if (a) {
      const s = sponsorById.get(a.sponsorId) ?? null
      // Associação inativa → nada na jornada (e não cai no default).
      if (s && s.active) return { sponsor: s, herdado: false }
      return { sponsor: null, herdado: false }
    }
    if (defId) {
      const d = sponsorById.get(defId) ?? null
      if (d && d.active) return { sponsor: d, herdado: true }
    }
    return { sponsor: null, herdado: false }
  }

  const defSponsor = defId ? sponsorById.get(defId) : undefined
  const defInativo = Boolean(defSponsor && !defSponsor.active)

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">Quadras</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Acessos, patrocínio e QR por quadra. Mudanças de patrocínio aparecem nas quadras em até 10
        minutos (cache dos aparelhos).
      </p>

      {/* Aviso de venue fora da jornada (herdado do share-links). */}
      {!naJornada && (
        <div
          role="alert"
          className="mt-4 flex gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="text-sm leading-relaxed">
            <p className="font-medium text-destructive">Este local ainda não está na jornada de QR.</p>
            <p className="mt-1 text-muted-foreground">
              A jornada é servida por <span className="font-mono text-xs">lib/clubs-config.ts</span>,
              e o slug <span className="font-mono text-xs">{venueSlug}</span> não está lá. As URLs
              abaixo montam, mas hoje caem na home ao serem abertas —{' '}
              <strong className="font-medium text-foreground">não imprima QR a partir delas</strong>{' '}
              antes de cadastrar o local no config.
            </p>
          </div>
        </div>
      )}

      {/* Patrocinador geral do clube (fallback das quadras sem associação). */}
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
                  {s.name}
                  {s.active ? '' : ' (inativo)'}
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

      {/* Modo campanha (recolhido): reescreve as URLs com o sufixo /[ad]. */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setModoCampanha((v) => !v)}
          aria-expanded={modoCampanha}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${modoCampanha ? 'rotate-180' : ''}`}
          />
          Gerar URLs de campanha
        </button>
        {modoCampanha && (
          <div className="mt-2 flex flex-col gap-1.5 rounded-xl border border-border bg-card p-4">
            <label htmlFor="campanha" className="text-xs text-muted-foreground">
              Patrocinador da campanha (vira o último segmento de todas as URLs)
            </label>
            <select
              id="campanha"
              value={campanha}
              onChange={(e) => setCampanha(e.target.value)}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm sm:max-w-xs"
            >
              <option value="">— nenhum —</option>
              {coaches.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.nome}
                  {c.temLogo ? '' : ' (sem logo)'}
                </option>
              ))}
            </select>
            {coaches.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum coach ativo com slug cadastrado. O slug é o que vira o último segmento da URL.
              </p>
            )}
            {coachCampanha && !coachCampanha.temLogo && (
              <p className="text-xs text-muted-foreground">
                {coachCampanha.nome} não tem logo cadastrado — as URLs funcionam, mas a tela de
                patrocinador será pulada na abertura.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Esportes colapsáveis → cards de quadra. */}
      <div className="mt-4 flex flex-col gap-4">
        {GRADE.map((g) => {
          const sportId = sportIdFromSlug(g.esporte)
          const esp = sportId ? (statsByEsporte[sportId] ?? { total: 0, d7: 0 }) : { total: 0, d7: 0 }
          const aberto = abertos[g.esporte] ?? false

          return (
            <div key={g.esporte} className="rounded-2xl border border-border">
              <button
                type="button"
                onClick={() => setAbertos((m) => ({ ...m, [g.esporte]: !aberto }))}
                aria-expanded={aberto}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? 'rotate-180' : ''}`}
                />
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {g.nome}
                  <span className="ml-2 font-normal normal-case tracking-normal opacity-70">
                    {g.quadras.length} {g.quadras.length === 1 ? 'quadra' : 'quadras'}
                  </span>
                </h3>
                <div className="ml-auto">
                  <ParTotaisTexto total={esp.total} d7={esp.d7} />
                </div>
              </button>

              {aberto && (
                <div className="flex flex-col gap-2 px-3 pb-3">
                  {g.quadras.map((court) => {
                    const key = sportId ? courtKey(sportId, court) : ''
                    const stats = (key && statsByCourt[key]) || { total: 0, d7: 0 }
                    const valor = key ? (assoc[key]?.sponsorId ?? '') : ''

                    return (
                      <CourtCard
                        key={court}
                        venueSlug={venueSlug}
                        esporteSlug={g.esporte}
                        esporteNome={g.nome}
                        court={court}
                        stats={stats}
                        sponsors={sponsors}
                        valor={valor}
                        onChangeSponsor={(v) => sportId && onChangeCourt(sportId, court, v)}
                        salvando={savingKey === key}
                        erro={key ? errors[key] : undefined}
                        efetivo={key ? efetivoDe(key) : { sponsor: null, herdado: false }}
                        campanhaSufixo={campanhaSufixo}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
