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
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { parsePhoneNumber } from 'libphonenumber-js'
import { ArrowLeft, Loader2, Trophy } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { createBrowserSupabaseClient } from '@/lib/supabase/browser-client'
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
type Perfil = { nome: string | null; phone: string | null; username: string }

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

// ------------------------------------------------------------- página / header
function PerfilLogado({ user }: { user: User }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)

  useEffect(() => {
    let alive = true
    const supabase = createBrowserSupabaseClient()
    supabase
      .from('profiles')
      .select('name, phone')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>
        setPerfil({
          nome: data?.name ?? null,
          phone: data?.phone ?? null,
          username: (meta.username as string) ?? '',
        })
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
    <main className="mx-auto min-h-[100dvh] max-w-lg bg-neutral-950 px-5 py-8 text-white">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-white/60 transition hover:text-white">
        <ArrowLeft className="h-4 w-4" />
        Início
      </Link>

      {/* HEADER: avatar (placeholder) + nome + @username + celular mascarado. */}
      <header className="mt-6 flex items-center gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/10 text-2xl font-black">
          {inicial}
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{perfil?.nome ?? 'Meu perfil'}</h1>
          {perfil?.username && <p className="truncate font-mono text-sm text-white/60">@{perfil.username}</p>}
          {telFmt && <p className="truncate text-sm text-white/50">{telFmt}</p>}
        </div>
      </header>

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
      <div className="flex min-h-[100dvh] items-center justify-center bg-neutral-950 text-white">
        <Loader2 className="h-6 w-6 animate-spin text-white/60" />
      </div>
    )
  }

  if (!user) {
    return (
      <main className="tema-landing flex min-h-[100dvh] flex-col items-center justify-center bg-background px-5 py-12 text-foreground">
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
