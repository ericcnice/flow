/**
 * O que o SERVIDOR entrega à tela do telão, por quadra.
 *
 * ⚠️ NENHUM SEGREDO CRU AQUI. O `view_token` da partida nunca chega ao cliente
 * como campo: ele já vem embutido dentro de `placarUrl`, montada no servidor a
 * partir dos campos guardados. O cliente recebe um endereço para pôr num
 * iframe, não a credencial para construir outros.
 */

export type QuadraTelao = {
  /** Slug da quadra (ex.: "q1"). */
  slug: string
  /** Número exibível (ex.: "1"). */
  numero: string
  /** Embed do YouTube já resolvido pela precedência. null = quadra sem vídeo. */
  embedUrl: string | null
  /** Link de escape para quando o YouTube bloqueia o embed. */
  canalUrl: string | null
  /** /placar já montado. null = nenhuma partida ligada a esta quadra. */
  placarUrl: string | null
}
