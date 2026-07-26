/**
 * O WORDMARK "flow" — o logo por extenso.
 *
 * "flow" em MINÚSCULO (a marca é minúscula), Audiowide, com o mesmo degradê do
 * símbolo (#0078FF → #00FF6F). Compartilha fonte e cores com o <FlowMark>, para
 * a marca renderizar IDÊNTICA no site e no app.
 *
 * `aria-label="Flow"` com role="img": o degradê por background-clip deixa o
 * texto transparente, então o rótulo acessível é o que garante que leitores de
 * tela anunciem a marca.
 *
 * Sem hooks e sem 'use client' — a landing é Server Component e continua sendo.
 */

import { audiowide } from '@/components/brand/flow-font'
import { FLOW_GRADIENT_CSS } from '@/components/brand/flow-gradient'

export function FlowWordmark({
  size = 20,
  variant = 'gradient',
  className = '',
}: {
  /** Tamanho da fonte em px (o wordmark cresce/encolhe por aqui). */
  size?: number
  /** 'mono' usa currentColor — para fundos onde o degradê não funciona. */
  variant?: 'gradient' | 'mono'
  className?: string
}) {
  const gradiente = variant === 'gradient'

  return (
    <span
      role="img"
      aria-label="Flow"
      className={`${audiowide.className} inline-block select-none leading-none ${className}`}
      style={{
        fontSize: size,
        ...(gradiente
          ? {
              backgroundImage: FLOW_GRADIENT_CSS,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              WebkitTextFillColor: 'transparent',
            }
          : { color: 'currentColor' }),
      }}
    >
      flow
    </span>
  )
}
