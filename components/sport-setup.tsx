"use client"

/**
 * Superfície de configuração ÚNICA do app: um CARD CLARO ancorado na base, com a
 * QUADRA (SVG) visível ACIMA dele. É usada em DOIS lugares, com o MESMO visual,
 * para não haver dois padrões de configuração:
 *
 *  - PARTIDA NOVA  (app/setup/page.tsx): context="new".
 *  - DENTRO DO JOGO (app/jogo/page.tsx): context="ingame" — abre JÁ no esporte e
 *    nas regras vigentes; o botão volta pro placar aplicando o que foi escolhido.
 *    Quem decide o efeito é o pai, via onConfirm(sport, rules, sportChanged).
 *
 * Estrutura do card (referência de design): [seletor de esportes no topo] →
 * [regras + ações secundárias no MIOLO rolável] → [CTA "JOGAR" FIXO na base].
 * As regras se aplicam no toque (sem "salvar"); o CTA fecha e vai pro placar.
 *
 * O componente é PRESENTACIONAL: mantém só o estado da seleção (esporte + regras).
 * NÃO fala com o motor nem com localStorage. NÃO altera lib/scoring.
 */

import { useMemo, useState, type ReactNode } from "react"
import { X } from "lucide-react"
import { SportCourt, SportCourtGlyph } from "@/components/sport-court"
import { SPORTS, ruleControlsFor, defaultRulesFor, sideChangeOf, type RuleControl, type SportId } from "@/lib/sports-catalog"
import { THEMES, DEFAULT_THEME, themeClassName, type ThemeId } from "@/lib/themes"

export type SportSetupContext = "new" | "ingame"

// Nomes curtos e discretos exibidos sob cada mini-quadra do seletor.
const SHORT_NAME: Record<SportId, string> = {
  tennis: "Tênis",
  beach: "Beach",
  padel: "Padel",
  squash: "Squash",
  tabletennis: "Ping Pong",
  pickleball: "Pickleball",
}

