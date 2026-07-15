/**
 * Layout do /dashboard: header comum + a GUARDA que cobre todas as subrotas.
 *
 * O requireSuperAdmin() aqui protege /dashboard/** de uma vez. As páginas o
 * chamam de novo (defense in depth): um layout sozinho não é garantia — em
 * navegação client-side entre irmãos ele pode não re-executar, e uma página
 * nova criada por engano fora dele ficaria sem guarda. O cache() do React
 * deduplica, então a query de papel roda uma vez por request.
 */

import Link from 'next/link'
import { LogOut } from 'lucide-react'
import { requireSuperAdmin } from './guard'
import { signOut } from './actions'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const admin = await requireSuperAdmin()

  return (
    <div className="tema-landing min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/dashboard" className="flex items-baseline gap-2 leading-none">
            <span className="text-[10px] font-semibold uppercase tracking-[0.4em] opacity-50">
              PWER
            </span>
            <span className="text-xl font-black tracking-tight">Flow</span>
            <span className="ml-1 hidden text-xs uppercase tracking-widest text-muted-foreground sm:inline">
              Admin
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <span className="hidden max-w-[16rem] truncate text-sm text-muted-foreground sm:inline">
              {admin.nome}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      {children}
    </div>
  )
}
