"use client"

/**
 * O PALCO do modo DESTAQUE: uma quadra grande, vídeo + placar.
 *
 * ⚠️ O PLACAR É UM IFRAME DO /placar — não uma reimplementação. A transmissão
 * já resolve motor, sync, avatar, saque e patrocinador; refazer isso aqui seria
 * criar um segundo placar para manter em dia com o primeiro. O telão COMPÕE.
 *
 * ⚠️ UM CONTAINER SÓ para os dois sublayouts, mudando apenas a direção do flex.
 * Montar árvores diferentes para "empilhado" e "lado a lado" desmontaria os
 * iframes a cada troca — e desmontar o iframe do YouTube RECARREGA a
 * transmissão ao vivo, com buffer e tudo. O layout muda; os quadros não param.
 */

import { ExternalLink } from "lucide-react"
import type { SubLayout } from "./telao-prefs"
import type { QuadraTelao } from "./tipos"

export function TelaoHero({
  quadra,
  clubeNome,
  layout,
  comVideo,
}: {
  quadra: QuadraTelao
  clubeNome: string
  layout: SubLayout
  /** false = esta tela pediu só o placar, ou a quadra não tem vídeo. */
  comVideo: boolean
}) {
  const mostraVideo = comVideo && !!quadra.embedUrl
  const empilhado = layout === "stacked"

  return (
    <div
      className={`flex min-h-0 flex-1 gap-3 ${empilhado ? "flex-col" : "flex-col lg:flex-row"}`}
    >
      {mostraVideo && (
        <section
          className="relative min-h-0 overflow-hidden rounded-2xl bg-black ring-1 ring-white/10"
          style={{ flex: empilhado ? "1 1 62%" : "1 1 58%" }}
        >
          <iframe
            // Chaveado pela URL, NÃO pela quadra: com o canal do clube como
            // fallback, várias quadras compartilham o mesmo embed. Chavear por
            // quadra recarregaria a mesma transmissão a cada troca de destaque.
            key={quadra.embedUrl ?? "sem-video"}
            src={quadra.embedUrl ?? ""}
            title={`Transmissão ao vivo — ${clubeNome}`}
            className="h-full w-full border-0"
            allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />

          {/* LINK DE ESCAPE — sempre presente, e não só no erro: o YouTube
              devolve uma tela cinza SEM avisar quando o dono do canal não
              liberou o embed, e nenhum evento dispara. Um link discreto é a
              única saída que funciona nos dois casos. */}
          {quadra.canalUrl && (
            <a
              href={quadra.canalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 ring-1 ring-white/20 transition-colors hover:text-white"
            >
              <ExternalLink className="h-3 w-3" />
              Abrir no YouTube
            </a>
          )}
        </section>
      )}

      <section
        className="relative min-h-0 overflow-hidden rounded-2xl bg-black ring-1 ring-white/10"
        style={{ flex: mostraVideo ? (empilhado ? "1 1 38%" : "1 1 42%") : "1 1 100%" }}
      >
        {quadra.placarUrl ? (
          <iframe
            key={quadra.placarUrl}
            src={quadra.placarUrl}
            title={`Placar ao vivo — quadra ${quadra.numero}`}
            className="h-full w-full border-0"
          />
        ) : (
          <AguardandoPartida />
        )}
      </section>
    </div>
  )
}

/** O estado normal ENTRE jogos — dito com todas as letras, não um vazio. */
export function AguardandoPartida({ compacto = false }: { compacto?: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p
        className={`font-black uppercase tracking-[0.15em] text-white/70 ${
          compacto ? "text-[11px]" : "text-sm"
        }`}
      >
        Aguardando partida
      </p>
      {!compacto && (
        <p className="max-w-xs text-xs leading-relaxed text-white/35">
          Nenhum jogo ligado a esta quadra. Use a tela de operação para conectar
          a transmissão.
        </p>
      )}
    </div>
  )
}
