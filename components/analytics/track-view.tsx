'use client'

/**
 * Dispara um evento ao MONTAR — a ponte para páginas que são Server Components.
 *
 * A landing é estática e assim deve continuar (1,97 kB); este componente é a
 * única parte cliente dela, e não renderiza nada.
 *
 * Uma vez por visita (`trackUmaVez`): voltar para a home no meio da sessão não
 * é uma visita nova, e contar de novo inflaria o topo do funil.
 */

import { useEffect } from 'react'
import { trackUmaVez } from '@/lib/analytics'

export function TrackView({ evento, chave }: { evento: string; chave?: string }) {
  useEffect(() => {
    trackUmaVez(chave ?? evento, evento)
  }, [evento, chave])
  return null
}
