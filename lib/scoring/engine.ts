/**
 * Núcleo genérico do motor de scoring.
 *
 * Este arquivo NÃO conhece nenhuma regra de esporte. Ele:
 *  - guarda o estado atual da partida,
 *  - mantém um histórico (pilha de snapshots) para permitir "undo",
 *  - delega TODA decisão de pontuação ao SportModule ativo.
 *
 * Trocar o esporte é só instanciar com outro módulo.
 */

import type { GameState, ScoringEvent, Side, SportModule } from "./types"

/** Clona um estado de jogo em profundidade (imutabilidade do histórico). */
function cloneState(state: GameState): GameState {
  return structuredClone(state)
}

export class ScoringEngine<TRules> {
  private readonly module: SportModule<TRules>
  private readonly rules: TRules
  private state: GameState
  /** Snapshots do estado ANTES de cada ponto — base do "undo". */
  private undoStack: GameState[] = []
  /** Eventos gerados pelo último ponto marcado. */
  private lastEvents: ScoringEvent[] = []

  constructor(module: SportModule<TRules>, rules?: TRules, firstServer: Side = "A") {
    this.module = module
    this.rules = rules ?? module.defaultRules()
    this.state = module.createInitialState(this.rules, firstServer)
  }

  /** Retorna uma cópia do estado atual (não expõe a referência interna). */
  getState(): GameState {
    return cloneState(this.state)
  }

  /** Regras em vigor nesta partida. */
  getRules(): TRules {
    return this.rules
  }

  /** Módulo de esporte ativo. */
  getModule(): SportModule<TRules> {
    return this.module
  }

  /** Eventos produzidos pelo último ponto marcado. */
  getLastEvents(): ScoringEvent[] {
    return this.lastEvents
  }

  /** Se há ao menos um ponto para desfazer. */
  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  /**
   * Marca um ponto para o lado informado e retorna os eventos ocorridos.
   * Se a partida já acabou, é um no-op (nenhum evento, nada no histórico).
   */
  pointFor(side: Side): ScoringEvent[] {
    if (this.state.finished) {
      this.lastEvents = []
      return this.lastEvents
    }
    // Guarda o estado atual antes de aplicar o ponto.
    this.undoStack.push(cloneState(this.state))

    const result = this.module.scorePoint(this.state, side, this.rules)
    this.state = result.state
    this.lastEvents = result.events
    return this.lastEvents
  }

  /**
   * Concede um game inteiro ao lado informado (granularidade "por game"),
   * pulando a contagem de pontos. Convive com pointFor: mesmo estado, mesmo
   * histórico. É desfazível pelo undo exatamente como um ponto. Se a partida
   * já acabou, é um no-op.
   */
  awardGameFor(side: Side): ScoringEvent[] {
    if (this.state.finished) {
      this.lastEvents = []
      return this.lastEvents
    }
    // Mesmo mecanismo de undo que um ponto: snapshot antes de aplicar.
    this.undoStack.push(cloneState(this.state))

    const result = this.module.awardGame(this.state, side, this.rules)
    this.state = result.state
    this.lastEvents = result.events
    return this.lastEvents
  }

  /**
   * Desfaz o último ponto, retrocedendo o estado. Retorna false se não havia
   * nada para desfazer. Também reverte o fim de partida, se o último ponto o
   * havia encerrado.
   */
  undo(): boolean {
    const previous = this.undoStack.pop()
    if (!previous) return false
    this.state = previous
    this.lastEvents = []
    return true
  }

  /** Reinicia a partida do zero, limpando o histórico. */
  reset(firstServer: Side = "A"): void {
    this.state = this.module.createInitialState(this.rules, firstServer)
    this.undoStack = []
    this.lastEvents = []
  }
}
