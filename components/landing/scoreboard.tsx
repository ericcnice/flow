import { Mic, Wifi } from 'lucide-react'

type Player = {
  name: string
  sets: number[]
  point: string
  serving?: boolean
}

const LEFT: Player = { name: 'R. GARCIA', sets: [6, 4], point: '40', serving: true }
const RIGHT: Player = { name: 'M. COSTA', sets: [4, 5], point: '15' }

function Row({
  player,
  variant,
}: {
  player: Player
  variant: 'light' | 'dark'
}) {
  const isLight = variant === 'light'
  return (
    <div
      className={`flex items-center justify-between gap-4 px-5 py-4 ${
        isLight ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground'
      }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ${
            player.serving
              ? isLight
                ? 'bg-primary-foreground'
                : 'bg-primary'
              : isLight
                ? 'bg-primary-foreground/25'
                : 'bg-muted-foreground/40'
          }`}
          aria-hidden
        />
        <span className="font-mono text-sm font-medium tracking-wide sm:text-base">
          {player.name}
        </span>
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        {player.sets.map((s, i) => (
          <span
            key={i}
            className={`font-mono text-lg tabular-nums sm:text-xl ${
              isLight ? 'text-primary-foreground/55' : 'text-muted-foreground'
            }`}
          >
            {s}
          </span>
        ))}
        <span className="min-w-[3ch] text-right font-mono text-4xl font-bold tabular-nums sm:text-5xl">
          {player.point}
        </span>
      </div>
    </div>
  )
}

export function Scoreboard({ className = '' }: { className?: string }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/40 ${className}`}
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Set 3 · Game 10
        </span>
        <div className="flex items-center gap-3 text-muted-foreground">
          <Mic className="h-3.5 w-3.5 text-primary" />
          <Wifi className="h-3.5 w-3.5" />
        </div>
      </div>
      <Row player={LEFT} variant="light" />
      <Row player={RIGHT} variant="dark" />
      <div className="flex items-center justify-between px-5 py-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          Vantagem
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-primary">
          Ao vivo
        </span>
      </div>
    </div>
  )
}
