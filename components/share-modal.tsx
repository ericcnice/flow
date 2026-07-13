"use client"

import { useEffect, useMemo, useState } from "react"
import { X, Copy, Check, Share2, Users } from "lucide-react"
import { QRCodeGenerator } from "@/components/qr-code"

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  quadra: string
  /** Esporte da partida — vai na URL (&sport=) p/ o device remoto instanciar o
   *  módulo de scoring certo (squash/padel/etc), já que o servidor não guarda. */
  sport?: string
  /** Tema de cor — vai na URL (&theme=) para o device remoto nascer com o tema
   *  real do dono, não mais "neutro" fixo. */
  theme?: string
  /** Modo de contagem no JOIN (&scoreType=). Ao vivo, a troca propaga via
   *  Realtime (ação set_score_type); este param cobre o estado inicial. */
  scoreType?: string
  matchId?: string
  viewToken?: string
  editToken?: string
  /** Contagem de editores conectados agora (via presence do hook). COSMÉTICO. */
  editorCount: number
  /** Limite exibido no contador "X/Y". Apenas visual — sem enforcement. */
  maxEditors?: number
}

/**
 * Modal de compartilhamento (overlay glass inline, mesmo padrão dos outros
 * overlays da tela de jogo: fecha ao tocar fora, painel com stopPropagation).
 *
 * Duas seções:
 *  - Convidar editor: QR para a URL de edição + contador de editores ao vivo.
 *  - Assistir ao vivo: URL de espectador com "Copiar link" e share nativo.
 *
 * Se a sala Realtime ainda não existe (offline / criação falhou), mostra um
 * estado neutro — o jogo continua funcionando localmente, sem sala.
 */
export function ShareModal({
  isOpen,
  onClose,
  quadra,
  sport,
  theme,
  scoreType,
  matchId,
  viewToken,
  editToken,
  editorCount,
  maxEditors = 3,
}: ShareModalProps) {
  const [copied, setCopied] = useState(false)

  // origin só existe no client; o modal só abre por interação, mas guardamos
  // com useState/useEffect para evitar qualquer leitura no SSR.
  const [origin, setOrigin] = useState("")
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin)
  }, [])

  const ready = Boolean(matchId && viewToken && editToken)

  // Formato das URLs (ver explicação no PR): reaproveitam o estilo de query já
  // usado no app (quadra=...), carregando o id da sala + o token adequado + o
  // sport (para o device remoto instanciar o módulo de scoring correto).
  //  - Editor  → /jogo   (tela de operação) com o edit_token (SEGREDO do dono).
  //  - Espectador → /placar (tela read-only) com o view_token (seguro de expor).
  // Params que viajam na URL para o device remoto nascer coerente (sport, tema,
  // e o modo de contagem inicial). O servidor não guarda esses campos.
  const extraParams =
    (sport ? `&sport=${encodeURIComponent(sport)}` : "") +
    (theme ? `&theme=${encodeURIComponent(theme)}` : "") +
    (scoreType ? `&scoreType=${encodeURIComponent(scoreType)}` : "")
  const editUrl = useMemo(
    () =>
      ready
        ? `${origin}/jogo?quadra=${quadra}&match=${matchId}&edit=${editToken}${extraParams}`
        : "",
    [ready, origin, quadra, matchId, editToken, extraParams],
  )
  const viewUrl = useMemo(
    () =>
      ready
        ? `${origin}/placar?quadra=${quadra}&match=${matchId}&view=${viewToken}${extraParams}`
        : "",
    [ready, origin, quadra, matchId, viewToken, extraParams],
  )

  // Reset do feedback "Copiado!" a cada abertura.
  useEffect(() => {
    if (isOpen) setCopied(false)
  }, [isOpen])

  if (!isOpen) return null

  const handleCopy = async () => {
    if (!viewUrl) return
    try {
      await navigator.clipboard.writeText(viewUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Copiar link falhou:", err)
    }
  }

  const handleNativeShare = async () => {
    if (!viewUrl) return
    try {
      const nav = navigator as Navigator & { share?: (data?: ShareData) => Promise<void> }
      if (nav.share) {
        await nav.share({
          title: "Acompanhe o jogo ao vivo",
          text: "Placar ao vivo da partida",
          url: viewUrl,
        })
      } else {
        // Sem share nativo (desktop): cai para copiar o link.
        await handleCopy()
      }
    } catch (err) {
      // Cancelar o menu nativo (AbortError) é silencioso.
      if ((err as Error)?.name !== "AbortError") console.error("Compartilhar falhou:", err)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Compartilhar partida"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-neutral-900 text-white shadow-2xl ring-1 ring-white/10 flex flex-col max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-base font-bold uppercase tracking-wide">Compartilhar</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-1.5 hover:bg-white/10 active:scale-95 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {!ready ? (
          // Estado offline / sala indisponível — o jogo segue funcionando local.
          <div className="px-5 py-8 text-center text-sm text-white/70">
            Sala ao vivo indisponível no momento.
            <br />
            O placar continua funcionando normalmente neste aparelho.
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-white/10">
            {/* a) Convidar editor */}
            <section className="px-5 py-5 flex flex-col items-center gap-3">
              <h3 className="self-start text-sm font-semibold uppercase tracking-wide text-white/80">
                Convidar editor
              </h3>
              <div className="rounded-xl bg-white p-3">
                <QRCodeGenerator value={editUrl} size={168} />
              </div>
              <p className="text-xs text-white/60 text-center">
                Escaneie para marcar pontos junto (mesma partida, em tempo real).
              </p>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold">
                <Users className="h-4 w-4" />
                <span className="tabular-nums">
                  {editorCount}/{maxEditors}
                </span>
                <span className="text-white/60 font-normal">editando agora</span>
              </div>
            </section>

            {/* b) Assistir ao vivo */}
            <section className="px-5 py-5 flex flex-col gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white/80">
                Assistir ao vivo
              </h3>
              <div className="flex items-stretch gap-2">
                <input
                  readOnly
                  value={viewUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 min-w-0 rounded-lg bg-white/10 px-3 py-2 text-xs text-white/90 outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold hover:bg-white/25 active:scale-95 transition"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
              <button
                type="button"
                onClick={handleNativeShare}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white text-neutral-900 px-4 py-2.5 text-sm font-bold hover:bg-white/90 active:scale-95 transition"
              >
                <Share2 className="h-4 w-4" />
                Compartilhar link
              </button>
              <p className="text-xs text-white/50 text-center">
                Quem abrir este link só assiste — sem poder alterar o placar.
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
