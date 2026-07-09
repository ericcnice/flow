/**
 * Catálogo de esportes — a "cola" entre o motor de scoring (lib/scoring) e a UI
 * (tela de setup + tela de jogo). NÃO contém regra de pontuação nenhuma: só
 * consome os SportModule já existentes e descreve, de forma declarativa:
 *
 *  - metadados de cada esporte (id, nome amigável, módulo, "família" de placar);
 *  - quais REGRAS configuráveis cada esporte expõe (RULE_SPECS) — usado pela
 *    tela de setup para desenhar os toggles sem conhecer o formato interno das
 *    regras de cada esporte;
 *  - como FORMATAR o ponto de cada família (15/30/40 do tênis vs. contagem
 *    corrida do squash/ping pong/pickleball) — usado pela tela de jogo.
 *
 * Regra de ouro: este arquivo NÃO altera lib/scoring; apenas o importa.
 */

import type { GameState, Side, SideState, SportModule } from "./scoring/types"
import { tennisModule } from "./scoring/sports/tennis"
import { beachModule } from "./scoring/sports/beach"
import { padelModule } from "./scoring/sports/padel"
import { squashModule } from "./scoring/sports/squash"
import { tableTennisModule } from "./scoring/sports/tabletennis"
import { pickleballModule } from "./scoring/sports/pickleball"
import { pointLabel } from "./scoring/sports/racket-core"

/** Ids estáveis dos 6 esportes ligados à UI. */
export type SportId = "tennis" | "beach" | "padel" | "squash" | "tabletennis" | "pickleball"

/**
 * "Família" de placar — determina como o ponto é exibido e contado na tela:
 *  - "tennis":  15/30/40, games e sets, tiebreak (tênis, beach, padel);
 *  - "rally":   contagem corrida por game (squash, ping pong);
 *  - "sideout": contagem corrida, só quem saca pontua (pickleball).
 * Para EXIBIÇÃO, "rally" e "sideout" são idênticas (número corrido).
 */
export type ScoreFamily = "tennis" | "rally" | "sideout"

/** Um metadado de esporte: o suficiente para instanciar o motor e rotular a UI. */
export type SportMeta = {
  id: SportId
  name: string
  /** O módulo do motor (lib/scoring/sports/*). Tipado como `unknown` nas regras
   * de propósito: cada esporte tem seu próprio formato de regras. */
  module: SportModule<any>
  family: ScoreFamily
}

/** Ordem do carrossel na tela de setup. */
export const SPORTS: SportMeta[] = [
  { id: "tennis", name: "Tênis", module: tennisModule, family: "tennis" },
  { id: "beach", name: "Beach Tennis", module: beachModule, family: "tennis" },
  { id: "padel", name: "Padel", module: padelModule, family: "tennis" },
  { id: "squash", name: "Squash", module: squashModule, family: "rally" },
  { id: "tabletennis", name: "Ping Pong", module: tableTennisModule, family: "rally" },
  { id: "pickleball", name: "Pickleball", module: pickleballModule, family: "sideout" },
]

/** Índice por id (fallback: tênis) — não quebra com id desconhecido. */
export function sportById(id: string | null | undefined): SportMeta {
  return SPORTS.find((s) => s.id === id) ?? SPORTS[0]
}

/** Família de placar de um esporte. */
export function familyOf(id: string | null | undefined): ScoreFamily {
  return sportById(id).family
}

/** Regras padrão do esporte (delegadas ao módulo). */
export function defaultRulesFor(id: string | null | undefined): any {
  return sportById(id).module.defaultRules()
}

/**
 * Formata o "número grande" do ponto conforme a família:
 *  - tênis: em tiebreak mostra os pontos do tiebreak; senão 0/15/30/40/AD;
 *  - rally/sideout: contagem corrida (points).
 */
export function formatPoint(id: string, side: SideState, isTiebreak: boolean): string {
  if (familyOf(id) === "tennis") {
    if (isTiebreak) return side.tiebreakPoints.toString()
    return pointLabel(side)
  }
  return side.points.toString()
}

