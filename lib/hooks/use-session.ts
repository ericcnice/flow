'use client'

/**
 * Leitura de sessão NÃO-BLOQUEANTE (A1.2). Lê `getSession()` (LOCAL — cookie/
 * storage, SEM rede) num effect PÓS-MOUNT e reage a login/logout via
 * `onAuthStateChange`. Default "anônimo" (user null, loading true) até saber.
 *
 * INVIOLÁVEL: nunca gatear render/timers/jornada nisto. É só para a UI ADITIVA
 * de conta. Hydration-safe: nada é lido no render inicial (o estado nasce
 * anônimo no servidor e no primeiro paint do cliente). Offline-safe: getSession
 * devolve a sessão em cache ou null, sem tocar a rede.
 *
 * Usa o browser-client (cookie), NUNCA o client.ts do Realtime anônimo.
 */

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createBrowserSupabaseClient } from '@/lib/supabase/browser-client'

export function useSession(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createBrowserSupabaseClient()
    let alive = true

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return { user, loading }
}
