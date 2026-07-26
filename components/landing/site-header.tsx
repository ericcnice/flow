import { buttonVariants } from '@/components/ui/button'
import { FlowWordmark } from '@/components/brand/flow-wordmark'

const NAV = [
  { label: 'Jogadores', href: '#jogadores' },
  { label: 'Professores', href: '#professores' },
  { label: 'Clubes', href: '#clubes' },
  { label: 'Como funciona', href: '#como-funciona' },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        {/* MARCA OFICIAL: "flow" em Audiowide com o degradê #0078FF → #00FF6F.
            Substitui o placeholder (quadrado "F" em font-mono + texto em Inter),
            que contradizia a marca em fonte, caixa e cor. O "/ PWER" fica como
            texto discreto — identifica a empresa, não faz parte do wordmark. */}
        <a href="#top" className="flex items-baseline gap-2">
          <FlowWordmark size={24} />
          <span className="text-sm font-medium tracking-tight text-muted-foreground">
            / PWER
          </span>
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Principal">
          {NAV.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <a
          href="#experimentar"
          className={buttonVariants({
            size: 'sm',
            className: 'bg-primary font-medium text-primary-foreground hover:bg-primary/90',
          })}
        >
          Experimentar
        </a>
      </div>
    </header>
  )
}
