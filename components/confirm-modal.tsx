"use client"

import { Button } from "@/components/ui/button"

/**
 * Modal de CONFIRMAÇÃO do app (QUADRA 2.0) — substitui o window.confirm() nativo
 * (que estampa "flow.pwer.com.br diz" + URL e quebra a imersão).
 *
 * Mesmo molde glass dos overlays da tela de jogo (ShareModal/NameEditModal):
 * fecha ao tocar fora (onClick no backdrop) e o painel para a propagação
 * (stopPropagation). Presentacional: não decide nada — só chama onConfirm /
 * onClose. A ação destrutiva ganha destaque (vermelho/atenção); cancelar neutro.
 */
export function ConfirmModal({
  message,
  confirmLabel,
  onConfirm,
  onClose,
  destructive = true,
}: {
  /** Pergunta + consequência (ex.: "Recomeçar a partida? Os pontos serão perdidos."). */
  message: string
  /** Rótulo da ação (ex.: "Recomeçar", "Sair"). Cancelar é fixo. */
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
  /** Botão de confirmar em vermelho (atenção). Default true. */
  destructive?: boolean
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={confirmLabel}
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-neutral-900 text-white shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="px-6 py-6 text-center text-base font-semibold leading-snug">{message}</p>
        <div className="flex gap-2 border-t border-white/10 px-5 py-4">
          <Button
            onClick={onClose}
            className="h-12 flex-1 bg-white/10 text-base font-bold text-white hover:bg-white/15"
          >
            Cancelar
          </Button>
          <Button
            onClick={() => {
              onConfirm()
              onClose()
            }}
            className={`h-12 flex-1 text-base font-bold ${
              destructive
                ? "bg-red-600 text-white hover:bg-red-500"
                : "bg-white text-neutral-900 hover:bg-white/90"
            }`}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
