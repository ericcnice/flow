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
 * ⚠️ IDENTIFICADOR: as quadras vêm de public.courts com `sport` CANÔNICO
 * ("tennis","beach","tabletennis") — o MESMO que acessos e associações usam.
 * O server já agrupa e resolve o slug de URL (esporteSlug) por grupo; aqui o
 * canônico é a chave direta de stats/assoc (sem sportIdFromSlug intermediário).
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
  Plus,
  QrCode,
  Share2,
  TriangleAlert,
} from 'lucide-react'
import { courtKey, type ParTotais } from '@/lib/venue-stats'
import { DOMINIO_PUBLICO } from '../constants'
import { QrModal } from './qr-modal'
import {
  removeCourtSponsor,
  setCourtSponsor,
  setVenueDefaultSponsor,
  type FormState,
} from './court-sponsors-actions'
import { ManageCourts } from './courts-manage'
import { seedDefaultCourts } from './courts-actions'

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

/** Uma quadra do venue (id/active/sort p/ a gestão; slug+name p/ operação). */
export type ManagedCourt = {
  id: string
  slug: string
  name: string
  active: boolean
  sort: number
}

/**
 * Grupo de quadras de um esporte, montado no server a partir de public.courts.
 * `sport` = id CANÔNICO (chave de stats/assoc); `esporteSlug` = slug de URL
 * (monta as URLs da jornada); `nome` = nome de exibição do esporte (catálogo);
 * `quadras` = TODAS as quadras do venue (ativas + inativas) — a OPERAÇÃO filtra
 * as ativas; a GESTÃO enxerga todas.
 */
export type CourtGroup = {
  sport: string
  esporteSlug: string
  nome: string
  quadras: ManagedCourt[]
}

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
  courtName,
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
  courtName: string
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
        <span className="min-w-0 truncate text-sm font-medium">{courtName}</span>
        <span className="font-mono text-xs text-muted-foreground">{court}</span>
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
  courtGroups,
  sponsors,
  defaultSponsorId,
  associations,
  statsByEsporte,
  statsByCourt,
}: {
  venueId: string
  venueSlug: string
  naJornada: boolean
  courtGroups: CourtGroup[]
  sponsors: SponsorOption[]
  defaultSponsorId: string | null
  associations: CourtAssoc[]
  statsByEsporte: Record<string, ParTotais>
  statsByCourt: Record<string, ParTotais>
}) {
  const sponsorById = useMemo(() => new Map(sponsors.map((s) => [s.id, s])), [sponsors])

  // Campanha só faz sentido com sponsor ATIVO: a URL /[slug] resolve por
  // get_sponsor_by_slug, que filtra active=true — um inativo cairia em nada.
  const sponsorsAtivos = useMemo(() => sponsors.filter((s) => s.active), [sponsors])

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

  // Seed de quadras padrão (estado vazio). Opt-in explícito — nunca automático.
  const [seeding, setSeeding] = useState(false)
  const [seedErro, setSeedErro] = useState<string | null>(null)
  async function criarQuadrasPadrao() {
    setSeeding(true)
    setSeedErro(null)
    try {
      const r = await seedDefaultCourts(venueId, venueSlug)
      if (!r.ok) setSeedErro(r.erro ?? 'Erro ao criar as quadras padrão.')
    } finally {
      setSeeding(false)
    }
  }

  // Modo campanha (herdado do share-links): recolhido por padrão; ativo, injeta
  // o sufixo /[slug] em TODAS as URLs dos cards. `campanha` guarda o SLUG do
  // sponsor — o mesmo segmento /[ad] que a jornada resolve.
  const [modoCampanha, setModoCampanha] = useState(false)
  const [campanha, setCampanha] = useState('')
  const campanhaSufixo = modoCampanha && campanha ? `/${campanha}` : ''

  // Esportes abertos: por padrão só os que têm acesso OU associação. Chaveado
  // pelo id CANÔNICO do grupo (courts.sport) — chave direta dos rollups/assoc.
  const [abertos, setAbertos] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {}
    for (const g of courtGroups) {
      const temAcesso = (statsByEsporte[g.sport]?.total ?? 0) > 0
      const temAssoc = g.quadras.some((c) => c.active && Boolean(assoc[courtKey(g.sport, c.slug)]))
      m[g.sport] = temAcesso || temAssoc
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
              {sponsorsAtivos.map((s) => (
                <option key={s.id} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
            {sponsorsAtivos.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum patrocinador ativo cadastrado. Cadastre em /dashboard/sponsors — o slug do
                patrocinador é o que vira o último segmento da URL.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Esportes colapsáveis → cards de quadra. Vazio = venue sem quadras em
          public.courts (não cai mais na GRADE hardcoded). */}
      {courtGroups.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm font-medium">Nenhuma quadra cadastrada.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Este local ainda não tem quadras em <span className="font-mono text-xs">courts</span>.
          </p>
          <button
            type="button"
            onClick={criarQuadrasPadrao}
            disabled={seeding}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {seeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar quadras padrão (q1 e q2 dos 6 esportes)
          </button>
          {seedErro && (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {seedErro}
            </p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Ou use “Gerenciar quadras” abaixo para adicionar uma a uma.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {courtGroups.map((g) => {
            // OPERAÇÃO: só as quadras ATIVAS. Grupo sem ativas não vira acordeão
            // de operação (aparece só na gestão, para reativar).
            const ativas = g.quadras.filter((c) => c.active)
            if (ativas.length === 0) return null
            const esp = statsByEsporte[g.sport] ?? { total: 0, d7: 0 }
            const aberto = abertos[g.sport] ?? false

            return (
              <div key={g.sport} className="rounded-2xl border border-border">
                <button
                  type="button"
                  onClick={() => setAbertos((m) => ({ ...m, [g.sport]: !aberto }))}
                  aria-expanded={aberto}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? 'rotate-180' : ''}`}
                  />
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    {g.nome}
                    <span className="ml-2 font-normal normal-case tracking-normal opacity-70">
                      {ativas.length} {ativas.length === 1 ? 'quadra' : 'quadras'}
                    </span>
                  </h3>
                  <div className="ml-auto">
                    <ParTotaisTexto total={esp.total} d7={esp.d7} />
                  </div>
                </button>

                {aberto && (
                  <div className="flex flex-col gap-2 px-3 pb-3">
                    {ativas.map((c) => {
                      const key = courtKey(g.sport, c.slug)
                      const stats = statsByCourt[key] || { total: 0, d7: 0 }
                      const valor = assoc[key]?.sponsorId ?? ''

                      return (
                        <CourtCard
                          key={c.slug}
                          venueSlug={venueSlug}
                          esporteSlug={g.esporteSlug}
                          esporteNome={g.nome}
                          court={c.slug}
                          courtName={c.name}
                          stats={stats}
                          sponsors={sponsors}
                          valor={valor}
                          onChangeSponsor={(v) => onChangeCourt(g.sport, c.slug, v)}
                          salvando={savingKey === key}
                          erro={errors[key]}
                          efetivo={efetivoDe(key)}
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
      )}

      {/* GESTÃO (estrutural) — separada da operação acima. */}
      <ManageCourts venueId={venueId} venueSlug={venueSlug} courtGroups={courtGroups} />
    </section>
  )
}