/**
 * Uma "coluna" do placar por UNIDADE da partida: set no tênis/beach/padel,
 * game nos esportes de rally/side-out (squash/ping pong/pickleball).
 *  - played:true, current:false → unidade JÁ encerrada (resultado em a/b);
 *  - current:true               → unidade EM ANDAMENTO (valor ao vivo em a/b);
 *  - played:false               → unidade FUTURA (a/b = null → dash na UI).
 */
export type ScoreCol = {
  /** Número da unidade (1-based): set 1, set 2… (ou game 1, game 2…). */
  setNum: number
  played: boolean
  current: boolean
  a: number | null
  b: number | null
  /** Unidade decidida em tiebreak/super tiebreak (só marca no tênis). */
  tb: boolean
}

/**
 * Monta as colunas do placar (uma por unidade POSSÍVEL, de 1 até `bestOf`) a
 * partir do {@link GameState}. Fonte de verdade ÚNICA para o placar geral
 * (visão horizontal/tabela) E para a trilha compacta da chip central — ambos
 * consomem o MESMO array. NÃO altera lib/scoring: só LÊ o estado exposto
 * (completedSets + games/points do lado corrente).
 *
 * Combina duas fontes: as unidades encerradas vêm de `state.completedSets`; a
 * unidade em andamento vem dos contadores ao vivo (`games` no tênis, `points`
 * no rally/side-out); as demais ficam como futuras (dash).
 */
export function buildScoreCols(
  state: GameState,
  opts: { bestOf: number; isTennisFamily: boolean; finished: boolean; isTiebreak: boolean },
): ScoreCol[] {
  const { bestOf, isTennisFamily, finished, isTiebreak } = opts
  const totalUnits = bestOf || 3
  return Array.from({ length: totalUnits }, (_, i) => {
    const done = state.completedSets[i]
    if (done) {
      return { setNum: i + 1, played: true, current: false, a: done.A, b: done.B, tb: !!done.tiebreak }
    }
    if (!finished && i === state.completedSets.length) {
      const a = isTennisFamily ? state.A.games : state.A.points
      const b = isTennisFamily ? state.B.games : state.B.points
      return { setNum: i + 1, played: true, current: true, a, b, tb: isTiebreak }
    }
    return { setNum: i + 1, played: false, current: false, a: null as number | null, b: null as number | null, tb: false }
  })
}

/* ------------------------------------------------------------------------- */
/* Regras configuráveis por esporte (declarativo, para a tela de setup)       */
/* ------------------------------------------------------------------------- */

/** Um valor possível de uma regra (rótulo grande + valor aplicado). */
export type RuleOption = { label: string; value: string | number | boolean }

/**
 * Um controle de regra: rótulo + opções + como LER/GRAVAR aquele valor no
 * objeto de regras do esporte. get/set escondem o formato interno (inclusive
 * regras aninhadas como tiebreak.enabled e a conversão do "ponto de ouro" do
 * padel), então a tela de setup renderiza qualquer esporte sem conhecê-lo.
 */
export type RuleControl = {
  key: string
  label: string
  options: RuleOption[]
  get: (rules: any) => RuleOption["value"]
  set: (rules: any, value: RuleOption["value"]) => any
}

// Controles da família de racquete (tênis/beach) — mesmo formato de regras.
const racketControls = (): RuleControl[] => [
  {
    key: "gamesPerSet",
    label: "Games por set",
    options: [
      { label: "4", value: 4 },
      { label: "6", value: 6 },
    ],
    get: (r) => r.gamesPerSet,
    set: (r, v) => ({ ...r, gamesPerSet: v }),
  },
  {
    key: "advantage",
    label: "Vantagem",
    options: [
      { label: "Com", value: true },
      { label: "Sem", value: false },
    ],
    get: (r) => r.advantage,
    set: (r, v) => ({ ...r, advantage: v }),
  },
  {
    key: "tiebreak",
    label: "Tiebreak",
    options: [
      { label: "Sim", value: true },
      { label: "Não", value: false },
    ],
    get: (r) => r.tiebreak.enabled,
    set: (r, v) => ({ ...r, tiebreak: { ...r.tiebreak, enabled: v } }),
  },
  {
    key: "superTiebreak",
    label: "Super tiebreak",
    options: [
      { label: "Sim", value: true },
      { label: "Não", value: false },
    ],
    get: (r) => r.superTiebreak.enabled,
    set: (r, v) => ({ ...r, superTiebreak: { ...r.superTiebreak, enabled: v } }),
  },
  {
    key: "bestOf",
    label: "Melhor de",
    options: [
      { label: "1 set", value: 1 },
      { label: "3 sets", value: 3 },
      { label: "5 sets", value: 5 },
    ],
    get: (r) => r.bestOf,
    set: (r, v) => ({ ...r, bestOf: v }),
  },
]

