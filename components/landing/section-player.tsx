import { Award, Share2, Trophy } from 'lucide-react'
import { PhoneFrame } from '@/components/landing/phone-frame'

function EndGameScreen() {
  return (
    <div className="flex h-full flex-col bg-background px-4 py-5">
      <p className="text-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Partida encerrada
      </p>
      <div className="mt-6 flex flex-col items-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary">
          <Trophy className="h-8 w-8 text-primary-foreground" />
        </div>
        <p className="mt-4 text-lg font-semibold">R. Garcia</p>
        <p className="font-mono text-xs uppercase tracking-wider text-primary">
          Venceu
        </p>
      </div>

      <div className="mt-6 space-y-2">
        <div className="flex items-center justify-between rounded-lg bg-primary px-3 py-2 text-primary-foreground">
          <span className="font-mono text-xs font-medium">R. GARCIA</span>
          <span className="font-mono text-sm font-bold tabular-nums">6 6</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-card px-3 py-2">
          <span className="font-mono text-xs font-medium">M. COSTA</span>
          <span className="font-mono text-sm font-bold tabular-nums text-muted-foreground">
            4 3
          </span>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-primary-foreground">
        <Share2 className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold">Compartilhar resultado</span>
      </div>
    </div>
  )
}

function ShareCard() {
  return (
    <div className="w-[190px] overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-secondary to-background shadow-2xl shadow-black/50">
      <div className="flex items-center justify-between px-4 pt-4">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-primary">
          Flow
        </span>
        <span className="font-mono text-[9px] text-muted-foreground">
          14 JUL
        </span>
      </div>
      <div className="flex flex-col items-center px-4 py-6">
        <Award className="h-9 w-9 text-primary" />
        <p className="mt-3 text-center text-base font-semibold leading-tight">
          Vitória em 2 sets
        </p>
        <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Beach Tennis
        </p>
        <div className="mt-4 w-full space-y-1.5">
          <div className="flex justify-between rounded-md bg-primary px-2.5 py-1.5 text-primary-foreground">
            <span className="font-mono text-[10px] font-bold">EU</span>
            <span className="font-mono text-[11px] font-bold tabular-nums">6 6</span>
          </div>
          <div className="flex justify-between rounded-md bg-card px-2.5 py-1.5">
            <span className="font-mono text-[10px] font-bold text-muted-foreground">
              RIVAL
            </span>
            <span className="font-mono text-[11px] font-bold tabular-nums text-muted-foreground">
              4 3
            </span>
          </div>
        </div>
      </div>
      <div className="bg-card px-4 py-2 text-center">
        <span className="font-mono text-[8px] uppercase tracking-[0.15em] text-muted-foreground">
          Gerado por Flow · pwerflow.app
        </span>
      </div>
    </div>
  )
}

export function SectionPlayer() {
  return (
    <section id="jogadores" className="border-t border-border">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-20 lg:grid-cols-2 lg:py-28">
        <div className="order-2 lg:order-1">
          <div className="relative mx-auto flex max-w-sm items-center justify-center">
            <PhoneFrame>
              <EndGameScreen />
            </PhoneFrame>
            <div className="absolute -right-2 bottom-6 sm:right-0 lg:-right-6">
              <ShareCard />
            </div>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            Para o jogador
          </span>
          <h2 className="mt-4 text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Seu jogo merece um placar de verdade
          </h2>
          <p className="mt-5 max-w-md text-pretty text-lg leading-relaxed text-muted-foreground">
            Jogue como se fosse Wimbledon: voz de árbitro anunciando cada ponto,
            placar oficial e uma tela de vitória que dá orgulho. No fim, seu
            resultado vira um card pronto para postar.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              'Tela de fim de jogo com resultado e medalha do vencedor',
              'Card de compartilhamento estilo Stories, com sua vitória',
              'Mostre para os amigos e para o grupo do WhatsApp',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-foreground">
                <span
                  className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                  aria-hidden
                />
                <span className="leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
