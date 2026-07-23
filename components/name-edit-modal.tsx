"use client"

import { useRef, useState } from "react"
import { X, Check, BadgeCheck } from "lucide-react"
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
  gameType,
  onGameTypeChange,
  initialNames,
  verifiedFirstName,
  onSave,
  onClose,
}: {
  /** Cor do lado (var do tema) para um ponto indicador no cabeçalho. */
  accentColor: string
  /** Formato atual da partida ('simples'|'duplas'). O toggle no topo o muda AO
   *  VIVO (mesma escrita do settings, via onGameTypeChange) — revela/oculta o 2º
   *  campo na hora. */
  gameType: string
  onGameTypeChange: (gameType: string) => void
  /** [nome1, nome2] atuais; nome2 ignorado em simples. */
  initialNames: [string, string]
  /** IDENTIDADE VERIFICADA do dono (A4): quando presente, o 1º nome é o dono
   *  logado — TRAVADO aqui (edita-se no /perfil), com tick verde. null = nome
   *  comum, editável. O 2º nome (duplas) segue editável. */
  verifiedFirstName?: string | null
  onSave: (p1: string, p2: string) => void
  onClose: () => void
}) {
  const [gt, setGt] = useState(gameType)
  const duplas = gt === "duplas"
  const verified = Boolean(verifiedFirstName)
  const [p1, setP1] = useState(initialNames[0] ?? "")
  const [p2, setP2] = useState(initialNames[1] ?? "")

  // Valores da ABERTURA (capturados uma vez): base para habilitar o Salvar só
  // quando algo diverge.
  const [orig] = useState(() => ({ p1: initialNames[0] ?? "", p2: initialNames[1] ?? "" }))
  // Verificado: o 1º nome está travado (não conta como mudança); só o 2º (duplas)
  // pode divergir. Comum: qualquer campo que divirja habilita o Salvar.
  const changed = verified
    ? duplas && p2.trim() !== orig.p2.trim()
    : p1.trim() !== orig.p1.trim() || (duplas && p2.trim() !== orig.p2.trim())

  const p2Ref = useRef<HTMLInputElement>(null)
  // Seleciona o texto ao focar (item 3): um toque substitui tudo, editar 1 letra
  // ainda é possível. Vale p/ autoFocus, Tab e toque.
  const selectAll = (e: { currentTarget: { select: () => void } }) => e.currentTarget.select()

  // Trocar o formato grava JÁ (mesmo campo do settings) e revela/oculta o 2º
  // campo imediatamente. Sincroniza via onGameTypeChange (set_config no pai).
  const trocarFormato = (v: string) => {
    setGt(v)
    onGameTypeChange(v)
  }

  const salvar = () => {
    if (!changed) return
    // Verificado: o 1º nome vai INTACTO (o dono edita no /perfil); só o 2º muda.
    onSave(verified ? (verifiedFirstName as string) : p1.trim(), p2.trim())
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
          {/* Segmentado Simples|Duplas (estilo PONTOS|GAMES): muda o formato na
              hora — Duplas revela o 2º campo, Simples oculta. */}
          <div className="flex rounded-full bg-white/10 p-1 text-sm font-semibold">
            {[
              { v: "simples", label: "Simples" },
              { v: "duplas", label: "Duplas" },
            ].map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => trocarFormato(opt.v)}
                aria-pressed={gt === opt.v}
                className={`flex-1 rounded-full px-3 py-1.5 transition ${
                  gt === opt.v ? "bg-white text-neutral-900" : "text-white/70 hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {verified ? (
            // 1º nome TRAVADO: é a identidade VERIFICADA do dono. Não editável
            // aqui — a fonte da verdade é o /perfil. Terceiros nunca a alteram.
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
                {duplas ? "Player 1" : "Nome"}
              </span>
              <div className="flex h-12 items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-400/5 px-3">
                <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                <span className="truncate text-base font-semibold text-white">{verifiedFirstName}</span>
              </div>
              <a
                href="/perfil"
                className="text-xs text-white/60 underline underline-offset-2 hover:text-white"
              >
                Identidade verificada — edite seu nome no perfil
              </a>
            </div>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
                {duplas ? "Player 1" : "Nome"}
              </span>
              <Input
                value={p1}
                onChange={(e) => setP1(e.target.value)}
                onFocus={selectAll}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return
                  // Enter/OK: em duplas avança p/ o campo 2 (foco + select); em
                  // simples salva.
                  if (duplas) p2Ref.current?.focus()
                  else salvar()
                }}
                autoFocus
                placeholder="Nome"
                className="h-12 border-white/20 bg-white/10 text-base text-white placeholder:text-white/40"
              />
            </label>
          )}

          {duplas && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
                Player 2
              </span>
              <Input
                ref={p2Ref}
                value={p2}
                onChange={(e) => setP2(e.target.value)}
                onFocus={selectAll}
                onKeyDown={(e) => {
                  if (e.key === "Enter") salvar()
                }}
                // Verificado: o 1º campo está travado → o foco começa no 2º.
                autoFocus={verified}
                placeholder="Nome"
                className="h-12 border-white/20 bg-white/10 text-base text-white placeholder:text-white/40"
              />
            </label>
          )}

          {/* Salvar CONDICIONADO a mudança: nasce desabilitado (claro) e só ativa
              quando algum campo diverge do valor da abertura. Verificado+simples
              não tem nada a salvar (o nome edita-se no /perfil) → sem botão. */}
          {(!verified || duplas) && (
            <Button
              onClick={salvar}
              disabled={!changed}
              className="mt-1 h-12 gap-2 bg-white text-base font-bold text-neutral-900 hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Check className="h-5 w-5" />
              Salvar
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
