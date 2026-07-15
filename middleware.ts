/**
 * Middleware de AUTENTICAÇÃO — ALLOWLIST, nunca blocklist.
 *
 * ⚠️ ESTA É A PARTE MAIS PERIGOSA DA CAMADA DE LOGIN. Leia antes de mexer.
 *
 * O Flow é ANÔNIMO por natureza: o fluxo central é "escaneou o QR na quadra →
 * joga direto, sem login". /jogo, /placar, /setup, /placares, /admin, as rotas
 * de clube (/[clube]/[esporte]/[quadra]) e a landing (/) precisam continuar
 * abrindo para qualquer pessoa, sem sessão.
 *
 * O exemplo oficial do Supabase faz o OPOSTO disto: usa um matcher que pega
 * TODAS as rotas ("/((?!_next/static|_next/image|favicon.ico|...).*)") e
 * redireciona para /login quem não tiver sessão. Copiado como está, ele
 * derrubaria o produto inteiro — todo link de QR viraria um redirect para
 * login. Por isso o matcher abaixo é uma ALLOWLIST explícita.
 *
 * A garantia é estrutural, não condicional: como o `matcher` só casa
 * /dashboard, o Next NEM EXECUTA este arquivo nas outras rotas. Não existe
 * caminho de código em que uma rota anônima chegue no `NextResponse.redirect`
 * abaixo — mesmo que a lógica interna tivesse um bug. Para proteger uma rota
 * nova, ACRESCENTE ao matcher; nunca troque por um padrão abrangente.
 *
 * Next 15 usa `middleware.ts` na raiz exportando `middleware`. A doc atual do
 * Supabase mostra `proxy.ts` exportando `proxy`, que é a nomenclatura do
 * Next 16 — naquele formato este arquivo seria silenciosamente IGNORADO aqui
 * (sem erro de build, e a sessão nunca renovaria).
 */

import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
          // Headers de no-cache que o @supabase/ssr exige junto dos cookies de
          // sessão: sem eles, um CDN pode cachear a resposta e servir o token
          // de um usuário para outro.
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          )
        },
      },
    },
  )

  // NÃO rodar código entre createServerClient e getClaims(): segundo a doc do
  // Supabase, um engano aqui causa logout aleatório e é péssimo de depurar.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims

  // Só alcançável em /dashboard/** (ver `matcher`). Falha fechada: qualquer
  // erro na leitura da sessão vira "não logado" e manda para o /login.
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Estar logado NÃO basta: /dashboard é exclusivo de super_admin. Sem isto,
  // qualquer player autenticado abriria o painel administrativo.
  //
  // Esta é uma checagem OTIMISTA (redireciona cedo, boa UX). A autorização de
  // verdade está em requireSuperAdmin() (layout/páginas/Server Actions) e na
  // RLS de members — o Next.js recomenda não deixar o middleware ser a única
  // tranca, e middleware já teve bypass por header no passado.
  const { data: papel, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.sub)
    .maybeSingle()

  // Falha fechada: erro de leitura ou papel ausente ⇒ manda para a home.
  if (error || papel?.role !== 'super_admin') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // Devolver o supabaseResponse como está — trocá-lo por outra resposta sem
  // copiar os cookies dessincroniza browser e servidor e encerra a sessão.
  return supabaseResponse
}

export const config = {
  // ALLOWLIST. `/dashboard/:path*` casa /dashboard e /dashboard/qualquer/coisa.
  // Nenhuma outra rota do app passa por aqui.
  matcher: ['/dashboard/:path*'],
}
