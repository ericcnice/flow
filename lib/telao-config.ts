/**
 * CONFIG DO TELÃO, por clube — a parte que muda RARAMENTE.
 *
 * A separação que organiza esta feature inteira:
 *  • SETUP RARO (aqui): quadras, canal do YouTube, marca. Muda quando o clube
 *    entra ou reconfigura — é o Eric quem mexe, no código.
 *  • OPERAÇÃO FREQUENTE (a tela /operar): qual partida está em qual quadra
 *    AGORA. Muda a cada jogo — é o parceiro quem mexe, do celular dele.
 * Misturar as duas obrigaria o parceiro a mexer no que ele não deve, ou o Eric
 * a estar presente em cada troca de jogo.
 *
 * ⚠️ ARQUIVO PÚBLICO — vai para o bundle do cliente. NENHUM SEGREDO AQUI. O
 * token de operação vive em variável de ambiente server-only (ver operar/).
 */

export type TelaoConfig = {
  /**
   * Canal do YouTube em modo "o que estiver ao vivo agora".
   *
   * POR QUE CANAL E NÃO LINK DE VÍDEO: com o id do vídeo, alguém teria que
   * atualizar a config a cada transmissão — o telão quebraria toda semana e
   * ninguém saberia por quê. Com o canal, o embed segue a live sozinho.
   *
   * ⚠️ EXIGE QUE O DONO DO CANAL LIBERE O EMBED nas configurações do YouTube.
   * Bloqueado, o player mostra tela cinza — e é para isso que existe o link de
   * escape ("abrir no YouTube") na tela do telão.
   */
  youtubeChannelId: string
  /** Quadra que o telão abre por padrão. */
  quadraPadrao: string
}

export const TELAO: Record<string, TelaoConfig> = {
  squashwall: {
    // Canal da Squash Wall. Enquanto o embed não estiver liberado lá, a tela
    // cinza é o comportamento esperado — o link de escape cobre.
    youtubeChannelId: "UCqoT-ogFzJxqBmW-gNvz_Cg",
    quadraPadrao: "q1",
  },
}

export function telaoConfig(clube: string | null | undefined): TelaoConfig | null {
  if (!clube) return null
  return TELAO[clube.toLowerCase()] ?? null
}

/**
 * URL de embed do canal ao vivo. `mute=1` não é preferência: navegador nenhum
 * dá autoplay com som, e um telão que não começa sozinho é um telão que alguém
 * precisa ir apertar.
 */
export function embedDoCanal(channelId: string): string {
  return `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(
    channelId,
  )}&autoplay=1&mute=1&rel=0&modestbranding=1`
}

/** Link de ESCAPE: quando o embed é bloqueado, ainda dá para assistir. */
export function linkDoCanal(channelId: string): string {
  return `https://www.youtube.com/channel/${encodeURIComponent(channelId)}/live`
}
