import { buttonVariants } from '@/components/ui/button'

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
        <a href="#top" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary font-mono text-lg font-bold text-primary-foreground">
            F
          </span>
          <span className="text-lg font-semibold tracking-tight">
            Flow<span className="text-muted-foreground"> / PWER</span>
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