// Padel: igual ao racquete, mas o 40-40 é "ponto de ouro" (goldenPoint) no
// lugar da vantagem.
const padelControls = (): RuleControl[] => [
  {
    key: "gamesPerSet",
    label: "Games por set",
    options: [
      { label: "4", value: 4 },
      { label: "6", value: 6 },
    ],
    get: (r) => r.gamesPerSet,
    set: (r, v) => ({ ...r, gamesPerSet: v }),
  },
  {
    key: "goldenPoint",
    label: "Ponto de ouro",
    options: [
      { label: "Sim", value: true },
      { label: "Não", value: false },
    ],
    get: (r) => r.goldenPoint,
    set: (r, v) => ({ ...r, goldenPoint: v }),
  },
  {
    key: "tiebreak",
    label: "Tiebreak",
    options: [
      { label: "Sim", value: true },
      { label: "Não", value: false },
    ],
    get: (r) => r.tiebreak.enabled,
    set: (r, v) => ({ ...r, tiebreak: { ...r.tiebreak, enabled: v } }),
  },
  {
    key: "superTiebreak",
    label: "Super tiebreak",
    options: [
      { label: "Sim", value: true },
      { label: "Não", value: false },
    ],
    get: (r) => r.superTiebreak.enabled,
    set: (r, v) => ({ ...r, superTiebreak: { ...r.superTiebreak, enabled: v } }),
  },
  {
    key: "bestOf",
    label: "Melhor de",
    options: [
      { label: "1 set", value: 1 },
      { label: "3 sets", value: 3 },
      { label: "5 sets", value: 5 },
    ],
    get: (r) => r.bestOf,
    set: (r, v) => ({ ...r, bestOf: v }),
  },
]

// Alvo (pontos por game) 11/15 — comum aos esportes de contagem corrida.
const targetControl = (): RuleControl => ({
  key: "target",
  label: "Pontos por game",
  options: [
    { label: "11", value: 11 },
    { label: "15", value: 15 },
  ],
  get: (r) => r.target,
  set: (r, v) => ({ ...r, target: v }),
})

const bestOfControl = (options: RuleOption[]): RuleControl => ({
  key: "bestOf",
  label: "Melhor de",
  options,
  get: (r) => r.bestOf,
  set: (r, v) => ({ ...r, bestOf: v }),
})

/** Controles de regra por esporte (SÓ os do esporte selecionado aparecem). */
export const RULE_SPECS: Record<SportId, () => RuleControl[]> = {
  tennis: racketControls,
  beach: racketControls,
  padel: padelControls,
  squash: () => [
    targetControl(),
    bestOfControl([
      { label: "3 games", value: 3 },
      { label: "5 games", value: 5 },
    ]),
  ],
  tabletennis: () => [
    targetControl(),
    bestOfControl([
      { label: "5 games", value: 5 },
      { label: "7 games", value: 7 },
    ]),
  ],
  pickleball: () => [
    targetControl(),
    bestOfControl([
      { label: "3 games", value: 3 },
      { label: "5 games", value: 5 },
    ]),
  ],
}

/** Controles do esporte informado (lista já materializada). */
export function ruleControlsFor(id: SportId): RuleControl[] {
  return (RULE_SPECS[id] ?? racketControls)()
}

// Reexport de tipos úteis para os consumidores.
export type { GameState, Side, SideState }
