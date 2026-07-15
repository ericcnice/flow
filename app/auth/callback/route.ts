/**
 * Callback do OAuth (Google): troca o `code` devolvido pelo provider por uma
 * sessão em cookie. Padrão oficial do Supabase para o App Router.
 *
 * É um Route Handler (não Server Component) de propósito: só aqui a escrita de
 * cookie funciona de verdade, que é o que persiste a sessão.
 *
 * Esta é a URL que precisa estar na allowlist de "Redirect URLs" do painel do
 * Supabase (ex.: http://localhost:3000/auth/callback em dev).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // `next` permite voltar para a página pretendida após o login. Só aceitamos
  // caminhos internos: sem esta checagem, ?next=https://site-malicioso.com
  // transformaria o callback num open redirect assinado pelo nosso domínio.
  const nextParam = searchParams.get('next')
  const next =
    nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
      ? nextParam
      : '/dashboard'

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Atrás de um proxy (Vercel), `origin` é o host interno; x-forwarded-host
      // é o domínio que o usuário realmente vê.
      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'

      if (!isLocalEnv && forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      }
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?erro=callback`)
}
