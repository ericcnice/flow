import { SPORTS } from '@/components/landing/sport-icons'
import { FlowWordmark } from '@/components/brand/flow-wordmark'

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-card/30">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="flex flex-col items-center gap-8">
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-6">
            {SPORTS.map(({ key, label, Icon }) => (
              <div key={key} className="flex flex-col items-center gap-2">
                <Icon className="h-7 w-7 text-muted-foreground" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {label}
                </span>
              </div>
            ))}
          </div>

          <div className="flex w-full flex-col items-center justify-between gap-4 border-t border-border pt-8 sm:flex-row">
            <div className="flex items-baseline gap-2">
              <FlowWordmark size={20} />
              <span className="text-xs font-medium tracking-tight text-muted-foreground">
                / PWER
              </span>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              © {new Date().getFullYear()} PWER Flow. Placar inteligente para
              esportes de raquete.
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
