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
 * DUAS VARIANTES DE TEMA (fatia b), porque o mesmo slot vive em dois fundos:
 *  • 'dark'  — o popup atual (NameEditModal), fundo neutral-900. É o DEFAULT,
 *              então nada muda para quem já usa o componente.
 *  • 'card'  — o card CLARO da tela de configuração (--setup-card-bg #f4f1ea),
 *              onde a aba Players vai morar (fatia c).
 * Só a APARÊNCIA muda entre elas: avatar, tick, link do dono, selectAll,
 * autoFocus, Enter e preview se comportam igual nas duas.
 */

import type { RefObject } from "react"
import Link from "next/link"
import { BadgeCheck } from "lucide-react"
import { Input } from "@/components/ui/input"
import { PlayerAvatar } from "@/components/player-avatar"
import type { SlotPreview } from "@/components/name-edit-modal"

export type SlotRowVariant = "dark" | "card"

/**
 * As classes de cada variante, lado a lado — assim a diferença fica legível num
 * lugar só, em vez de espalhada por ternários no meio da marcação.
 *
 * O VERDE do verificado muda de tom de propósito: `emerald-400` sobre off-white
 * quase não se lê (e o fundo `emerald-400/5` some), então a variante clara usa
 * `emerald-700`/`emerald-600` — mesma leitura de "verificado", contraste que
 * funciona no papel claro.
 */
const ESTILOS: Record<
  SlotRowVariant,
  {
    label: string
    caixa: string
    nome: string
    tick: string
    link: string
    input: string
  }
> = {
  dark: {
    label: "text-xs font-semibold uppercase tracking-wide text-white/60",
    caixa:
      "flex h-14 items-center gap-2.5 rounded-md border border-emerald-400/30 bg-emerald-400/5 px-3",
    nome: "min-w-0 flex-1 truncate text-base font-semibold text-white",
    tick: "h-4 w-4 shrink-0 text-emerald-400",
    link: "text-xs text-white/60 underline underline-offset-2 hover:text-white",
    input:
      "h-12 flex-1 border-white/20 bg-white/10 text-base text-white placeholder:text-white/40",
  },
  card: {
    label: "text-xs font-bold uppercase tracking-wide",
    caixa:
      "flex h-14 items-center gap-2.5 rounded-xl border-2 border-emerald-600/30 bg-emerald-600/10 px-3",
    nome: "min-w-0 flex-1 truncate text-base font-bold",
    tick: "h-4 w-4 shrink-0 text-emerald-700",
    link: "text-xs underline underline-offset-2",
    input: "h-12 flex-1 rounded-xl border-2 text-base",
  },
}

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
  variant = "dark",
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
  /** Tema do fundo em que o slot está. Default 'dark' = comportamento atual. */
  variant?: SlotRowVariant
}) {
  const travado = Boolean(preview?.verified)
  const st = ESTILOS[variant]
  const claro = variant === "card"

  // Cores por token no claro (não há classe utilitária para as vars do card).
  const corTexto = claro ? { color: "var(--setup-card-texto)" } : undefined
  const corRotulo = claro ? { color: "var(--setup-card-cinza)" } : undefined
  const estiloInput = claro
    ? {
        backgroundColor: "#ffffff",
        borderColor: "var(--setup-card-borda)",
        color: "var(--setup-card-texto)",
      }
    : undefined

  // Seleciona o texto ao focar: um toque substitui tudo, editar 1 letra ainda é
  // possível. Vale p/ autoFocus, Tab e toque.
  const selectAll = (e: { currentTarget: { select: () => void } }) => e.currentTarget.select()

  if (travado) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className={st.label} style={corRotulo}>
          {label}
        </span>
        <div className={st.caixa}>
          <PlayerAvatar url={preview?.avatarUrl} nome={preview?.nome ?? ""} size={40} />
          <span className={st.nome} style={corTexto}>
            {preview?.nome}
          </span>
          <BadgeCheck className={st.tick} aria-hidden />
        </div>
        {/* SÓ O DONO, no aparelho dele. Terceiro/anônimo não vê NADA aqui — o
            tick já comunica "verificado", e oferecer um atalho para editar
            identidade alheia seria promessa falsa. */}
        {linkPerfil && preview?.souEu && (
          <Link href={perfilHref} className={st.link} style={corRotulo}>
            Identidade verificada — edite seu nome no perfil
          </Link>
        )}
      </div>
    )
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className={st.label} style={corRotulo}>
        {label}
      </span>
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
          className={st.input}
          style={estiloInput}
        />
      </div>
    </label>
  )
}
