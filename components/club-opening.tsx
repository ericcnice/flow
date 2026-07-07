"use client"

/**
 * Sequência de ABERTURA da jornada de contexto de clube (acionada pelo SCAN da
 * URL /[clube]/[esporte]/[quadra][/ad]). Aparece SEMPRE ao acessar a rota — sem
 * localStorage, sem "uma vez": o próprio acesso é o gatilho.
 *
 *  TELA 1 (~2,5s, cai sozinha): duas metades na MESMA linguagem do placar
 *  (retrato = empilhadas, paisagem = lado a lado — ver .palco-main). Metade A:
 *  logo do clube. Metade B: nome do esporte em cima + "Quadra N" grande embaixo.
 *
 *  TELA 2 (só quando a rota tem /ad): logo do Nicholas centralizado ~2,5s; depois
 *  ENCOLHE para uma metade (via transição de flex-basis) e na outra metade entra
 *  o botão redondo "JOGAR". Sem /ad, a Tela 1 vai direto para o jogo.
 *
 * Ao final, grava a config no MESMO formato do /setup (tennis_match_${quadra} +
 * tennis_engine_${quadra}) — acrescentando `clube` — e navega para /jogo. NÃO
 * passa pela tela de /setup e NÃO altera lib/scoring.
 */

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import { resolveClubContext } from "@/lib/clubs-config"
import { defaultRulesFor } from "@/lib/sports-catalog"
import { DEFAULT_THEME } from "@/lib/themes"

const SCREEN_MS = 2500

// Logo do Nicholas: fundo escuro na Tela 2 → usa a versão CLARA (contrasta).
const NICHOLAS_LOGO = "/nicholas-light.png"

export function ClubOpening({ hasAd }: { hasAd: boolean }) {
  const router = useRouter()
  const params = useParams<{ clube: string; esporte: string; quadra: string }>()

  const ctx = useMemo(
    () => resolveClubContext(params?.clube, params?.esporte, params?.quadra),
    [params?.clube, params?.esporte, params?.quadra],
  )

  // "one" = Tela 1; "two" = Tela 2 (com `split` controlando o encolhimento).
  const [phase, setPhase] = useState<"one" | "two">("one")
  const [split, setSplit] = useState(false)

  // Grava a config pré-configurada (mesmo formato do /setup) e vai pro jogo.
  const startGame = () => {
    if (!ctx) return
    const { club, sportId, quadra } = ctx
    const rules = defaultRulesFor(sportId)
    const config = {
      quadra,
      sport: sportId,
      theme: DEFAULT_THEME,
      clube: club.id,
      gameType: "simples",
      scoreType: "pontos",
      players: { blue1: "Jogador 1", blue2: "Jogador 2", red1: "Jogador 3", red2: "Jogador 4" },
      startTime: new Date().toISOString(),
      maxSets: rules.bestOf ?? 3,
    }
    localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(config))
    localStorage.setItem(
      `tennis_engine_${quadra}`,
      JSON.stringify({ rules, firstServer: "A", actions: [] }),
    )
    localStorage.removeItem(`tennis_score_${quadra}`)
    router.push(`/jogo?quadra=${quadra}&sport=${sportId}`)
  }

  useEffect(() => {
    // Rota inválida (clube/esporte/quadra) → volta pra home.
    if (!ctx) {
      router.replace("/")
      return
    }
    const timers: ReturnType<typeof setTimeout>[] = []
    // Fim da Tela 1: sem /ad → joga; com /ad → Tela 2 (centralizada → encolhe).
    timers.push(
      setTimeout(() => {
        if (!hasAd) {
          startGame()
          return
        }
        setPhase("two")
        timers.push(setTimeout(() => setSplit(true), SCREEN_MS))
      }, SCREEN_MS),
    )
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, hasAd])

  if (!ctx) return null

  // ---------------------------------------------------------------- TELA 2 (ad)
  if (phase === "two") {
    return (
      <div
        className="tema-neutro palco-main flex h-[100dvh] w-screen overflow-hidden"
        style={{ backgroundColor: "var(--palco-fundo)", color: "var(--palco-texto)" }}
      >
        {/* Metade do LOGO: sempre presente; encolhe quando `split` abre a outra
            metade (o container do logo é % da metade, então acompanha o tamanho). */}
        <div className="flex-1 basis-0 flex items-center justify-center min-w-0 min-h-0">
          <div className="relative w-[70%] h-[45%]">
            <Image src={NICHOLAS_LOGO} alt="Nicholas" fill sizes="60vw" priority className="object-contain" />
          </div>
        </div>

        {/* Metade do BOTÃO: cresce de 0 → metade (transição = "encolher o logo"). */}
        <div
          className="flex items-center justify-center overflow-hidden min-w-0 min-h-0
            transition-[flex-grow] duration-700 ease-out"
          style={{ flexGrow: split ? 1 : 0, flexBasis: 0 }}
        >
          {split && (
            <button
              type="button"
              onClick={startGame}
              aria-label="Jogar"
              className="aspect-square w-[42vw] max-w-[240px] rounded-full font-black tracking-widest
                text-2xl md:text-4xl uppercase active:scale-95 transition-transform shadow-2xl
                animate-[clubFadeIn_0.4s_ease-out]"
              style={{ backgroundColor: "var(--lado-a-bg)", color: "var(--lado-a-texto)" }}
            >
              Jogar
            </button>
          )}
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------- TELA 1
  return (
    <div
      className="tema-neutro palco-main flex h-[100dvh] w-screen overflow-hidden animate-[clubFadeIn_0.4s_ease-out]"
      style={{ gap: "1px", backgroundColor: "var(--palco-divisor)" }}
    >
      {/* Metade A: logo do clube (fundo claro — seguro para logos coloridos). */}
      <div
        className="flex-1 basis-0 flex items-center justify-center min-w-0 min-h-0"
        style={{ backgroundColor: "var(--lado-a-bg)", color: "var(--lado-a-texto)" }}
      >
        <div className="relative w-[68%] h-[46%]">
          <Image src={ctx.club.logo} alt={ctx.club.nome} fill sizes="60vw" priority className="object-contain" />
        </div>
      </div>

      {/* Metade B: nome do esporte (cima) + "Quadra N" grande (embaixo). */}
      <div
        className="flex-1 basis-0 flex flex-col items-center justify-center gap-3 px-4 text-center min-w-0 min-h-0"
        style={{ backgroundColor: "var(--lado-b-bg)", color: "var(--lado-b-texto)" }}
      >
        <div className="uppercase tracking-[0.2em] font-semibold opacity-80 text-lg md:text-3xl">
          {ctx.sportName}
        </div>
        <div className="font-black leading-none text-5xl md:text-8xl">Quadra {ctx.quadraNum}</div>
      </div>
    </div>
  )
}
