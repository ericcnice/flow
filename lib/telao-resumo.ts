/**
 * O PLACAR-RESUMO de uma partida — o que cabe num cartão do carrossel do telão.
 *
 * Módulo PURO: sem React, sem rede, sem window. Recebe o `state` cru de uma
 * sala ao vivo e devolve nomes + números. Por ser puro, é testável — e é assim
 * que se confere que os números do cartão batem com os do placar, sem abrir
 * navegador nenhum.
 *
 * ⚠️ POR QUE NÃO REUSAR O /placar: o telão já compõe o placar do DESTAQUE com
 * um iframe do /placar, e essa continua sendo a regra ("o telão COMPÕE, não
 * reimplementa"). Mas cinco iframes de transmissão completa numa faixa de
 * navegação seria pesado — cinco motores, cinco conexões, cinco buscas de
 * avatar — para mostrar dois nomes e três números. O cartão precisa de um
 * RESUMO, e resumo é outra coisa que uma transmissão.
 *
 * ⚠️ A CONTA NÃO É REIMPLEMENTADA: o placar sai do MESMO motor (ScoringEngine +
 * o módulo do esporte) e das MESMAS funções de exibição que o /placar usa
 * (`buildScoreCols`, `formatPoint`, `displayServer`). Só LÊ — `lib/scoring`
 * não é tocado. Se a regra de um esporte mudar, os dois mudam juntos, porque
 * são o mesmo código. O que se duplica aqui são as ~8 linhas do replay, e
 * apenas porque extraí-las exigiria mexer no /placar, que está preservado.
 */

import { ScoringEngine } from "@/lib/scoring/engine"
import type { Side } from "@/lib/scoring/types"
import {
  buildScoreCols,
  defaultRulesFor,
  displayServer,
  familyOf,
  formatPoint,
  sportById,
  type ScoreAction,
} from "@/lib/sports-catalog"

export type ResumoLado = {
  nome: string
  /**
   * Unidades JÁ encerradas. No tênis são os SETS (6, 4…); nos esportes de
   * rally são os GAMES, e o número guardado é o PLACAR daquele game (11, 9…),
   * não a contagem de games — é assim que o motor os registra.
   */
  encerradas: number[]
  /**
   * A unidade em ANDAMENTO — games do set atual, no tênis.
   *
   * ⚠️ `null` fora da família do tênis, e isto não é economia: nos esportes de
   * rally a unidade em andamento É a contagem de pontos, o mesmo número que
   * `ponto`. Mandar os dois faria o cartão imprimir "5 5" — um número repetido
   * que quem olha de longe leria como um placar.
   */
  atual: number | null
  /** Ponto corrente já formatado: "40", "AD", "7". */
  ponto: string
  saca: boolean
  venceu: boolean
}

export type ResumoPartida = {
  A: ResumoLado
  B: ResumoLado
  finalizada: boolean
}

/**
 * O nome de um lado, com a MESMA regra do /placar (`teamName` lá):
 * em duplas mostra o par "A/B"; em simples, só o jogador principal.
 *
 * ⚠️ A dupla exige as DUAS condições — a sala afirmando "duplas" E o parceiro
 * tendo nome. Uma só não basta: sem o formato, um nome sobrando de um jogo
 * anterior viraria uma dupla que não existe; sem o nome, sairia "Eric/" ou
 * "Eric/Jogador 2", que é pior que mostrar um nome só.
 */
function nomeDoLado(players: unknown, lado: "blue" | "red", duplas: boolean): string {
  const p = (players ?? {}) as Record<string, unknown>
  const bruto = p[`${lado}1`]
  const um = typeof bruto === "string" && bruto.trim() ? bruto.trim() : ""
  if (!um) return lado === "blue" ? "Jogador 1" : "Jogador 2"

  if (!duplas) return um
  const brutoDois = p[`${lado}2`]
  const dois = typeof brutoDois === "string" && brutoDois.trim() ? brutoDois.trim() : ""
  return dois ? `${um}/${dois}` : um
}

/** Só o que o motor sabe reexecutar; qualquer outra chave da sala é ignorada. */
function acoesDoState(bruto: unknown): ScoreAction[] {
  if (!Array.isArray(bruto)) return []
  const out: ScoreAction[] = []
  for (const a of bruto) {
    const kind = (a as { kind?: unknown })?.kind
    if (kind !== "point" && kind !== "game") continue
    out.push({ kind, side: (a as { side?: unknown })?.side === "B" ? "B" : "A" })
  }
  return out
}

/**
 * O resumo de uma sala. `null` quando não há partida reconhecível ali — o
 * cartão então mostra o mesmo "Sem partida" de sempre, em vez de zeros que
 * pareceriam um jogo empatado que nunca começou.
 */
export function resumoDoState(bruto: unknown, sportId: string): ResumoPartida | null {
  if (!bruto || typeof bruto !== "object") return null
  const st = bruto as Record<string, unknown>

  const esporte = sportById(sportId)
  const rules = st.rules ?? defaultRulesFor(esporte.id)
  const primeiro: Side = st.firstServer === "B" ? "B" : "A"
  const acoes = acoesDoState(st.actions)

  // O MESMO replay que o /placar faz para o espectador: o motor é a fonte da
  // verdade e o estado guardado são as AÇÕES, não o placar já somado.
  const engine = new ScoringEngine(esporte.module, rules as never, primeiro)
  for (const a of acoes) {
    if (a.kind === "game") engine.awardGameFor(a.side)
    else engine.pointFor(a.side)
  }
  const gs = engine.getState()

  const familiaTenis = familyOf(esporte.id) === "tennis"
  const bestOf = Number((rules as { bestOf?: unknown })?.bestOf) || 3
  const cols = buildScoreCols(gs, {
    bestOf,
    isTennisFamily: familiaTenis,
    finished: gs.finished,
    isTiebreak: gs.isTiebreak,
  })

  // Só as unidades JÁ jogadas: as futuras viram traço no /placar, e num cartão
  // de 150px um traço por set gastaria a largura que os números precisam.
  const encerradas = cols.filter((c) => c.played && !c.current)
  const emAndamento = cols.find((c) => c.current)
  const saca = gs.finished ? null : displayServer(gs)

  // O cartão e o palco leem a MESMA afirmação da sala — é o que garante que os
  // dois digam a mesma coisa sobre quem está jogando.
  const duplas = st.gameType === "duplas"

  const lado = (s: Side): ResumoLado => ({
    nome: nomeDoLado(st.players, s === "A" ? "blue" : "red", duplas),
    encerradas: encerradas.map((c) => (s === "A" ? (c.a ?? 0) : (c.b ?? 0))),
    atual:
      familiaTenis && emAndamento ? ((s === "A" ? emAndamento.a : emAndamento.b) ?? 0) : null,
    ponto: formatPoint(esporte.id, gs[s], gs.isTiebreak),
    saca: saca === s,
    venceu: gs.finished && gs.winner === s,
  })

  return { A: lado("A"), B: lado("B"), finalizada: gs.finished }
}
