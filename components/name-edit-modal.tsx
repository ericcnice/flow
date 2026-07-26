"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { X, Check, BadgeCheck } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { PlayerAvatar } from "@/components/player-avatar"

/**
 * PREVIEW de um slot — "é assim que você vai aparecer". `verified` é a verdade
 * que VIAJA (playerIds/profile_id no state, Fatia 1a), não um flag local: um
 * slot com carteirinha fica TRAVADO em qualquer aparelho, porque terceiros não
 * alteram nome verificado.
 */
export type SlotPreview = {
  nome: string
  avatarUrl: string | null
  verified: boolean
  /**
   * Este APARELHO é o dono deste slot (authUser.id === profile_id do slot).
   * "VER viaja, EDITAR é local": a foto/nome/tick aparecem em todo aparelho,
   * mas o atalho para editar a identidade é privilégio de quem é dono dela.
   */
  souEu: boolean
}

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
  previews,
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
  /**
   * PREVIEW POR SLOT [slot0, slot1] do lado aberto. `verified` decide a trava:
   * slot com carteirinha vira texto + tick + foto; sem, segue input editável.
   *
   * É um PAR, e não "o primeiro nome", de propósito: quando red1 e os slots 2
   * ganharem identidade (1c), nada aqui precisa ser refeito.
   *
   * Ausente = comportamento anterior (tudo editável) — o popup nunca depende
   * disto para funcionar offline/anônimo.
   */
  previews?: [SlotPreview | null, SlotPreview | null]
  onSave: (p1: string, p2: string) => void
  onClose: () => void
}) {
  const [gt, setGt] = useState(gameType)
  const duplas = gt === "duplas"
  const prev0 = previews?.[0] ?? null
  const prev1 = previews?.[1] ?? null
  // TRAVA POR SLOT. Antes vinha do flag LOCAL `ownerVerified`, então no 2º
  // aparelho a pílula mostrava o tick mas o popup deixava o nome editável —
  // terceiro alterando nome verificado, o que a regra do produto proíbe.
  const verified = Boolean(prev0?.verified)
  const verified1 = Boolean(prev1?.verified)
  const verifiedFirstName = verified ? prev0?.nome : null
  const [p1, setP1] = useState(initialNames[0] ?? "")
  const [p2, setP2] = useState(initialNames[1] ?? "")

  // Valores da ABERTURA (capturados uma vez): base para habilitar o Salvar só
  // quando algo diverge.
  const [orig] = useState(() => ({ p1: initialNames[0] ?? "", p2: initialNames[1] ?? "" }))
  // Slot TRAVADO não conta como mudança (o nome dele nem é editável aqui). Cada
  // um é avaliado por conta própria — em duplas, o dono pode estar no slot 1 e o
  // parceiro anônimo no 2, ou o contrário.
  const changed =
    (!verified && p1.trim() !== orig.p1.trim()) ||
    (duplas && !verified1 && p2.trim() !== orig.p2.trim())

  // VOLTA REDONDA: leva a URL ATUAL do jogo no ?voltar= para o /perfil saber
  // para onde devolver. URL COMPLETA de propósito — num aparelho que entrou
  // pelo QR, sem match/edit/v o retorno cairia numa partida diferente. Mesmo
  // padrão do `next` do login (components/auth/app-auth.tsx). Inicializador
  // preguiçoso com guarda de window: nunca lê no SSR.
  const [perfilHref] = useState(() => {
    if (typeof window === "undefined") return "/perfil"
    const atual = window.location.pathname + window.location.search
    return `/perfil?voltar=${encodeURIComponent(atual)}`
  })

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
    // Nome de slot TRAVADO vai INTACTO (a fonte da verdade é o /perfil do dono).
    onSave(
      verified ? (verifiedFirstName as string) : p1.trim(),
      verified1 ? (prev1?.nome ?? p2.trim()) : p2.trim(),
    )
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
              <div className="flex h-14 items-center gap-2.5 rounded-md border border-emerald-400/30 bg-emerald-400/5 px-3">
                <PlayerAvatar url={prev0?.avatarUrl} nome={verifiedFirstName ?? ""} size={40} />
                <span className="min-w-0 flex-1 truncate text-base font-semibold text-white">
                  {verifiedFirstName}
                </span>
                <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
              </div>
              {/* SÓ O DONO, no aparelho dele. Terceiro/anônimo não vê NADA aqui
                  — o tick já comunica "verificado", e oferecer um atalho para
                  editar identidade alheia seria promessa falsa. */}
              {prev0?.souEu && (
                <Link
                  href={perfilHref}
                  className="text-xs text-white/60 underline underline-offset-2 hover:text-white"
                >
                  Identidade verificada — edite seu nome no perfil
                </Link>
              )}
            </div>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
                {duplas ? "Player 1" : "Nome"}
              </span>
              {/* Avatar FORA do <Input> (o preview não interfere na digitação). */}
              <div className="flex items-center gap-2.5">
                <PlayerAvatar url={prev0?.avatarUrl} nome={p1} size={40} />
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
                  className="h-12 flex-1 border-white/20 bg-white/10 text-base text-white placeholder:text-white/40"
                />
              </div>
            </label>
          )}

          {duplas &&
            (verified1 ? (
              // Slot 2 com carteirinha: mesma trava do slot 1 (a 1c pode pôr
              // identidade aqui quando alguém entrar pelo QR).
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
                  Player 2
                </span>
                <div className="flex h-14 items-center gap-2.5 rounded-md border border-emerald-400/30 bg-emerald-400/5 px-3">
                  <PlayerAvatar url={prev1?.avatarUrl} nome={prev1?.nome ?? ""} size={40} />
                  <span className="min-w-0 flex-1 truncate text-base font-semibold text-white">
                    {prev1?.nome}
                  </span>
                  <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                </div>
              </div>
            ) : (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
                  Player 2
                </span>
                <div className="flex items-center gap-2.5">
                  <PlayerAvatar url={prev1?.avatarUrl} nome={p2} size={40} />
                  <Input
                    ref={p2Ref}
                    value={p2}
                    onChange={(e) => setP2(e.target.value)}
                    onFocus={selectAll}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") salvar()
                    }}
                    // Slot 1 travado → o foco começa no 2º.
                    autoFocus={verified}
                    placeholder="Nome"
                    className="h-12 flex-1 border-white/20 bg-white/10 text-base text-white placeholder:text-white/40"
                  />
                </div>
              </label>
            ))}

          {/* O ESPELHO: vale para os dois casos (com e sem carteirinha) — não
              aponta o dedo para quem não tem foto, só diz onde aquilo aparece. */}
          <p className="text-xs text-white/40">É assim que você aparece nas transmissões.</p>

          {/* Salvar CONDICIONADO a mudança: nasce desabilitado (claro) e só ativa
              quando algum campo diverge do valor da abertura. Verificado+simples
              não tem nada a salvar (o nome edita-se no /perfil) → sem botão. */}
          {(!verified || (duplas && !verified1)) && (
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
