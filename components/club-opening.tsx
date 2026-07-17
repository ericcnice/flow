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
 *  TELA 2 (só quando a rota tem /ad E o slug resolve para um patrocinador): logo
 *  em cartão claro centralizado ~2,5s; depois ENCOLHE para uma metade (via
 *  transição de flex-basis) e na outra metade entra o botão redondo "JOGAR".
 *  Sem /ad — ou com /ad que não resolve —, a Tela 1 vai direto para o jogo.
 *
 * Ao final, grava a config no MESMO formato do /setup (tennis_match_${quadra} +
 * tennis_engine_${quadra}) — acrescentando `clube` — e navega para /jogo. NÃO
 * passa pela tela de /setup e NÃO altera lib/scoring.
 */

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import { resolveClubContext } from "@/lib/clubs-config"
import { resolveSponsor, type Sponsor } from "@/lib/supabase/sponsors"
import { supabase } from "@/lib/supabase/client"
import { defaultRulesFor } from "@/lib/sports-catalog"
import { DEFAULT_THEME } from "@/lib/themes"

// Duração de cada tela da abertura: Tela 1 (logo do clube + esporte/quadra) e o
// "logo do patrocinador sozinho" da Tela 2 antes de encolher e mostrar o JOGAR.
const SCREEN_MS = 4000

// Janela de deduplicação do log de acesso: a mesma quadra não é logada de novo
// dentro deste intervalo. Também neutraliza o double-fire do StrictMode em dev
// (o segundo disparo cai dentro da janela e é ignorado).
const VISIT_THROTTLE_MS = 30 * 60 * 1000

/**
 * Registra um acesso à quadra (peça D) — FIRE-AND-FORGET, por decisão:
 *  - NUNCA await no caminho da Tela 1: telemetria não pode adicionar latência à
 *    jornada, que é offline-first e precisa continuar instantânea;
 *  - erro é engolido nos DOIS canais da promise (resolve/reject) para não virar
 *    unhandledrejection nem quebrar o jogo se a rede/RPC falhar;
 *  - throttle no localStorage evita inflar a contagem por refresh/StrictMode.
 *
 * `sponsorSlug` é o que foi DE FATO mostrado (adCfg.slug), ou null na rota base.
 * O timestamp é gravado ANTES do envio: um log que falhou não retenta por 30min
 * — para telemetria, perder um acesso esporádico é melhor que martelar a RPC.
 */
function logCourtVisit(
  venueSlug: string,
  sport: string,
  courtSlug: string,
  sponsorSlug: string | null,
): void {
  try {
    const chave = `court_visit_${venueSlug}_${sport}_${courtSlug}`
    const anterior = localStorage.getItem(chave)
    if (anterior) {
      const ts = Number(anterior)
      if (Number.isFinite(ts) && Date.now() - ts < VISIT_THROTTLE_MS) return
    }
    localStorage.setItem(chave, String(Date.now()))
  } catch {
    // localStorage indisponível (aba privada): segue sem throttle. No pior caso
    // conta um acesso a mais — não vale travar a telemetria por isso.
  }

  void supabase
    .rpc("log_court_visit", {
      p_venue_slug: venueSlug,
      p_sport: sport,
      p_court_slug: courtSlug,
      p_sponsor_slug: sponsorSlug,
    })
    .then(
      () => {},
      () => {},
    )
}

