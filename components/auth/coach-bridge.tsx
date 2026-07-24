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
import { PartyPopper, X } from 'lucide-react'
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

  // Auto-dismiss do feedback (o momento é comemorativo, não um alerta a resolver).
  useEffect(() => {
    if (!promoted) return
    const t = setTimeout(() => setPromoted(false), 6000)
    return () => clearTimeout(t)
  }, [promoted])

  if (!promoted) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-5 z-[90] flex justify-center px-4"
    >
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-emerald-400/30 bg-neutral-900/95 px-4 py-2.5 text-sm font-semibold text-white shadow-2xl ring-1 ring-white/10 backdrop-blur">
        <PartyPopper className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
        <span>
          Você agora é <span className="text-emerald-400">Professor no Flow</span> 🎾
        </span>
        <button
          type="button"
          onClick={() => setPromoted(false)}
          aria-label="Fechar"
          className="ml-1 rounded-full p-0.5 text-white/50 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
