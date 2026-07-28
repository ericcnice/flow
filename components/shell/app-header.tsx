'use client'

/**
 * O HEADER DO APP — a casca de navegação (fatia N2).
 *
 * O PROBLEMA QUE ELE RESOLVE: até aqui cada tela do app era uma ilha. O /perfil
 * só era alcançável por quatro atalhos condicionais (um link minúsculo na aba
 * Players, o card de fim de jogo atrás de flag, a landing do convite e o toast
 * do coach) — na prática, digitando a URL. E no PWA instalado não há barra de
 * URL: dava para ficar preso numa tela sem saída.
 *
 * ONDE ELE NÃO APARECE, e por quê: /jogo e /placar são FULLSCREEN — a tela de
 * marcar ponto não pode ter um header comendo altura nem um alvo de toque perto
 * do placar. A garantia não é um `if` aqui dentro: essas rotas simplesmente NÃO
 * estão no route group `(app)`, então nunca passam por este layout. Por
 * construção, não por disciplina — ver app/(app)/layout.tsx.
 *
 * PESO: `useSession` já é usado no /perfil e no /jogo (uma leitura de cookie,
 * sem rede), e o avatar sai do `user_metadata` via `avatarUrlOf` — também sem
 * rede. A casca não acrescenta NENHUMA requisição às telas que envolve.
 */

import Link from 'next/link'
import { History } from 'lucide-react'
import { FlowWordmark } from '@/components/brand/flow-wordmark'
import { PlayerAvatar } from '@/components/player-avatar'
import { useSession } from '@/lib/hooks/use-session'
import { avatarUrlOf } from '@/lib/auth-avatar'

/**
 * Destino do "Meus jogos". O histórico vive DENTRO do /perfil hoje; a fatia N3
 * o promove para a rota própria `/jogos` e esta constante passa a apontar para
 * lá — um lugar só para mudar.
 */
export const ROTA_HISTORICO = '/perfil'

export function AppHeader() {
  const { user } = useSession()
  const avatar = avatarUrlOf(user)
  const nome =
    ((user?.user_metadata as Record<string, unknown> | undefined)?.full_name as string) ??
    user?.email ??
    ''

  return (
    <header className="sticky top-0 z-40 shrink-0 border-b border-white/10 bg-neutral-950/90 backdrop-blur-md">
      <nav
        className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4"
        aria-label="Principal"
      >
        <Link href="/" aria-label="Flow — início" className="shrink-0">
          <FlowWordmark size={22} />
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* MEUS JOGOS — só no desktop. No celular o espaço é curto e o
              destino hoje é o mesmo do avatar (/perfil); quando a N3 criar a
              rota própria, ele passa a valer também no mobile. */}
          <Link
            href={ROTA_HISTORICO}
            data-flow-cta="nav-jogos"
            className="hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white/60 transition-colors hover:text-white sm:inline-flex"
          >
            <History className="h-4 w-4" />
            Meus jogos
          </Link>

          <Link
            href="/setup"
            data-flow-cta="nav-jogar"
            className="l-grad-fill inline-flex h-9 items-center rounded-full px-5 text-xs font-black uppercase tracking-wide transition-transform active:scale-95"
          >
            Jogar
          </Link>

          {user ? (
            <Link
              href="/perfil"
              data-flow-cta="nav-perfil"
              aria-label="Meu perfil"
              className="shrink-0 rounded-full ring-1 ring-white/15 transition-shadow hover:ring-white/40"
            >
              <PlayerAvatar url={avatar} nome={nome} size={32} />
            </Link>
          ) : (
            <Link
              href="/perfil"
              data-flow-cta="nav-entrar"
              className="inline-flex h-9 items-center rounded-full px-3 text-xs font-bold uppercase tracking-wide text-white/60 transition-colors hover:text-white"
            >
              Entrar
            </Link>
          )}
        </div>
      </nav>
    </header>
  )
}
