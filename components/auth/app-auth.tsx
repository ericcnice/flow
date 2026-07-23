'use client'

/**
 * UI de CONTA no app (A1.2) — ADITIVA e atrás de flag. Orquestra:
 *  - sem sessão → CTA discreto "Criar sua conta no Flow" (abre o modal de login);
 *  - com sessão e perfil INCOMPLETO → abre o ProfileModal (obrigatório);
 *  - com sessão e perfil completo → saudação discreta (nome).
 *
 * INVIOLÁVEL: nada aqui gateia a jornada, o jogo ou os timers. Só aparece na
 * ZONA DE AÇÕES da tela de fim (fora do finishArtRef → não entra na imagem).
 * Flag NEXT_PUBLIC_APP_AUTH (default OFF); override de QA por ?auth=1 / ?auth=0.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Loader2, LogIn } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase/browser-client'
import { useSession } from '@/lib/hooks/use-session'
import { useAppAuthFlag } from '@/lib/hooks/use-app-auth-flag'
import { LoginPanel } from './login-panel'
import { ProfileModal } from './profile-modal'

export function AppAuthCta({
  saveState = 'idle',
}: {
  /** Estado do save do histórico (A1.3a), vindo da tela de jogo. */
  saveState?: 'idle' | 'saving' | 'saved' | 'queued'
}) {
  const flagOn = useAppAuthFlag()
  const { user, loading } = useSession()

  const [loginAberto, setLoginAberto] = useState(false)
  const [perfil, setPerfil] = useState<{ nome: string | null; completo: boolean } | null>(null)

  // Completude do perfil: lê profiles(name, phone) quando há sessão. Pós-mount,
  // não-bloqueante, só quando logado (nunca no caminho anônimo).
  useEffect(() => {
    if (!flagOn || !user) {
      setPerfil(null)
      return
    }
    let alive = true
    const supabase = createBrowserSupabaseClient()
    supabase
      .from('profiles')
      .select('name, phone')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return
        setPerfil({ nome: data?.name ?? null, completo: Boolean(data?.name && data?.phone) })
      })
    return () => {
      alive = false
    }
  }, [flagOn, user])

  if (!flagOn || loading) return null

  // Modal de perfil obrigatório: sessão + perfil carregado + incompleto.
  const mostrarPerfil = Boolean(user && perfil && !perfil.completo)

  return (
    <>
      {!user ? (
        // SEM sessão: o CTA promete o que agora cumpre. Ao logar, o jogo
        // recém-terminado é salvo (o save da tela de jogo dispara com a sessão).
        <button
          type="button"
          onClick={() => setLoginAberto(true)}
          className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-white/70 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white"
        >
          <LogIn className="h-3.5 w-3.5" />
          Salve este jogo no seu histórico
        </button>
      ) : saveState === 'saved' ? (
        // Salvo → vira o ATALHO para ver o histórico (o ponto de entrada do /perfil).
        <Link
          href="/perfil"
          className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-primary underline decoration-primary/30 underline-offset-4"
        >
          <Check className="h-3.5 w-3.5" />
          Jogo salvo — ver meus jogos
        </Link>
      ) : saveState === 'queued' ? (
        <span className="mt-1 text-[11px] uppercase tracking-widest text-white/60">
          Será salvo quando houver conexão
        </span>
      ) : saveState === 'saving' ? (
        <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-white/50">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Salvando no seu histórico…
        </span>
      ) : perfil?.completo ? (
        <Link href="/perfil" className="mt-1 text-[11px] uppercase tracking-widest text-white/50 underline decoration-white/20 underline-offset-4">
          Conectado{perfil.nome ? ` — ${perfil.nome}` : ''} · meu perfil
        </Link>
      ) : null}

      {loginAberto && !user && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setLoginAberto(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Entrar no Flow"
        >
          <div
            className="tema-landing w-full max-w-sm rounded-2xl bg-background p-6 text-foreground shadow-2xl ring-1 ring-border"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-center text-xl font-semibold tracking-tight">Entrar no Flow</h2>
            <p className="mb-6 text-center text-sm text-muted-foreground">
              Crie sua conta para começar a construir seu perfil de jogador.
            </p>
            <LoginPanel
              next={typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/'}
              onAuthenticated={() => setLoginAberto(false)}
            />
          </div>
        </div>
      )}

      {mostrarPerfil && user && (
        <ProfileModal
          user={user}
          onDone={() => setPerfil({ nome: perfil?.nome ?? null, completo: true })}
        />
      )}
    </>
  )
}
