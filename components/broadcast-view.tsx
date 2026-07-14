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

import { ScoringEngine } from "@/lib/scoring/engine"
import { sportById, familyOf, formatPoint, defaultRulesFor, buildScoreCols, type SportId } from "@/lib/sports-catalog"
import { themeClassName, type ThemeId } from "@/lib/themes"
import { clubBySlug, adBySlug } from "@/lib/clubs-config"
import type { GameState, Side } from "@/lib/scoring/types"
import { getLiveMatchState } from "@/lib/supabase/live-match"
import { useRealtimeMatch } from "@/lib/hooks/use-realtime-match"

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
  points,
}: {
  cols: ReturnType<typeof buildScoreCols>
  isTennisFamily: boolean
  unitLabel: string
  server: Side
  winner: Side | null
  names: { A: string; B: string }
  points: { A: string; B: string }
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
              </td>
              {cols.map((c) => {
                const games = side === "A" ? c.a : c.b
                return (
                  <td
                    key={c.setNum}
                    className={`sb-set ${c.current ? "sb-current sb-live" : ""} ${!c.played ? "sb-future" : ""}`}
                    title={c.current ? "Parcial — game em andamento (ainda não fechado)" : undefined}
                  >
                    {c.played ? games : "–"}
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
  const [quadra, setQuadra] = useState("1")
  // Simples vs. duplas: define se a linha mostra 1 nome ou o par. Vem da URL
  // (&gameType=); ausente = simples (default seguro). O servidor não guarda.
  const [gameType, setGameType] = useState<string | null>(null)

  const [nameA, setNameA] = useState("Jogador 1")
  const [nameB, setNameB] = useState("Jogador 2")

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
        }

        rebuildEngine(rRules, rFirst, cleanActions)
        // O cronômetro do espectador conta desde a abertura (o startTime real não
        // é transmitido) — mesmo comportamento dos devices remotos do /jogo.
        setStartTime(new Date())
        setLoading(false)

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
  }, [rt.remotePlayers, rt.remoteFirstServer, rt.remoteRules, rt.remoteTheme, gameType])

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
  const pointOf = (side: Side): string => (finished ? "" : formatPoint(sport, gs[side], isTiebreak))
  const viewClub = clube ? clubBySlug(clube) : null
  const viewAd = adBySlug(adSlug)
  const winnerName = gs.winner === "B" ? nameB : gs.winner === "A" ? nameA : ""

  return (
    <div
      className={`relative flex flex-col h-[100dvh] overflow-hidden mono-tabular ${themeClassName(theme)}`}
      style={{ backgroundColor: "var(--palco-fundo)", color: "var(--palco-discreto)" } as CSSProperties}
    >
      {/* Logo do CLUBE: topo-centro, discreto, estilo Wimbledon/US Open (mesmo
          padrão da abertura e do topo do placar do /jogo). */}
      {viewClub?.logo && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-10">
          <div className="relative aspect-square h-12 md:h-16 rounded-full overflow-hidden ring-1 ring-white/15 shadow-md">
            <Image src={viewClub.logo} alt={viewClub.nome} fill sizes="64px" className="object-cover" />
          </div>
        </div>
      )}

      {/* Placar de transmissão: SEMPRE visível, tela cheia (não é mais overlay
          temporário). Nenhum elemento é clicável — é 100% leitura. */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="glass-panel-anim w-full max-w-5xl flex flex-col gap-3 md:gap-5">
          {/* Topo discreto: quadra + cronômetro. */}
          <div className="w-full flex items-center justify-between text-[11px] md:text-sm uppercase tracking-widest opacity-70">
            <span>Quadra {quadra}</span>
            <span className="tabular-nums">
              {elapsedTime}
              {isTiebreak ? " · TB" : ""}
            </span>
          </div>

          <div className="w-full overflow-x-auto">
            <BroadcastScoreboard
              cols={cols}
              isTennisFamily={isTennisFamily}
              unitLabel={unitLabel}
              server={gs.server}
              winner={gs.winner ?? null}
              names={{ A: nameA, B: nameB }}
              points={{ A: pointOf("A"), B: pointOf("B") }}
            />
          </div>

          {/* Rodapé: vencedor (se encerrada) ou selo "ao vivo". */}
          <div className="w-full flex items-center justify-between gap-3">
            {finished ? (
              <span className="text-xs md:text-sm font-bold uppercase tracking-[0.2em] opacity-90">
                Vencedor: {winnerName}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 text-[10px] uppercase tracking-widest opacity-60">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" aria-hidden />
                Ao vivo
              </span>
            )}
            <span />
          </div>
        </div>
      </div>

      {/* Logo do PATROCINADOR: marca d'água discreta no rodapé-direito, com
          "Oferecimento" (mesmo padrão da tela de fim de jogo). */}
      {viewAd?.logo && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-10 flex items-center gap-2">
          <span className="text-[9px] md:text-[10px] font-bold uppercase tracking-[0.2em] opacity-55">
            Oferecimento
          </span>
          <div className="rounded-lg bg-black/85 p-1.5 shadow-md">
            <div className="relative h-8 md:h-10 w-24 md:w-28">
              <Image src={viewAd.logo} alt={viewAd.nome} fill sizes="120px" className="object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
