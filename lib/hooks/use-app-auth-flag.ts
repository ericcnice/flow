'use client'

/**
 * FLAG da UI de conta no app (NEXT_PUBLIC_APP_AUTH). Default OFF = comportamento
 * de hoje (sem UI de conta). Override de QA por query-param ?auth=1 / ?auth=0.
 * SSR-safe: o inicial vem do env (determinístico); o override é aplicado
 * pós-mount, sem mismatch de hidratação. Compartilhado por AppAuthCta e /perfil.
 */

import { useEffect, useState } from 'react'

export function useAppAuthFlag(): boolean {
  const [on, setOn] = useState(process.env.NEXT_PUBLIC_APP_AUTH === '1')
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('auth')
    if (q === '1') setOn(true)
    else if (q === '0') setOn(false)
  }, [])
  return on
}
