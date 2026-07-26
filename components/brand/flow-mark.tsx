/**
 * O "w" DO FLOW — o símbolo/avatar da marca.
 *
 * A letra "w" minúscula em Audiowide com o degradê oficial (#0078FF → #00FF6F),
 * aplicado por `background-clip: text`. Não é imagem: escala nítido em qualquer
 * tamanho e não faz request.
 *
 * ONDE ENTRA: no lugar do logo quando NÃO há clube/patrocinador no contexto
 * (jogo avulso, praia). É assinatura, não informação — por isso o chamador
 * costuma reduzir a opacidade para não competir com o placar.
 *
 * DEGRADAÇÃO: se a Audiowide não carregar (rede ruim, offline no primeiro
 * acesso), a letra aparece na fonte de fallback COM o degradê — nunca sumindo.
 * Nada aqui depende de rede para renderizar.
 *
 * Sem hooks e sem 'use client': serve tanto a Server Components (a landing)
 * quanto a Client Components (a tela de jogo).
 */

import { audiowide } from '@/components/brand/flow-font'
import { FLOW_GRADIENT_CSS } from '@/components/brand/flow-gradient'

export function FlowMark({
  size = 28,
  variant = 'gradient',
  className = '',
}: {
  /** Lado da caixa quadrada, em px. A letra é escalada dentro dela. */
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
      className={`${audiowide.className} inline-flex shrink-0 select-none items-center justify-center leading-none ${className}`}
      style={{
        width: size,
        height: size,
        // 0.78 do lado: a Audiowide é larga, e o "w" é a letra mais larga dela —
        // este fator mantém o glifo dentro da caixa sem margem sobrando.
        fontSize: Math.round(size * 0.78),
        ...(gradiente
          ? {
              backgroundImage: FLOW_GRADIENT_CSS,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              // Safari precisa deste; sem ele a letra sai sólida.
              WebkitTextFillColor: 'transparent',
            }
          : { color: 'currentColor' }),
      }}
    >
      w
    </span>
  )
}
