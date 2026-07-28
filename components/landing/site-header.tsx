/**
 * HEADER — mínimo de propósito, porque o hero é a tela inteira.
 *
 * Transparente sobre o hero (sem barra sólida cortando a foto do atleta) e sem
 * o menu de âncoras antigo (Jogadores/Professores/Clubes/Como funciona): numa
 * página que agora cabe num scroll, um menu de quatro âncoras era navegação
 * inventada. Ficam só as duas ações reais.
 *
 * ⚠️ "Entrar" leva ao /perfil, que já mostra o painel de login quando não há
 * sessão. É a porta de conta mais alcançável do produto hoje — e por isso ela
 * precisa existir aqui: sem ela, quem já tem carteirinha não tinha como voltar
 * para a própria conta a partir da home.
 */

import Link from 'next/link'
import { FlowWordmark } from '@/components/brand/flow-wordmark'

export function SiteHeader() {
  return (
    <header className="absolute inset-x-0 top-0 z-50">
      <div className="mx-auto flex h-20 max-w-5xl items-center justify-between px-5">
        <Link href="#top" className="flex items-baseline gap-2" aria-label="Flow — início">
          <FlowWordmark size={22} />
          <span className="text-xs font-medium tracking-tight text-white/40">/ PWER</span>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/perfil"
            data-flow-cta="header-entrar"
            className="inline-flex h-9 items-center rounded-full px-4 text-xs font-bold uppercase tracking-wide text-white/70 transition-colors hover:text-white"
          >
            Entrar
          </Link>
          <Link
            href="/setup"
            data-flow-cta="header-jogar"
            className="l-grad-fill inline-flex h-9 items-center rounded-full px-5 text-xs font-black uppercase tracking-wide transition-transform active:scale-95"
          >
            Jogar
          </Link>
        </div>
      </div>
    </header>
  )
}
