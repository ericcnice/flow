"use client"

/**
 * A TELA do telão: a moldura em volta do palco.
 *
 * ⚠️ O DELAY É ASSUMIDO, não um defeito a esconder: o YouTube ao vivo atrasa
 * 10-30s e o placar do Flow é instantâneo, então o ponto aparece ANTES da
 * jogada. Não há como sincronizar (não controlamos o encoder), e atrasar o
 * placar de propósito mataria o que ele tem de melhor. O clube já convive com
 * isso — ele mesmo manda um buffer de 15s aos jogadores.
 *
 * ⚠️ 100dvh SEM ROLAGEM, e é por isso que esta tela não é o protótipo copiado:
 * o protótipo é uma PÁGINA de navegador, que rola. Um telão é uma TV — o que
 * não cabe na altura simplesmente não existe. Daí o carrossel virar uma faixa
 * que rola na HORIZONTAL no rodapé, em vez da grade de cartões do protótipo.
 */

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Columns2, MonitorPlay, Radio, Rows2, Tv2 } from "lucide-react"
import { FlowWordmark } from "@/components/brand/flow-wordmark"
import { TelaoHero } from "./telao-hero"
import { usePrefsTelao } from "./telao-prefs"
import type { QuadraTelao } from "./tipos"

/** De quanto em quanto tempo a TV procura por uma troca de partida. */
const RECHECAR_MS = 20000

export function TelaoTela({
  clubeId,
  clubeNome,
  clubeLogo,
  quadras,
  quadraInicial,
  destaqueFixado,
}: {
  /** Slug do clube — a chave da preferência local (o nome mudaria com a marca). */
  clubeId: string
  clubeNome: string
  clubeLogo: string
  /** Todas as quadras do clube, já resolvidas pelo servidor. */
  quadras: QuadraTelao[]
  /** Quadra que o servidor escolheu (?quadra= ou a padrão da config). */
  quadraInicial: string
  /** true quando veio ?quadra= na URL — a URL vence a preferência da tela. */
  destaqueFixado: boolean
}) {
  const router = useRouter()
  const { prefs, atualizar, alternarSoPlacar } = usePrefsTelao(clubeId)

  // A TV fica ligada horas; quem opera está em OUTRO aparelho. Sem isto, trocar
  // a partida no celular exigiria alguém ir até a TV recarregar a página.
  // `router.refresh()` refaz só o Server Component — não recarrega o iframe do
  // vídeo, então a transmissão não pisca a cada 20s.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), RECHECAR_MS)
    return () => clearInterval(t)
  }, [router])

  // A URL VENCE a preferência local: quem abre /telao?quadra=q3 está fixando
  // aquela TV naquela quadra (é como se pendura um telão numa parede). Sem
  // ?quadra=, a tela usa a sua escolha; se ela apontar para uma quadra que
  // sumiu do catálogo, cai na do servidor em vez de ficar em branco.
  const emCartaz = useMemo(() => {
    const alvo = destaqueFixado ? quadraInicial : (prefs.destaque ?? quadraInicial)
    return quadras.find((q) => q.slug === alvo) ?? quadras.find((q) => q.slug === quadraInicial) ?? quadras[0]
  }, [quadras, prefs.destaque, quadraInicial, destaqueFixado])

  if (!emCartaz) return null

  const temVideo = !!emCartaz.embedUrl
  const soPlacar = prefs.soPlacar.includes(emCartaz.slug)

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#04060d] text-white">
      {/* FAIXA: o clube à esquerda, a quadra em cartaz ao centro, o Flow à
          direita. Uma faixa só — numa TV a altura é o recurso escasso, e o
          protótipo gastava duas barras com o que cabe em uma. */}
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <span className="flex min-w-0 items-center gap-3">
          <Logo nome={clubeNome} src={clubeLogo} />
          <span className="truncate text-sm font-black uppercase tracking-[0.15em] md:text-lg">
            {clubeNome}
          </span>
        </span>

        <span className="flex items-center gap-2">
          <span
            className="rounded-lg px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-white shadow-lg md:text-sm"
            style={{ backgroundImage: "var(--l-grad)" }}
          >
            Quadra {emCartaz.numero}
          </span>
          {emCartaz.placarUrl && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 ring-1 ring-white/10">
              <Radio className="h-3 w-3 animate-pulse" style={{ color: "var(--l-green)" }} />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">
                Ao vivo
              </span>
            </span>
          )}
        </span>

        <span className="flex items-center gap-2">
          {/* CONTROLES DE EXIBIÇÃO — locais a esta tela, e por isso ficam NA
              tela e não na operação. Discretos de propósito: numa TV eles são
              usados uma vez, na hora de montar, e depois só atrapalhariam. */}
          {temVideo && (
            <Grupo>
              <Botao
                ativo={prefs.layout === "split" && !soPlacar}
                onClick={() => {
                  if (soPlacar) alternarSoPlacar(emCartaz.slug)
                  atualizar({ layout: "split" })
                }}
                titulo="Vídeo e placar lado a lado"
              >
                <Columns2 className="h-4 w-4" />
              </Botao>
              <Botao
                ativo={prefs.layout === "stacked" && !soPlacar}
                onClick={() => {
                  if (soPlacar) alternarSoPlacar(emCartaz.slug)
                  atualizar({ layout: "stacked" })
                }}
                titulo="Vídeo em cima, placar embaixo"
              >
                <Rows2 className="h-4 w-4" />
              </Botao>
              <Botao
                ativo={soPlacar}
                onClick={() => alternarSoPlacar(emCartaz.slug)}
                titulo="Só o placar nesta tela"
              >
                <Tv2 className="h-4 w-4" />
              </Botao>
            </Grupo>
          )}
          <span className="hidden opacity-60 md:block">
            <FlowWordmark size={20} />
          </span>
        </span>
      </header>

      <main className="flex min-h-0 flex-1 flex-col gap-3 px-3 pb-3">
        <TelaoHero
          quadra={emCartaz}
          clubeNome={clubeNome}
          layout={prefs.layout}
          comVideo={!soPlacar}
        />

        {/* O CARROSSEL — "mudar o canal pelas quadras". Só existe quando há
            mais de uma: uma faixa com um item só rouba altura da TV para
            oferecer uma escolha que não existe. */}
        {quadras.length > 1 && (
          <nav
            aria-label="Quadras do clube"
            className="flex shrink-0 gap-2 overflow-x-auto pb-0.5"
          >
            {quadras.map((q) => (
              <CartaoQuadra
                key={q.slug}
                quadra={q}
                emCartaz={q.slug === emCartaz.slug}
                fixado={destaqueFixado}
                onEscolher={() => atualizar({ destaque: q.slug })}
              />
            ))}
          </nav>
        )}
      </main>
    </div>
  )
}

