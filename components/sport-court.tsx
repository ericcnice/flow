"use client"

/**
 * Fundo de QUADRA por esporte — desenho em SVG puro (NADA de foto/imagem).
 * Versão SIMPLES mas reconhecível: cada esporte tem sua superfície + linhas
 * características. O capricho fino de cada quadra é etapa FUTURA; aqui basta
 * "bater o olho e saber qual esporte é".
 *
 * Todas as cores vêm de variáveis CSS (definidas em globals.css, prefixo
 * --quadra-*), para que temas/palcos futuros troquem só as variáveis.
 *
 * O SVG preenche o container (preserveAspectRatio none-ish via width/height
 * 100%) e é puramente decorativo (aria-hidden) — a quadra é fundo imersivo.
 */

import type { ReactElement } from "react"
import type { SportId } from "@/lib/sports-catalog"

const LINE = "var(--quadra-linha)" // linhas brancas padrão
const STROKE = 1.4

/** Tênis: superfície de saibro (padrão) + linhas brancas da quadra. */
function TennisCourt() {
  return (
    <svg viewBox="0 0 100 150" className="court-svg" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect x="0" y="0" width="100" height="150" fill="var(--quadra-tenis-fundo)" />
      {/* Quadra externa */}
      <rect x="16" y="18" width="68" height="114" fill="var(--quadra-tenis-piso)" stroke={LINE} strokeWidth={STROKE} />
      {/* Corredores de duplas */}
      <line x1="24" y1="18" x2="24" y2="132" stroke={LINE} strokeWidth={STROKE} />
      <line x1="76" y1="18" x2="76" y2="132" stroke={LINE} strokeWidth={STROKE} />
      {/* Linhas de saque */}
      <line x1="24" y1="52" x2="76" y2="52" stroke={LINE} strokeWidth={STROKE} />
      <line x1="24" y1="98" x2="76" y2="98" stroke={LINE} strokeWidth={STROKE} />
      {/* Linha central de saque */}
      <line x1="50" y1="52" x2="50" y2="98" stroke={LINE} strokeWidth={STROKE} />
      {/* Marca central */}
      <line x1="50" y1="18" x2="50" y2="22" stroke={LINE} strokeWidth={STROKE} />
      <line x1="50" y1="128" x2="50" y2="132" stroke={LINE} strokeWidth={STROKE} />
      {/* Rede */}
      <line x1="12" y1="75" x2="88" y2="75" stroke="var(--quadra-rede)" strokeWidth={STROKE * 1.6} strokeDasharray="2 2" />
    </svg>
  )
}

/** Beach tennis: areia (bege/dourado) + linha da rede ao centro. */
function BeachCourt() {
  return (
    <svg viewBox="0 0 100 150" className="court-svg" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect x="0" y="0" width="100" height="150" fill="var(--quadra-beach-areia)" />
      {/* Textura sutil da areia */}
      <g opacity="0.5">
        <circle cx="20" cy="30" r="0.7" fill="var(--quadra-beach-pontos)" />
        <circle cx="70" cy="45" r="0.7" fill="var(--quadra-beach-pontos)" />
        <circle cx="40" cy="110" r="0.7" fill="var(--quadra-beach-pontos)" />
        <circle cx="82" cy="120" r="0.7" fill="var(--quadra-beach-pontos)" />
        <circle cx="30" cy="70" r="0.7" fill="var(--quadra-beach-pontos)" />
      </g>
      {/* Contorno da quadra (fitas) */}
      <rect x="18" y="24" width="64" height="102" fill="none" stroke={LINE} strokeWidth={STROKE} />
      {/* Rede ao centro */}
      <line x1="10" y1="75" x2="90" y2="75" stroke="var(--quadra-rede)" strokeWidth={STROKE * 2} strokeDasharray="3 2.5" />
      {/* Postes */}
      <circle cx="10" cy="75" r="2" fill="var(--quadra-rede)" />
      <circle cx="90" cy="75" r="2" fill="var(--quadra-rede)" />
    </svg>
  )
}

/** Padel: piso azul + paredes de vidro (contorno grosso) sugerindo a estrutura. */
function PadelCourt() {
  return (
    <svg viewBox="0 0 100 150" className="court-svg" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect x="0" y="0" width="100" height="150" fill="var(--quadra-padel-fundo)" />
      {/* Paredes de vidro (moldura externa grossa) */}
      <rect
        x="12"
        y="20"
        width="76"
        height="110"
        fill="var(--quadra-padel-piso)"
        stroke="var(--quadra-padel-vidro)"
        strokeWidth={STROKE * 2.6}
      />
      {/* Linhas de saque */}
      <line x1="12" y1="48" x2="88" y2="48" stroke={LINE} strokeWidth={STROKE} />
      <line x1="12" y1="102" x2="88" y2="102" stroke={LINE} strokeWidth={STROKE} />
      {/* Linha central de saque */}
      <line x1="50" y1="48" x2="50" y2="102" stroke={LINE} strokeWidth={STROKE} />
      {/* Rede */}
      <line x1="12" y1="75" x2="88" y2="75" stroke="var(--quadra-rede)" strokeWidth={STROKE * 1.6} strokeDasharray="2 2" />
    </svg>
  )
}

