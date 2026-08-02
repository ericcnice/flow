"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { X, Copy, Check, Share2, Users } from "lucide-react"
import { QRCodeGenerator } from "@/components/qr-code"
import { buildEditUrl, buildViewUrl } from "@/lib/share-links"
import { createRemoteCode } from "@/lib/supabase/live-match"

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
  /** Clube de contexto (&clube=) — o servidor não guarda; vai na URL para a tela
   *  de espectador (/placar) resolver o logo do clube (clubBySlug). */
  clube?: string
  /** Patrocinador/ad da abertura (&ad=) — idem: vai na URL para o /placar
   *  resolver o logo do patrocinador (adBySlug). */
  ad?: string
  /** Simples/duplas (&gameType=) — o servidor não guarda; vai na URL para a tela
   *  de espectador montar o nome certo (1 jogador em simples, par em duplas). */
  gameType?: string
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
  clube,
  ad,
  gameType,
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

  // As URLs vêm do helper COMPARTILHADO (lib/share-links): a mesma montagem que
  // a aba Players do setup usa. Antes isto era inline aqui, e foi assim que o
  // `&clube=` ficou de fora de um dos caminhos — uma fonte só fecha essa porta.
  const linkParams = useMemo(
    () => ({ origin, quadra, matchId, viewToken, editToken, sport, theme, scoreType, clube, ad, gameType }),
    [origin, quadra, matchId, viewToken, editToken, sport, theme, scoreType, clube, ad, gameType],
  )
  // CÓDIGO do controle remoto. Só existe sob demanda: gerar sempre que o modal
  // abre criaria códigos vivos que ninguém pediu — e cada código vivo é mais
  // uma chance de um chute acertar.
  const [codigo, setCodigo] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)
  const [erroCodigo, setErroCodigo] = useState(false)

  const gerarCodigo = async () => {
    if (!matchId || !editToken || gerando) return
    setGerando(true)
    setErroCodigo(false)
    const c = await createRemoteCode(matchId, editToken, { sport, theme, scoreType })
    setCodigo(c)
    setErroCodigo(c === null)
    setGerando(false)
  }

  const editUrl = useMemo(() => buildEditUrl(linkParams), [linkParams])
  const viewUrl = useMemo(() => buildViewUrl(linkParams), [linkParams])

  // Reset do feedback "Copiado!" a cada abertura.
  useEffect(() => {
    if (isOpen) setCopied(false)
  }, [isOpen])

  // --- Confirmação de conexão --------------------------------------------------
  // editorCount INCLUI o próprio aparelho, então "outro conectou" = editorCount
  // cresceu E passou de 1. Na PRIMEIRA transição de crescimento da sessão,
  // mostramos o ✓ e auto-fechamos ~2s depois. A ref do valor anterior garante que
  // o ✓ dispare na TRANSIÇÃO (não a cada presence sync) — isso já tolera a dupla
  // contagem de ~1s do refresh de outro aparelho.
  const [showSuccess, setShowSuccess] = useState(false)
  const prevEditorCountRef = useRef(editorCount)
  const autoCloseDoneRef = useRef(false)
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // onClose pode trocar de identidade a cada render do pai; a ref faz o timer
  // chamar sempre a versão atual sem re-agendar/cancelar por dependência.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const prev = prevEditorCountRef.current
    prevEditorCountRef.current = editorCount
    // Só reage com o modal aberto — o ✓ e o auto-close só fazem sentido visíveis.
    // (prevEditorCountRef segue atualizado mesmo fechado, então reabrir com alguém
    // já conectado mostra o NÚMERO, não um ✓ de uma transição que não foi vista.)
    if (!isOpen) return
    if (editorCount > prev && editorCount > 1) {
      setShowSuccess(true)
      // Auto-fecha SÓ na 1ª transição da sessão; reaberturas manuais só atualizam
      // o número (autoCloseDoneRef nunca volta a false).
      if (!autoCloseDoneRef.current) {
        autoCloseDoneRef.current = true
        autoCloseTimerRef.current = setTimeout(() => onCloseRef.current(), 2000)
      }
    }
  }, [editorCount, isOpen])

  // Cada ABERTURA rearma o auto-close (uma vez POR ABERTURA, não por sessão) e
  // fixa a BASELINE no editorCount atual: só conexões que chegarem DEPOIS de
  // abrir disparam o ✓ + auto-close — inclusive reconexões de aparelhos que já
  // estiveram no jogo. Aberto sem ninguém conectar = fica aberto normal.
  // Fechar limpa o ✓ (reabrir mostra o número).
  useEffect(() => {
    if (isOpen) {
      autoCloseDoneRef.current = false
      prevEditorCountRef.current = editorCount
      setShowSuccess(false)
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current)
        autoCloseTimerRef.current = null
      }
    } else {
      setShowSuccess(false)
    }
    // Depende só de isOpen: fixa a baseline no MOMENTO da abertura (ler o
    // editorCount atual aqui é intencional, não uma dep).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Limpa o timer de auto-close no unmount.
  useEffect(
    () => () => {
      if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current)
    },
    [],
  )

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
              {/* Na 1ª conexão de outro aparelho, o chip vira CONFIRMAÇÃO (✓ verde,
                  pop de entrada) e o modal se fecha sozinho ~2s depois. Fora disso,
                  o chip neutro mostra a contagem ao vivo (inclui este aparelho). */}
              {showSuccess ? (
                <div
                  key="ok"
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-3.5 py-1.5 text-sm font-bold text-white shadow-md
                    animate-in zoom-in-50 fade-in duration-300"
                >
                  <Check className="h-4 w-4" />
                  <span>Aparelho conectado</span>
                  <span className="tabular-nums font-semibold text-white/85">
                    ({editorCount}/{maxEditors})
                  </span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold">
                  <Users className="h-4 w-4" />
                  <span className="tabular-nums">
                    {editorCount}/{maxEditors}
                  </span>
                  <span className="text-white/60 font-normal">editando agora</span>
                </div>
              )}
            </section>

            {/* a2) CONTROLE REMOTO por CÓDIGO.
                 A URL de editor tem 100+ caracteres — ninguém digita isso num
                 relógio, e o QR acima também não serve (relógio não escaneia).
                 O código de 6 dígitos é a ponte: aqui gera, lá se digita.
                 Fica ABAIXO do QR de propósito: o QR resolve o caso comum (2º
                 celular) e o código é a saída para quem não escaneia. */}
            <section className="px-5 py-5 flex flex-col gap-3">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-white/80">
                Controle remoto
              </h3>

              {codigo ? (
                <div className="flex flex-col items-center gap-1.5">
                  <span className="font-mono text-4xl font-black tracking-[0.3em] text-white">
                    {codigo}
                  </span>
                  <p className="text-center text-xs text-white/60">
                    Abra <span className="font-mono text-white/80">flow.pwer.com.br/remoto</span> no
                    outro aparelho e digite o código.
                  </p>
                  {/* A VALIDADE é informação, não enfeite: o código morre em 10
                      minutos e é de uso único, e quem não sabe disso acha que
                      quebrou quando ele expira. */}
                  <p className="text-[11px] text-white/40">Vale por 10 minutos, uma vez só.</p>
                  <button
                    type="button"
                    onClick={gerarCodigo}
                    disabled={gerando}
                    className="mt-1 text-[11px] font-bold uppercase tracking-widest text-white/50 underline underline-offset-4 disabled:opacity-50"
                  >
                    Gerar outro
                  </button>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={gerarCodigo}
                    disabled={gerando}
                    className="rounded-full bg-white/10 px-5 py-3 text-sm font-bold uppercase tracking-wide text-white ring-1 ring-white/20 active:scale-95 transition disabled:opacity-50"
                  >
                    {gerando ? "Gerando…" : "Gerar código"}
                  </button>
                  <p className="text-center text-xs text-white/50">
                    Para marcar pontos de outro aparelho sem escanear.
                  </p>
                </>
              )}
              {erroCodigo && (
                <p className="text-center text-xs text-red-400">
                  Não deu para gerar agora. Tente de novo.
                </p>
              )}
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
