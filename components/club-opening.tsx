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

// Duração de cada tela da abertura: Tela 1 (logo do clube + esporte/quadra) e o
// "logo do Nicholas sozinho" da Tela 2 antes de encolher e mostrar o JOGAR.
const SCREEN_MS = 4000

// Logo do Nicholas na Tela 2 (fundo PRETO = var(--palco-fundo) do tema neutro).
// Os dois arquivos têm fundo SÓLIDO (sem transparência): nicholas-light.png tem
// fundo BRANCO e nicholas-dark.png tem fundo PRETO com o brasão claro. Para não
// aparecer um retângulo, casamos o fundo do arquivo com o da tela → usamos a
// versão de fundo PRETO sobre a tela preta.
const NICHOLAS_LOGO = "/nicholas-dark.png"

export function ClubOpening({ hasAd, ad }: { hasAd: boolean; ad?: string }) {
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
      // Patrocinador/anúncio da abertura (ex.: "ad1"). Só entra quando a rota
      // tem /[ad]; sem ele o campo nem aparece na config (retrocompatível).
      ...(ad ? { ad } : {}),
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
          {/* Container do logo em % da METADE: centralizado (metade = tela cheia)
              fica grande/presente; ao encolher (metade = ~50%) acompanha, mas com
              % maior preenche melhor a metade esquerda mantendo margem. object-
              contain garante que nunca estoura. */}
          <div className="relative w-[86%] h-[72%]">
            <Image src={NICHOLAS_LOGO} alt="Nicholas" fill sizes="70vw" priority className="object-contain" />
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
        {/* Recorte CIRCULAR (avatar): o brasão do SPAC já é redondo, então o
            círculo respeita a forma (o campo azul vira a borda do "badge"). A
            caixa é quadrada e limitada pela menor dimensão da metade (altura em
            retrato, largura em paisagem). */}
        <div className="relative aspect-square rounded-full overflow-hidden portrait:h-[58%] landscape:w-[64%] max-h-[82%] max-w-[82%]">
          <Image src={ctx.club.logo} alt={ctx.club.nome} fill sizes="60vw" priority className="object-cover" />
        </div>
      </div>

      {/* Metade B: ESPORTE forte no topo → "Quadra" discreto → NÚMERO grande (2
          dígitos), na altura do número gigante do placar. */}
      <div
        className="flex-1 basis-0 flex flex-col items-center justify-center px-4 text-center min-w-0 min-h-0"
        style={{ backgroundColor: "var(--lado-b-bg)", color: "var(--lado-b-texto)" }}
      >
        <div className="font-black uppercase tracking-[0.1em] leading-tight text-2xl md:text-5xl">
          {ctx.sportName}
        </div>
        <div className="font-light uppercase tracking-[0.35em] opacity-70 text-xs md:text-base mt-3">
          Quadra
        </div>
        <div className="font-black tabular-nums leading-none text-[26vw] landscape:text-[30vh]">
          {ctx.quadraNum.padStart(2, "0")}
        </div>
      </div>
    </div>
  )
}