export function ClubOpening({ hasAd, ad }: { hasAd: boolean; ad?: string }) {
  const router = useRouter()
  const params = useParams<{ clube: string; esporte: string; quadra: string }>()

  const ctx = useMemo(
    () => resolveClubContext(params?.clube, params?.esporte, params?.quadra),
    [params?.clube, params?.esporte, params?.quadra],
  )

  // Patrocinador da abertura, resolvido por resolveSponsor (ADS estático → cache
  // → RPC). null se a rota não tem /[ad], se o slug é desconhecido ou se a busca
  // falhou. Adicionar patrocinador é cadastrar um coach com logo — ou, para um QR
  // já impresso, uma entrada em ADS.
  const [adCfg, setAdCfg] = useState<Sponsor | null>(null)
  // `adResolved` separa "ainda não sei" de "sei que não tem" — distinção que não
  // existia quando adBySlug respondia na hora, e sem a qual os timers das telas
  // decidiriam com base num null que é só "a RPC não voltou ainda".
  // Sem /[ad] nasce true: o caminho sem patrocinador não espera por nada e
  // continua idêntico ao de antes, sem nem tocar em resolveSponsor.
  const [adResolved, setAdResolved] = useState(!hasAd)

  useEffect(() => {
    if (!hasAd) {
      setAdResolved(true)
      return
    }
    let alive = true
    resolveSponsor(ad).then((s) => {
      if (!alive) return
      setAdCfg(s)
      setAdResolved(true)
    })
    return () => {
      alive = false
    }
  }, [hasAd, ad])

  // Log de acesso da quadra (peça D). Fire-and-forget: não atrasa nem quebra a
  // jornada (ver logCourtVisit). Espera `adResolved` para registrar o
  // patrocinador que foi DE FATO mostrado — na rota base adResolved já nasce
  // true e adCfg é null; na rota /[ad], adCfg já tem o valor final quando
  // adResolved vira true (os dois são setados no mesmo .then). Logamos venue +
  // esporte + quadra da chave já validada por resolveClubContext.
  useEffect(() => {
    if (!ctx || !adResolved) return
    logCourtVisit(ctx.club.id, ctx.sportId, ctx.quadra, adCfg?.slug ?? null)
    // adCfg fica fora das deps de propósito: ele é setado junto de adResolved,
    // então quando este effect roda o slug já é o final. O throttle protege
    // contra qualquer disparo extra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, adResolved])

  // Só há Tela 2 (patrocinador) quando o slug resolve para um patrocinador
  // VÁLIDO. Se `hasAd` mas o slug é desconhecido (ou a busca falhou), tratamos
  // como "sem anúncio": pula a Tela 2 e vai direto ao jogo (graceful), em vez de
  // mostrar um logo fantasma.
  const showAdScreen = adCfg !== null

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
      // Patrocinador da abertura (ex.: "ad1" ou o slug do coach). Só entra
      // quando resolveu para um patrocinador VÁLIDO; grava o SLUG DE URL, que é
      // o que o /placar precisa para reresolver o mesmo logo no aparelho de quem
      // assiste. Sem patrocinador o campo nem aparece (retrocompatível).
      ...(adCfg ? { ad: adCfg.slug } : {}),
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
    // Só arma o relógio DEPOIS de saber se há patrocinador. Sem esta guarda, o
    // timer nasceria com adCfg=null (rumo a startGame), a RPC responderia no
    // meio, showAdScreen viraria true, o effect re-rodaria e o cleanup trocaria
    // o timer por outro de 4s — esticando a Tela 1 sem que ninguém pedisse.
    // Custo: a Tela 1 dura 4s + latência da RPC, e só para slug vindo do banco
    // (ADS resolve num microtask). Sobre 4s, imperceptível — e o timeout de 2s
    // do resolveSponsor é o teto dessa espera.
    if (!adResolved) return

    const timers: ReturnType<typeof setTimeout>[] = []
    // Fim da Tela 1: sem anúncio válido → joga; com anúncio → Tela 2 (centralizada
    // → encolhe).
    timers.push(
      setTimeout(() => {
        if (!showAdScreen) {
          startGame()
          return
        }
        setPhase("two")
        timers.push(setTimeout(() => setSplit(true), SCREEN_MS))
      }, SCREEN_MS),
    )
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, showAdScreen, adResolved])

  if (!ctx) return null

  // ---------------------------------------------------------------- TELA 2 (ad)
  if (phase === "two" && adCfg) {
    return (
      <div
        className="tema-neutro palco-main flex h-[100dvh] w-screen overflow-hidden"
        style={{ backgroundColor: "var(--palco-fundo)", color: "var(--palco-texto)" }}
      >
        {/* Metade do LOGO: sempre presente; encolhe quando `split` abre a outra
            metade (o container do logo é % da metade, então acompanha o tamanho). */}
        <div className="flex-1 basis-0 flex items-center justify-center min-w-0 min-h-0">
          {/* CARTÃO CLARO. O logo do patrocinador é UM só (sponsor_logo_url), sem
              variante escura, e vem de fora: pode ter fundo transparente, branco
              ou colorido. Sobre o preto do palco, um logo de arte escura sumiria
              e um de fundo branco viraria um retângulo solto. O cartão claro
              resolve os dois de uma vez — vira o "papel" onde qualquer logo
              assenta, com o mesmo contraste sempre.

              As medidas (% da METADE) são as de antes, então o encolhimento
              quando `split` abre a outra metade continua igual; o cartão só
              troca o que existe DENTRO da caixa. object-contain garante que
              nunca estoura. */}
          <div className="w-[86%] h-[72%] rounded-3xl bg-white p-[5%] shadow-2xl ring-1 ring-black/5 flex items-center justify-center">
            <div className="relative w-full h-full">
              <Image src={adCfg.logoUrl} alt={adCfg.name} fill sizes="70vw" priority className="object-contain" />
            </div>
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
