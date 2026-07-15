/**
 * Client de AUTENTICAÇÃO para o SERVIDOR (Server Components e Route Handlers).
 * Lê/escreve a sessão nos cookies via next/headers, seguindo o padrão oficial
 * do Supabase para o App Router.
 *
 * Não tem relação com `lib/supabase/client.ts` (salas anônimas do Realtime),
 * que segue intocado. Ver a nota em `lib/supabase/browser-client.ts`.
 *
 * `cookies()` é assíncrona no Next 15 — daí o `await` e a factory ser async.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Chamado a partir de um Server Component, que não pode escrever
            // cookies. Ignorável: o middleware é quem renova a sessão em
            // /dashboard. Em Route Handlers (ex.: /auth/callback) a escrita
            // funciona normalmente e este catch não dispara.
          }
        },
      },
    },
  )
}
