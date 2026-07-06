"use client"

/**
 * Tela de SETUP integrada — aparece ANTES do jogo (home → setup → jogo).
 *
 * Fluxo: a home navega para /setup?quadra=X quando é uma partida NOVA. Aqui o
 * usuário (1) escolhe o ESPORTE num carrossel, (2) vê a QUADRA daquele esporte
 * como fundo imersivo, (3) ajusta as REGRAS do esporte selecionado num painel
 * que SOBE cobrindo ~metade da tela, e (4) toca JOGO! para iniciar.
 *
 * Ao iniciar, grava em localStorage a config da partida (com o esporte) e uma
 * "semente" do motor com as regras escolhidas, e navega para
 * /jogo?quadra=X&sport=ID. A tela de jogo instancia o ScoringEngine com o
 * MÓDULO do esporte escolhido (ver app/jogo/page.tsx + lib/sports-catalog.ts).
 *
 * NÃO altera lib/scoring: só consome os módulos via o catálogo.
 */

import { Suspense, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { SportCourt } from "@/components/sport-court"
import {
  SPORTS,
  ruleControlsFor,
  defaultRulesFor,
  type RuleControl,
  type SportId,
} from "@/lib/sports-catalog"

// useSearchParams() exige uma fronteira de Suspense na geração estática do
// Next (CSR bailout). O conteúdo real fica em SetupScreen; a página só o
// embrulha em <Suspense>.
export default function SetupPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Carregando...</div>}>
      <SetupScreen />
    </Suspense>
  )
}

function SetupScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const quadra = searchParams.get("quadra") || "1"

  const [sport, setSport] = useState<SportId>("tennis")
  // As regras vivem por esporte: ao trocar de esporte, resetam para os padrões
  // daquele esporte (defaultRules do módulo). O objeto é opaco aqui — os RuleControl
  // sabem ler/gravar cada campo (inclusive aninhados e o "ponto de ouro" do padel).
  const [rules, setRules] = useState<any>(() => defaultRulesFor("tennis"))
  const [panelOpen, setPanelOpen] = useState(false)

  const controls = useMemo<RuleControl[]>(() => ruleControlsFor(sport), [sport])

  const selectSport = (id: SportId) => {
    setSport(id)
    setRules(defaultRulesFor(id)) // troca de esporte ⇒ regras padrão do novo esporte
  }

  const startGame = () => {
    // Config da partida (mantém as MESMAS chaves do fluxo atual — placar/QR leem
    // `tennis_match_${quadra}` — apenas acrescenta o campo `sport`).
    const config = {
      quadra,
      sport,
      gameType: "simples",
      scoreType: "pontos",
      players: {
        blue1: "Jogador 1",
        blue2: "Jogador 2",
        red1: "Jogador 3",
        red2: "Jogador 4",
      },
      startTime: new Date().toISOString(),
      // maxSets espelha o formato (bestOf) para os controles existentes da tela de jogo.
      maxSets: rules.bestOf ?? 3,
    }
    localStorage.setItem(`tennis_match_${quadra}`, JSON.stringify(config))

    // Semente do motor com as regras ESCOLHIDAS (a tela de jogo reconstrói a
    // partir daqui; sem ações ainda). É o que faz o placar contar como o esporte
    // certo desde o primeiro ponto.
    localStorage.setItem(
      `tennis_engine_${quadra}`,
      JSON.stringify({ rules, firstServer: "A", actions: [] }),
    )
    // Limpa qualquer pontuação/escore antigo desta quadra.
    localStorage.removeItem(`tennis_score_${quadra}`)

    router.push(`/jogo?quadra=${quadra}&sport=${sport}`)
  }

  return (
    <div
      className="relative flex flex-col h-[100dvh] overflow-hidden"
      style={{ backgroundColor: "var(--palco-fundo)", color: "var(--setup-texto)" }}
    >
      {/* Fundo: a QUADRA do esporte selecionado (SVG), imersiva. */}
      <SportCourt sport={sport} />

      {/* Carrossel de esportes (topo). Fica acima da quadra. */}
      <div className="relative z-10 px-3 pt-4">
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

      {/* Área da quadra (resto da tela). Quando o painel está aberto, tocar aqui
          (na metade visível) fecha o painel para ver a quadra inteira. */}
      <button
        type="button"
        aria-label="Ver a quadra inteira"
        onClick={() => panelOpen && setPanelOpen(false)}
        className="relative z-10 flex-1 w-full cursor-default"
        tabIndex={-1}
      />

      {/* Botão flutuante para ABRIR as regras (visível só com o painel fechado):
          antes disso a quadra aparece inteira (imersiva). */}
      {!panelOpen && (
        <div className="relative z-10 px-4 pb-6">
          <button type="button" className="play-button" onClick={() => setPanelOpen(true)}>
            CONFIGURAR &amp; JOGAR
          </button>
        </div>
      )}

      {/* Painel de regras: SOBE cobrindo ~metade da tela; a quadra segue visível
          na metade de cima. Só as regras do esporte selecionado aparecem. */}
      <div
        className={`setup-panel absolute bottom-0 left-0 right-0 z-20 max-h-[62vh] flex flex-col ${
          panelOpen ? "open" : ""
        }`}
        role="dialog"
        aria-label="Regras do esporte"
        aria-hidden={!panelOpen}
      >
        {/* Puxador + cabeçalho (nome do esporte + fechar). */}
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

        {/* Toggles das regras (scrollável se não couber). */}
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

        {/* JOGO!: inicia a partida com o esporte + regras escolhidos. */}
        <div className="px-5 pt-2 pb-6">
          <button type="button" className="play-button" onClick={startGame}>
            JOGO!
          </button>
        </div>
      </div>
    </div>
  )
}

function sportName(id: SportId): string {
  return SPORTS.find((s) => s.id === id)?.name ?? "Tênis"
}
