'use client'

/**
 * ÁREA DE PERFIL (A1.3c) — rota PRIVADA do próprio dono. Client component,
 * guardada por SESSÃO (useSession, getSession local — não entra no middleware,
 * que é só /dashboard; a jornada anônima segue intocada). Sem sessão → login
 * INLINE (não redireciona: é uma página de conta). Mobile-first, página única.
 *
 * Futuro (não aqui): a versão PÚBLICA vira /@username (cartão de visita do
 * professor). Esta é a privada; o snapshot já viaja com nomes para projetar lá.
 *
 * Tudo atrás da flag NEXT_PUBLIC_APP_AUTH (?auth=1 p/ QA).
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AsYouType, isValidPhoneNumber, parsePhoneNumber } from 'libphonenumber-js'
import { AlertTriangle, ArrowLeft, BadgeCheck, Check, Copy, Loader2, LogOut, MessageCircle, Pencil, Plus, Send, ShieldCheck, Trash2, Trophy, Users, X } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { createBrowserSupabaseClient } from '@/lib/supabase/browser-client'
import { avatarUrlOf } from '@/lib/auth-avatar'
import { AvatarUploader } from '@/components/auth/avatar-uploader'
import { TOS_VERSION } from '@/lib/legal'
import { acceptTos, getConsent, setMarketing, type Consent } from '@/lib/supabase/consents'
import { useSession } from '@/lib/hooks/use-session'
import { LoginPanel } from '@/components/auth/login-panel'
import { ProfileForm } from '@/components/auth/profile-form'
import { splitName } from '@/components/auth/profile-form'

const PAGINA = 20

type MatchResult = {
  players?: { blue1?: string; blue2?: string; red1?: string; red2?: string }
  winner?: 'A' | 'B'
  winnerName?: string
  loserName?: string
  sets?: { set: number; a: number; b: number; tiebreak?: boolean }[]
  sportName?: string
  scoreType?: string
}
type MatchRow = {
  id: string
  sport: string
  venue_slug: string | null
  court_slug: string | null
  game_type: string | null
  result: MatchResult
  started_at: string | null
  ended_at: string
}
type Perfil = { nome: string | null; phone: string | null; username: string; avatarUrl: string | null }

// ---------------------------------------------------------------- item de jogo
function MatchItem({ m }: { m: MatchRow }) {
  const r = m.result ?? {}
  const winnerIsA = r.winner === 'A'
  const sets = r.sets ?? []
  const winSets = sets.map((s) => (winnerIsA ? s.a : s.b))
  const loseSets = sets.map((s) => (winnerIsA ? s.b : s.a))
  const quando = (() => {
    try {
      return formatDistanceToNow(new Date(m.ended_at), { addSuffix: true, locale: ptBR })
    } catch {
      return ''
    }
  })()

  return (
    <div className="rounded-xl border border-white/10 bg-neutral-900 p-4">
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-widest text-white/50">
        <span className="font-semibold text-white/70">{r.sportName ?? m.sport}</span>
        <span>·</span>
        <span>{quando}</span>
        {m.venue_slug && (
          <>
            <span>·</span>
            <span className="font-mono normal-case tracking-normal">
              {m.venue_slug}
              {m.court_slug ? `/${m.court_slug}` : ''}
            </span>
          </>
        )}
      </div>

      <div
        className="grid items-center gap-x-2 gap-y-1 text-lg font-bold tabular-nums"
        style={{ gridTemplateColumns: `minmax(0,1fr) repeat(${sets.length}, 1.5rem)` }}
      >
        {/* Vencedor em destaque (amarelo), perdedor esmaecido. */}
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate" style={{ color: '#FEE100' }}>
          <Trophy className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{r.winnerName ?? '—'}</span>
        </span>
        {winSets.map((v, i) => (
          <span key={`w${i}`} className="text-center" style={{ color: '#FEE100' }}>
            {v}
          </span>
        ))}

        <span className="min-w-0 truncate pl-5 text-white/55">{r.loserName ?? '—'}</span>
        {loseSets.map((v, i) => (
          <span key={`l${i}`} className="text-center text-white/55">
            {v}
          </span>
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ meus jogos
function MeusJogos({ userId }: { userId: string }) {
  const [jogos, setJogos] = useState<MatchRow[]>([])
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando')
  const [limite, setLimite] = useState(PAGINA)
  const [temMais, setTemMais] = useState(false)

  useEffect(() => {
    let alive = true
    setEstado((e) => (jogos.length === 0 ? 'carregando' : e))
    const supabase = createBrowserSupabaseClient()
    supabase
      .from('matches')
      .select('id, sport, venue_slug, court_slug, game_type, result, started_at, ended_at')
      .order('ended_at', { ascending: false })
      .range(0, limite) // pede 1 a mais para saber se há próxima página
      .then(({ data, error }) => {
        if (!alive) return
        if (error) {
          setEstado('erro')
          return
        }
        const rows = (data ?? []) as MatchRow[]
        setTemMais(rows.length > limite)
        setJogos(rows.slice(0, limite))
        setEstado('ok')
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, limite])

  if (estado === 'carregando') {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-neutral-900" />
        ))}
      </div>
    )
  }
  if (estado === 'erro') {
    return (
      <p className="rounded-xl border border-white/10 bg-neutral-900 p-4 text-sm text-white/60">
        Não deu para carregar seus jogos agora. Tente novamente com conexão.
      </p>
    )
  }
  if (jogos.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/15 bg-neutral-900 p-8 text-center">
        <Trophy className="mx-auto mb-3 h-8 w-8 text-white/40" />
        <p className="text-sm font-medium">Você ainda não salvou nenhum jogo.</p>
        <p className="mt-1 text-sm text-white/55">
          Termine uma partida e ela aparece aqui, com placar e nomes.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {jogos.map((m) => (
        <MatchItem key={m.id} m={m} />
      ))}
      {temMais && (
        <button
          type="button"
          onClick={() => setLimite((n) => n + PAGINA)}
          className="mx-auto mt-1 rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5"
        >
          Carregar mais
        </button>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ meus alunos
// Linha crua de coach_list_students (SOBERANIA DE DADOS / Fatia 1). A RPC já
// resolve a identidade: aluno CADASTRADO mostra o que ELE declarou no profile;
// aluno solto mostra a anotação do professor. O app não faz mais essa escolha.
type AlunoRpcRow = {
  id: string
  level: string | null
  member_number: string | null
  class_schedule: string | null
  is_claimed: boolean
  display_name: string | null
  display_phone: string | null
  avatar_url: string | null
  email: string | null
  idade: number | null
  nascimento_mes_ano: string | null
  invite_token: string | null
  invite_status: string | null
  invite_last_sent_at: string | null
}

type Aluno = {
  id: string
  /** Nome RESOLVIDO (profile do aluno quando cadastrado; anotação do coach quando não). */
  name: string | null
  /** Celular RESOLVIDO, mesma regra. */
  phone: string | null
  level: string | null
  member_number: string | null
  class_schedule: string | null
  /** O aluno é dono de si (members.profile_id preenchido) — a verdade da soberania. */
  isClaimed: boolean
  avatarUrl: string | null
  /** Do profile do aluno (login Google/OTP). Só cadastrado; desambigua homônimos. */
  email: string | null
  /** Anos completos, DERIVADO no banco. O dia do nascimento nunca chega aqui. */
  idade: number | null
  /** 'MM/AAAA' — granularidade máxima que sai do banco. */
  nascimentoMesAno: string | null
  conviteToken: string | null
  conviteStatus: string | null
  conviteEnviadoEm: string | null
}

function alunoDaRpc(r: AlunoRpcRow): Aluno {
  return {
    id: r.id,
    name: r.display_name,
    phone: r.display_phone,
    level: r.level,
    member_number: r.member_number,
    class_schedule: r.class_schedule,
    isClaimed: Boolean(r.is_claimed),
    avatarUrl: r.avatar_url,
    email: r.email,
    idade: r.idade,
    nascimentoMesAno: r.nascimento_mes_ano,
    conviteToken: r.invite_token,
    conviteStatus: r.invite_status,
    conviteEnviadoEm: r.invite_last_sent_at,
  }
}

// Estado que o CARD mostra. A régua de "cadastrado" é `isClaimed` (profile_id),
// NÃO o status do convite: quem é dono de si é dono de si independentemente do
// caminho que usou para chegar lá (o claim por celular da A5 não passa por
// convite algum). O convite só responde pelo estado intermediário "convidado".
function estadoDoConvite(a: Aluno): { tipo: 'cadastrado' | 'convidado'; quando: string | null } | null {
  if (a.isClaimed) return { tipo: 'cadastrado', quando: null }
  if (a.conviteStatus === 'pending') return { tipo: 'convidado', quando: a.conviteEnviadoEm }
  return null
}

// Badge. VERDE (mesmo tom do tick de verificado) para 'cadastrado' — puxa o olho
// de propósito; NEUTRO para 'convidado', com o "há Xd" do último disparo (o app
// abre o WhatsApp mas não sabe se o coach apertou enviar — por isso "Convidado",
// nunca "Enviado").
function ConviteBadge({ estado }: { estado: { tipo: 'cadastrado' | 'convidado'; quando: string | null } }) {
  if (estado.tipo === 'cadastrado') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] font-bold text-emerald-400 ring-1 ring-emerald-400/25">
        <BadgeCheck className="h-3 w-3" aria-hidden />
        Cadastrado
      </span>
    )
  }
  const quando = (() => {
    if (!estado.quando) return ''
    try {
      return formatDistanceToNow(new Date(estado.quando), { addSuffix: true, locale: ptBR })
    } catch {
      return ''
    }
  })()
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/60">
      Convidado
      {quando && <span className="text-white/35">· {quando}</span>}
    </span>
  )
}

// Card de aluno. Mostra o nome em destaque, o badge do convite (se houver), o
// celular discreto e só os campos preenchidos (nível/sócio/aula).
//
// ESTRUTURA (refatorada na A.2): o card era um <button> ÚNICO embrulhando tudo.
// Isso impedia acrescentar o botão "Convidar" (A.3) — <button> dentro de
// <button> é HTML inválido. Agora é <div> + <button> interno nos DADOS (mesmo
// onEdit, comportamento idêntico) + uma ÁREA DE AÇÕES à direita, com o botão de
// convite e o lápis.
function AlunoCard({
  a,
  onEdit,
  onConvidar,
  convidando,
}: {
  a: Aluno
  onEdit: (a: Aluno) => void
  onConvidar: (a: Aluno) => void
  convidando: boolean
}) {
  const tel = (() => {
    if (!a.phone) return ''
    try {
      return parsePhoneNumber(a.phone)?.formatInternational() ?? a.phone
    } catch {
      return a.phone
    }
  })()
  // A IDADE entra junto dos detalhes (útil para montar categoria/turma de
  // relance). O EMAIL fica só no modal — no card seria ruído numa linha que já
  // carrega nome, badge e celular.
  const detalhes = [
    a.idade !== null ? { label: 'Idade', valor: `${a.idade}` } : null,
    a.level ? { label: 'Nível', valor: a.level } : null,
    a.member_number ? { label: 'Sócio', valor: a.member_number } : null,
    a.class_schedule ? { label: 'Aula', valor: a.class_schedule } : null,
  ].filter(Boolean) as { label: string; valor: string }[]
  const convite = estadoDoConvite(a)

  return (
    <div className="flex items-stretch overflow-hidden rounded-xl border border-white/10 bg-neutral-900">
      {/* DADOS — alvo principal de toque (ocupa quase todo o card, altura do
          conteúdo ≥ 44px com o p-4). Carrega o nome acessível da ação. */}
      <button
        type="button"
        onClick={() => onEdit(a)}
        aria-label={`Editar ${a.name ?? 'aluno'}`}
        className="min-w-0 flex-1 p-4 text-left transition hover:bg-neutral-800/60"
      >
        <p className="truncate text-base font-bold">{a.name ?? '—'}</p>
        {convite && (
          <p className="mt-1.5">
            <ConviteBadge estado={convite} />
          </p>
        )}
        {tel && <p className="mt-1 text-sm text-white/50">{tel}</p>}
        {detalhes.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/60">
            {detalhes.map((d) => (
              <span key={d.label}>
                <span className="text-white/40">{d.label}:</span> {d.valor}
              </span>
            ))}
          </div>
        )}
      </button>

      {/* AÇÕES — coluna à direita: CONVIDAR (ação nova, própria) + o lápis.
          O lápis repete a MESMA ação do botão de dados: é afordância visual,
          então sai da ordem de tabulação e do leitor de tela (tabIndex=-1 +
          aria-hidden) para não duplicar "Editar Fulano". 44×44 de alvo cada. */}
      <div className="flex shrink-0 items-center gap-1 pr-2">
        {/* CONVIDAR só faz sentido para quem ainda não tem conta. Aluno
            cadastrado já chegou — manter o botão seria oferecer uma ação sem
            efeito e roubar espaço do que importa. */}
        {!a.isClaimed && (
          <button
            type="button"
            onClick={() => onConvidar(a)}
            disabled={convidando}
            aria-label={`Convidar ${a.name ?? 'aluno'}`}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-white/45 transition hover:bg-white/10 hover:text-emerald-400 disabled:opacity-40"
          >
            {convidando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => onEdit(a)}
          tabIndex={-1}
          aria-hidden
          className="flex h-11 w-11 items-center justify-center rounded-lg text-white/30 transition hover:bg-white/10 hover:text-white/70"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

// Mensagem que o coach manda pelo WhatsApp DELE (zero custo de API). Template
// pessoal — o CLAUDE.md é explícito que o convite direcionado converte por ser
// pessoal. Sem o nome do coach (perfil ainda carregando / sem nome), a saudação
// degrada limpo em vez de virar "Aqui é  👋".
function montarMensagemConvite(primeiroNome: string, nomeCoach: string, url: string) {
  const coach = nomeCoach.trim()
  return [
    coach ? `Olá ${primeiroNome}! Aqui é ${coach} 👋` : `Olá ${primeiroNome}! 👋`,
    'Estou usando o Flow para marcar os pontos e guardar os jogos das nossas aulas.',
    'Faça seu cadastro rápido por aqui — leva 1 minuto:',
    url,
  ].join('\n')
}

// MODAL DE CONVITE (A.3). Abre DEPOIS que a RPC devolveu o token.
//
// POR QUE UM MODAL, e não abrir o WhatsApp direto: a RPC é assíncrona, e um
// window.open() depois do await perde o gesto do usuário — o Safari iOS
// (justamente o aparelho do professor) bloqueia como popup. Aqui o WhatsApp é
// um <a href> que o coach CLICA: gesto preservado, zero bloqueio. De quebra,
// sobra lugar para ele editar a mensagem antes de mandar.
function ConviteModal({
  aluno,
  token,
  nomeCoach,
  onClose,
}: {
  aluno: Aluno
  token: string
  nomeCoach: string
  onClose: () => void
}) {
  const primeiroNome = (aluno.name ?? '').trim().split(/\s+/)[0] || 'aluno'
  // Inicializador PREGUIÇOSO com guarda de window: roda só no cliente (o modal
  // nem existe no SSR, mas a guarda mantém a regra da casa de nunca ler window
  // durante a renderização do servidor).
  const [origin] = useState(() => (typeof window !== 'undefined' ? window.location.origin : ''))
  const url = `${origin}/convite/${token}`

  const [mensagem, setMensagem] = useState(() => montarMensagemConvite(primeiroNome, nomeCoach, url))
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    if (!copiado) return
    const t = setTimeout(() => setCopiado(false), 2000)
    return () => clearTimeout(t)
  }, [copiado])

  // wa.me exige SÓ DÍGITOS (sem '+', sem espaços). members.phone é E.164
  // validado no banco. Sem celular cadastrado, `digitos` fica vazio e a URL
  // degrada exatamente para o formato sem número (https://wa.me/?text=...),
  // em que o próprio WhatsApp abre o seletor de contato.
  const digitos = (aluno.phone ?? '').replace(/\D/g, '')
  const waUrl = `https://wa.me/${digitos}?text=${encodeURIComponent(mensagem)}`

  async function copiarLink() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Convidar ${primeiroNome}`}
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h3 className="min-w-0 truncate text-base font-bold">Convidar {primeiroNome}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-5">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Mensagem</span>
            <textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={6}
              className="w-full min-w-0 resize-none rounded-lg border border-white/20 bg-white/10 p-3 text-sm leading-relaxed"
            />
            <span className="text-xs text-white/45">
              {digitos
                ? 'Abre a conversa com o aluno no seu WhatsApp. Você pode editar antes de enviar.'
                : 'Sem celular cadastrado — o WhatsApp vai pedir para você escolher o contato.'}
            </span>
          </label>

          {/* <a>, NUNCA window.open: preserva o gesto do usuário (popup blocker
              do iOS) e deixa o SO decidir — app no celular, web no desktop. */}
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 items-center justify-center gap-2 rounded-lg bg-white text-base font-bold text-neutral-900 transition hover:bg-white/90"
          >
            <MessageCircle className="h-5 w-5" />
            Abrir WhatsApp
          </a>

          {/* Escape sempre visível: se o wa.me/{numero} falhar (número sem
              WhatsApp), o coach ainda leva o link por onde quiser. */}
          <button
            type="button"
            onClick={copiarLink}
            className="flex h-11 items-center justify-center gap-2 rounded-lg bg-white/10 text-sm font-bold text-white transition hover:bg-white/15"
          >
            {copiado ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" /> Link copiado
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" /> Copiar link
              </>
            )}
          </button>

          <p className="break-all text-center font-mono text-[11px] text-white/35">{url}</p>
        </div>
      </div>
    </div>
  )
}

// Modal de aluno (A3.3 cadastro + A3.4 edição/remoção). Enxuto/mobile-first, tema
// dark do /perfil. `aluno=null` → cadastro (coach_add_student); `aluno` presente →
// edição (coach_update_student) + remover (coach_remove_student, soft-delete). O
// coach NUNCA envia coach_id/role — as RPCs (SECURITY DEFINER) escopam no servidor.
function AlunoFormModal({
  aluno,
  onClose,
  onDone,
}: {
  aluno: Aluno | null
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const editar = aluno !== null
  // SOBERANIA (Fatia 3): aluno CADASTRADO tem nome/celular/email/idade vindos do
  // profile DELE — aqui viram texto, não campo. O banco já recusa a escrita
  // (Fatia 2); a tela apenas para de oferecer o que não é do professor.
  const cadastrado = editar && Boolean(aluno?.isClaimed)
  const telInicial = (() => {
    if (!aluno?.phone) return ''
    try {
      return parsePhoneNumber(aluno.phone)?.formatInternational() ?? aluno.phone
    } catch {
      return aluno.phone
    }
  })()
  // Só dígitos para o wa.me (o E.164 traz '+' e a exibição traz espaços).
  const waDigitos = (aluno?.phone ?? '').replace(/\D/g, '')

  const [nome, setNome] = useState(aluno?.name ?? '')
  const [celular, setCelular] = useState(telInicial)
  const [nivel, setNivel] = useState(aluno?.level ?? '')
  const [socio, setSocio] = useState(aluno?.member_number ?? '')
  const [horario, setHorario] = useState(aluno?.class_schedule ?? '')
  const [salvando, setSalvando] = useState(false)
  const [removendo, setRemovendo] = useState(false)
  const [confirmandoRemover, setConfirmandoRemover] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const nomeOk = nome.trim() !== ''
  // Celular OPCIONAL: vazio → ok; preenchido → precisa ser E.164 válido.
  const celularPreenchido = celular.trim() !== ''
  const e164 =
    celularPreenchido && isValidPhoneNumber(celular, 'BR')
      ? (parsePhoneNumber(celular, 'BR')?.number ?? '')
      : ''
  const celularInvalido = celularPreenchido && e164 === ''

  // DIRTY (só na edição): Salvar habilita se algum campo divergiu do original.
  // Para CADASTRADO, nome/celular não são mais editáveis — incluí-los na conta
  // deixaria o Salvar preso, porque eles nunca mudam.
  const dirtyPedagogico =
    nivel.trim() !== (aluno?.level ?? '').trim() ||
    socio.trim() !== (aluno?.member_number ?? '').trim() ||
    horario.trim() !== (aluno?.class_schedule ?? '').trim()

  const dirty =
    !editar ||
    dirtyPedagogico ||
    (!cadastrado &&
      (nome.trim() !== (aluno?.name ?? '').trim() || (e164 || '') !== (aluno?.phone ?? '')))

  const podeSalvar =
    (cadastrado || nomeOk) && (cadastrado || !celularInvalido) && dirty && !salvando && !removendo

  const norm = (s: string) => {
    const t = s.trim()
    return t === '' ? null : t
  }

  async function salvar() {
    if (!podeSalvar) return
    setSalvando(true)
    setErro(null)
    const supabase = createBrowserSupabaseClient()
    // coach_id/role NÃO vão no payload — as RPCs escopam por coach_id=auth.uid().
    if (editar && aluno) {
      // Aluno CADASTRADO: nem enviamos identidade. O banco já a congela (Fatia
      // 2, o `case` em coach_update_student), mas mandar null deixa a intenção
      // explícita — o professor está salvando ANOTAÇÃO, não identidade.
      const { error } = await supabase.rpc('coach_update_student', {
        p_student_id: aluno.id,
        p_name: cadastrado ? null : nome.trim(),
        p_phone: cadastrado ? null : e164 || null,
        p_level: norm(nivel),
        p_member_number: norm(socio),
        p_class_schedule: norm(horario),
      })
      if (error) {
        setErro('Não deu para salvar as alterações agora. Tente novamente.')
        setSalvando(false)
        return
      }
      onDone('Aluno atualizado.')
    } else {
      const { error } = await supabase.rpc('coach_add_student', {
        p_name: nome.trim(),
        p_phone: e164 || null,
        p_level: norm(nivel),
        p_member_number: norm(socio),
        p_class_schedule: norm(horario),
      })
      if (error) {
        setErro('Não deu para adicionar o aluno agora. Tente novamente.')
        setSalvando(false)
        return
      }
      onDone('Aluno adicionado.')
    }
  }

  async function remover() {
    if (!aluno) return
    setRemovendo(true)
    setErro(null)
    const supabase = createBrowserSupabaseClient()
    // Soft-delete no servidor (active=false); some da lista (filtra active=true).
    const { error } = await supabase.rpc('coach_remove_student', { p_student_id: aluno.id })
    if (error) {
      setErro('Não deu para remover agora. Tente novamente.')
      setRemovendo(false)
      return
    }
    onDone('Aluno removido.')
  }

  const ocupado = salvando || removendo
  // w-full + min-w-0: a largura intrínseca do <input> é a origem do estouro
  // horizontal no mobile; assim ele sempre obedece ao container, nunca ao size.
  const campo = 'h-11 w-full min-w-0 rounded-lg border border-white/20 bg-white/10 px-3 text-base'

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={editar ? 'Editar aluno' : 'Adicionar aluno'}
      onClick={() => !ocupado && onClose()}
    >
      <div
        className="my-8 w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h3 className="text-base font-bold">{editar ? 'Editar aluno' : 'Adicionar aluno'}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-5">
          {cadastrado ? (
            /* BLOCO 1 — DADOS DO ALUNO (leitura). Ele criou conta e declarou
               quem é; o professor lê, não escreve. O tick verde é o mesmo do
               /perfil, e a frase final ensina a regra em cinco palavras. */
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-white/40">
                Dados do aluno
              </p>
              <div className="flex items-start gap-3">
                {aluno?.avatarUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={aluno.avatarUrl}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-base font-bold text-white/70">
                    {(aluno?.name ?? '?').trim().charAt(0).toUpperCase() || '?'}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-base font-bold">
                    <span className="truncate">{aluno?.name ?? '—'}</span>
                    <BadgeCheck
                      className="h-4 w-4 shrink-0 text-emerald-400"
                      aria-label="Identidade confirmada pelo aluno"
                    />
                  </p>
                  {/* CELULAR CLICÁVEL: abre a conversa no WhatsApp do professor.
                      Mesmo tratamento de dígitos do convite (wa.me não aceita
                      '+' nem espaços). Só aqui, no bloco de leitura — no card o
                      telefone vive dentro do <button> de editar, e um <a> ali
                      dentro seria HTML inválido além de roubar o toque. */}
                  {telInicial && waDigitos && (
                    <a
                      href={`https://wa.me/${waDigitos}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-0.5 inline-flex items-center gap-1.5 truncate text-sm text-white/60 transition hover:text-emerald-400"
                    >
                      <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{telInicial}</span>
                    </a>
                  )}
                  {telInicial && !waDigitos && (
                    <p className="mt-0.5 truncate text-sm text-white/60">{telInicial}</p>
                  )}
                  {aluno?.email && <p className="truncate text-sm text-white/50">{aluno.email}</p>}
                  {aluno?.idade !== null && aluno?.idade !== undefined && (
                    <p className="mt-0.5 text-sm text-white/50">
                      Idade: {aluno.idade} anos
                      {aluno.nascimentoMesAno ? ` · ${aluno.nascimentoMesAno}` : ''}
                    </p>
                  )}
                </div>
              </div>
              <p className="mt-2.5 text-xs text-white/40">Informado pelo próprio aluno.</p>
            </div>
          ) : (
            <>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Nome *</span>
                <input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus placeholder="Nome do aluno" className={campo} />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Celular</span>
                <input
                  value={celular}
                  onChange={(e) => setCelular(new AsYouType('BR').input(e.target.value))}
                  inputMode="tel"
                  placeholder="+55 (11) 95050-7175"
                  className={campo}
                />
                {celularInvalido && <span className="text-xs text-white/50">Número inválido. Deixe vazio ou corrija.</span>}
              </label>

              {/* Combina a expectativa ANTES de ela virar surpresa: o dia em que
                  o aluno criar a conta, estes dois campos deixam de ser do
                  professor — e ninguém vai achar que perdeu uma função. */}
              <p className="-mt-1 text-xs text-white/40">
                Você anotou estes dados. Quando o aluno criar a conta, ele passa a mantê-los.
              </p>
            </>
          )}

          {/* BLOCO 2 — SUAS ANOTAÇÕES (sempre editável, nos dois casos): é a
              visão do professor sobre o aluno, não identidade. */}
          {cadastrado && (
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-white/40">
              Suas anotações
            </p>
          )}

          {/* EMPILHADOS (não lado a lado): dois inputs numa row estouravam a
              largura no mobile — input tem largura intrínseca (~20 chars) e não
              encolhe abaixo dela, empurrando scroll horizontal na página toda.
              Mesmo bug (e mesma correção) do Nome/Sobrenome do /perfil. */}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Nível</span>
            <input value={nivel} onChange={(e) => setNivel(e.target.value)} placeholder="Iniciante" className={campo} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Nº sócio</span>
            <input value={socio} onChange={(e) => setSocio(e.target.value)} placeholder="Opcional" className={campo} />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Horário de aula</span>
            <input value={horario} onChange={(e) => setHorario(e.target.value)} placeholder="Ter/Qui 18h" className={campo} />
          </label>

          {erro && (
            <p role="alert" className="text-sm text-red-400">
              {erro}
            </p>
          )}

          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={ocupado}
              className="h-12 flex-1 rounded-lg bg-white/10 text-base font-bold text-white transition hover:bg-white/15 disabled:opacity-40"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvar}
              disabled={!podeSalvar}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-white text-base font-bold text-neutral-900 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {salvando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              {/* "Salvar" nos dois modos: "Salvar alterações" quebrava em duas
                  linhas no mobile e não acrescenta informação. */}
              Salvar
            </button>
          </div>

          {/* REMOVER (só na edição). Deliberado: confirmação separada. */}
          {editar && !confirmandoRemover && (
            <button
              type="button"
              onClick={() => setConfirmandoRemover(true)}
              disabled={ocupado}
              className="mt-1 inline-flex items-center justify-center gap-1.5 border-t border-white/10 pt-4 text-sm font-medium text-red-400/80 transition hover:text-red-400 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
              Remover aluno
            </button>
          )}
          {editar && confirmandoRemover && (
            <div className="mt-1 rounded-lg border border-red-500/25 bg-red-500/5 p-3">
              <p className="mb-2.5 text-sm text-white/80">
                Remover <strong>{aluno?.name}</strong>? Ele sai da sua lista de alunos.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmandoRemover(false)}
                  disabled={removendo}
                  className="h-10 flex-1 rounded-lg bg-white/10 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={remover}
                  disabled={removendo}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 text-sm font-bold text-white transition hover:bg-red-500 disabled:opacity-40"
                >
                  {removendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Remover
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Roster do coach: os alunos DELE. O escopo agora vem da RPC
// coach_list_students (auth.uid() por dentro), que também resolve a identidade
// do aluno cadastrado — nenhum vazamento entre coaches, e nada de nome velho.
//
// `userId` não entra mais na consulta (a RPC não recebe parâmetro); segue como
// DEPENDÊNCIA do effect, para a lista recarregar se a sessão trocar.
function MeusAlunos({ userId, nomeCoach }: { userId: string; nomeCoach: string }) {
  const [alunos, setAlunos] = useState<Aluno[]>([])
  const [estado, setEstado] = useState<'carregando' | 'ok' | 'erro'>('carregando')
  // Modal: null = fechado; { aluno: null } = cadastro; { aluno } = edição.
  const [modal, setModal] = useState<{ aluno: Aluno | null } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [feedback, setFeedback] = useState<string | null>(null)
  // Convite (A.3): id do aluno cujo convite está sendo gerado (spinner no card)
  // e o modal com o token já em mãos.
  const [convidandoId, setConvidandoId] = useState<string | null>(null)
  const [convite, setConvite] = useState<{ aluno: Aluno; token: string } | null>(null)
  const [erroConvite, setErroConvite] = useState<string | null>(null)

  // Recarrega a lista (sem voltar ao skeleton em refresh — estado só é
  // 'carregando' no 1º load; refresh só troca os dados quando chegam).
  useEffect(() => {
    let alive = true
    const supabase = createBrowserSupabaseClient()

    async function carregar() {
      // UMA viagem: a RPC já escopa ao coach (auth.uid() por dentro), resolve a
      // identidade do aluno cadastrado a partir do profile DELE, embute o
      // convite relevante e ordena pelo nome MOSTRADO.
      //
      // O embed members→profiles seria pior que inútil aqui: a RLS self de
      // profiles devolveria null em SILÊNCIO e o card continuaria com o nome
      // velho, sem erro nenhum para denunciar.
      const { data, error } = await supabase.rpc('coach_list_students')
      if (!alive) return
      if (error) {
        setEstado('erro')
        return
      }
      setAlunos(((data ?? []) as AlunoRpcRow[]).map(alunoDaRpc))
      setEstado('ok')
    }

    carregar()
    return () => {
      alive = false
    }
  }, [userId, refreshKey])

  // Feedback transitório após adicionar/editar/remover.
  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => setFeedback(null), 2500)
    return () => clearTimeout(t)
  }, [feedback])

  // Erro do convite: some sozinho (mais tempo que o sucesso — é o que precisa
  // ser lido).
  useEffect(() => {
    if (!erroConvite) return
    const t = setTimeout(() => setErroConvite(null), 4000)
    return () => clearTimeout(t)
  }, [erroConvite])

  // Métrica do coach ("quantos convidei, quantos já se cadastraram"). Só aparece
  // quando há convite — roster novo mostra apenas "N alunos", sem ruído.
  const resumoConvites = useMemo(() => {
    let cadastrados = 0
    let convidados = 0
    for (const a of alunos) {
      const e = estadoDoConvite(a)
      if (e?.tipo === 'cadastrado') cadastrados++
      else if (e?.tipo === 'convidado') convidados++
    }
    const partes: string[] = []
    if (cadastrados > 0) partes.push(`${cadastrados} cadastrado${cadastrados === 1 ? '' : 's'}`)
    if (convidados > 0) partes.push(`${convidados} convidado${convidados === 1 ? '' : 's'}`)
    return partes.join(' · ')
  }, [alunos])

  // Add/update/remove concluído: fecha o modal, recarrega e sinaliza.
  const aoConcluir = (msg: string) => {
    setModal(null)
    setRefreshKey((k) => k + 1)
    setFeedback(msg)
  }

  // CONVIDAR (A.3). A RPC gera o convite OU devolve o pendente que já existe —
  // o token é ESTÁVEL enquanto pending, então reenviar manda o MESMO link (a
  // mensagem antiga no WhatsApp do aluno continua valendo).
  async function convidar(a: Aluno) {
    if (convidandoId) return
    setConvidandoId(a.id)
    setErroConvite(null)
    const supabase = createBrowserSupabaseClient()
    const { data, error } = await supabase.rpc('coach_invite_student', { p_student_id: a.id })
    setConvidandoId(null)

    // `returns table` chega como array de linhas; normalizamos (mesmo cuidado
    // de lib/supabase/live-match.ts).
    const linha = (Array.isArray(data) ? data[0] : data) as { token?: string } | null
    if (error || !linha?.token) {
      // A RPC levanta erro técnico em inglês ('not a coach', 'student not
      // found'); o usuário vê uma frase só, gentil.
      setErroConvite('Não deu para gerar o convite agora. Tente novamente.')
      return
    }

    setConvite({ aluno: a, token: linha.token })
    // Recarrega para o badge "Convidado" aparecer no card (mesmo caminho do
    // adicionar/editar).
    setRefreshKey((k) => k + 1)
  }

  const modalEl = modal && (
    <AlunoFormModal aluno={modal.aluno} onClose={() => setModal(null)} onDone={aoConcluir} />
  )

  if (estado === 'carregando') {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-neutral-900" />
        ))}
      </div>
    )
  }
  if (estado === 'erro') {
    return (
      <p className="rounded-xl border border-white/10 bg-neutral-900 p-4 text-sm text-white/60">
        Não deu para carregar seus alunos agora. Tente novamente com conexão.
      </p>
    )
  }
  if (alunos.length === 0) {
    return (
      <>
        <div className="rounded-2xl border border-dashed border-orange-400/25 bg-orange-400/5 p-8 text-center">
          <Users className="mx-auto mb-3 h-8 w-8 text-orange-400/70" />
          <p className="text-base font-semibold">Você ainda não tem alunos cadastrados.</p>
          <p className="mx-auto mt-1.5 mb-4 max-w-xs text-sm text-white/55">
            Cadastre seu primeiro aluno para começar seu roster.
          </p>
          <button
            type="button"
            onClick={() => setModal({ aluno: null })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-4 py-2.5 text-sm font-bold text-neutral-900 transition hover:bg-white/90"
          >
            <Plus className="h-4 w-4" /> Adicionar aluno
          </button>
        </div>
        {modalEl}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-white/40">
          {alunos.length} {alunos.length === 1 ? 'aluno' : 'alunos'}
          {resumoConvites && <span className="text-white/25"> · {resumoConvites}</span>}
        </p>
        <button
          type="button"
          onClick={() => setModal({ aluno: null })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-neutral-900 transition hover:bg-white/90"
        >
          <Plus className="h-4 w-4" /> Adicionar
        </button>
      </div>
      {feedback && (
        <p className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
          <Check className="h-3 w-3" /> {feedback}
        </p>
      )}
      {erroConvite && (
        <p role="alert" className="text-xs text-red-400">
          {erroConvite}
        </p>
      )}
      {alunos.map((a) => (
        <AlunoCard
          key={a.id}
          a={a}
          onEdit={(al) => setModal({ aluno: al })}
          onConvidar={convidar}
          convidando={convidandoId === a.id}
        />
      ))}
      {modalEl}
      {convite && (
        <ConviteModal
          aluno={convite.aluno}
          token={convite.token}
          nomeCoach={nomeCoach}
          onClose={() => setConvite(null)}
        />
      )}
    </div>
  )
}

// --------------------------------------------------------------- consentimentos
function Consentimentos({ user }: { user: User }) {
  const [consent, setConsent] = useState<Consent | null | undefined>(undefined) // undefined = carregando
  const [salvando, setSalvando] = useState(false)
  // Estado do TOGGLE de marketing (salva na hora, mecanismo próprio — não depende
  // do Salvar de "Meus dados"). O feedback deixa isso óbvio ao usuário.
  const [mktEstado, setMktEstado] = useState<'idle' | 'salvando' | 'salvo' | 'erro'>('idle')

  useEffect(() => {
    let alive = true
    getConsent(user.id).then((c) => {
      if (alive) setConsent(c)
    })
    return () => {
      alive = false
    }
  }, [user.id])

  const aceitou = consent?.tosVersion != null
  const desatualizado = aceitou && consent?.tosVersion !== TOS_VERSION
  // Precisa (re)aceitar sempre que a versão registrada não for a vigente — cobre
  // o usuário LEGADO (sem aceite algum) e o bump futuro de TOS_VERSION.
  const precisaAceitar = (consent?.tosVersion ?? null) !== TOS_VERSION
  const dataAceite = (() => {
    if (!consent?.tosAcceptedAt) return ''
    try {
      return new Date(consent.tosAcceptedAt).toLocaleDateString('pt-BR')
    } catch {
      return ''
    }
  })()

  // Salva na HORA (upsert self em consents) — sem depender do Salvar de "Meus
  // dados". Otimista (o checkbox reflete já) + feedback; reverte em erro.
  async function toggleMarketing() {
    const novo = !(consent?.marketingOptIn ?? false)
    setConsent((c) => ({
      tosVersion: c?.tosVersion ?? null,
      tosAcceptedAt: c?.tosAcceptedAt ?? null,
      marketingOptIn: novo,
    }))
    setMktEstado('salvando')
    const { error } = await setMarketing(user.id, novo)
    if (error) {
      // Reverte o otimismo e sinaliza — a preferência não foi persistida.
      setConsent((c) => ({
        tosVersion: c?.tosVersion ?? null,
        tosAcceptedAt: c?.tosAcceptedAt ?? null,
        marketingOptIn: !novo,
      }))
      setMktEstado('erro')
      return
    }
    setMktEstado('salvo')
  }

  async function reaceitar() {
    setSalvando(true)
    const { error } = await acceptTos(user.id, TOS_VERSION)
    setSalvando(false)
    if (!error) {
      setConsent((c) => ({
        tosVersion: TOS_VERSION,
        tosAcceptedAt: new Date().toISOString(),
        marketingOptIn: c?.marketingOptIn ?? false,
      }))
    }
  }

  if (consent === undefined) {
    return <div className="h-28 animate-pulse rounded-2xl bg-neutral-900" />
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-neutral-900 p-4">
      {/* Estado do aceite de T&C */}
      <div className="flex items-start gap-2.5 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
        <div className="min-w-0">
          {aceitou ? (
            <p className="text-white/80">
              Termos aceitos — versão <span className="font-mono">{consent?.tosVersion}</span>
              {dataAceite ? ` em ${dataAceite}` : ''}.
            </p>
          ) : (
            <p className="text-white/60">Nenhum aceite de termos registrado.</p>
          )}
          <p className="mt-0.5 text-xs text-white/40">
            Versão vigente: <span className="font-mono">{TOS_VERSION}</span> ·{' '}
            <a href="/termos" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white/70">
              Termos
            </a>{' '}
            ·{' '}
            <a href="/privacidade" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white/70">
              Privacidade
            </a>
          </p>
        </div>
      </div>

      {/* Aceite/re-aceite: legado sem aceite OU versão desatualizada */}
      {precisaAceitar && (
        <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3">
          <p className="mb-2 text-sm text-amber-200/90">
            {desatualizado
              ? 'Os termos foram atualizados desde o seu último aceite. Revise e confirme para continuar.'
              : 'Você ainda não registrou o aceite dos Termos e da Política de Privacidade.'}
          </p>
          <p className="mb-2.5 text-xs text-amber-200/70">
            <a href="/termos" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white">
              Termos de Uso
            </a>{' '}
            ·{' '}
            <a href="/privacidade" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white">
              Política de Privacidade
            </a>
          </p>
          <button
            type="button"
            onClick={reaceitar}
            disabled={salvando}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-bold text-neutral-900 transition hover:bg-white/90 disabled:opacity-40"
          >
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Li e aceito os Termos e a Política de Privacidade
          </button>
        </div>
      )}

      {/* Marketing (opt-in que salva na hora — sem depender de nenhum "Salvar"). */}
      <div className="border-t border-white/10 pt-3">
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-white/80">
          <input
            type="checkbox"
            checked={consent?.marketingOptIn ?? false}
            onChange={toggleMarketing}
            disabled={mktEstado === 'salvando'}
            className="mt-0.5 h-4 w-4 shrink-0 accent-white"
          />
          <span>
            Receber novidades do Flow por email.{' '}
            <span className="text-white/45">Opcional — salva automaticamente ao marcar/desmarcar.</span>
          </span>
        </label>
        {/* Feedback: deixa claro que a preferência foi (ou não) persistida. */}
        {mktEstado === 'salvando' && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 pl-7 text-xs text-white/50">
            <Loader2 className="h-3 w-3 animate-spin" /> Salvando…
          </p>
        )}
        {mktEstado === 'salvo' && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 pl-7 text-xs text-emerald-400">
            <Check className="h-3 w-3" /> Preferência salva.
          </p>
        )}
        {mktEstado === 'erro' && (
          <p role="alert" className="mt-1.5 pl-7 text-xs text-red-400">
            Não deu para salvar agora. Tente de novo.
          </p>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------- excluir conta
function ExcluirConta({ user }: { user: User }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [excluindo, setExcluindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [excluido, setExcluido] = useState(false)

  async function excluir() {
    setExcluindo(true)
    setErro(null)
    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase.rpc('delete_my_account')
    if (error) {
      setErro(error.message)
      setExcluindo(false)
      return
    }
    await supabase.auth.signOut()
    setExcluindo(false)
    setExcluido(true)
  }

  // Despedida após a exclusão (a sessão já foi encerrada).
  if (excluido) {
    return (
      <div className="rounded-2xl border border-white/10 bg-neutral-900 p-8 text-center">
        <p className="text-base font-semibold">Sua conta foi excluída.</p>
        <p className="mx-auto mt-2 max-w-xs text-sm text-white/55">
          Seus dados pessoais foram apagados. Obrigado por jogar com a gente — as quadras seguem abertas quando quiser
          voltar.
        </p>
        <button
          type="button"
          onClick={() => router.push('/')}
          className="mt-5 rounded-full border border-white/20 px-5 py-2 text-sm font-medium text-white/80 transition hover:bg-white/5"
        >
          Voltar ao início
        </button>
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAberto(true)
          setTexto('')
          setErro(null)
        }}
        className="inline-flex items-center gap-2 text-sm font-medium text-red-400/80 transition hover:text-red-400"
      >
        <Trash2 className="h-4 w-4" />
        Excluir minha conta
      </button>

      {aberto && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Excluir minha conta"
          onClick={() => !excluindo && setAberto(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-6 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="text-lg font-bold">Excluir minha conta</h3>
            </div>
            <p className="text-sm text-white/70">Esta ação é permanente. Ao excluir:</p>
            <ul className="mt-2 space-y-1.5 text-sm text-white/70">
              <li className="flex gap-2">
                <span className="text-red-400">•</span>
                seus <strong>dados pessoais</strong> (nome, email, celular, username, foto) são apagados;
              </li>
              <li className="flex gap-2">
                <span className="text-red-400">•</span>
                seus jogos <strong>somem do seu histórico</strong> (a posse é anulada);
              </li>
              <li className="flex gap-2">
                <span className="text-white/40">•</span>
                <span className="text-white/60">
                  os <strong>placares e os nomes nas súmulas são preservados</strong> — são registro histórico esportivo
                  e direito dos demais participantes.
                </span>
              </li>
            </ul>

            <label className="mt-4 block text-sm text-white/70">
              Para confirmar, digite <span className="font-mono font-bold text-white">EXCLUIR</span>:
              <input
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                autoFocus
                className="mt-1.5 h-11 w-full rounded-lg border border-white/20 bg-white/10 px-3 font-mono text-base tracking-widest"
              />
            </label>

            {erro && (
              <p role="alert" className="mt-2 text-sm text-red-400">
                {erro}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setAberto(false)}
                disabled={excluindo}
                className="h-11 flex-1 rounded-lg bg-white/10 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={excluir}
                disabled={texto !== 'EXCLUIR' || excluindo}
                className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 text-sm font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Excluir definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ------------------------------------------------------------- página / header
function PerfilLogado({ user }: { user: User }) {
  const router = useRouter()
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [saindo, setSaindo] = useState(false)
  // Papel do PRÓPRIO usuário (user_roles tem policy SELECT self → leitura direta,
  // sem RPC). undefined = carregando; coach revela a aba/badge. Todo coach é
  // também jogador (a aba Jogador nunca some).
  const [role, setRole] = useState<string | null | undefined>(undefined)
  const [aba, setAba] = useState<'jogador' | 'coach'>('jogador')
  const isCoach = role === 'coach'

  // VOLTA REDONDA (?voltar=): quem chega DO JOGO volta PARA o jogo. Lido de
  // window.location num effect — e não com useSearchParams — para a rota seguir
  // ESTÁTICA (o mesmo motivo do origin em share-modal.tsx). Sem o param, nada
  // muda: o botão continua "Início" → '/'.
  //
  // GUARDA contra open redirect: só caminho interno. Sem o teste do '//', um
  // ?voltar=//site-malicioso.com viraria um redirect assinado pelo nosso
  // domínio — a mesma tranca do /auth/callback.
  const [voltar, setVoltar] = useState<string | null>(null)
  useEffect(() => {
    const bruto = new URLSearchParams(window.location.search).get('voltar')
    if (bruto && bruto.startsWith('/') && !bruto.startsWith('//')) setVoltar(bruto)
  }, [])

  // Logout: encerra a sessão e volta à home. (A ponte do coach e o pré-preench.
  // reagem à ausência de sessão normalmente; nada a "desfazer" aqui.)
  async function sair() {
    setSaindo(true)
    const supabase = createBrowserSupabaseClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  useEffect(() => {
    let alive = true
    const supabase = createBrowserSupabaseClient()
    supabase
      .from('profiles')
      .select('name, phone, avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>
        setPerfil({
          nome: data?.name ?? null,
          phone: data?.phone ?? null,
          username: (meta.username as string) ?? '',
          avatarUrl: data?.avatar_url ?? null,
        })
      })
    return () => {
      alive = false
    }
  }, [user])

  // Lê o papel do próprio usuário (RLS self em user_roles). Não-bloqueante.
  useEffect(() => {
    let alive = true
    const supabase = createBrowserSupabaseClient()
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setRole((data?.role as string) ?? null)
      })
    return () => {
      alive = false
    }
  }, [user])

  const telFmt = useMemo(() => {
    if (!perfil?.phone) return ''
    try {
      return parsePhoneNumber(perfil.phone)?.formatInternational() ?? perfil.phone
    } catch {
      return perfil.phone
    }
  }, [perfil?.phone])

  const inicial = (perfil?.nome ?? user.email ?? '?').trim().charAt(0).toUpperCase() || '?'
  const [nome, sobrenome] = splitName(perfil?.nome ?? undefined)

  return (
    <main className="mx-auto min-h-full max-w-lg bg-neutral-950 px-5 py-8 text-white">
      <Link href={voltar ?? '/'} className="inline-flex items-center gap-1.5 text-sm text-white/60 transition hover:text-white">
        <ArrowLeft className="h-4 w-4" />
        {voltar ? 'Voltar ao jogo' : 'Início'}
      </Link>

      {/* HEADER: avatar + nome + badges (tick verde verificado + pílula Coach
          laranja só p/ coach) + @username + celular mascarado. */}
      <header className="mt-6 flex items-center gap-4">
        {/* Cascata desta fatia: profiles.avatar_url (Storage) → Google → inicial.
            A cascata completa em todo lugar é a 1c. */}
        <AvatarUploader
          // Enquanto o perfil não resolve (perfil === null), skeleton neutro —
          // NÃO mostra o Google como intermediário (evita o flicker Google→Storage).
          // Resolvido: cascata Storage → Google → inicial.
          carregando={perfil === null}
          displayUrl={perfil ? avatarUrlOf(user, perfil.avatarUrl) : null}
          inicial={inicial}
          onUploaded={(url) => setPerfil((p) => (p ? { ...p, avatarUrl: url } : p))}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-xl font-bold">{perfil?.nome ?? 'Meu perfil'}</h1>
            {/* Verificado = tem sessão/conta (identidade ancorada em email real). */}
            <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-label="Identidade verificada pelo Flow" />
            {isCoach && (
              <span className="shrink-0 rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-orange-400 ring-1 ring-orange-400/30">
                Coach
              </span>
            )}
          </div>
          {perfil?.username && <p className="truncate font-mono text-sm text-white/60">@{perfil.username}</p>}
          {telFmt && <p className="truncate text-sm text-white/50">{telFmt}</p>}
        </div>
      </header>

      {/* ABAS [Jogador | Coach] — SÓ para coach (jogador comum não vê seletor). */}
      {isCoach && (
        <div className="mt-6 flex rounded-full bg-white/10 p-1 text-sm font-semibold">
          {(['jogador', 'coach'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setAba(t)}
              aria-pressed={aba === t}
              className={`flex-1 rounded-full px-3 py-1.5 capitalize transition ${
                aba === t ? 'bg-white text-neutral-900' : 'text-white/70 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* ABA JOGADOR — o perfil atual, comportamento IDÊNTICO (coach também é
          jogador; esta aba nunca some). Só reorganizado sob a condição da aba. */}
      {(!isCoach || aba === 'jogador') && (
        <>
          {/* MEUS JOGOS */}
          <section className="mt-8">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/50">Meus jogos</h2>
            <MeusJogos userId={user.id} />
          </section>

      {/* MEUS DADOS (edição, reusa o ProfileForm) */}
      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/50">Meus dados</h2>
        <div className="rounded-2xl border border-white/10 bg-neutral-900 p-4">
          {perfil ? (
            <ProfileForm
              user={user}
              mode="editar"
              initial={{ nome, sobrenome, username: perfil.username, phone: telFmt }}
              ownUsername={perfil.username}
              currentPhone={perfil.phone ?? undefined}
              onDone={() => {
                // Re-lê para refletir no header.
                setPerfil(null)
              }}
            />
          ) : (
            <div className="h-40 animate-pulse rounded-lg bg-white/5" />
          )}
        </div>
      </section>

      {/* CONSENTIMENTOS */}
      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/50">Consentimentos</h2>
        <Consentimentos user={user} />
      </section>

      {/* SAIR — logout (ação benigna de conta, antes da zona de perigo). */}
      <section className="mt-8">
        <button
          type="button"
          onClick={sair}
          disabled={saindo}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
        >
          {saindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
          Sair da conta
        </button>
      </section>

          {/* ZONA DE PERIGO — excluir conta */}
          <section className="mt-8 border-t border-white/10 pt-6">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-red-400/70">Zona de perigo</h2>
            <p className="mb-3 text-sm text-white/45">
              Apaga seus dados pessoais e desvincula seus jogos. Placares e nomes nas súmulas são preservados.
            </p>
            <ExcluirConta user={user} />
          </section>
        </>
      )}

      {/* ABA COACH — roster do professor (A3.2: só leitura). Adicionar/editar/
          remover são A3.3/A3.4. Só coach vê. */}
      {isCoach && aba === 'coach' && (
        <section className="mt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/50">Meus alunos</h2>
          {/* nomeCoach alimenta a mensagem do convite ("Aqui é a Ana"). Enquanto
              o perfil carrega vai vazio e a saudação degrada sem quebrar. */}
          <MeusAlunos userId={user.id} nomeCoach={perfil?.nome ?? ''} />
        </section>
      )}
    </main>
  )
}

export default function PerfilPage() {
  // Guardada SÓ pela SESSÃO — NUNCA redireciona para a home (era o bug: o
  // redirect por flag disparava no 1º paint, antes de o ?auth=1 assentar). A
  // flag NEXT_PUBLIC_APP_AUTH gateia os LINKS que levam aqui (CTA da tela de
  // fim), não a página em si: quem tem a URL acessa; sem sessão vê o login.
  const { user, loading } = useSession()

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-neutral-950 text-white">
        <Loader2 className="h-6 w-6 animate-spin text-white/60" />
      </div>
    )
  }

  if (!user) {
    return (
      <main className="tema-landing flex min-h-full flex-col items-center justify-center bg-background px-5 py-12 text-foreground">
        <div className="w-full max-w-sm">
          <h1 className="mb-2 text-center text-2xl font-semibold tracking-tight">Seu perfil</h1>
          <p className="mb-8 text-center text-sm text-muted-foreground">Entre para ver seus jogos e seus dados.</p>
          <LoginPanel next="/perfil" onAuthenticated={() => {}} />
        </div>
      </main>
    )
  }

  return <PerfilLogado user={user} />
}
