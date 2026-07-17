'use client'

/**
 * Imagem de um venue (logo ou foto) com degradação graciosa.
 *
 * NÃO reusa o ImageUrlField: aquele é um CAMPO DE FORMULÁRIO (input + preview),
 * e esta página é de leitura — um input editável aqui seria mentira de UI. O que
 * se reusa é o comportamento que importa: a mesma regra do avatar da listagem,
 * onde "sem imagem" é o caso NORMAL e uma URL quebrada cai no fallback via
 * onError em vez de virar imagem rasgada. Como as URLs não são validadas no
 * banco nem no formulário (o preview é quem dá o feedback ao colar), link
 * quebrado é cenário real, não hipótese.
 *
 * <img> simples e não next/image, pelo mesmo motivo do ImageUrlField: o projeto
 * roda com images.unoptimized e o next/image pediria cada host em remotePatterns.
 */

import { useState } from 'react'

export function VenueImage({
  src,
  alt,
  className,
  fallback,
}: {
  src: string | null
  alt: string
  className?: string
  /** Desenhado quando não há URL ou quando ela falha ao carregar. */
  fallback: React.ReactNode
}) {
  const [falhou, setFalhou] = useState(false)

  if (!src || falhou) return <>{fallback}</>

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={src} alt={alt} className={className} onError={() => setFalhou(true)} />
  )
}
