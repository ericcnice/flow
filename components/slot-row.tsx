"use client"

/**
 * UM SLOT DE JOGADOR — a linha de um lugar na partida.
 *
 * Extraído do NameEditModal (1c.3, fatia i), onde este mesmo bloco estava
 * INLINE quatro vezes (dois slots × dois estados). O popup ÚNICO da fatia (ii)
 * mostra os quatro jogadores juntos; sem esta extração, seriam OITO cópias.
 *
 * DOIS ESTADOS, decididos pelo `preview`:
 *  • TRAVADO (preview.verified) — o slot tem CARTEIRINHA: nome em texto, tick
 *    verde, e o atalho para o /perfil SÓ quando o dono é quem está no aparelho
 *    (souEu). Terceiro vê a identidade e não pode editá-la.
 *  • INPUT — nome livre, digitável. É o caminho do anônimo/offline, que a 1c
 *    NÃO remove.
 *
 * Refactor PURO: a marcação, as classes e o comportamento são os que já estavam
 * no modal. Nada de novo aqui — a tela tem de ficar idêntica.
 */

import type { RefObject } from "react"
import Link from "next/link"
import { BadgeCheck } from "lucide-react"
import { Input } from "@/components/ui/input"
import { PlayerAvatar } from "@/components/player-avatar"
import type { SlotPreview } from "@/components/name-edit-modal"

export function SlotRow({
  label,
  valor,
  onChange,
  onEnter,
  preview,
  perfilHref,
  autoFocus = false,
  inputRef,
  linkPerfil = false,
}: {
  /** Rótulo do campo ("Player 1" / "Nome" / "Player 2"). */
  label: string
  /** Nome digitado (estado do pai). Ignorado quando o slot está travado. */
  valor: string
  onChange: (v: string) => void
  /** Enter no campo — o pai decide (avançar para o próximo, ou salvar). */
  onEnter: () => void
  /** Carteirinha do slot: decide travado vs input, e alimenta avatar/tick. */
  preview: SlotPreview | null
  /** Destino do atalho de identidade (já com o ?voltar= do jogo). */
  perfilHref: string
  autoFocus?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
  /**
   * Mostra o atalho "editar no perfil" quando o slot é do próprio usuário.
   *
   * ⚠️ Existe como PROP só para preservar o comportamento atual: hoje o modal
   * oferece o atalho apenas no PRIMEIRO slot do lado. A assimetria é um
   * resquício de quando só blue1 podia ter identidade — agora que a 1c.1 põe
   * carteirinha em qualquer slot, a fatia (ii) deve uniformizar (todo slot com
   * souEu mostra o atalho) e esta prop some.
   */
  linkPerfil?: boolean
}) {
  const travado = Boolean(preview?.verified)

  // Seleciona o texto ao focar: um toque substitui tudo, editar 1 letra ainda é
  // possível. Vale p/ autoFocus, Tab e toque.
  const selectAll = (e: { currentTarget: { select: () => void } }) => e.currentTarget.select()

  if (travado) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-white/60">{label}</span>
        <div className="flex h-14 items-center gap-2.5 rounded-md border border-emerald-400/30 bg-emerald-400/5 px-3">
          <PlayerAvatar url={preview?.avatarUrl} nome={preview?.nome ?? ""} size={40} />
          <span className="min-w-0 flex-1 truncate text-base font-semibold text-white">
            {preview?.nome}
          </span>
          <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
        </div>
        {/* SÓ O DONO, no aparelho dele. Terceiro/anônimo não vê NADA aqui — o
            tick já comunica "verificado", e oferecer um atalho para editar
            identidade alheia seria promessa falsa. */}
        {linkPerfil && preview?.souEu && (
          <Link
            href={perfilHref}
            className="text-xs text-white/60 underline underline-offset-2 hover:text-white"
          >
            Identidade verificada — edite seu nome no perfil
          </Link>
        )}
      </div>
    )
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-white/60">{label}</span>
      {/* Avatar FORA do <Input> (o preview não interfere na digitação). */}
      <div className="flex items-center gap-2.5">
        <PlayerAvatar url={preview?.avatarUrl} nome={valor} size={40} />
        <Input
          ref={inputRef}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          onFocus={selectAll}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnter()
          }}
          autoFocus={autoFocus}
          placeholder="Nome"
          className="h-12 flex-1 border-white/20 bg-white/10 text-base text-white placeholder:text-white/40"
        />
      </div>
    </label>
  )
}
