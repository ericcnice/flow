/**
 * Guarda de acesso do /dashboard: exige role='super_admin', não apenas login.
 *
 * ⚠️ POR QUE ISTO EXISTE E NÃO SÓ O MIDDLEWARE:
 * o middleware é uma checagem OTIMISTA (redireciona cedo, boa UX). Ele não é
 * o lugar certo para ser a ÚNICA tranca de autorização — é a orientação do
 * próprio Next.js, e a razão é histórica: middleware já teve bypass por header
 * (CVE-2025-29927). A tranca de verdade fica perto do dado: aqui (Server
 * Component / Server Action) e, no fim da linha, na RLS do Postgres, que é a
 * única que vale mesmo se todo o resto falhar.
 *
 * Três camadas, de fora para dentro:
 *   1. middleware.ts        → redireciona rápido quem não é super_admin
 *   2. requireSuperAdmin()  → layout, páginas e TODA Server Action
 *   3. RLS em members       → super_admin exclusivo, no banco
 *
 * FALHA FECHADA: erro na leitura do papel, papel ausente ou papel diferente
 * de super_admin ⇒ redirect. Nunca "deixa passar em caso de dúvida".
 *
 * `cache()` do React deduplica a chamada dentro do MESMO request: layout e
 * page chamam os dois, mas a query roda uma vez só.
 */

import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export type AdminSession = {
  userId: string
  email: string | null
  /** Nome de exibição já resolvido (profile.name → email → fallback). */
  nome: string
}

export const requireSuperAdmin = cache(async function requireSuperAdmin(): Promise<AdminSession> {
  const supabase = await createServerSupabaseClient()

  // getUser() revalida o token no servidor do Supabase — não confiar em
  // getSession() para decisão de autorização.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: papel, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  // Logado mas sem o papel: não é "não autenticado", é "não autorizado".
  // Vai para a home — não para /login, que só o faria repetir o mesmo login.
  if (error || papel?.role !== 'super_admin') redirect('/')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', user.id)
    .maybeSingle()

  return {
    userId: user.id,
    email: user.email ?? null,
    nome: profile?.name || profile?.email || user.email || 'admin',
  }
})
