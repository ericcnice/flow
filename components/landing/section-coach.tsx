import { ArrowRight, Camera, MessageCircle } from 'lucide-react'
import { PhoneFrame } from '@/components/landing/phone-frame'

function CoachLogo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-8 w-8 text-sm' : 'h-14 w-14 text-2xl'
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`flex items-center justify-center rounded-2xl border border-primary/40 bg-secondary font-mono font-bold text-primary ${box}`}
      >
        PV
      </div>
      {size === 'md' && (
        <div className="text-center">
          <p className="text-sm font-semibold">Prof. Ventura Tennis</p>
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Academia parceira
          </p>
        </div>
      )}
    </div>
  )
}

function SplashScreen() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-background px-4">
      <CoachLogo />
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Iniciando partida
        </span>
      </div>
      <p className="absolute bottom-5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        com tecnologia Flow
      </p>
    </div>
  )
}

function ResultShare() {
  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-secondary to-background px-4 py-5">
      <div className="flex items-center justify-between">
        <CoachLogo size="sm" />
        <span className="font-mono text-[9px] uppercase tracking-wider text-primary">
          Flow
        </span>
      </div>
      <div className="mt-6 space-y-1.5">
        <div className="flex justify-between rounded-md bg-primary px-3 py-2 text-primary-foreground">
          <span className="font-mono text-[11px] font-bold">L. MARTINS</span>
          <span className="font-mono text-xs font-bold tabular-nums">6 6</span>
        </div>
        <div className="flex justify-between rounded-md bg-card px-3 py-2">
          <span className="font-mono text-[11px] font-bold text-muted-foreground">
            J. SOUZA
          </span>
          <span className="font-mono text-xs font-bold tabular-nums text-muted-foreground">
            2 4
          </span>
        </div>
      </div>
      <p className="mt-5 text-center text-sm font-semibold leading-tight">
        Vitória na Prof. Ventura Tennis
      </p>
      <div className="mt-auto flex items-center justify-center gap-4 text-muted-foreground">
        <Camera className="h-4 w-4" />
        <MessageCircle className="h-4 w-4" />
      </div>
    </div>
  )
}

export function SectionCoach() {
  return (
    <section id="professores" className="border-t border-border bg-card/30">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 lg:grid-cols-2 lg:py-28">
        <div>
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            Para professores e capitães
          </span>
          <h2 className="mt-4 text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Sua marca em todo jogo dos seus alunos
          </h2>
          <p className="mt-5 max-w-md text-pretty text-lg leading-relaxed text-muted-foreground">
            Seu logo aparece na abertura de cada partida e viaja em cada card de
            resultado compartilhado. Toda vez que um aluno joga e posta, sua
            marca vai junto — para o grupo, para o Instagram, para fora da
            quadra.
          </p>

          <div className="mt-8 flex items-center gap-4 rounded-xl border border-border bg-background p-4">
            <div className="text-center">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Abertura
              </p>
              <p className="mt-1 text-sm font-medium">Seu logo</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
            <div className="text-center">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Resultado
              </p>
              <p className="mt-1 text-sm font-medium">Seu logo</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-primary" />
            <div className="text-center">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Alcance
              </p>
              <p className="mt-1 text-sm font-medium text-primary">Orgânico</p>
            </div>
          </div>

          <p className="mt-6 max-w-md text-pretty leading-relaxed text-muted-foreground">
            É publicidade contínua e gratuita, gerada pelo próprio uso do app
            pelos seus alunos.
          </p>
        </div>

        <div className="flex items-center justify-center gap-4 sm:gap-6">
          <PhoneFrame className="max-w-[210px] translate-y-4">
            <SplashScreen />
          </PhoneFrame>
          <PhoneFrame className="max-w-[210px] -translate-y-4">
            <ResultShare />
          </PhoneFrame>
        </div>
      </div>
    </section>
  )
}
