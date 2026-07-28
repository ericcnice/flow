/**
 * RODAPÉ — marca, os links legais que os T&C prometem, e o contato.
 *
 * As páginas /termos e /privacidade EXISTEM e prometem direitos ao usuário
 * (revogar consentimento, excluir conta). Não linká-las no rodapé era a única
 * parte do produto legalmente prometida e praticamente inalcançável.
 *
 * "Meu perfil" fica aqui também: enquanto a casca de navegação não existe (a
 * fatia seguinte), este é o único caminho visível da landing para a conta de
 * quem já se cadastrou.
 */

import Link from 'next/link'
import { FlowWordmark } from '@/components/brand/flow-wordmark'

const WHATSAPP =
  'https://wa.me/5511950507175?text=Ol%C3%A1%2C%20quero%20saber%20mais%20sobre%20o%20Flow'

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto max-w-5xl px-5 py-12">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <FlowWordmark size={26} />
              <span className="text-xs font-medium tracking-tight text-muted-foreground">
                / PWER
              </span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Placar para tênis, beach tennis, padel, squash, ping pong e
              pickleball.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm" aria-label="Rodapé">
            <Link href="/setup" data-flow-cta="rodape-jogar" className="text-muted-foreground transition-colors hover:text-foreground">
              Jogar
            </Link>
            <Link href="/perfil" data-flow-cta="rodape-perfil" className="text-muted-foreground transition-colors hover:text-foreground">
              Meu perfil
            </Link>
            <Link href="/termos" className="text-muted-foreground transition-colors hover:text-foreground">
              Termos
            </Link>
            <Link href="/privacidade" className="text-muted-foreground transition-colors hover:text-foreground">
              Privacidade
            </Link>
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Contato
            </a>
          </nav>
        </div>

        <p className="mt-10 border-t border-border/60 pt-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} PWER IO. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  )
}
