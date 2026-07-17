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
 *  TELA 2 (quando um patrocinador RESOLVE — por /ad na URL, ou por associação
 *  da quadra no banco): logo em cartão claro centralizado ~2,5s; depois ENCOLHE
 *  para uma metade (via transição de flex-basis) e na outra metade entra o botão
 *  redondo "JOGAR". Sem patrocinador, a Tela 1 vai direto para o jogo.
 *
 * Ao final, grava a config no MESMO formato do /setup (tennis_match_${quadra} +
 * tennis_engine_${quadra}) — acrescentando `clube` — e navega para /jogo. NÃO
 * passa pela tela de /setup e NÃO altera lib/scoring.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import { resolveClubContext } from "@/lib/clubs-config"
import { resolveSponsor, resolveSponsorForCourt, type Sponsor } from "@/lib/supabase/sponsors"
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

export function ClubOpening({ ad }: { ad?: string }) {
  const router = useRouter()
  const params = useParams<{ clube: string; esporte: string; quadra: string }>()

  const ctx = useMemo(
    () => resolveClubContext(params?.clube, params?.esporte, params?.quadra),
    [params?.clube, params?.esporte, params?.quadra],
  )

  // Patrocinador da abertura. DUAS fontes, escolhidas pela presença de `ad`:
  //  - `ad` presente (rota /[ad], cartaz impresso legado): resolve por SLUG, com
  //    ADS estático primeiro — o QR do Nicholas nunca toca rede.
  //  - `ad` ausente (rota base): resolve POR QUADRA (venue+esporte+quadra) em
  //    court_sponsors, com o patrocinador geral do clube como fallback.
  // Ambas devolvem o mesmo Sponsor { name, slug, logoUrl }; `slug` é o que o
  // startGame grava na config para /jogo e /placar re-resolverem depois.
  const [adCfg, setAdCfg] = useState<Sponsor | null>(null)
  // `adResolved` = "já sei se tem patrocinador". Hoje é gate SÓ do log (peça D);
  // o timer NÃO depende mais dele (ver o effect do timer). Nasce false: mesmo a
  // rota base agora consulta o banco antes de saber o patrocinador.
  const [adResolved, setAdResolved] = useState(false)

  useEffect(() => {
    // Espera o ctx: o caminho por quadra precisa de club/esporte/quadra dele.
    if (!ctx) return
    let alive = true
    const pendente =
      ad !== undefined
        ? resolveSponsor(ad)
        : resolveSponsorForCourt(ctx.club.id, ctx.sportId, ctx.quadra)
    pendente.then((s) => {
      if (!alive) return
      setAdCfg(s)
      setAdResolved(true)
    })
    return () => {
      alive = false
    }
  }, [ctx, ad])

  // Log de acesso da quadra (peça D). Fire-and-forget: não atrasa nem quebra a
  // jornada (ver logCourtVisit). Espera `adResolved` para registrar o
  // patrocinador que foi DE FATO mostrado: quando adResolved vira true, adCfg já
  // tem o valor final (os dois saem do mesmo .then), seja da resolução por slug
  // (/[ad]) ou por quadra (rota base). Logamos venue + esporte + quadra da chave
  // já validada por resolveClubContext.
  useEffect(() => {
    if (!ctx || !adResolved) return
    logCourtVisit(ctx.club.id, ctx.sportId, ctx.quadra, adCfg?.slug ?? null)
    // adCfg fica fora das deps de propósito: ele é setado junto de adResolved,
    // então quando este effect roda o slug já é o final. O throttle protege
    // contra qualquer disparo extra.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, adResolved])

  // Espelho do adCfg mais recente para o CALLBACK DO TIMER. O timer arma em t=0
  // e dispara em t+4s com a closure de quando armou (adCfg=null naquele
  // instante); sem este ref ele leria o null congelado e nunca abriria a Tela 2.
  // O antigo `showAdScreen` colapsou aqui: "há patrocinador a mostrar" é
  // exatamente adCfgRef.current !== null (adCfg só é não-nulo quando resolveu).
  const adCfgRef = useRef<Sponsor | null>(null)
  useEffect(() => {
    adCfgRef.current = adCfg
  }, [adCfg])

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
      // Patrocinador da abertura (slug: "ad1", ou o slug do coach). Lê do REF,
      // não do estado: o startGame chamado pelo callback do timer roda numa
      // closure antiga, e só o ref tem o adCfg final. Grava o SLUG, que é o que
      // /jogo e /placar re-resolvem depois. Sem patrocinador o campo nem aparece.
      ...(adCfgRef.current ? { ad: adCfgRef.current.slug } : {}),
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
    // O relógio arma SEMPRE em t=0, sem esperar a resolução do patrocinador — é
    // isso que mantém a jornada instantânea (a rota base não ganha nenhuma
    // latência de rede antes da Tela 1 começar). A decisão fica para o FIM dos
    // 4s, lida via adCfgRef para a closure não congelar um adCfg velho.
    const timers: ReturnType<typeof setTimeout>[] = []
    timers.push(
      setTimeout(() => {
        // t+4s: a resolução (teto de 2s nas resolveSponsor*) já terminou no
        // caminho normal. Se uma rede patológica passou dos 4s, adCfgRef ainda é
        // null → joga sem patrocinador. NUNCA segura o jogador esperando rede.
        if (adCfgRef.current) {
          setPhase("two")
          timers.push(setTimeout(() => setSplit(true), SCREEN_MS))
        } else {
          startGame()
        }
      }, SCREEN_MS),
    )
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx])

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
