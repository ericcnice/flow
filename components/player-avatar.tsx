"use client"

/**
 * AVATAR DO JOGADOR — o primeiro avatar COMPARTILHADO do app.
 *
 * Até aqui havia três cópias inline do mesmo desenho (app/dashboard/players/
 * members-list.tsx, o bloco "Dados do aluno" do /perfil e o AvatarUploader).
 * Esta peça nasce para o popup de nomes (1b.2a) e é a mesma que a transmissão
 * vai usar (1b.2b) — a foto tem que ser IDÊNTICA nos dois lugares, senão o
 * "espelho" mente sobre como a pessoa vai aparecer.
 *
 * TRÊS ESTADOS, nesta ordem:
 *   1. FOTO      — url do Storage. `onError` cai na inicial: URL morta nunca
 *                  vira imagem rasgada (o padrão do members-list).
 *   2. INICIAL   — sem foto, mas com nome real → círculo neutro com a letra.
 *   3. VAZIO     — nome ainda em fallback ("Player 2") → círculo neutro SEM
 *                  letra. Um "P" idêntico em todos os slots não identifica
 *                  ninguém e parece bug.
 *
 * NEUTRO de propósito (sem cor por hash): a assimetria que o funil precisa é
 * FOTO vs. SEM FOTO. Cor por pessoa acrescentaria ruído a um popup que já tem
 * verde (tick), branco (input) e a cor do lado.
 *
 * Sem estado de rede, sem fetch: recebe a url pronta (quem resolve é
 * lib/supabase/player-cards). Offline exibe o que veio; nada aqui espera nada.
 */

import { useState } from "react"

/**
 * Nome ainda no rótulo automático ("Player 1", legado "Jogador 1", vazio).
 * Cópia deliberada da regra de app/jogo/page.tsx: importar de lá criaria ciclo
 * (a página importa este componente). Se um terceiro lugar precisar, aí sim
 * vale extrair para lib/.
 */
function nomeEhFallback(n: string): boolean {
  const t = (n ?? "").trim()
  return !t || /^(player|jogador)\s*\d?$/i.test(t)
}

export function PlayerAvatar({
  url,
  nome,
  size = 40,
  isFallback,
  className = "",
}: {
  /** URL pública do Storage. null/ausente → cai na inicial. */
  url?: string | null
  nome: string
  size?: number
  /** Força o estado VAZIO. Ausente → deduz do próprio nome. */
  isFallback?: boolean
  className?: string
}) {
  const [falhou, setFalhou] = useState(false)
  const mostraFoto = Boolean(url) && !falhou
  const vazio = isFallback ?? nomeEhFallback(nome)
  const inicial = vazio ? "" : (nome ?? "").trim().charAt(0).toUpperCase()

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/10 ring-1 ring-white/15 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {mostraFoto ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={url as string}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFalhou(true)}
        />
      ) : inicial ? (
        <span
          className="font-bold uppercase leading-none text-white/70"
          style={{ fontSize: Math.round(size * 0.4) }}
        >
          {inicial}
        </span>
      ) : (
        /* VAZIO: glifo sutil de pessoa — um contorno, não uma letra falsa. */
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          className="text-white/25"
          style={{ width: Math.round(size * 0.5), height: Math.round(size * 0.5) }}
        >
          <circle cx="12" cy="8" r="3.5" />
          <path d="M4.5 20a7.5 7.5 0 0 1 15 0" strokeLinecap="round" />
        </svg>
      )}
    </span>
  )
}
