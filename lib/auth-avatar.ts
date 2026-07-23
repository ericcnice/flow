import type { User } from '@supabase/supabase-js'

/**
 * URL da FOTO do usuário a partir da sessão. O Google (OIDC) popula `picture`; o
 * Supabase costuma copiar para `avatar_url` no user_metadata — tentamos os dois.
 * null quando não há foto (ex.: login por OTP de email) → o chamador cai na
 * inicial do nome. Helper simples e puro para reuso (perfil hoje, /@username
 * futuro).
 */
export function avatarUrlOf(user: User | null | undefined): string | null {
  if (!user) return null
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const url = (meta.avatar_url as string) ?? (meta.picture as string) ?? null
  return typeof url === 'string' && url.trim() !== '' ? url : null
}
