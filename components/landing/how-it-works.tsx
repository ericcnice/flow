import { QrCode, Share2, Volume2 } from 'lucide-react'

const STEPS = [
  {
    Icon: QrCode,
    title: 'Escaneie o QR na quadra',
    desc: 'Aponte a câmera do celular e abra o placar em segundos.',
  },
  {
    Icon: Volume2,
    title: 'Jogue com o placar automático',
    desc: 'Voz de árbitro e contagem oficial acompanham cada ponto.',
  },
  {
    Icon: Share2,
    title: 'Compartilhe o resultado',
    desc: 'Card pronto para o grupo, o Instagram e os amigos.',
  },
]

export function HowItWorks() {
  return (
    <section id="como-funciona" className="border-t border-border bg-card/30">
      <div className="mx-auto max-w-6xl px-5 py-20 lg:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            Como funciona
          </span>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Três passos, do saque ao compartilhamento
          </h2>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {STEPS.map(({ Icon, title, desc }, i) => (
            <div key={title} className="relative flex flex-col items-start">
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Icon className="h-6 w-6" />
                </span>
                <span className="font-mono text-4xl font-bold tabular-nums text-muted-foreground/40">
                  0{i + 1}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
