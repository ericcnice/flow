"use client"

/**
 * A TELA do telão: vídeo ao vivo + placar do Flow, lado a lado.
 *
 * ⚠️ O PLACAR É UM IFRAME DO /placar — não uma reimplementação. A transmissão
 * já resolve motor, sync, avatar, saque e patrocinador; refazer isso aqui seria
 * criar um segundo placar para manter em dia com o primeiro. O telão COMPÕE.
 *
 * ⚠️ O DELAY É ASSUMIDO, não um defeito a esconder: o YouTube ao vivo atrasa
 * 10-30s e o placar do Flow é instantâneo, então o ponto aparece ANTES da
 * jogada. Não há como sincronizar (não controlamos o encoder), e atrasar o
 * placar de propósito mataria o que ele tem de melhor. O clube já convive com
 * isso — ele mesmo manda um buffer de 15s aos jogadores.
 */

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, Radio } from "lucide-react"
import { FlowWordmark } from "@/components/brand/flow-wordmark"

/** De quanto em quanto tempo a TV procura por uma troca de partida. */
const RECHECAR_MS = 20000

export function TelaoTela({
  clubeNome,
  clubeLogo,
  quadra,
  embedUrl,
  canalUrl,
  placarUrl,
}: {
  clubeNome: string
  clubeLogo: string
  quadra: string
  /** null = esta quadra não tem vídeo configurado — o placar ocupa a tela. */
  embedUrl: string | null
  canalUrl: string | null
  /** null = ninguém ligou uma partida a esta quadra ainda. */
  placarUrl: string | null
}) {
  const router = useRouter()

  // A TV fica ligada horas; quem opera está em OUTRO aparelho. Sem isto, trocar
  // a partida no celular exigiria alguém ir até a TV recarregar a página.
  // `router.refresh()` refaz só o Server Component — não recarrega o iframe do
  // vídeo, então a transmissão não pisca a cada 20s.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), RECHECAR_MS)
    return () => clearInterval(t)
  }, [router])

  const [videoFalhou, setVideoFalhou] = useState(false)
  const [logoFalhou, setLogoFalhou] = useState(false)

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#04060d] text-white">
      {/* FAIXA: o clube à esquerda, a quadra ao centro, o Flow à direita. */}
      <header className="flex shrink-0 items-center justify-between gap-4 px-5 py-3">
        <span className="flex min-w-0 items-center gap-3">
          {/* PLACEHOLDER VISÍVEL quando o logo não carrega — antes a imagem era
              simplesmente ESCONDIDA, e um asset faltando ficava idêntico a "este
              clube não tem logo mesmo". Foi o que fez procurar o problema no
              lugar errado. A inicial num disco marcado diz "falta algo aqui". */}
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/5 ring-1 ring-white/15 md:h-12 md:w-12"
            aria-hidden
          >
            {clubeLogo && !logoFalhou ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={clubeLogo}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setLogoFalhou(true)}
              />
            ) : (
              <span className="text-sm font-black text-white/45 md:text-lg">
                {clubeNome.trim().charAt(0).toUpperCase() || "?"}
              </span>
            )}
          </span>
          <span className="truncate text-sm font-black uppercase tracking-[0.15em] md:text-xl">
            {clubeNome}
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2 rounded-full bg-white/5 px-3 py-1 ring-1 ring-white/10">
          <Radio className="h-3.5 w-3.5" style={{ color: "var(--l-green)" }} />
          <span className="text-xs font-black uppercase tracking-[0.2em] md:text-sm">
            Quadra {quadra.replace(/^q/i, "")}
          </span>
        </span>

        <span className="hidden shrink-0 opacity-60 md:block">
          <FlowWordmark size={22} />
        </span>
      </header>

      {/* O SPLIT. Empilhado no estreito, lado a lado no largo — um telão é
          horizontal, mas a mesma página serve para conferir num celular. */}
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 px-3 pb-3 lg:grid-cols-12">
        {/* VÍDEO — só quando a quadra TEM vídeo. Sem ele, o placar ocupa a
            tela inteira: um retângulo preto vazio pareceria transmissão
            quebrada, e há quadras que legitimamente não têm câmera. */}
        {embedUrl && (
        <section className="relative min-h-0 overflow-hidden rounded-2xl bg-black ring-1 ring-white/10 lg:col-span-7">
          <iframe
            src={embedUrl}
            title={`Transmissão ao vivo — ${clubeNome}`}
            className="h-full w-full border-0"
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            onError={() => setVideoFalhou(true)}
          />
          {/* LINK DE ESCAPE — sempre presente, e não só no erro: o YouTube
              devolve uma tela cinza SEM avisar quando o dono do canal não
              liberou o embed, e nenhum evento dispara. Um link discreto é a
              única saída que funciona nos dois casos. */}
          {canalUrl && (
          <a
            href={canalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/70 ring-1 ring-white/20 transition-colors hover:text-white"
          >
            <ExternalLink className="h-3 w-3" />
            Abrir no YouTube
            {videoFalhou && <span className="ml-1 text-amber-400">• embed bloqueado</span>}
          </a>
          )}
        </section>
        )}

        {/* PLACAR */}
        <section
          className={`relative min-h-0 overflow-hidden rounded-2xl bg-black ring-1 ring-white/10 ${
            embedUrl ? "lg:col-span-5" : "lg:col-span-12"
          }`}
        >
          {placarUrl ? (
            <iframe
              key={placarUrl}
              src={placarUrl}
              title={`Placar ao vivo — quadra ${quadra}`}
              className="h-full w-full border-0"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm font-black uppercase tracking-[0.15em] text-white/70">
                Aguardando partida
              </p>
              <p className="max-w-xs text-xs leading-relaxed text-white/35">
                Nenhum jogo ligado a esta quadra. Use a tela de operação para
                conectar a transmissão.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