/** Squash: parede frontal de MADEIRA CLARA (bege/creme) com as linhas
 * vermelhas características (out line, linha de saque, tin) e as caixas de saque. */
function SquashCourt() {
  return (
    <svg viewBox="0 0 100 150" className="court-svg" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect x="0" y="0" width="100" height="150" fill="var(--quadra-squash-parede)" />
      {/* Veios da madeira (tábuas verticais) — bem sutis, só para dar a textura. */}
      <g stroke="var(--quadra-squash-grao)" strokeWidth="1">
        <line x1="20" y1="0" x2="20" y2="150" />
        <line x1="40" y1="0" x2="40" y2="150" />
        <line x1="60" y1="0" x2="60" y2="150" />
        <line x1="80" y1="0" x2="80" y2="150" />
      </g>
      {/* Out line (linha de fora, no alto) */}
      <line x1="10" y1="26" x2="90" y2="26" stroke="var(--quadra-squash-linha)" strokeWidth={STROKE * 1.6} />
      {/* Linha de saque (service line) */}
      <line x1="10" y1="70" x2="90" y2="70" stroke="var(--quadra-squash-linha)" strokeWidth={STROKE * 1.6} />
      {/* Tin (linha baixa, mais grossa) */}
      <line x1="10" y1="122" x2="90" y2="122" stroke="var(--quadra-squash-linha)" strokeWidth={STROKE * 2.4} />
      {/* Linha central vertical entre saque e tin */}
      <line x1="50" y1="70" x2="50" y2="122" stroke="var(--quadra-squash-linha)" strokeWidth={STROKE * 1.6} />
      {/* Caixas de saque */}
      <rect x="10" y="70" width="22" height="22" fill="none" stroke="var(--quadra-squash-linha)" strokeWidth={STROKE} />
      <rect x="68" y="70" width="22" height="22" fill="none" stroke="var(--quadra-squash-linha)" strokeWidth={STROKE} />
    </svg>
  )
}

/** Ping pong: mesa azul vista de cima + linha central branca + rede. */
function TableTennisCourt() {
  return (
    <svg viewBox="0 0 100 150" className="court-svg" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect x="0" y="0" width="100" height="150" fill="var(--quadra-pingpong-fundo)" />
      {/* Tampo da mesa */}
      <rect
        x="14"
        y="20"
        width="72"
        height="110"
        fill="var(--quadra-pingpong-mesa)"
        stroke={LINE}
        strokeWidth={STROKE * 1.4}
      />
      {/* Linha central (comprida) */}
      <line x1="50" y1="20" x2="50" y2="130" stroke={LINE} strokeWidth={STROKE} />
      {/* Rede ao centro (transversal) */}
      <line x1="10" y1="75" x2="90" y2="75" stroke="var(--quadra-rede)" strokeWidth={STROKE * 2.2} />
      {/* Postes da rede */}
      <circle cx="10" cy="75" r="1.8" fill="var(--quadra-rede)" />
      <circle cx="90" cy="75" r="1.8" fill="var(--quadra-rede)" />
    </svg>
  )
}

/** Pickleball: quadra verde/azul + linhas + a "kitchen" (zona de não-voleio). */
function PickleballCourt() {
  return (
    <svg viewBox="0 0 100 150" className="court-svg" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect x="0" y="0" width="100" height="150" fill="var(--quadra-pickle-fundo)" />
      {/* Quadra */}
      <rect x="16" y="22" width="68" height="106" fill="var(--quadra-pickle-piso)" stroke={LINE} strokeWidth={STROKE} />
      {/* Kitchen (zona central de não-voleio), destacada */}
      <rect x="16" y="61" width="68" height="28" fill="var(--quadra-pickle-kitchen)" stroke={LINE} strokeWidth={STROKE} />
      {/* Linhas centrais de saque (fora da kitchen) */}
      <line x1="50" y1="22" x2="50" y2="61" stroke={LINE} strokeWidth={STROKE} />
      <line x1="50" y1="89" x2="50" y2="128" stroke={LINE} strokeWidth={STROKE} />
      {/* Rede */}
      <line x1="10" y1="75" x2="90" y2="75" stroke="var(--quadra-rede)" strokeWidth={STROKE * 1.6} strokeDasharray="2 2" />
    </svg>
  )
}

const COURTS: Record<SportId, () => ReactElement> = {
  tennis: TennisCourt,
  beach: BeachCourt,
  padel: PadelCourt,
  squash: SquashCourt,
  tabletennis: TableTennisCourt,
  pickleball: PickleballCourt,
}

/** Renderiza a quadra do esporte informado (fundo decorativo de tela cheia). */
export function SportCourt({ sport }: { sport: SportId }) {
  const Court = COURTS[sport] ?? TennisCourt
  return (
    <div className="court-bg" aria-hidden>
      <Court />
    </div>
  )
}

/**
 * Mini-ícone da quadra (o MESMO SVG, sem o wrapper de fundo) para o seletor de
 * esportes: renderizado dentro de um container pequeno (.court-glyph). O viewBox
 * é 2:3, então num box 2:3 a quadra aparece inteira, sem corte.
 */
export function SportCourtGlyph({ sport }: { sport: SportId }) {
  const Court = COURTS[sport] ?? TennisCourt
  return <Court />
}
