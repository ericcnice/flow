/**
 * CORES OFICIAIS DA MARCA FLOW — um lugar só.
 *
 * O logo é "flow" em MINÚSCULO, fonte Audiowide, com degradê linear do AZUL ao
 * VERDE. O "w" isolado (símbolo/avatar) é a mesma letra, mesma fonte, mesmo
 * degradê. Audiowide é a fonte padrão de TODOS os logos de produtos da PWER IO.
 *
 * Quem precisar da marca importa daqui — nunca redigita o hex. Se a marca
 * evoluir, muda neste arquivo e o app inteiro acompanha.
 */

/** Azul — início do degradê. */
export const FLOW_BLUE = '#0078FF'

/** Verde — fim do degradê. */
export const FLOW_GREEN = '#00FF6F'

/**
 * O degradê pronto para CSS. 100° (e não 90°) dá a leve diagonal do logo
 * original, subindo da esquerda para a direita.
 */
export const FLOW_GRADIENT_CSS = `linear-gradient(100deg, ${FLOW_BLUE} 0%, ${FLOW_GREEN} 100%)`
