'use client'

/**
 * <Link> que emite um evento ao ser tocado.
 *
 * ⚠️ EXISTE PARA NÃO ENGORDAR A LANDING. O jeito óbvio seria pôr `'use client'`
 * no CourtPicker e um onClick no Link — mas ele importa `SPORTS` de
 * `lib/sports-catalog`, que puxa os MÓDULOS DE SCORING junto. O seletor de
 * esporte da landing arrastaria o motor inteiro para o bundle do cliente.
 * Isolando só o clique aqui, o catálogo continua no servidor.
 *
 * As props chegam serializadas (string/número/booleano), como exige a fronteira
 * server → client.
 */

import Link from 'next/link'
import type { ReactNode } from 'react'
import { track } from '@/lib/analytics'

export function TrackLink({
  href,
  evento,
  props,
  children,
  ...resto
}: {
  href: string
  evento: string
  props?: Record<string, string | number | boolean>
  children: ReactNode
  className?: string
  'aria-label'?: string
  'data-flow-cta'?: string
  'data-flow-sport'?: string
}) {
  return (
    <Link href={href} onClick={() => track(evento, props)} {...resto}>
      {children}
    </Link>
  )
}
