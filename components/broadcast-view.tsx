"use client"

/**
 * Tela de ESPECTADOR (somente leitura) + o layout de placar de transmissão
 * compartilhado com o overlay "placar geral" do /jogo.
 *
 * Duas exportações:
 *  - <BroadcastScoreboard>: SÓ a tabela broadcast (jogadores em linha, sets/games
 *    legíveis, ponto na ponta). É PURA (recebe tudo por props) e é a MESMA usada
 *    pelo overlay temporário do /jogo — fonte de layout ÚNICA, sem duplicação.
 *  - <BroadcastView>: a página /placar inteira. Reaproveita o fluxo REMOTE-FIRST
 *    já provado do /jogo (getLiveMatchState → rebuild do motor → useRealtimeMatch),
 *    mas SEMPRE como "viewer": nunca lê edit_token, nunca cria sala, nunca envia
 *    ação. A superfície de interação é ZERO (nenhum bloco clicável, nenhum botão
 *    de edição) — é o "Caminho B": view-only reduz a interação em vez de duplicar
 *    a lógica de conexão.
 *
 * NÃO altera lib/scoring, lib/supabase nem lib/hooks — só os consome.
 */

import { useEffect, useRef, useState, type CSSProperties } from "react"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import { BadgeCheck } from "lucide-react"

import { ScoringEngine } from "@/lib/scoring/engine"
import { sportById, familyOf, formatPoint, defaultRulesFor, buildScoreCols, concededUnitFlags, displayServer, type SportId } from "@/lib/sports-catalog"
import { themeClassName, type ThemeId } from "@/lib/themes"
import { clubFromCacheOrBundle } from "@/lib/supabase/club-catalog"
import { resolveSponsor, type Sponsor } from "@/lib/supabase/sponsors"
import type { GameState, Side } from "@/lib/scoring/types"
import { getLiveMatchState } from "@/lib/supabase/live-match"
import { resolvePlayerCards, type PlayerCard } from "@/lib/supabase/player-cards"
import Link from "next/link"
import { PlayerAvatar } from "@/components/player-avatar"
import { FlowWordmark } from "@/components/brand/flow-wordmark"
import { FlowMark } from "@/components/brand/flow-mark"
import { useRealtimeMatch } from "@/lib/hooks/use-realtime-match"
import { trackUmaVez } from "@/lib/analytics"

// Ação de placar reconstruível por replay (idêntico ao /jogo — o motor não expõe
// setter de estado, então guardamos o histórico point/game).
type Action = { kind: "point" | "game"; side: Side }

