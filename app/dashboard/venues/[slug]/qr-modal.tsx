'use client'

/**
 * QR de uma URL da jornada, com download em PNG.
 *
 * Consome o QRCodeGenerator existente sem alterá-lo. Ele não expõe ref do
 * canvas, então o download pega o nó pelo wrapper (querySelector) — é o mesmo
 * canvas que ele desenha, e assim o componente segue intocado.
 *
 * ⚠️ O QRCodeGenerator NÃO tem download próprio (é só <canvas> + QRCode.
 * toCanvas), e a tela de jogo também não baixa QR: o download de lá é a ARTE de
 * fim de jogo, via html-to-image. O que se reaproveita aqui é o padrão de
 * download daquela tela (blob → objectURL → <a download> → revoke), não código.
 *
 * Overlay inline no mesmo padrão dos outros modais do projeto: fecha ao tocar
 * fora, painel com stopPropagation.
 */

import { useRef } from 'react'
import { Download, X } from 'lucide-react'
import { QRCodeGenerator } from '@/components/qr-code'
import { Button } from '@/components/ui/button'

/**
 * Lado do QR desenhado no canvas. Grande de propósito: este QR existe para ser
 * IMPRESSO e colado na quadra, e o canvas é exportado no tamanho intrínseco.
 * Na tela ele é reduzido por CSS (max-w), então o tamanho grande não custa
 * layout — só qualidade no papel.
 */
const LADO_QR = 512

export function QrModal({
  url,
  nomeArquivo,
  onFechar,
}: {
  url: string
  nomeArquivo: string
  onFechar: () => void
}) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  const baixar = () => {
    const canvas = wrapperRef.current?.querySelector('canvas')
    if (!canvas) return

    // Zona de silêncio (quiet zone): o QRCodeGenerator desenha com `margin: 1`
    // — um módulo de borda. Serve na tela, mas a norma do QR pede 4, e no papel
    // uma borda apertada é justamente onde a leitura falha. Como o componente
    // não pode mudar, a margem entra AQUI: copiamos o canvas dele para um maior
    // com fundo branco em volta. Só o arquivo baixado ganha a borda.
    const margem = Math.round(canvas.width * 0.08)
    const saida = document.createElement('canvas')
    saida.width = canvas.width + margem * 2
    saida.height = canvas.height + margem * 2

    const ctx = saida.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, saida.width, saida.height)
    ctx.drawImage(canvas, margem, margem)

    saida.toBlob((blob) => {
      if (!blob) {
        console.error('Não foi possível gerar o PNG do QR.')
        return
      }
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = nomeArquivo
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(objectUrl)
    }, 'image/png')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onFechar}
      role="dialog"
      aria-modal
      aria-label="QR code do link"
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">QR code</h2>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Fundo branco em volta do QR na TELA (o canvas já é branco, mas a
            moldura o separa do card escuro e reproduz o que o papel vê). */}
        <div ref={wrapperRef} className="flex justify-center rounded-xl bg-white p-4">
          <QRCodeGenerator value={`https://${url}`} size={LADO_QR} className="h-auto w-full" />
        </div>

        <p className="mt-4 break-all text-center font-mono text-xs text-muted-foreground">{url}</p>

        <Button
          onClick={baixar}
          className="mt-5 w-full bg-primary font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Download className="h-4 w-4" />
          Baixar PNG
        </Button>
      </div>
    </div>
  )
}
