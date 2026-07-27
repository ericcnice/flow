/**
 * OS LINKS DA PARTIDA — fonte ÚNICA.
 *
 * Dois destinos, dois papéis:
 *  • EDITOR (`/jogo`)    — leva o `edit_token`, o SEGREDO de escrita. Quem abre
 *    entra na partida e, se estiver logado, cai no próximo slot livre (1c.1).
 *    É o link do QR (do compartilhar e da aba Players).
 *  • ESPECTADOR (`/placar`) — leva só o `view_token`, seguro de expor.
 *
 * ⚠️ POR QUE UM HELPER, e não montar em cada tela: a montagem já viveu inline no
 * ShareModal, e quando o ramo remoto do /jogo passou a precisar do contexto de
 * quadra, o `&clube=` ficou de fora num dos caminhos — o 2º aparelho abria sem
 * logo do clube e sem patrocinador na tela de fim, sem erro nenhum para
 * denunciar. Uma fonte só evita a próxima versão desse bug.
 *
 * O `&v=` no link de EDITOR não é redundância: o nome do canal de broadcast é
 * derivado do view_token (getLiveMatchTopic). Sem ele o convidado assinaria um
 * canal diferente do que o servidor transmite e nunca receberia os pontos.
 *
 * Módulo PURO: sem React, sem window, sem rede. O `origin` vem de quem chama
 * (que sabe se está no cliente).
 */

export type MatchLinkParams = {
  /** Origem absoluta (ex.: window.location.origin). Vazio → link relativo. */
  origin: string
  quadra: string
  matchId?: string
  viewToken?: string
  editToken?: string
  /** Contexto que o aparelho remoto precisa para nascer coerente. */
  sport?: string
  theme?: string
  scoreType?: string
  /** Slug do clube e do patrocinador — o par que já sumiu uma vez. */
  clube?: string
  ad?: string
  gameType?: string
}

/** Os parâmetros de contexto, na ordem estável em que sempre viajaram. */
function extras(p: MatchLinkParams): string {
  return (
    (p.sport ? `&sport=${encodeURIComponent(p.sport)}` : "") +
    (p.theme ? `&theme=${encodeURIComponent(p.theme)}` : "") +
    (p.scoreType ? `&scoreType=${encodeURIComponent(p.scoreType)}` : "") +
    (p.clube ? `&clube=${encodeURIComponent(p.clube)}` : "") +
    (p.ad ? `&ad=${encodeURIComponent(p.ad)}` : "") +
    (p.gameType ? `&gameType=${encodeURIComponent(p.gameType)}` : "")
  )
}

/**
 * Link de EDITOR (o do QR). Devolve "" quando a sala ainda não existe — o
 * chamador trata isso como "sem link para mostrar", nunca como erro: o jogo
 * segue local e a sala é bônus.
 */
export function buildEditUrl(p: MatchLinkParams): string {
  if (!p.matchId || !p.viewToken || !p.editToken) return ""
  return (
    `${p.origin}/jogo?quadra=${p.quadra}&match=${p.matchId}&edit=${p.editToken}` +
    `&v=${encodeURIComponent(p.viewToken)}${extras(p)}`
  )
}

/** Link de ESPECTADOR (transmissão). Mesmas regras; só o view_token viaja. */
export function buildViewUrl(p: MatchLinkParams): string {
  if (!p.matchId || !p.viewToken) return ""
  return `${p.origin}/placar?quadra=${p.quadra}&match=${p.matchId}&view=${p.viewToken}${extras(p)}`
}
