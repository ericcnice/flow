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

export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
