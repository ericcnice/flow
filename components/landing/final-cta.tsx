import { MessageCircle, QrCode } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

export function FinalCta() {
  return (
    <section id="experimentar" className="border-t border-border">
      <div className="mx-auto max-w-4xl px-5 py-24 text-center lg:py-32">
        <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">
          Pronto para jogar no palco de um Grand Slam?
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-pretty text-lg leading-relaxed text-muted-foreground">
          Experimente como jogador ou fale com a gente para levar o Flow ao seu
          espaço.
        </p>

        <div className="mt-10 flex flex-col items-stretch justify-center gap-4 sm:flex-row">
          <a
            href="#top"
            className={buttonVariants({
              size: 'lg',
              className: 'bg-primary font-medium text-primary-foreground hover:bg-primary/90',
            })}
          >
            <QrCode className="h-4 w-4" />
            Sou jogador, quero experimentar
          </a>
          <a
            href="https://wa.me/5511950507175?text=Ol%C3%A1%2C%20quero%20saber%20mais%20sobre%20o%20Flow"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({
              size: 'lg',
              variant: 'outline',
              className: 'border-border bg-transparent text-foreground hover:bg-card',
            })}
          >
            <MessageCircle className="h-4 w-4" />
            Sou professor ou clube, quero conversar
          </a>
        </div>
      </div>
    </section>
  )
}