export function SportSetup({
  initialSport,
  initialRules,
  initialTheme,
  initialSideChangeAlert,
  initialGameType,
  context,
  onConfirm,
  onClose,
  footer,
}: {
  /** Esporte pré-selecionado (no jogo: o que está sendo jogado). */
  initialSport: SportId
  /** Regras iniciais dos toggles (no jogo: as regras vigentes da partida). */
  initialRules: any
  /** Tema de cor pré-selecionado (default Neutro). Parte da config da partida. */
  initialTheme?: ThemeId
  /** Aviso de troca de lado ligado? Padrão DESLIGADO. Só aparece o toggle em
   *  esportes com troca de lado (sideChange !== 'none'). */
  initialSideChangeAlert?: boolean
  /** Simples/duplas inicial. Ausente = 'duplas' (95% dos jogos do clube). */
  initialGameType?: string
  context: SportSetupContext
  /** Chamado no CTA. sportChanged=true quando o esporte mudou; theme = tema
   *  escolhido; sideChangeAlert = aviso de troca; gameType = simples/duplas. */
  onConfirm: (
    sport: SportId,
    rules: any,
    sportChanged: boolean,
    theme: ThemeId,
    sideChangeAlert: boolean,
    gameType: string,
  ) => void
  /** Fechar sem confirmar (ingame: volta ao jogo). Ausente = sem "X". */
  onClose?: () => void
  /** Conteúdo extra no miolo (ingame: ações secundárias da partida). */
  footer?: ReactNode
}) {
  const [sport, setSport] = useState<SportId>(initialSport)
  const [rules, setRules] = useState<any>(initialRules)
  const [theme, setTheme] = useState<ThemeId>(initialTheme ?? DEFAULT_THEME)
  const [sideChangeAlert, setSideChangeAlert] = useState<boolean>(initialSideChangeAlert ?? false)
  // Simples/duplas. Default 'duplas' para partida nova (initialGameType ausente).
  const [gameType, setGameType] = useState<string>(initialGameType ?? "duplas")

  const controls = useMemo<RuleControl[]>(() => ruleControlsFor(sport), [sport])
  const sportChanged = sport !== initialSport
  // Só faz sentido oferecer o aviso onde o esporte troca de lado.
  const temTrocaDeLado = sideChangeOf(sport) !== "none"

  const selectSport = (id: SportId) => {
    setSport(id)
    // Voltar ao esporte inicial restaura as regras vigentes; trocar para outro
    // esporte usa os padrões dele.
    setRules(id === initialSport ? initialRules : defaultRulesFor(id))
  }

  return (
    <div
      className={`relative flex flex-col h-full overflow-hidden ${themeClassName(theme)}`}
      style={{ backgroundColor: "var(--palco-fundo)" }}
    >
      {/* Fundo: a QUADRA do esporte selecionado (SVG), visível ACIMA do card. */}
      <SportCourt sport={sport} />

      {/* Fechar (ingame): flutua sobre a quadra, no canto. */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar e voltar ao jogo"
          className="glass absolute top-4 right-4 z-30 rounded-full p-3 active:scale-95 transition-transform"
        >
          <X className="h-5 w-5" />
        </button>
      )}

      {/* Empurra o card para a base; a quadra respira no espaço acima. */}
      <div className="relative z-10 flex-1" aria-hidden />

      {/* CARD CLARO único: seletor → miolo rolável → CTA fixo. */}
      <div className="setup-card relative z-20 flex flex-col max-h-[74vh]">
        {/* TOPO do card: seletor de esportes = mini-quadras + nome cinza. */}
        <div className="px-4 pt-4">
          <div className="setup-selector">
            {SPORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => selectSport(s.id)}
                className={`court-option ${s.id === sport ? "on" : ""}`}
                aria-pressed={s.id === sport}
                aria-label={SHORT_NAME[s.id]}
              >
                <span className="court-glyph">
                  <SportCourtGlyph sport={s.id} />
                </span>
                <span className="court-option-name">{SHORT_NAME[s.id]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* MIOLO rolável: regras do esporte + ações secundárias. NÃO inclui o CTA. */}
        <div className="flex-1 overflow-y-auto px-4 pt-1 pb-3 space-y-4">
          {context === "ingame" && sportChanged && (
            <p className="text-xs leading-snug" style={{ color: "var(--setup-card-cinza)" }}>
              Trocar de esporte inicia uma NOVA partida (o placar atual será descartado).
            </p>
          )}

          {/* SIMPLES/DUPLAS — propriedade fundamental da partida (define quantas
              pílulas de nome). Antes das regras de propósito. Molde rule-group. */}
          <div>
            <div className="text-sm font-semibold mb-2">Formato</div>
            <div className="rule-group">
              {[
                { label: "Simples", value: "simples" },
                { label: "Duplas", value: "duplas" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGameType(opt.value)}
                  className={`rule-option ${gameType === opt.value ? "on" : ""}`}
                  aria-pressed={gameType === opt.value}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {controls.map((c) => {
            const current = c.get(rules)
            return (
              <div key={c.key}>
                <div className="text-sm font-semibold mb-2">{c.label}</div>
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

          {/* AVISO DE TROCA DE LADO — só em esportes que trocam de lado. Padrão
              DESLIGADO (aviso não solicitado é ruído em quadra); o swipe para
              espelhar segue disponível independente disto. Mesmo visual dos
              toggles de regra (rule-group). */}
          {temTrocaDeLado && (
            <div>
              <div className="text-sm font-semibold mb-2">Avisar troca de lado</div>
              <div className="rule-group">
                {[
                  { label: "Não", value: false },
                  { label: "Sim", value: true },
                ].map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => setSideChangeAlert(opt.value)}
                    className={`rule-option ${sideChangeAlert === opt.value ? "on" : ""}`}
                    aria-pressed={sideChangeAlert === opt.value}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CORES (tema/palco) — no FIM das opções: personalização, não config
              de rotina. Amostras tocáveis; a ativa fica destacada. Aplica o
              tema por partida (persiste na config junto de esporte + regras). */}
          <div>
            <div className="text-sm font-semibold mb-2">Cores</div>
            <div className="theme-swatches">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  className={`theme-swatch ${t.id === theme ? "on" : ""}`}
                  aria-pressed={t.id === theme}
                  aria-label={`Tema ${t.label}`}
                  title={t.label}
                >
                  <span className="theme-swatch-chip">
                    <span style={{ backgroundColor: t.aBg, color: t.aText }}>15</span>
                    <span style={{ backgroundColor: t.bBg, color: t.bText }}>30</span>
                  </span>
                  <span className="theme-swatch-name">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {footer}
        </div>

        {/* BASE do card: CTA JOGAR FIXO (fora do scroll), sempre visível. */}
        <div className="px-4 pt-3 pb-5 border-t" style={{ borderColor: "var(--setup-card-borda)" }}>
          <button
            type="button"
            className="play-button"
            onClick={() => onConfirm(sport, rules, sportChanged, theme, sideChangeAlert, gameType)}
          >
            JOGAR
          </button>
        </div>
      </div>
    </div>
  )
}
