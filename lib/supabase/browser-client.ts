/**
 * Client de AUTENTICAÇÃO para o navegador (Client Components).
 *
 * ⚠️ NÃO confundir com `lib/supabase/client.ts`, que exporta o singleton
 * `supabase` usado pelo sistema de SALAS ANÔNIMAS do Realtime (live-match).
 * São dois clients distintos, de propósito:
 *
 *   client.ts         → singleton, sessão em localStorage, RPCs de sala por
 *                       token de capacidade. NÃO tem identidade de pessoa.
 *                       Continua funcionando exatamente como antes.
 *   browser-client.ts  → factory, sessão em COOKIE (legível pelo servidor via
 *                       middleware/Server Components). É a camada NOVA de login.
 *
 * A sessão precisa viver em cookie — e não em localStorage — porque o servidor
 * (middleware e Server Components) não enxerga localStorage. É essa a razão de
 * existir do @supabase/ssr, e o motivo de este arquivo não substituir o outro.
 *
 * A chave é a ANON_KEY: é o nome que existe de fato no .env.local deste projeto.
 * A doc atual do Supabase já usa NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (nome
 * novo); a anon key é a forma legada, ainda suportada. Ao migrar a env var,
 * trocar aqui, em server.ts e em middleware.ts ao mesmo tempo.
 */

import { createBrowserClient } from '@supabase/ssr'

// Fábrica interna: o tipo do cliente é INFERIDO daqui (concreto). `ReturnType`
// sobre `createBrowserClient` genérico degradaria o tipo p/ any e quebraria a
// inferência dos `.then` — por isso o tipo do singleton vem de `typeof criar`.
function criar() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// SINGLETON (uma instância por aba). Antes era factory (uma instância NOVA a
// cada chamada) → múltiplos GoTrueClient (warning + CORRIDA de hidratação da
// sessão). O sintoma: um cliente recém-criado num handler de clique disparava o
// Storage upload ANTES de hidratar a sessão do cookie → a request ia sem token →
// auth.uid() NULL → a policy de storage.objects recusava (403 mascarado de 400).
// Uma instância única, já hidratada pelo useSession, anexa o token de forma
// consistente a TODAS as chamadas (DB e Storage).
let client: ReturnType<typeof criar> | undefined

export function createBrowserSupabaseClient() {
  return (client ??= criar())
}
