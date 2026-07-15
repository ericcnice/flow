/**
 * HUB do dashboard administrativo: grid de cards, um por área de gestão.
 * Só "Players" está ativo; o resto é "Em Breve" (sem link, não clicável).
 *
 * Layout inspirado no hub de cards do GAME-FLOW-V10 (grid responsivo + forma
 * geométrica colorida como ícone), mas escrito do zero com Tailwind e a paleta
 * .tema-landing já existente — nenhum código de lá foi copiado.
 *
 * O layout já roda requireSuperAdmin(); repetimos aqui de propósito (ver a
 * nota em guard.ts). cache() faz a query rodar uma vez só por request.
 */

import Link from 'next/link'
import { requireSuperAdmin } from './guard'

type CardArea = {
  titulo: string
  descricao: string
  href?: string
  /** Forma geométrica do V10 como referência: classes da cor + do formato. */
  forma: string
}

const AREAS: CardArea[] = [
  {
    titulo: 'Players',
    descricao: 'Cadastro de jogadores e professores, contatos e clube de atuação.',
    href: '/dashboard/players',
    forma: 'h-20 w-20 rounded-full bg-blue-500',
  },
  {
    titulo: 'Locais',
    descricao: 'Clubes, condomínios e quadras públicas — cadastro e URL pública.',
    href: '/dashboard/venues',
    forma: 'h-16 w-24 rounded-lg bg-primary',
  },
  {
    titulo: 'Queue',
    descricao: 'Fila de espera e rodízio de quadras.',
    forma: 'h-20 w-20 rounded-full border-4 border-foreground',
  },
  {
    titulo: 'Tournaments',
    descricao: 'Chaves, grupos e resultados de torneios.',
    forma: 'h-20 w-20 rotate-45 rounded-lg bg-secondary',
  },
  {
    titulo: 'Settings',
    descricao: 'Configurações gerais do clube e do painel.',
    forma: 'h-16 w-16 rounded-md bg-muted-foreground',
  },
]

function CardConteudo({ area }: { area: CardArea }) {
  const ativo = Boolean(area.href)
  return (
    <>
      <div className="flex h-40 items-center justify-center border-b border-border bg-background/40">
        <div className={area.forma} aria-hidden />
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{area.titulo}</h2>
          {!ativo && (
            <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Em breve
            </span>
          )}
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{area.descricao}</p>
      </div>
    </>
  )
}

export default async function DashboardPage() {
  const admin = await requireSuperAdmin()

  return (
    <main className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Bem-vindo, {admin.nome}. Você está autenticado como{' '}
        <span className="font-mono text-primary">super_admin</span>.
      </p>

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {AREAS.map((area) =>
          area.href ? (
            <Link
              key={area.titulo}
              href={area.href}
              className="overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/40"
            >
              <CardConteudo area={area} />
            </Link>
          ) : (
            <div
              key={area.titulo}
              aria-disabled
              className="overflow-hidden rounded-2xl border border-border bg-card opacity-45"
            >
              <CardConteudo area={area} />
            </div>
          ),
        )}
      </div>
    </main>
  )
}
