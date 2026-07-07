/**
 * TEMAS ("palcos") de cor do placar — alto contraste, legíveis sob sol.
 *
 * Cada tema é APENAS um conjunto de valores das variáveis CSS que o placar já
 * consome (--lado-a-*, --lado-b-*, --palco-*). Os valores vivem em globals.css,
 * numa classe por tema (.tema-neutro, .tema-azul-amarelo, ...). Este módulo é só
 * o CATÁLOGO usado pela UI: id estável, rótulo, classe CSS e as cores de
 * amostra (swatch) do seletor. NÃO altera lib/scoring nem as regras/quadras.
 *
 * O tema escolhido é POR PARTIDA (parte da config, junto de esporte + regras) e
 * persiste no localStorage com o resto da config. Default = Neutro (P&B).
 */

export type ThemeId = "neutro" | "azul-amarelo" | "vermelho-branco" | "verde-amarelo"

export type ThemeMeta = {
  id: ThemeId
  /** Rótulo curto exibido sob a amostra no seletor. */
  label: string
  /** Classe CSS aplicada no container do placar/setup (ver globals.css). */
  className: string
  /** Cores de AMOSTRA (swatch) — espelham as do tema em globals.css. Lado A e
   *  lado B do placar: fundo + cor do número, pra prever o par no seletor. */
  aBg: string
  aText: string
  bBg: string
  bText: string
}

/** Ordem de exibição no seletor. Neutro é o primeiro (default). */
export const THEMES: ThemeMeta[] = [
  {
    id: "neutro",
    label: "Neutro",
    className: "tema-neutro",
    aBg: "#f5f5f5",
    aText: "#0a0a0a",
    bBg: "#0a0a0a",
    bText: "#f5f5f5",
  },
  {
    id: "azul-amarelo",
    label: "Azul",
    className: "tema-azul-amarelo",
    aBg: "#16386e",
    aText: "#ffd400",
    bBg: "#0a1f47",
    bText: "#ffd400",
  },
  {
    id: "vermelho-branco",
    label: "Vermelho",
    className: "tema-vermelho-branco",
    aBg: "#d11a1a",
    aText: "#ffffff",
    bBg: "#8f0f0f",
    bText: "#ffffff",
  },
  {
    id: "verde-amarelo",
    label: "Verde",
    className: "tema-verde-amarelo",
    aBg: "#0f7a44",
    aText: "#ffe000",
    bBg: "#08492a",
    bText: "#ffe000",
  },
]

export const DEFAULT_THEME: ThemeId = "neutro"

/** Classe CSS do tema (cai no Neutro para id ausente/desconhecido). */
export function themeClassName(id?: ThemeId | null): string {
  const t = THEMES.find((x) => x.id === id)
  return (t ?? THEMES[0]).className
}