// ---------------------------------------------------------------------------
// Layout PURO da tabela broadcast (compartilhado /jogo overlay + /placar).
// ---------------------------------------------------------------------------
export function BroadcastScoreboard({
  cols,
  isTennisFamily,
  unitLabel,
  server,
  winner,
  names,
  verified,
  points,
  conceded = [],
}: {
  cols: ReturnType<typeof buildScoreCols>
  isTennisFamily: boolean
  unitLabel: string
  server: Side
  winner: Side | null
  names: { A: string; B: string }
  /** Identidade CONFIRMADA por lado (playerIds do state). Ausente = anônimo. */
  verified?: { A: boolean; B: boolean }
  points: { A: string; B: string }
  /** Por UNIDADE (índice = setNum-1): true se foi fechada por CONCESSÃO. Nessas,
   *  mostramos só um indicador de vitória (●/○), nunca o placar de pontos. */
  conceded?: boolean[]
}) {
  return (
    <table className="scoreboard-broadcast">
      <thead>
        <tr className="text-[9px] md:text-xs uppercase tracking-widest opacity-45">
          <th className="text-left font-normal">Jogador</th>
          {cols.map((c) => (
            <th key={c.setNum} className="font-normal">
              {c.current ? (
                // Coluna do game EM ANDAMENTO: ponto vermelho pulsante = "ao vivo",
                // sinalizando que o número abaixo é parcial, não um resultado.
                <span className="inline-flex items-center justify-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" aria-hidden />
                  {isTennisFamily ? "Game" : "Pts"}
                </span>
              ) : (
                `${unitLabel} ${c.setNum}`
              )}
            </th>
          ))}
          <th className="font-normal">Ponto</th>
        </tr>
      </thead>
      <tbody>
        {(["A", "B"] as Side[]).map((side) => {
          const name = side === "A" ? names.A : names.B
          const isServing = server === side
          const isWinner = winner === side
          return (
            <tr key={side} data-side={side.toLowerCase()} className={isWinner ? "sb-winner" : ""}>
              <td className="sb-name">
                <span className={`sb-dot ${isServing ? "on" : ""}`} aria-hidden />
                <span>{name}</span>
                {/* TICK do jogador com carteirinha. Só LEITURA: o /placar nunca
                    toca edit_token nem identidade de escrita — apenas exibe o
                    que veio no state. Sem playerIds (o normal), nada muda. */}
                {verified?.[side] && (
                  <BadgeCheck
                    className="ml-1 inline h-3.5 w-3.5 align-[-2px] text-emerald-400"
                    aria-label="Identidade verificada pelo Flow"
                  />
                )}
              </td>
              {cols.map((c) => {
                const mine = side === "A" ? c.a : c.b
                const theirs = side === "A" ? c.b : c.a
                // Indicador de concessão SÓ na família rally (squash/ping pong/
                // pickleball), onde um game concedido grava um placar de PONTOS
                // fictício. No tênis/beach/padel o número é a contagem REAL de
                // games (verdadeira mesmo em games-mode), então nunca esconde.
                const isConceded =
                  !isTennisFamily && c.played && !c.current && !!conceded[c.setNum - 1]
                const won = (mine ?? 0) > (theirs ?? 0)
                return (
                  <td
                    key={c.setNum}
                    className={`sb-set ${c.current ? "sb-current sb-live" : ""} ${!c.played ? "sb-future" : ""}`}
                    title={
                      c.current
                        ? "Parcial — game em andamento (ainda não fechado)"
                        : isConceded
                          ? "Game concedido (sem disputa de pontos)"
                          : undefined
                    }
                  >
                    {!c.played ? (
                      "–"
                    ) : isConceded ? (
                      <span className="sb-award" style={{ opacity: won ? 1 : 0.35 }} aria-label={won ? "venceu" : "não venceu"}>
                        {won ? "●" : "○"}
                      </span>
                    ) : (
                      mine
                    )}
                    {c.tb && !c.current ? <sup className="sb-tb">tb</sup> : null}
                  </td>
                )
              })}
              <td className="sb-point">{side === "A" ? points.A : points.B}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// Nome exibido de um lado a partir do `players` da raiz do state, respeitando o
// gameType: SÓ em "duplas" mostra o par "A/B"; em "simples" (ou ausente/default)
// mostra apenas o jogador principal (blue1/red1) — nada de "/Jogador 2".
/** Os quatro lugares, na ordem global (blue1=1 … red2=4). Espelha o /jogo. */
type SlotKey = "blue1" | "blue2" | "red1" | "red2"
const SLOTS: SlotKey[] = ["blue1", "blue2", "red1", "red2"]

/**
 * Nome ABREVIADO para o rodapé: "Eric Nice" → "E. Nice", "Jogador 2" → "J. 2".
 * O rodapé tem quatro nomes competindo com os sets numa linha; por extenso eles
 * truncavam no meio ("E. NICE / PLAY…") e a dupla ficava ilegível. Abreviar o
 * PRIMEIRO nome preserva o que identifica (o sobrenome) e cabe.
 */
function abreviar(nome: string): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean)
  if (partes.length < 2) return partes[0] ?? ""
  return `${partes[0][0].toUpperCase()}. ${partes.slice(1).join(" ")}`
}

/** Os quatro nomes SOLTOS (o `teamName` junta; a T1b precisa deles separados). */
function nomesDoState(players: any): Record<SlotKey, string> {
  const out = { blue1: "", blue2: "", red1: "", red2: "" } as Record<SlotKey, string>
  for (const k of SLOTS) out[k] = typeof players?.[k] === "string" ? players[k] : ""
  return out
}

/** Os uuids por slot, filtrando lixo. Ausente = slot anônimo (o caso normal). */
function idsDoState(playerIds: any): Partial<Record<SlotKey, string>> {
  const out: Partial<Record<SlotKey, string>> = {}
  for (const k of SLOTS) {
    const v = playerIds?.[k]
    if (typeof v === "string" && v) out[k] = v
  }
  return out
}

/** `initialServer` do state → {A,B} com 0|1 garantido (salas antigas não têm). */
function normalizaServer(raw: any): { A: 0 | 1; B: 0 | 1 } {
  return { A: raw?.A === 1 ? 1 : 0, B: raw?.B === 1 ? 1 : 0 }
}

/**
 * O INÍCIO da partida guardado na sala → a âncora do cronômetro.
 *
 * Cai em "agora" (o comportamento antigo) em três casos, e os três são reais:
 *  - sala ANTIGA, criada antes de o campo existir;
 *  - valor ilegível (lixo no jsonb);
 *  - data no FUTURO — relógio do aparelho atrasado em relação ao de quem criou
 *    a sala daria um tempo NEGATIVO, e o formatador imprimiria "-1:-23:-45" na
 *    tela de transmissão. Uma tolerância de um minuto absorve a diferença
 *    normal entre dois celulares.
 */
function inicioDaSala(bruto: unknown): Date {
  if (typeof bruto === "string" && bruto) {
    const t = new Date(bruto).getTime()
    if (Number.isFinite(t) && t <= Date.now() + 60_000) return new Date(t)
  }
  return new Date()
}

function teamName(players: any, side: "blue" | "red", gameType?: string | null): string {
  const one = side === "blue" ? players?.blue1 : players?.red1
  const two = side === "blue" ? players?.blue2 : players?.red2
  if (gameType === "duplas" && two) return `${one}/${two}`
  return one || (side === "blue" ? "Jogador 1" : "Jogador 2")
}

// ---------------------------------------------------------------------------
// Tela /placar completa: espectador REMOTE-FIRST, SEMPRE viewer, view-only.
// ---------------------------------------------------------------------------
export function BroadcastView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const rt = useRealtimeMatch()

  // Esporte/tema/clube/ad vêm da URL (o servidor não os guarda) — igual ao /jogo.
  const [sport, setSport] = useState<SportId>("tennis")
  const sportRef = useRef<SportId>("tennis")
  const [theme, setTheme] = useState<ThemeId>("neutro")
  const [clube, setClube] = useState<string | null>(null)
  const [adSlug, setAdSlug] = useState<string | null>(null)
  // Patrocinador resolvido a partir do `&ad=` da URL (ADS estático → cache →
  // RPC). Fica aqui em cima porque há um `return` antecipado (carregando/erro)
  // antes do ponto onde o logo é usado — hook depois dele quebraria a ordem.
  // Este device é o de QUEM ASSISTE: cache próprio, tipicamente vazio, então é
  // aqui que a RPC mais roda de verdade.
  const [viewAd, setViewAd] = useState<Sponsor | null>(null)
  const [quadra, setQuadra] = useState("1")
  // Simples vs. duplas: define se a linha mostra 1 nome ou o par. Vem da URL
  // (&gameType=); ausente = simples (default seguro). O servidor não guarda.
  const [gameType, setGameType] = useState<string | null>(null)

  const [nameA, setNameA] = useState("Jogador 1")
  const [nameB, setNameB] = useState("Jogador 2")
  // Carteirinha por lado (Fatia 1a): quem tem profile_id no slot principal
  // ganha o tick. AUSENTE é o caso normal — jogo anônimo não muda em nada.
  const [verified, setVerified] = useState<{ A: boolean; B: boolean }>({ A: false, B: false })

  // ===================== T1a: OS DOIS DADOS QUE FALTAVAM =====================
  // Esta fatia SÓ TRAZ dado — a tela continua idêntica. A repaginação (T1b) usa
  // o que está aqui. Separado de propósito: misturar "não aparece porque o dado
  // não chegou" com "não aparece porque o CSS está errado" foi o que fez o
  // diagnóstico do claim custar uma sessão inteira.

  /**
   * DADO 1 — as CARTEIRINHAS por slot (uuid → nome/foto).
   *
   * Antes, `playerIds` era reduzido a dois booleanos ("tem alguém verificado
   * deste lado") e o uuid ia para o lixo — sem ele não há como buscar foto.
   * Agora o mapa inteiro fica guardado, para os QUATRO slots (o `verified`
   * continua existindo: é o que a tela de hoje consome, e não mudamos a tela).
   */
  const [slotIds, setSlotIds] = useState<Partial<Record<SlotKey, string>>>({})
  const [cards, setCards] = useState<Map<string, PlayerCard>>(new Map())

  /**
   * DADO 2a — os QUATRO NOMES SEPARADOS.
   *
   * `teamName` junta "N1/N2" num string só, e de um string juntado não se
   * destaca UM parceiro. A T1b precisa pintar o nome de QUEM SACA, então os
   * nomes precisam existir soltos. Os `nameA`/`nameB` juntados seguem
   * intactos — são eles que a tela de hoje desenha.
   */
  const [nomes, setNomes] = useState<Record<SlotKey, string>>({
    blue1: "",
    blue2: "",
    red1: "",
    red2: "",
  })

  /** DADO 2b — o sacador INDIVIDUAL por lado (0|1), que o broadcast ignorava. */
  const [initialServer, setInitialServer] = useState<{ A: 0 | 1; B: 0 | 1 }>({ A: 0, B: 0 })

  /**
   * O MODO DE CONTAGEM — "pontos" ou "games".
   *
   * ⚠️ ERA A CAUSA DO NÚMERO CONGELADO. Em modo GAMES, cada toque no /jogo
   * envia `kind:"game"` e o motor fecha um game inteiro: `points` fica em 0
   * para sempre e quem sobe é `games`. A transmissão formatava sempre o PONTO,
   * então exibia um "0" imóvel enquanto o placar do juiz avançava. O dado
   * viajava no state e no hook (`remoteScoreType`) — o broadcast é que não o
   * lia.
   */
  const [scoreType, setScoreType] = useState<"pontos" | "games">("pontos")

  const [elapsedTime, setElapsedTime] = useState("00:00:00")
  const [startTime, setStartTime] = useState<Date | null>(null)

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  // Motor de scoring: fonte de verdade do placar. É reconstruído por replay das
  // ações remotas (o espectador NUNCA marca — só reflete). Sem setter direto.
  const engineRef = useRef<ScoringEngine<any> | null>(null)
  const actionsRef = useRef<Action[]>([])
  const rulesRef = useRef<any>(defaultRulesFor("tennis"))
  const firstServerRef = useRef<Side>("A")
  const [gameState, setGameState] = useState<GameState | null>(null)
  const initRef = useRef(false)

  const rebuildEngine = (rules: any, firstServer: Side, actions: Action[]) => {
    const module = sportById(sportRef.current).module
    const engine = new ScoringEngine(module, rules, firstServer)
    for (const a of actions) {
      if (a.kind === "game") engine.awardGameFor(a.side)
      else engine.pointFor(a.side)
    }
    engineRef.current = engine
    actionsRef.current = [...actions]
    rulesRef.current = rules
    firstServerRef.current = firstServer
    setGameState(engine.getState())
  }

  // --- Carga REMOTE-FIRST (viewer) -----------------------------------------
  // Mesma lógica do /jogo, mas SEM edit_token: o canal/leitura usa só o
  // view_token (`view=`; `v=` como fallback de link legado). Um `edit=` que
  // venha por engano na URL é IGNORADO — /placar nunca autoriza escrita.
  useEffect(() => {
    const matchParam = searchParams.get("match")
    const viewParam = searchParams.get("view") || searchParams.get("v") // NUNCA edit
    const sportParam = searchParams.get("sport")
    const themeParam = searchParams.get("theme")
    const q = searchParams.get("quadra") || "1"
    setQuadra(q)
    setClube(searchParams.get("clube"))
    setAdSlug(searchParams.get("ad"))
    const gt = searchParams.get("gameType")
    setGameType(gt)

    // Sem sala (link antigo /placar?quadra=X ou token ausente): estado de erro
    // simples, sem quebrar. A tela de transmissão exige um view_token.
    if (!matchParam || !viewParam) {
      setLoading(false)
      setLoadError(true)
      return
    }
    if (initRef.current) return
    initRef.current = true

    const resolvedSport = (sportParam || "tennis") as SportId
    sportRef.current = resolvedSport
    setSport(resolvedSport)
    const resolvedTheme = (themeParam || "neutro") as ThemeId
    setTheme(resolvedTheme)

    void (async () => {
      try {
        const remote = await getLiveMatchState(viewParam)
        if (!remote) {
          setLoadError(true)
          setLoading(false)
          return
        }

        const rState: any = remote.state || {}
        const rRules = rState.rules ?? defaultRulesFor(resolvedSport)
        const rFirst: Side = rState.firstServer === "B" ? "B" : "A"
        const rawActions: any[] = Array.isArray(rState.actions) ? rState.actions : []
        const cleanActions: Action[] = []
        for (const a of rawActions) {
          if (a?.kind === "point" || a?.kind === "game") cleanActions.push({ kind: a.kind, side: a.side })
        }

        if (rState.players && typeof rState.players === "object") {
          setNameA(teamName(rState.players, "blue", gt))
          setNameB(teamName(rState.players, "red", gt))
          setNomes(nomesDoState(rState.players))
        }
        if (rState.playerIds && typeof rState.playerIds === "object") {
          setVerified({
            A: Boolean(rState.playerIds.blue1),
            B: Boolean(rState.playerIds.red1),
          })
          // T1a: os QUATRO uuids, não só os dois booleanos. Em duplas a foto do
          // parceiro também importa, e sem o id dele não há o que buscar.
          setSlotIds(idsDoState(rState.playerIds))
        }
        if (rState.initialServer && typeof rState.initialServer === "object") {
          setInitialServer(normalizaServer(rState.initialServer))
        }
        if (rState.scoreType === "games" || rState.scoreType === "pontos") {
          setScoreType(rState.scoreType)
        }

        rebuildEngine(rRules, rFirst, cleanActions)
        // CRONÔMETRO ancorado no INÍCIO DA PARTIDA quando a sala o traz.
        //
        // Antes contava sempre desde a abertura da tela, porque o `startTime`
        // real não viajava — vivia só no localStorage do dono. No telão isso
        // virava um relógio que ZERAVA a cada troca de quadra: o iframe
        // remonta, e a contagem recomeçava do zero numa partida de 40 minutos.
        //
        // Sala ANTIGA (sem o campo) cai no comportamento de sempre, em vez de
        // ficar sem cronômetro: degradação graciosa, não erro.
        setStartTime(inicioDaSala(rState.startTime))
        setLoading(false)

        // TRANSMISSÃO ABERTA — só depois de carregar de VERDADE: um link
        // expirado cai no `catch` e não conta como audiência. Dedup pela sala,
        // então recarregar não infla. Quem assiste é sempre anônimo do ponto de
        // vista do produto, e é justamente esse alcance que se quer medir.
        trackUmaVez(`bc_${remote.id}`, "broadcast_opened", {
          sport: resolvedSport,
          ...(searchParams.get("clube") ? { clube: searchParams.get("clube") as string } : {}),
        })

        // Continua escutando o canal como VIEWER (papel read-only no presence).
        await rt.subscribe(viewParam, remote.id, "viewer")
      } catch (err) {
        console.error("Carregamento remoto do placar falhou:", err)
        setLoadError(true)
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Sync AO VIVO: placar (broadcast → engine) ---------------------------
  // O espectador não tem estado local para divergir: o remoto É a verdade.
  // Reconstrói o motor a cada novo histórico de ações point/game.
  useEffect(() => {
    const remote = rt.state
    if (!Array.isArray(remote)) return
    const scoreActions: Action[] = []
    for (const a of remote as any[]) {
      if (a?.kind === "point" || a?.kind === "game") scoreActions.push({ kind: a.kind, side: a.side })
    }
    rebuildEngine(rulesRef.current, firstServerRef.current, scoreActions)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt.state])

  // --- Sync AO VIVO: config da raiz do state (nomes/sacador/regras/tema) ----
  // A config vive na RAIZ do state (não em actions), então o hook a repassa
  // separadamente. firstServer/rules podem exigir replay (rebuild) preservando
  // o placar; nomes e tema são só exibição.
  useEffect(() => {
    if (rt.remotePlayers && typeof rt.remotePlayers === "object") {
      setNameA(teamName(rt.remotePlayers, "blue", gameType))
      setNameB(teamName(rt.remotePlayers, "red", gameType))
      setNomes(nomesDoState(rt.remotePlayers))
    }
    // Quem REIVINDICA vence e a ausência nunca apaga: só ligamos o tick, nunca
    // desligamos por um patch que veio sem a chave.
    if (rt.remotePlayerIds && typeof rt.remotePlayerIds === "object") {
      setVerified((prev) => ({
        A: prev.A || Boolean(rt.remotePlayerIds.blue1),
        B: prev.B || Boolean(rt.remotePlayerIds.red1),
      }))
      setSlotIds(idsDoState(rt.remotePlayerIds))
    }
    if (rt.remoteInitialServer && typeof rt.remoteInitialServer === "object") {
      setInitialServer(normalizaServer(rt.remoteInitialServer))
    }
    if (rt.remoteScoreType === "games" || rt.remoteScoreType === "pontos") {
      setScoreType(rt.remoteScoreType)
    }
    if (rt.remoteTheme) setTheme(rt.remoteTheme as ThemeId)

    let nextFirst = firstServerRef.current
    let nextRules = rulesRef.current
    let needRebuild = false
    if ((rt.remoteFirstServer === "A" || rt.remoteFirstServer === "B") && rt.remoteFirstServer !== firstServerRef.current) {
      nextFirst = rt.remoteFirstServer
      needRebuild = true
    }
    if (
      rt.remoteRules &&
      typeof rt.remoteRules === "object" &&
      JSON.stringify(rt.remoteRules) !== JSON.stringify(rulesRef.current)
    ) {
      nextRules = rt.remoteRules
      needRebuild = true
    }
    if (needRebuild) rebuildEngine(nextRules, nextFirst, actionsRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    rt.remotePlayers,
    rt.remotePlayerIds,
    rt.remoteInitialServer,
    rt.remoteFirstServer,
    rt.remoteRules,
    rt.remoteScoreType,
    rt.remoteTheme,
    gameType,
  ])

  // Cronômetro (mesmo padrão do /jogo).
  useEffect(() => {
    if (!startTime) return
    const timer = setInterval(() => {
      const diff = new Date().getTime() - startTime.getTime()
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)
      setElapsedTime(
        `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
      )
    }, 1000)
    return () => clearInterval(timer)
  }, [startTime])

  /**
   * T1a — resolve as CARTEIRINHAS (nome canônico + foto) dos slots identificados.
   *
   * Mesma RPC pública que a tela de jogo usa (`get_public_player_cards`), que já
   * tem grant a `anon` justamente para a jornada pública — o espectador não tem
   * sessão, e é por isso que só esta via serve: aqui TODO MUNDO é terceiro, não
   * existe o atalho de "ler o próprio profile" que o dono tem no /jogo.
   *
   * Não-bloqueante e tolerante: sem ids não toca a rede; offline/erro devolve
   * vazio e a T1b cai na inicial do nome. A chave do effect é a LISTA de ids
   * (string ordenada), não o objeto — assim um broadcast que não mexeu em
   * identidade nenhuma não redispara a busca.
   */
  const chaveIds = SLOTS.map((k) => slotIds[k] ?? "").join(",")
  useEffect(() => {
    const ids = chaveIds.split(",").filter(Boolean)
    if (ids.length === 0) {
      setCards(new Map())
      return
    }
    let alive = true
    void (async () => {
      // O callback cobre a revalidação de fundo (stale-while-revalidate): se a
      // foto mudou desde o último jogo, a transmissão atualiza sozinha.
      const resolvidas = await resolvePlayerCards(ids, (frescas) => {
        if (alive) setCards(new Map(frescas))
      })
      if (alive) setCards(resolvidas)
    })()
    return () => {
      alive = false
    }
  }, [chaveIds])

  /**
   * T1a — QUAL PARCEIRO saca (0|1), por lado. O broadcast já sabia o LADO
   * (`displayServer`), mas em DUPLAS isso não diz qual dos dois está sacando.
   *
   * Mesma derivação da tela de jogo, e ela é derivação porque o motor só alterna
   * o LADO: dentro do lado, os parceiros se revezam a cada vez que o time volta
   * a sacar — `floor(games do set / 2)` par → o inicial, ímpar → o parceiro.
   * Simples e tiebreak ficam no índice inicial.
   */
  const serverPlayerIdx = (side: Side): 0 | 1 => {
    const init = initialServer[side]
    if (gameType !== "duplas" || !gameState || gameState.isTiebreak) return init
    const gamesNoSet = gameState.A.games + gameState.B.games
    return (Math.floor(gamesNoSet / 2) % 2 === 0 ? init : 1 - init) as 0 | 1
  }

  // Resolve o patrocinador quando o `&ad=` da URL chega (o effect de carga o
  // preenche). null enquanto resolve e null quando não há — a guarda de render
  // trata os dois como "não desenha a marca d'água", igual a antes.
  useEffect(() => {
    let alive = true
    resolveSponsor(adSlug).then((s) => {
      if (alive) setViewAd(s)
    })
    return () => {
      alive = false
    }
  }, [adSlug])

  // --- Estados de erro / carregamento (mesma UX do /jogo) ------------------
  if (loadError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 p-6 text-center">
        <p className="text-lg font-semibold">Não foi possível carregar esta transmissão</p>
        <p className="text-sm opacity-70">O link pode ter expirado ou a sala não existe mais.</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mt-2 rounded-full bg-white px-5 py-2 text-sm font-bold text-neutral-900 active:scale-95 transition"
        >
          Voltar ao início
        </button>
      </div>
    )
  }

  if (loading || !gameState) {
    return <div className="flex items-center justify-center min-h-screen">Carregando transmissão ao vivo...</div>
  }

  // --- Derivações de exibição (idênticas ao /jogo, mas view-only) ----------
  const gs = gameState
  const finished = gs.finished
  const isTiebreak = gs.isTiebreak
  const isTennisFamily = familyOf(sport) === "tennis"
  const unitLabel = isTennisFamily ? "Set" : "Game"
  const totalUnits = (rulesRef.current?.bestOf as number) || 3
  const cols = buildScoreCols(gs, { bestOf: totalUnits, isTennisFamily, finished, isTiebreak })
  // Quais unidades foram concedidas (replay das ações no motor): nelas a tabela
  // mostra só o indicador de vitória, nunca o placar de pontos fictício.
  const conceded = concededUnitFlags(
    sportById(sport).module,
    rulesRef.current,
    firstServerRef.current,
    actionsRef.current,
  )
  const pointOf = (side: Side): string => (finished ? "" : formatPoint(sport, gs[side], isTiebreak))

  /**
   * O NÚMERO HERÓI — o MESMO que o juiz vê no /jogo (`bigNumber` de lá).
   *
   * Espelhar é o requisito, não um detalhe de estilo: se a transmissão
   * mostrasse outra coisa, quem assiste e quem marca estariam olhando placares
   * diferentes — e o espectador não tem como saber qual é o certo.
   *  • tiebreak → os pontos do tiebreak;
   *  • modo GAMES → os games (é o que cada toque incrementa lá);
   *  • modo PONTOS → 0/15/30/40/AD no tênis, contagem corrida nos de rally.
   */
  const numeroHeroi = (side: Side): string => {
    if (finished) return gs.winner === side ? "★" : ""
    if (isTiebreak) return gs[side].tiebreakPoints.toString()
    if (scoreType === "games") return gs[side].games.toString()
    return formatPoint(sport, gs[side], false)
  }
  const viewClub = clube ? clubFromCacheOrBundle(clube) : null
  const winnerName = gs.winner === "B" ? nameB : gs.winner === "A" ? nameA : ""

  // Os slots de cada lado, no formato atual. Em simples só o primeiro joga.
  const slotsDoLado = (side: Side): SlotKey[] =>
    side === "A"
      ? gameType === "duplas"
        ? ["blue1", "blue2"]
        : ["blue1"]
      : gameType === "duplas"
        ? ["red1", "red2"]
        : ["red1"]

  /** Número GLOBAL do lugar (blue1=1 … red2=4) — vira o "P2" do avatar vazio. */
  const numeroDoSlot = (slot: SlotKey): number => SLOTS.indexOf(slot) + 1

  /**
   * O texto do avatar sem foto. DUAS letras, não uma: num telão, "P" e "P" não
   * distinguem ninguém. Nome real → iniciais ("Eric Nice" → EN; nome único →
   * as duas primeiras letras). Slot vazio → o número do lugar ("P2").
   */
  const iniciaisDoSlot = (slot: SlotKey, nome: string, temNome: boolean): string => {
    if (!temNome) return `P${numeroDoSlot(slot)}`
    const partes = nome.trim().split(/\s+/).filter(Boolean)
    if (partes.length >= 2) return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
    return partes[0].slice(0, 2).toUpperCase()
  }

  /** Tudo que a linha de um jogador precisa, já com os fallbacks resolvidos. */
  const infoDoSlot = (slot: SlotKey, side: Side, idx: number) => {
    const id = slotIds[slot]
    const card = id ? cards.get(id) : undefined
    // O nome CANÔNICO do perfil ganha do string do state quando existe: é o que
    // a pessoa editou no /perfil, e o state pode carregar um apelido antigo.
    const bruto = (card?.displayName || nomes[slot] || "").trim()
    const rotulo =
      gameType === "duplas"
        ? `Jogador ${side === "A" ? idx + 1 : idx + 3}`
        : `Jogador ${side === "A" ? 1 : 2}`
    return {
      nome: bruto || rotulo,
      avatarUrl: card?.avatarUrl ?? null,
      iniciais: iniciaisDoSlot(slot, bruto, Boolean(bruto)),
      verificado: Boolean(id),
      // SÓ o parceiro que saca fica amarelo — é para isto que a T1a trouxe o
      // serverPlayerIdx. Em simples o índice é sempre 0.
      saca: displayServer(gs) === side && serverPlayerIdx(side) === idx,
    }
  }

  return (
    <div
      className={`relative flex h-[100dvh] flex-col overflow-hidden mono-tabular ${themeClassName(theme)}`}
      style={{ backgroundColor: "var(--palco-fundo)", color: "var(--palco-texto)" } as CSSProperties}
    >
      {/* ================= FAIXA SUPERIOR: onde · quem hospeda · agora ========
          O escudo do clube fica no CENTRO porque ali ele diz "o jogo é aqui".
          Colado nos jogadores diria "estes jogadores são daqui" — outra coisa,
          que só se separa no interclubes (a filiação por lado é camada futura). */}
      <header className="tv-faixa flex items-center justify-between gap-3 px-3 py-2 md:px-6 md:py-3">
        <span className="min-w-0 flex-1 truncate text-xs font-bold uppercase tracking-[0.15em] opacity-80 md:text-lg">
          Quadra {quadra}
        </span>

        {viewClub?.logo ? (
          <div className="relative aspect-square h-9 shrink-0 overflow-hidden rounded-full ring-1 ring-white/20 md:h-14">
            <Image src={viewClub.logo} alt={viewClub.nome} fill sizes="56px" className="object-cover" />
          </div>
        ) : (
          <span aria-hidden className="shrink-0" />
        )}

        {/* AO VIVO no VERDE DA MARCA (#00FF6F). O pulso e o relógio correndo são
            o que dizem "isto está acontecendo agora" — é o que separa uma
            transmissão de uma captura de tela —, então têm peso, não opacidade
            baixa. Verde e não vermelho: o vermelho é a cor de gravação/alerta;
            aqui é a cor do Flow, e a tela inteira ganha a assinatura. */}
        <span className="flex min-w-0 flex-1 items-center justify-end gap-2 md:gap-3">
          {!finished && (
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 animate-pulse rounded-full md:h-2.5 md:w-2.5"
                style={{ backgroundColor: "var(--l-green)" }}
                aria-hidden
              />
              <span
                className="text-xs font-black uppercase tracking-[0.15em] md:text-lg"
                style={{ color: "var(--l-green)" }}
              >
                Live
              </span>
            </span>
          )}
          <span
            className="text-sm font-bold tabular-nums md:text-xl"
            style={{ color: "var(--l-green)" }}
          >
            {elapsedTime}
            {isTiebreak ? " · TB" : ""}
          </span>
        </span>
      </header>

      {/* ================= OS DOIS LADOS: pílula NO TOPO, ponto no centro ===== */}
      <main
        className="flex min-h-0 flex-1 flex-col landscape:flex-row"
        style={{ gap: "1px", backgroundColor: "var(--palco-divisor)" }}
      >
        {(["A", "B"] as Side[]).map((side) => {
          const venceu = gs.winner === side
          const slots = slotsDoLado(side)
          return (
            <section
              key={side}
              data-side={side.toLowerCase()}
              className="tv-lado"
              style={finished && !venceu ? { opacity: 0.5 } : undefined}
            >
              {/* A PÍLULA ancorada NO TOPO (shrink-0), largura cheia: os dois
                  avatares vão para as PONTAS e os nomes ocupam o meio. */}
              <div className="tv-pilula w-full shrink-0">
                {slots.map((slot, idx, arr) => {
                  const info = infoDoSlot(slot, side, idx)
                  const ultimo = idx === arr.length - 1 && arr.length > 1
                  // O 2º parceiro é ESPELHADO: nome primeiro, avatar na ponta
                  // direita. É o que faz os dois rostos emoldurarem a pílula.
                  return (
                    <span key={slot} className="contents">
                      {/* O TRAÇO entre os dois nomes, e não no canto: ali ele
                          não separava nada. Renderizado ANTES do 2º parceiro
                          para cair exatamente no meio da pílula. */}
                      {idx > 0 && <span className="tv-dash">|</span>}
                      <span
                        className={`flex min-w-0 flex-1 items-center gap-1.5 md:gap-2 ${
                          ultimo ? "flex-row-reverse" : ""
                        }`}
                      >
                      <PlayerAvatar
                        url={info.avatarUrl}
                        nome={info.nome}
                        iniciais={info.iniciais}
                        size={30}
                        className="md:!h-12 md:!w-12"
                      />
                      <span
                        className={`flex min-w-0 flex-1 items-center gap-1.5 ${
                          ultimo ? "flex-row-reverse" : ""
                        }`}
                      >
                        <span className={`tv-nome truncate ${info.saca ? "tv-nome-saque" : ""}`}>
                          {info.nome}
                        </span>
                        {info.verificado && (
                          <BadgeCheck
                            className="h-3.5 w-3.5 shrink-0 text-emerald-400 md:h-5 md:w-5"
                            aria-label="Identidade verificada pelo Flow"
                          />
                        )}
                        {info.saca && <span className="tv-bola" aria-label="saque" />}
                        </span>
                      </span>
                    </span>
                  )
                })}
              </div>

              {/* O HERÓI ocupa TODO o resto do lado, centralizado. */}
              <span className="flex min-h-0 flex-1 items-center justify-center">
                <span className="tv-ponto">{numeroHeroi(side)}</span>
              </span>
            </section>
          )
        })}
      </main>

      {/* ================= FAIXA INFERIOR: o resumo + a marca ================= */}
      <footer className="tv-faixa flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-3 py-2 md:gap-x-8 md:px-6 md:py-3">
        {/* RESUMO COMPACTO: uma caixa que se ajusta ao conteúdo, centralizada —
            e não duas colunas esticadas de ponta a ponta, que no desktop abriam
            um vazio no meio. Mesmo vocabulário das pílulas (avatar + nome), para
            as duas faixas parecerem a mesma tela. */}
        <div className="tv-resumo">
          {(["A", "B"] as Side[]).map((side) => {
            const slots = slotsDoLado(side)
            return (
              <div key={side} className="flex items-center gap-2 md:gap-3">
                {/* O ESCUDO DO CLUBE como avatar do TIME. Antes era a foto do 1º
                    jogador — e o 2º ficava sem nada, o que dava a impressão de
                    que a linha era de uma pessoa, não de uma dupla. O escudo é
                    institucional e vale para os dois nomes.
                    Sem clube (jogo avulso/praia) entra o "w" da marca, que é a
                    regra registrada para o lugar do logo quando não há contexto. */}
                {viewClub?.logo ? (
                  <span className="relative aspect-square h-5 shrink-0 overflow-hidden rounded-full ring-1 ring-white/20 md:h-7">
                    <Image src={viewClub.logo} alt={viewClub.nome} fill sizes="28px" className="object-cover" />
                  </span>
                ) : (
                  <FlowMark size={20} className="shrink-0 opacity-70 md:!h-7 md:!w-7" />
                )}

                {/* NOMES ABREVIADOS, um <span> por jogador — precisam ser
                    separados para o sacador poder ficar amarelo aqui também. */}
                <span className="flex w-32 min-w-0 items-center gap-1 md:w-64">
                  {slots.map((slot, idx) => {
                    const info = infoDoSlot(slot, side, idx)
                    return (
                      <span key={slot} className="flex min-w-0 items-center gap-1">
                        {idx > 0 && <span className="shrink-0 opacity-40">/</span>}
                        <span
                          className={`truncate text-[11px] font-bold uppercase tracking-wide md:text-sm ${
                            info.saca ? "tv-nome-saque" : "text-white/85"
                          }`}
                        >
                          {abreviar(info.nome)}
                        </span>
                      </span>
                    )
                  })}
                </span>

                {cols.map((c) => (
                  <span
                    key={c.setNum}
                    className={`w-4 shrink-0 text-center text-xs font-bold tabular-nums md:w-7 md:text-lg ${
                      !c.played ? "opacity-25" : c.current ? "tv-nome-saque" : "text-white/75"
                    }`}
                  >
                    {c.played ? (side === "A" ? c.a : c.b) : "–"}
                  </span>
                ))}
              </div>
            )
          })}
        </div>

        {/* A MARCA, CLICÁVEL: quem assiste a transmissão de um amigo é
            exatamente quem ainda não conhece o Flow. É o único elemento
            interativo, e não contradiz "transmissão é exibição" — ele não
            controla o jogo, abre a porta. */}
        <Link
          href="/"
          data-flow-cta="placar-marca"
          aria-label="Conhecer o Flow"
          className="shrink-0 opacity-80 transition-opacity hover:opacity-100"
        >
          <FlowWordmark size={22} />
        </Link>
      </footer>

      {/* ============ FAIXA DO PATROCINADOR — espaço próprio, na base ========
          Antes ele FLUTUAVA sobre o canto inferior direito, por cima do lado B
          — invadia a dupla e o número, e uma marca paga não deve competir com o
          jogo nem atrapalhá-lo. Agora tem uma faixa SÓ dela, no rodapé de tudo,
          com o logo CENTRALIZADO: sai de cima do placar e ganha um lugar nobre,
          que é o que um patrocinador compra.

          Só existe quando HÁ patrocinador — sem ele a faixa nem renderiza, e o
          placar recupera a altura inteira. */}
      {viewAd?.logoUrl && (
        <section className="tv-faixa flex shrink-0 items-center justify-center px-3 py-2 md:py-3">
          <div className="flex items-center gap-3 rounded-xl bg-white px-4 py-1.5 shadow-md ring-1 ring-black/5 md:gap-4 md:px-6 md:py-2">
            <span className="shrink-0 text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-500 md:text-[11px]">
              Oferecimento
            </span>
            <div className="relative h-7 w-24 md:h-10 md:w-36">
              <Image src={viewAd.logoUrl} alt={viewAd.name} fill sizes="144px" className="object-contain" />
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