/**
 * PLACEHOLDER VISÍVEL quando o logo não carrega — antes a imagem era
 * simplesmente ESCONDIDA, e um asset faltando ficava idêntico a "este clube não
 * tem logo mesmo". Foi o que fez procurar o problema no lugar errado. A inicial
 * num disco marcado diz "falta algo aqui".
 */
function Logo({ nome, src }: { nome: string; src: string }) {
  // ⚠️ ESTADO, e não `display:none` no onError: esconder a imagem quebrada
  // deixaria o espaço VAZIO — de novo indistinguível de "este clube não tem
  // logo". A troca pela inicial só acontece se houver para onde trocar.
  const [falhou, setFalhou] = useState(false)

  return (
    <span
      className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/5 ring-1 ring-white/15 md:h-11 md:w-11"
      aria-hidden
    >
      {src && !falhou ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFalhou(true)}
        />
      ) : (
        <span className="text-sm font-black text-white/45 md:text-lg">
          {nome.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}
    </span>
  )
}

function Grupo({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-0.5 rounded-xl bg-white/[0.04] p-1 ring-1 ring-white/10">
      {children}
    </span>
  )
}

function Botao({
  ativo,
  onClick,
  titulo,
  children,
}: {
  ativo: boolean
  onClick: () => void
  titulo: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      aria-label={titulo}
      title={titulo}
      className={`rounded-lg p-1.5 transition-colors ${
        ativo ? "bg-white/15 text-white" : "text-white/40 hover:text-white/80"
      }`}
    >
      {children}
    </button>
  )
}

/** Um canal do carrossel. Diz o que a quadra TEM, para a escolha ser informada. */
function CartaoQuadra({
  quadra,
  emCartaz,
  fixado,
  onEscolher,
}: {
  quadra: QuadraTelao
  emCartaz: boolean
  /** Com ?quadra= na URL o destaque está travado — o cartão vira informativo. */
  fixado: boolean
  onEscolher: () => void
}) {
  const temPartida = !!quadra.placarUrl

  return (
    <button
      type="button"
      onClick={onEscolher}
      disabled={fixado}
      aria-current={emCartaz ? "true" : undefined}
      className={`flex min-w-[104px] shrink-0 flex-col items-start gap-1 rounded-xl px-3 py-2 text-left ring-1 transition-colors ${
        emCartaz
          ? "bg-white/[0.08] ring-white/30"
          : "bg-white/[0.02] ring-white/10 enabled:hover:bg-white/[0.05]"
      } disabled:cursor-default`}
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="text-xs font-black uppercase tracking-[0.15em] text-white/85">
          Q{quadra.numero}
        </span>
        {/* Dica de que a quadra tem câmera. `aria-hidden` porque a informação
            que decide a escolha (ao vivo / sem partida) está em texto logo
            abaixo — um ícone sem rótulo lido em voz alta só atrapalharia. */}
        {quadra.embedUrl && <MonitorPlay className="h-3 w-3 text-white/30" aria-hidden />}
      </span>
      <span
        className={`text-[10px] font-bold uppercase tracking-[0.12em] ${
          temPartida ? "" : "text-white/25"
        }`}
        style={temPartida ? { color: "var(--l-green)" } : undefined}
      >
        {emCartaz ? "No ar" : temPartida ? "Ao vivo" : "Sem partida"}
      </span>
    </button>
  )
}
