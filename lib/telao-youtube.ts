/**
 * RESOLUÇÃO DO VÍDEO do telão. Módulo PURO — sem React, sem rede, sem window.
 *
 * O parse aceita o que a pessoa TEM na mão, não o que seria conveniente para
 * nós: link de watch, /live/, youtu.be, embed já pronto, ou o id cru de 11
 * caracteres. Quem opera está copiando do YouTube com o celular na mão, e cada
 * formato recusado é um "não funciona" que ninguém sabe explicar.
 */

/** Um canal do YouTube tem id no formato UC + 22 caracteres. */
export function ehChannelId(v: string): boolean {
  return /^UC[\w-]{22}$/.test(v.trim())
}

/** Extrai o ID de 11 caracteres de qualquer forma de link de vídeo. */
export function idDoVideo(url: string): string | null {
  const t = (url ?? "").trim()
  if (!t) return null
  if (/^[\w-]{11}$/.test(t)) return t
  const m = t.match(/(?:v=|\/live\/|\/embed\/|youtu\.be\/|\/v\/)([\w-]{11})/)
  return m?.[1] ?? null
}

/**
 * A URL de EMBED de uma quadra, aplicando a precedência.
 *
 * `mute=1` não é preferência: navegador nenhum dá autoplay com som, e um telão
 * que não começa sozinho é um telão que alguém precisa ir apertar.
 *
 * @param videoUrl  vídeo próprio da quadra (vence)
 * @param channelId canal do clube (fallback: "o que estiver ao vivo agora")
 * @returns null quando a quadra não tem vídeo — o telão então mostra só o placar
 */
export function embedDaQuadra(
  videoUrl: string | null | undefined,
  channelId: string | null | undefined,
): string | null {
  const comuns = "autoplay=1&mute=1&rel=0&modestbranding=1&playsinline=1"

  const vid = idDoVideo(videoUrl ?? "")
  if (vid) return `https://www.youtube.com/embed/${vid}?${comuns}`

  const canal = (channelId ?? "").trim()
  if (ehChannelId(canal)) {
    return `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(canal)}&${comuns}`
  }
  return null
}

/**
 * Link de ESCAPE — para quando o embed é bloqueado.
 *
 * ⚠️ Ele existe porque o YouTube devolve uma TELA CINZA, sem avisar e sem
 * disparar evento nenhum, quando o dono do canal não liberou o embed. Sem um
 * link visível, o telão parece quebrado e ninguém descobre por quê.
 */
export function linkDeEscape(
  videoUrl: string | null | undefined,
  channelId: string | null | undefined,
): string | null {
  const vid = idDoVideo(videoUrl ?? "")
  if (vid) return `https://www.youtube.com/watch?v=${vid}`
  const canal = (channelId ?? "").trim()
  if (ehChannelId(canal)) return `https://www.youtube.com/channel/${encodeURIComponent(canal)}/live`
  return null
}
