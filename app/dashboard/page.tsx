/**
 * PLACEHOLDER de validação. Única rota protegida do app (ver `matcher` em
 * middleware.ts). Existe para provar três coisas de ponta a ponta:
 *   1. a sessão sobrevive em cookie e é legível no SERVIDOR;
 *   2. o profile é lido via RLS com a identidade do usuário;
 *   3. o papel é lido de user_roles (tabela separada de profiles).
 *
 * Server Component: `getUser()` revalida o token no servidor do Supabase, então
 * o dado exibido é confiável. O middleware já barra anônimos aqui; o redirect
 * abaixo é a segunda tranca (defense in depth) e cobre o caso de o matcher ser
 * editado por engano no futuro.
 */

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // maybeSingle(): não estoura se a linha ainda não existir (ex.: trigger de
  // profile criado, mas nenhum papel atribuído ainda).
  const { data: profile } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', user.id)
    .maybeSingle()

  const { data: papel } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  const nome = profile?.name || profile?.email || user.email || 'sem nome'

  return (
    <main className="tema-landing flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background px-5 py-12 text-foreground">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold tracking-tight">Login funcionou!</h1>
        <p className="mt-2 text-muted-foreground">Bem-vindo, {nome}.</p>

        <dl className="mt-8 flex flex-col gap-3 rounded-xl border border-border bg-card p-5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Papel (user_roles)</dt>
            <dd className="font-mono font-medium text-primary">
              {papel?.role ?? 'nenhum papel atribuído'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-mono">{user.email ?? '—'}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">User ID</dt>
            <dd className="truncate font-mono text-xs opacity-60">{user.id}</dd>
          </div>
        </dl>

        <p className="mt-8 text-sm text-muted-foreground">Dashboard em construção.</p>
      </div>
    </main>
  )
}
