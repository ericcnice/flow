"use client"

import { useState } from "react"
import { X, Check } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

/**
 * Popup grande de edição de nomes de UM lado (QUADRA 2.0, B1a). Substitui a
 * edição inline antiga (Input no canto/faixa central).
 *
 * Molde visual dos overlays da tela de jogo (glass centrado: fecha ao tocar
 * fora, painel com stopPropagation). Em DUPLAS os dois nomes do par ficam
 * juntos, em inputs SEPARADOS (sem a string com "/"). Campos grandes e
 * confortáveis; o primeiro já vem com autoFocus (teclado aberto).
 *
 * Presentacional: não fala com o motor nem com o sync. Devolve os nomes via
 * onSave; quem persiste e propaga (set_config) é o pai.
 */
export function NameEditModal({
  accentColor,
  duplas,
  initialNames,
  onSave,
  onClose,
}: {
  /** Cor do lado (var do tema) para um ponto indicador no cabeçalho. */
  accentColor: string
  duplas: boolean
  /** [nome1, nome2] atuais; nome2 ignorado em simples. */
  initialNames: [string, string]
  onSave: (p1: string, p2: string) => void
  onClose: () => void
}) {
  const [p1, setP1] = useState(initialNames[0] ?? "")
  const [p2, setP2] = useState(initialNames[1] ?? "")

  const salvar = () => {
    onSave(p1.trim(), p2.trim())
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Editar nomes"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-neutral-900 text-white shadow-2xl ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span
              className="h-3 w-3 shrink-0 rounded-full ring-1 ring-white/20"
              style={{ backgroundColor: accentColor }}
              aria-hidden
            />
            <h2 className="text-base font-bold uppercase tracking-wide">
              {duplas ? "Nomes da dupla" : "Nome do jogador"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-1.5 transition hover:bg-white/10 active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
              {duplas ? "Jogador 1" : "Nome"}
            </span>
            <Input
              value={p1}
              onChange={(e) => setP1(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !duplas) salvar()
              }}
              autoFocus
              placeholder="Nome"
              className="h-12 border-white/20 bg-white/10 text-base text-white placeholder:text-white/40"
            />
          </label>

          {duplas && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
                Jogador 2
              </span>
              <Input
                value={p2}
                onChange={(e) => setP2(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") salvar()
                }}
                placeholder="Nome"
                className="h-12 border-white/20 bg-white/10 text-base text-white placeholder:text-white/40"
              />
            </label>
          )}

          <Button
            onClick={salvar}
            className="mt-1 h-12 gap-2 bg-white text-base font-bold text-neutral-900 hover:bg-white/90"
          >
            <Check className="h-5 w-5" />
            Salvar
          </Button>
        </div>
      </div>
    </div>
  )
}
