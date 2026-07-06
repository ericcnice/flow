"use client"

/**
 * Superfície de configuração ÚNICA do app: carrossel de esportes + quadra SVG de
 * fundo + painel de regras que sobe cobrindo ~metade da tela. É usada em DOIS
 * lugares, com o MESMO visual, para não haver dois padrões de configuração:
 *
 *  - PARTIDA NOVA  (app/setup/page.tsx): context="new" — botão "JOGO!" inicia.
 *  - DENTRO DO JOGO (app/jogo/page.tsx): context="ingame" — abre JÁ no esporte
 *    e nas regras vigentes; o botão vira "APLICAR REGRAS" (mesmo esporte) ou
 *    "TROCAR ESPORTE" (outro esporte). Quem decide o que fazer com a escolha é o
 *    pai, via onConfirm(sport, rules, sportChanged).
 *
 * O componente é PRESENTACIONAL: mantém só o estado da seleção (esporte + regras
 * + painel aberto). NÃO fala com o motor nem com localStorage — isso é do pai.
 * NÃO altera lib/scoring (consome o catálogo).
 */

import { useMemo, useState, type ReactNode } from "react"
import { SportCourt } from "@/components/sport-court"
import { SPORTS, ruleControlsFor, defaultRulesFor, type RuleControl, type SportId } from "@/lib/sports-catalog"

export type SportSetupContext = "new" | "ingame"

export function SportSetup({
  initialSport,
  initialRules,
  context,
  onConfirm,
  onClose,
  footer,
  startPanelOpen,
}: {
  /** Esporte pré-selecionado (no jogo: o que está sendo jogado). */
  initialSport: SportId
  /** Regras iniciais dos toggles (no jogo: as regras vigentes da partida). */
  initialRules: any
  context: SportSetupContext
  /** Chamado no botão primário. sportChanged=true quando o esporte mudou. */
  onConfirm: (sport: SportId, rules: any, sportChanged: boolean) => void
  /** Fechar sem confirmar (ingame: volta ao jogo). Ausente = sem "X". */
  onClose?: () => void
  /** Conteúdo extra no rodapé do painel (ingame: ações da partida). */
  footer?: ReactNode
  /** Abrir o painel de regras já de cara (ingame: true). */
  startPanelOpen?: boolean
}) {
  const [sport, setSport] = useState<SportId>(initialSport)
  const [rules, setRules] = useState<any>(initialRules)
  const [panelOpen, setPanelOpen] = useState<boolean>(startPanelOpen ?? context === "ingame")

  const controls = useMemo<RuleControl[]>(() => ruleControlsFor(sport), [sport])
  const sportChanged = sport !== initialSport

  const selectSport = (id: SportId) => {
    setSport(id)
    // Voltar ao esporte inicial restaura as regras vigentes (para "aplicar" sem
    // querer não mudar nada); trocar para outro esporte usa os padrões dele.
    setRules(id === initialSport ? initialRules : defaultRulesFor(id))
  }

  const primaryLabel = context === "new" ? "JOGO!" : sportChanged ? "TROCAR ESPORTE" : "APLICAR REGRAS"

  return (
    <div
      className="relative flex flex-col h-full overflow-hidden"
      style={{ backgroundColor: "var(--palco-fundo)", color: "var(--setup-texto)" }}
    >
      {/* Fundo: a QUADRA do esporte selecionado (SVG), imersiva. */}
      <SportCourt sport={sport} />

      {/* Carrossel de esportes (topo). Com "X" à esquerda no modo ingame. */}
      <div className="relative z-10 px-3 pt-4 flex items-center gap-2">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar e voltar ao jogo"
            className="sport-chip shrink-0"
          >
            ✕
          </button>
        )}
        <div className="sport-carousel">
          {SPORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectSport(s.id)}
              className={`sport-chip ${s.id === sport ? "on" : ""}`}
              aria-pressed={s.id === sport}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {/* Área da quadra: tocar aqui (na metade visível) recolhe o painel. */}
      <button
        type="button"
        aria-label="Ver a quadra inteira"
        onClick={() => panelOpen && setPanelOpen(false)}
        className="relative z-10 flex-1 w-full cursor-default"
        tabIndex={-1}
      />

      {/* Botão para ABRIR o painel (visível só com o painel fechado). */}
      {!panelOpen && (
        <div className="relative z-10 px-4 pb-6">
          <button type="button" className="play-button" onClick={() => setPanelOpen(true)}>
            {context === "new" ? "CONFIGURAR & JOGAR" : "AJUSTAR REGRAS"}
          </button>
        </div>
      )}

      {/* Painel de regras: SOBE cobrindo ~metade da tela; a quadra segue visível. */}
      <div
        className={`setup-panel absolute bottom-0 left-0 right-0 z-20 max-h-[68vh] flex flex-col ${
          panelOpen ? "open" : ""
        }`}
        role="dialog"
        aria-label="Regras do esporte"
        aria-hidden={!panelOpen}
      >
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <span className="text-xs uppercase tracking-[0.2em] opacity-60">Regras · {sportName(sport)}</span>
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            aria-label="Recolher regras"
            className="text-xs uppercase tracking-widest opacity-60 px-2 py-1"
          >
            Ver quadra
          </button>
        </div>

        {/* Toggles das regras (só as do esporte selecionado). */}
        <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-4">
          {controls.map((c) => {
            const current = c.get(rules)
            return (
              <div key={c.key}>
                <div className="text-sm font-semibold mb-2 opacity-90">{c.label}</div>
                <div className="rule-group">
                  {c.options.map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setRules(c.set(rules, opt.value))}
                      className={`rule-option ${current === opt.value ? "on" : ""}`}
                      aria-pressed={current === opt.value}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Botão primário + rodapé opcional (ações da partida no modo ingame). */}
        <div className="px-5 pt-2 pb-6 space-y-3">
          {context === "ingame" && sportChanged && (
            <p className="text-xs opacity-70 leading-snug">
              Trocar de esporte inicia uma NOVA partida (o placar atual será descartado).
            </p>
          )}
          <button type="button" className="play-button" onClick={() => onConfirm(sport, rules, sportChanged)}>
            {primaryLabel}
          </button>
          {footer}
        </div>
      </div>
    </div>
  )
}

function sportName(id: SportId): string {
  return SPORTS.find((s) => s.id === id)?.name ?? "Tênis"
}
