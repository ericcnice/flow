/**
 * Tipos compartilhados do motor de scoring plugável.
 *
 * Este arquivo NÃO contém nenhuma regra de esporte — apenas contratos.
 * O núcleo genérico (engine.ts) e cada módulo de esporte (sports/*.ts)
 * conversam exclusivamente através destes tipos.
 */

/** Os dois lados de uma partida. 'A' e 'B' são neutros de esporte/cor. */
export type Side = "A" | "B"

/**
 * Como um tiebreak (ou super tiebreak) é decidido:
 * - "by-two":       precisa vencer por 2 de diferença (ex.: 7 com dif. de 2).
 * - "sudden-death": basta atingir o alvo (ponto seco), sem exigir diferença.
 */
export type TiebreakMode = "by-two" | "sudden-death"

/** Estado de pontuação de um único lado. */
export type SideState = {
  /** Índice do ponto no game: 0,1,2,3 → exibidos como 0,15,30,40. */
  points: number
  /** Games ganhos no set atual. */
  games: number
  /** Sets ganhos na partida. */
  sets: number
  /** Se este lado está com vantagem (após deuce). */
  advantage: boolean
  /** Pontos no tiebreak / super tiebreak em andamento. */
  tiebreakPoints: number
}

/** Registro de um set já encerrado (para placar/histórico). */
export type CompletedSet = {
  set: number
  A: number
  B: number
  /** true se o set foi decidido em tiebreak/super tiebreak. */
  tiebreak?: boolean
}

/**
 * Estado completo do jogo. É produzido e consumido pelos módulos de esporte,
 * e guardado/versionado pelo núcleo (engine) para permitir "undo".
 */
export type GameState = {
  A: SideState
  B: SideState
  /** Número do set atual (1-based). */
  currentSet: number
  /** Se um tiebreak comum está em andamento. */
  isTiebreak: boolean
  /** Se o tiebreak em andamento é um super tiebreak (set decisivo). */
  isSuperTiebreak: boolean
  /** Quem saca o game atual. */
  server: Side
  /** Quem sacou primeiro na partida (nunca muda após o 1º ponto). */
  firstServer: Side
  /** Sets já encerrados, em ordem. */
  completedSets: CompletedSet[]
  /** true quando a partida acabou. */
  finished: boolean
  /** Vencedor da partida, se encerrada. */
  winner?: Side
}

/**
 * Tipos de eventos emitidos a cada ponto. Servem para a voz do árbitro
 * saber o que anunciar depois.
 */
export type ScoringEventType =
  | "POINT" // um ponto foi marcado (game continua)
  | "DEUCE" // placar chegou a 40-40 (iguais)
  | "ADVANTAGE" // um lado ganhou vantagem
  | "GAME" // um game foi vencido
  | "SET" // um set foi vencido
  | "MATCH" // a partida foi vencida
  | "TIEBREAK_START" // um tiebreak / super tiebreak começou

/** Um evento ocorrido durante a marcação de um ponto. */
export type ScoringEvent = {
  type: ScoringEventType
  /** Lado que provocou/beneficiou-se do evento, quando aplicável. */
  side?: Side
  /** Detalhe legível para o anúncio (ex.: "30-15", "40-40", "7-6", "super"). */
  detail?: string
}

/** Resultado da marcação de um ponto: novo estado + eventos ocorridos. */
export type ScoreResult = {
  state: GameState
  events: ScoringEvent[]
}

/**
 * Contrato que todo esporte implementa. O núcleo é agnóstico de esporte e
 * delega TODA decisão de pontuação ao módulo ativo.
 *
 * @typeParam TRules - o formato das regras configuráveis daquele esporte.
 */
export type SportModule<TRules = unknown> = {
  /** Identificador estável (ex.: "tennis"). */
  readonly id: string
  /** Nome amigável (ex.: "Tênis"). */
  readonly name: string
  /** Regras padrão do esporte, usadas quando nenhuma é fornecida. */
  defaultRules(): TRules
  /** Cria o estado inicial de uma partida. */
  createInitialState(rules: TRules, firstServer?: Side): GameState
  /**
   * Marca um ponto para `side`, aplicando as regras. NÃO deve mutar `state`;
   * retorna um novo estado e a lista de eventos ocorridos.
   */
  scorePoint(state: GameState, side: Side, rules: TRules): ScoreResult
}

/** Regras configuráveis do tênis. */
export type TennisRules = {
  /** Games necessários para vencer um set (padrão 6). */
  gamesPerSet: number
  /** Com vantagem (deuce/AD) ou sem vantagem (ponto seco no 40-40). */
  advantage: boolean
  /** Tiebreak comum, disputado em 6-6 (ou gamesPerSet-gamesPerSet). */
  tiebreak: {
    enabled: boolean
    /** Pontos para vencer (padrão 7). */
    target: number
    mode: TiebreakMode
  }
  /** Super tiebreak que substitui o set decisivo. */
  superTiebreak: {
    enabled: boolean
    /** Pontos para vencer (padrão 10). */
    target: number
    mode: TiebreakMode
  }
  /** Melhor de 3 ou de 5 sets. */
  bestOf: 3 | 5
}

/**
 * Regras configuráveis do beach tennis.
 *
 * Estruturalmente igual a {@link TennisRules} (o algoritmo de racquete é o
 * mesmo), mas os PADRÕES refletem o esporte real: no-ad por padrão (ponto de
 * ouro no 40-40) e melhor de 3. O tipo é declarado à parte de propósito, para
 * que tênis e beach possam divergir livremente no futuro sem um acoplar o outro.
 */
export type BeachRules = {
  /** Games para vencer um set. Padrão 6; formato de vila/clube usa 4. */
  gamesPerSet: number
  /** Com vantagem (deuce/AD) ou sem vantagem — no beach o padrão é SEM. */
  advantage: boolean
  /** Tiebreak comum, disputado em gamesPerSet-gamesPerSet (ex.: 6-6 ou 4-4). */
  tiebreak: {
    enabled: boolean
    /** Pontos para vencer (padrão 7). */
    target: number
    mode: TiebreakMode
  }
  /** Super tiebreak que substitui o set decisivo (padrão desligado). */
  superTiebreak: {
    enabled: boolean
    /** Pontos para vencer (padrão 10). */
    target: number
    mode: TiebreakMode
  }
  /** Melhor de 3 ou de 5 sets — beach raramente é de 5, padrão 3. */
  bestOf: 3 | 5
}
