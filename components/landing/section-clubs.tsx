import { Activity, BadgeCheck, MonitorPlay, QrCode, Wallet } from 'lucide-react'

const FEATURES = [
  {
    Icon: QrCode,
    title: 'Um QR code por quadra',
    desc: 'Os jogadores usam o próprio celular. Nada para instalar, nada para operar.',
  },
  {
    Icon: Activity,
    title: 'Controle de uso em tempo real',
    desc: 'Acompanhe a ocupação das quadras e a atividade do clube ao vivo.',
  },
  {
    Icon: BadgeCheck,
    title: 'Placar oficial de campeonatos',
    desc: 'Torneios internos e externos com placar padronizado e confiável.',
  },
  {
    Icon: MonitorPlay,
    title: 'Telão de resultados ao vivo',
    desc: 'Resultados em tempo real com espaço reservado para patrocínio.',
  },
  {
    Icon: Wallet,
    title: 'Zero investimento em equipamento',
    desc: 'Sem hardware, sem manutenção, sem curva de aprendizado.',
  },
]

export function SectionClubs() {
  return (
    <section id="clubes" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
        <div className="max-w-3xl">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            Para clubes
          </span>
          <h2 className="mt-4 text-balance text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
            Sem hardware. Sem curva de aprendizado. Sem custo de implantação.
          </h2>
          <p className="mt-5 text-pretty text-lg leading-relaxed text-muted-foreground">
            Uma operação mais inteligente para quem decide orçamento e gestão do
            clube. Implante em minutos e comece a usar hoje.
          </p>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ Icon, title, desc }) => (
            <div key={title} className="flex flex-col gap-3 bg-card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {desc}
              </p>
            </div>
          ))}
          <div className="flex flex-col justify-center gap-3 bg-secondary p-6">
            <p className="font-mono text-3xl font-bold tabular-nums text-primary">
              R$ 0
            </p>
            <p className="text-sm leading-relaxed text-secondary-foreground">
              de custo de implantação. Você opera com o que já tem: as quadras e
              o celular dos jogadores.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
