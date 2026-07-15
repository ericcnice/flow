import { Mic, RefreshCw, WifiOff } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Scoreboard } from '@/components/landing/scoreboard'

const BADGES = [
  { Icon: WifiOff, label: 'Funciona offline' },
  { Icon: Mic, label: 'Voz de árbitro Grand Slam' },
  { Icon: RefreshCw, label: 'Sincronização em tempo real' },
]

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 lg:grid-cols-2 lg:gap-10 lg:pb-28 lg:pt-24">
        <div className="flex flex-col items-start">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
            Placar inteligente
          </span>

          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            O placar inteligente para{' '}
            <span className="text-primary">esportes de raquete</span>
          </h1>

          <p className="mt-6 max-w-md text-pretty text-lg leading-relaxed text-muted-foreground">
            Tênis, beach tennis, padel, squash, ping pong e pickleball. Um placar
            de verdade no seu celular — sem hardware, com a emoção de uma quadra
            profissional.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#experimentar"
              className={buttonVariants({
                size: 'lg',
                className: 'bg-primary font-medium text-primary-foreground hover:bg-primary/90',
              })}
            >
              Quero experimentar
            </a>
            <a
              href="#clubes"
              className={buttonVariants({
                size: 'lg',
                variant: 'outline',
                className: 'border-border bg-transparent text-foreground hover:bg-card',
              })}
            >
              Sou professor ou clube
            </a>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3">
            {BADGES.map(({ Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="h-4 w-4 text-primary" />
                {label}
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div
            className="pointer-events-none absolute -inset-x-8 -top-8 bottom-0 -z-10 rounded-full bg-primary/10 blur-3xl"
            aria-hidden
          />
          <Scoreboard />
        </div>
      </div>
    </section>
  )
}
