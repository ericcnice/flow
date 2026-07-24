import type { User } from '@supabase/supabase-js'

/**
 * URL da FOTO do usuário — CASCATA (fatia 1c):
 *   profiles.avatar_url (Storage, a foto que o usuário subiu) → user_metadata
 *   (Google: `avatar_url`/`picture`) → null (o chamador cai na inicial).
 *
 * `profileAvatarUrl` é a foto canônica do banco; quando presente, VENCE. Quem
 * tem o profile em mãos (o /perfil) repassa; quem não tem, chama só com `user` e
 * cai no Google/inicial. Helper puro (reuso: perfil hoje, /@username futuro).
 */
export function avatarUrlOf(
  user: User | null | undefined,
  profileAvatarUrl?: string | null,
): string | null {
  // 1) Storage (a foto que o usuário subiu) — prioridade máxima.
  if (typeof profileAvatarUrl === 'string' && profileAvatarUrl.trim() !== '') {
    return profileAvatarUrl
  }
  // 2) Google (metadata da sessão).
  if (!user) return null
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const url = (meta.avatar_url as string) ?? (meta.picture as string) ?? null
  return typeof url === 'string' && url.trim() !== '' ? url : null
}
