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
import { ScoringEngine } from "./scoring/engine"
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

/**
 * Regra de TROCA DE LADO do esporte — descritor DECLARATIVO consumido pela UI
 * para AVISAR (não troca nada sozinho; o espelhamento é gesto manual do juiz):
 *  - "tennis-odd-games": tênis/beach/padel — troca quando o total de games do
 *    set corrente vira ímpar (1º, 3º, 5º…) e, no tiebreak, a cada 6 pontos;
 *  - "each-game": ping pong — troca ao fim de CADA game e, no game decisivo,
 *    quando o 1º lado atinge 5 pontos;
 *  - "none": squash, pickleball — sem troca de lado.
 * A DERIVAÇÃO (quando avisar) vive na tela de jogo; aqui só declaramos a regra.
 */
export type SideChangeMode = "tennis-odd-games" | "each-game" | "none"

/** Um metadado de esporte: o suficiente para instanciar o motor e rotular a UI. */
export type SportMeta = {
  id: SportId
  name: string
  /** O módulo do motor (lib/scoring/sports/*). Tipado como `unknown` nas regras
   * de propósito: cada esporte tem seu próprio formato de regras. */
  module: SportModule<any>
  family: ScoreFamily
  /** Como/quando o esporte troca de lado (para o aviso automático na UI). */
  sideChange: SideChangeMode
}

/** Ordem do carrossel na tela de setup. */
export const SPORTS: SportMeta[] = [
  { id: "tennis", name: "Tênis", module: tennisModule, family: "tennis", sideChange: "tennis-odd-games" },
  { id: "beach", name: "Beach Tennis", module: beachModule, family: "tennis", sideChange: "tennis-odd-games" },
  { id: "padel", name: "Padel", module: padelModule, family: "tennis", sideChange: "tennis-odd-games" },
  { id: "squash", name: "Squash", module: squashModule, family: "rally", sideChange: "none" },
  { id: "tabletennis", name: "Ping Pong", module: tableTennisModule, family: "rally", sideChange: "each-game" },
  { id: "pickleball", name: "Pickleball", module: pickleballModule, family: "sideout", sideChange: "none" },
]

/** Índice por id (fallback: tênis) — não quebra com id desconhecido. */
export function sportById(id: string | null | undefined): SportMeta {
  return SPORTS.find((s) => s.id === id) ?? SPORTS[0]
}

/** Família de placar de um esporte. */
export function familyOf(id: string | null | undefined): ScoreFamily {
  return sportById(id).family
}

/** Regra de troca de lado de um esporte (para o aviso automático na UI). */
export function sideChangeOf(id: string | null | undefined): SideChangeMode {
  return sportById(id).sideChange
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

/**
 * Sacador a EXIBIR para o ponto ATUAL (bola de saque / indicador). Igual a
 * `state.server` FORA do tiebreak.
 *
 * DURANTE o tiebreak, o motor (racket-core) só rotaciona o saque por GAME —
 * `scoreTiebreakPoint` NÃO mexe em `state.server`, então ele fica congelado no
 * PRIMEIRO sacador do tiebreak (S0). A regra real do tiebreak é o padrão 1-2-2:
 * S0 saca 1 ponto, depois o saque alterna a cada 2 pontos (S0 · opp opp · S0 S0
 * · opp opp · …). Derivamos o sacador real de S0 (= o `state.server` congelado)
 * + o total de pontos já jogados no tiebreak:
 *   trocas de saque até aqui = floor((T + 1) / 2);  par → S0, ímpar → oponente.
 *
 * Só LÊ o estado exposto pelo motor — NÃO altera lib/scoring. Fora do tiebreak
 * (e em esportes sem tiebreak) devolve `state.server` inalterado.
 */
export function displayServer(state: GameState): Side {
  if (!state.isTiebreak) return state.server
  const s0 = state.server
  const t = state.A.tiebreakPoints + state.B.tiebreakPoints // pontos ANTES do atual
  return Math.floor((t + 1) / 2) % 2 === 0 ? s0 : s0 === "A" ? "B" : "A"
}

/** Ação de placar reconstruível: ponto real (`point`) ou game concedido (`game`). */
export type ScoreAction = { kind: "point" | "game"; side: Side }

/**
 * Para cada UNIDADE já encerrada (set no tênis; game no rally/side-out), diz se
 * ela foi fechada por CONCESSÃO (ação `kind:"game"` → awardGameFor) ou por
 * DISPUTA real (sequência de `kind:"point"` até o alvo do esporte).
 *
 * NÃO é heurística e NÃO olha o placar: reexecuta as MESMAS ações no MOTOR real
 * (ScoringEngine + módulo do esporte) e observa em QUAL ação o `completedSets`
 * cresceu — a ação que fechou a unidade define a origem. Assim, um game vencido
 * genuinamente por 11-0 (só pontos) fica `false`, e um game concedido fica
 * `true`, sem ambiguidade. O índice acompanha `state.completedSets` (0-based),
 * alinhado ao `setNum - 1` das colunas de {@link buildScoreCols}.
 *
 * Só LÊ o motor (não o altera). Fonte da verdade única de "como" cada unidade
 * foi fechada, já que o próprio GameState não guarda essa proveniência.
 */
export function concededUnitFlags(
  module: SportModule<any>,
  rules: any,
  firstServer: Side,
  actions: ScoreAction[],
): boolean[] {
  const engine = new ScoringEngine(module, rules, firstServer)
  const conceded: boolean[] = []
  let prev = engine.getState().completedSets.length // começa em 0
  for (const a of actions) {
    if (a.kind === "game") engine.awardGameFor(a.side)
    else engine.pointFor(a.side)
    const now = engine.getState().completedSets.length
    // Toda unidade fechada NESTA ação herda o kind dela (game → concedida).
    for (let k = prev; k < now; k++) conceded[k] = a.kind === "game"
    prev = now
  }
  return conceded
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

// Padel: igual ao racquete. No motor o 40-40 é modelado por `goldenPoint`, mas na
// UI o controle se chama "Vantagem" (Com/Sem) — o MESMO rótulo do tênis/beach —
// para não expor jargão. Com vantagem = deuce tradicional (goldenPoint=false);
// Sem vantagem = ponto decisivo único no 40-40 (goldenPoint=true). Só o texto
// muda; a lógica (advantage = !goldenPoint) é a mesma.
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
    label: "Vantagem",
    options: [
      { label: "Com", value: true },
      { label: "Sem", value: false },
    ],
    // O valor da opção é o "tem vantagem?"; goldenPoint é o inverso.
    get: (r) => !r.goldenPoint,
    set: (r, v) => ({ ...r, goldenPoint: !v }),
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
