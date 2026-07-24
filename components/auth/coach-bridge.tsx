'use client'

/**
 * PONTE DO COACH — chamada pós-login (A2.2). Dispara `claim_coach_membership()`
 * (A2.1) quando uma sessão é estabelecida: se o email VERIFICADO do usuário casa
 * um `members.email` de coach não-reivindicado, a RPC vincula o profile ao member
 * e promove `user_roles → 'coach'` (retorna 'promoted'); caso comum → 'noop'.
 *
 * ONDE: montado UMA vez no layout raiz → cobre TODOS os caminhos de login. Reage
 * ao `onAuthStateChange` (SIGNED_IN do OTP na mesma aba) e ao INITIAL_SESSION /
 * getSession (Google, que loga no /auth/callback e cai aqui já com sessão).
 *
 * INVIOLÁVEL: fire-and-forget, NÃO-bloqueante, nunca gateia nada. Anônimo (sem
 * sessão) → nenhuma chamada, render null. Jogador comum → RPC 'noop', silencioso.
 * A RPC é idempotente (re-chamar dá 'noop'), então re-tentar a cada login é ok.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, PartyPopper } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase/browser-client'

// Guard de MÓDULO: no máximo UMA tentativa por uid por carga de página (várias
// emissões do onAuthStateChange / múltiplos mounts não geram spam). Reseta no
// reload — e a RPC é idempotente, então re-tentar num novo carregamento é seguro.
const attempted = new Set<string>()

export function CoachBridge() {
  const [promoted, setPromoted] = useState(false)

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    let alive = true

    const tentar = async (userId: string) => {
      if (attempted.has(userId)) return
      attempted.add(userId)
      try {
        // Fire-and-forget: o app não espera por isto. A RPC valida o email
        // confirmado no servidor e só age no próprio auth.uid().
        const { data, error } = await supabase.rpc('claim_coach_membership')
        if (!alive || error) return
        if (data === 'promoted') {
          // Virou coach agora — feedback comemorativo. (O papel novo reflete no
          // próximo render server-side; a ÁREA do coach é a A3.)
          setPromoted(true)
        }
      } catch {
        // rede/erro: silencioso — tenta de novo no próximo login.
      }
    }

    // Sessão já presente na carga (Google pós-callback, ou reload logado).
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id
      if (alive && uid) void tentar(uid)
    })

    // Login ao vivo nesta aba (OTP → SIGNED_IN; Google → INITIAL_SESSION). O
    // guard de módulo deduplica com o getSession acima.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id
      if (alive && uid) void tentar(uid)
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  if (!promoted) return null

  // MODAL GENEROSO da promoção (à altura do momento — virou status). Aparece UMA
  // vez (a RPC só retorna 'promoted' na 1ª promoção; idempotente depois). Não
  // auto-fecha: é ponto de decisão (CTA para a área do coach).
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Você agora é Professor no Flow"
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={() => setPromoted(false)}
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-emerald-400/20 bg-neutral-900 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Hero comemorativo — brilho sutil, sem exageros. */}
        <div className="relative flex flex-col items-center gap-3 bg-gradient-to-b from-emerald-500/15 to-transparent px-6 pt-8 pb-5 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-400/30">
            <PartyPopper className="h-7 w-7 text-emerald-400" aria-hidden />
          </span>
          <h2 className="text-xl font-bold tracking-tight">
            Você agora é <span className="text-emerald-400">Professor no Flow</span> 🎾
          </h2>
        </div>

        {/* 3 benefícios punchy. */}
        <ul className="flex flex-col gap-3 px-6 pb-2 text-sm">
          {[
            'Gerencie seus alunos num só lugar',
            'Sua marca e seu patrocinador no placar',
            'Resultados ao vivo para pais e sua rede',
          ].map((b) => (
            <li key={b} className="flex items-start gap-2.5">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
              <span className="text-white/85">{b}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-2 px-6 pb-6 pt-4">
          <Link
            href="/perfil"
            onClick={() => setPromoted(false)}
            className="flex h-12 items-center justify-center rounded-lg bg-emerald-500 text-base font-bold text-neutral-950 transition hover:bg-emerald-400"
          >
            Ir para minha área
          </Link>
          <button
            type="button"
            onClick={() => setPromoted(false)}
            className="h-10 text-sm font-medium text-white/50 transition hover:text-white/80"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  )
}
