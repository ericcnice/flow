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
import { X, ChevronDown } from "lucide-react"
import { SlotRow, type SlotPreview } from "@/components/slot-row"
import { QRCodeGenerator } from "@/components/qr-code"
import { SportCourtGlyph } from "@/components/sport-court"
import { SPORTS, ruleControlsFor, defaultRulesFor, sideChangeOf, type RuleControl, type SportId } from "@/lib/sports-catalog"
import { THEMES, DEFAULT_THEME, themeClassName, type ThemeId } from "@/lib/themes"

export type SportSetupContext = "new" | "ingame"

/**
 * Abas da superfície de configuração. "jogo" = as REGRAS (o conteúdo de sempre);
 * "players" = os JOGADORES, que hoje vivem num popup escuro separado e migram
 * para cá numa fatia seguinte. Nesta fatia a aba Players é só o lugar reservado.
 */
export type SportSetupTab = "jogo" | "players"

/** Os quatro lugares da partida, na ordem global (blue1=1 … red2=4). */
export type SetupSlotKey = "blue1" | "blue2" | "red1" | "red2"
export type SetupPlayers = Record<SetupSlotKey, string>

// Nomes curtos e discretos exibidos sob cada mini-quadra do seletor.
const SHORT_NAME: Record<SportId, string> = {
  tennis: "Tênis",
  beach: "Beach",
  padel: "Padel",
  squash: "Squash",
  tabletennis: "Ping Pong",
  pickleball: "Pickleball",
}


/**
 * TOGGLE SIMPLES/DUPLAS — o MESMO controle nas duas abas.
 *
 * Aparece no "Formato" da aba Jogo/Quadra (onde vive junto das outras regras) e
 * acima dos times na aba Players (onde a pessoa está justamente organizando
 * quem joga). Não são duas fontes: os dois chamam o mesmo `onSelect` e leem o
 * mesmo `gameType` do SportSetup — mudar num aparece no outro porque É o mesmo
 * estado, não uma cópia sincronizada.
 */
function ToggleFormato({
  gameType,
  onSelect,
}: {
  gameType: string
  onSelect: (v: string) => void
}) {
  return (
    <div className="rule-group">
      {[
        { label: "Simples", value: "simples" },
        { label: "Duplas", value: "duplas" },
      ].map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(opt.value)}
          className={`rule-option ${gameType === opt.value ? "on" : ""}`}
          aria-pressed={gameType === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/** Separador discreto entre os dois lados. */
function Vs() {
  return (
    <div className="flex items-center gap-3 py-0.5" aria-hidden>
      <span className="h-px flex-1" style={{ backgroundColor: "var(--setup-card-borda)" }} />
      <span
        className="text-xs font-black uppercase tracking-[0.2em]"
        style={{ color: "var(--setup-card-cinza)" }}
      >
        vs
      </span>
      <span className="h-px flex-1" style={{ backgroundColor: "var(--setup-card-borda)" }} />
    </div>
  )
}

/**
 * CARD DE TIME (só em duplas): agrupa os dois parceiros. A cor do tema entra
 * como ACENTO (o ponto ao lado do rótulo), nunca como fundo — o fundo é o papel
 * claro do card, igual ao resto da tela. A distinção dos times vem do
 * agrupamento + do acento, não de duas cores brigando com o conteúdo.
 */
function CardTime({
  rotulo,
  acento,
  children,
}: {
  rotulo: string
  acento: string
  children: ReactNode
}) {
  return (
    <div
      className="space-y-3 rounded-2xl border-2 p-3"
      style={{ borderColor: "var(--setup-card-borda)" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: acento }}
          aria-hidden
        />
        <span
          className="text-xs font-bold uppercase tracking-wide"
          style={{ color: "var(--setup-card-cinza)" }}
        >
          {rotulo}
        </span>
      </div>
      {children}
    </div>
  )
}

/**
 * ABA PLAYERS — os jogadores da partida na linguagem do card claro.
 *
 * DUPLAS: dois CARDS DE TIME empilhados (Doubles 1 / vs / Doubles 2), cada um
 * com seus dois slots. SIMPLES: os dois slots DIRETOS, sem card aninhado — não
 * há "time" para agrupar, e uma caixa em volta de um jogador só seria moldura
 * vazia.
 *
 * `linkPerfil` vai SEMPRE ligado: qualquer slot com souEu mostra o atalho. A
 * assimetria do popup (link só no 1º) era resquício de quando só blue1 podia ter
 * identidade — com a 1c.1, qualquer lugar pode ser de alguém.
 *
 * SEM botão de salvar: o nome grava ao SAIR do campo (onBlur) e, como rede de
 * segurança, em qualquer saída da aba (trocar de aba, fechar, JOGAR). Quem toca
 * direto no JOGAR sem sair do campo não perde o que digitou.
 */
function AbaPlayers({
  duplas,
  gameType,
  onFormato,
  nomes,
  setNomes,
  previews,
  perfilHref,
  onSalvar,
  onLogin,
  entrarUrl,
}: {
  duplas: boolean
  /** Estado do formato — o MESMO do SportSetup, não uma cópia. */
  gameType: string
  onFormato: (v: string) => void
  nomes: SetupPlayers
  setNomes: (fn: (p: SetupPlayers) => SetupPlayers) => void
  previews?: Partial<Record<SetupSlotKey, SlotPreview | null>>
  perfilHref: string
  onSalvar: () => void
  /** Deslogado: "este slot sou eu". Ausente = logado (ou sem auth) → sem convite. */
  onLogin?: (slot: SetupSlotKey) => void
  entrarUrl?: string
}) {
  const linha = (slot: SetupSlotKey, label: string) => (
    <SlotRow
      variant="card"
      label={label}
      valor={nomes[slot]}
      onChange={(v) => setNomes((p) => ({ ...p, [slot]: v }))}
      onEnter={onSalvar}
      onBlur={onSalvar}
      preview={previews?.[slot] ?? null}
      perfilHref={perfilHref}
      linkPerfil
      onLogin={onLogin ? () => onLogin(slot) : undefined}
    />
  )

  return (
    <div className="space-y-3">
      {/* FORMATO também aqui: é organizando os jogadores que se percebe que a
          partida virou simples (ou que falta gente para duplas). Mesmo controle,
          mesmo estado da aba Jogo/Quadra — trocar aqui reflete lá e vice-versa. */}
      <div>
        <div
          className="mb-1.5 text-xs font-bold uppercase tracking-wide"
          style={{ color: "var(--setup-card-cinza)" }}
        >
          Formato
        </div>
        <ToggleFormato gameType={gameType} onSelect={onFormato} />
      </div>

      {duplas ? (
        <>
          <CardTime rotulo="Doubles 1" acento="var(--lado-a-bg)">
            {linha("blue1", "Player 1")}
            {linha("blue2", "Player 2")}
          </CardTime>
          <Vs />
          <CardTime rotulo="Doubles 2" acento="var(--lado-b-bg)">
            {linha("red1", "Player 3")}
            {linha("red2", "Player 4")}
          </CardTime>
        </>
      ) : (
        <>
          {linha("blue1", "Player 1")}
          <Vs />
          {linha("red1", "Player 2")}
        </>
      )}

      {/* ENTRAR NO JOGO — o QR fica SEMPRE visível abaixo dos jogadores, sem
          toggle: os dois caminhos convivem. Quem tem carteirinha escaneia e cai
          no próximo slot livre (1c.1); para quem não tem, o organizador digita
          o nome ali em cima. É um uso de 1-2 vezes no começo da partida, então
          ele não precisa disputar o topo — mas precisa estar à mão.
          Sem sala (offline/jogo local) não há link: a seção some e a aba segue
          servindo para editar nomes. */}
      {entrarUrl && (
        <div
          className="mt-1 flex flex-col items-center gap-2 rounded-2xl border-2 p-4"
          style={{ borderColor: "var(--setup-card-borda)" }}
        >
          <span
            className="text-xs font-bold uppercase tracking-wide"
            style={{ color: "var(--setup-card-cinza)" }}
          >
            Entrar no jogo
          </span>
          {/* Fundo branco atrás do QR: o off-white do card reduz o contraste que
              a leitura por câmera precisa. */}
          <span className="rounded-xl bg-white p-2.5">
            <QRCodeGenerator value={entrarUrl} size={168} />
          </span>
          <span className="text-center text-sm" style={{ color: "var(--setup-card-cinza)" }}>
            Escaneie para entrar nesta partida.
          </span>
        </div>
      )}
    </div>
  )
}

export function SportSetup({
  initialSport,
  initialRules,
  initialTheme,
  initialSideChangeAlert,
  initialGameType,
  sportFromCourt,
  context,
  players,
  playerPreviews,
  onPlayersSave,
  onGameTypeChange,
  entrarUrl,
  onSlotLogin,
  initialTab = "jogo",
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
  /** Esporte veio do CONTEXTO DE QUADRA (QR): o seletor nasce RECOLHIDO (o
   *  professor raramente troca; as regras ganham a 1ª dobra). Ausente/false =
   *  aberto sem contexto (desktop/ajustes) → seletor já expandido. */
  sportFromCourt?: boolean
  context: SportSetupContext
  /**
   * JOGADORES da partida (aba Players). AUSENTE = a aba nem aparece — é o caso
   * do /setup (partida nova), onde ainda não existe partida para ter nomes. Um
   * dado só, uma condição só: sem jogadores, sem aba.
   */
  players?: SetupPlayers
  /** Carteirinha por slot (foto/tick/souEu). Ausente = todos editáveis. */
  playerPreviews?: Partial<Record<SetupSlotKey, SlotPreview | null>>
  /** Salva os QUATRO nomes de uma vez (um único set_config no pai). */
  onPlayersSave?: (players: SetupPlayers) => void
  /**
   * FORMATO ao vivo. Presente (ingame) → tocar Simples/Duplas aplica NA HORA e
   * propaga; a aba Players revela/oculta o 3º e 4º slots no mesmo instante.
   * Ausente (/setup, partida nova) → comportamento DIFERIDO de sempre: a
   * escolha só vale no CTA, junto do resto da config — a partida ainda nem
   * existe para receber um patch.
   */
  onGameTypeChange?: (gameType: string) => void
  /**
   * LINK de editor da partida (o do QR da aba Players). Vem pronto do pai, que
   * monta com o helper compartilhado lib/share-links — a MESMA montagem do
   * ShareModal. Vazio/ausente = sala ainda não existe: a seção do QR nem
   * aparece, e a aba segue servindo para editar nomes.
   */
  entrarUrl?: string
  /**
   * DESLOGADO pede login a partir de um slot ("este slot sou eu"). Ausente =
   * nenhum convite aparece — é o caso de quem já está logado e do /setup.
   * O SLOT viaja no argumento: é ele que o pai carimba para, na volta, a
   * identidade cair NESTE lugar e não em "o próximo livre".
   */
  onSlotLogin?: (slot: SetupSlotKey) => void
  /**
   * Aba em que a tela ABRE. O botão Ajustes entra por "jogo"; tocar uma pílula
   * de jogador entrará por "players" (fatia d). Default "jogo" — por isso o
   * /setup (partida nova) não precisa passar nada e não muda de comportamento.
   */
  initialTab?: SportSetupTab
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
  // Seletor de esportes: RECOLHIDO por padrão quando o esporte veio da quadra
  // (QR) — o banner-título mostra o esporte e as regras ganham a 1ª dobra;
  // EXPANDIDO quando aberto sem contexto (a escolha do esporte importa mais).
  const [selectorOpen, setSelectorOpen] = useState<boolean>(!sportFromCourt)
  const [aba, setAba] = useState<SportSetupTab>(initialTab)

  // NOMES em edição na aba Players. Estado LOCAL (como o popup faz) — só vira
  // set_config quando a pessoa confirma, para cada tecla digitada não virar um
  // broadcast.
  const [nomes, setNomes] = useState<SetupPlayers>(
    players ?? { blue1: "", blue2: "", red1: "", red2: "" },
  )
  const nomesSujos = players
    ? (Object.keys(players) as SetupSlotKey[]).some((k) => nomes[k] !== players[k])
    : false
  // A aba Players só existe quando HÁ jogadores (ingame). No /setup a partida
  // ainda não nasceu — sem dado, sem aba.
  const temPlayers = Boolean(players)
  const abaAtual: SportSetupTab = temPlayers ? aba : "jogo"

  // Atalho para o /perfil levando de volta AO JOGO (mesmo padrão do popup).
  const [perfilHref] = useState(() => {
    if (typeof window === "undefined") return "/perfil"
    const atual = window.location.pathname + window.location.search
    return `/perfil?voltar=${encodeURIComponent(atual)}`
  })

  // FONTE ÚNICA do formato: as duas abas chamam ISTO. Ingame aplica e propaga
  // na hora (a prop existe); no /setup a prop é ausente e a escolha fica para o
  // CTA — o comportamento da fatia (f), agora com duas entradas.
  const escolherFormato = (v: string) => {
    setGameType(v)
    onGameTypeChange?.(v)
  }

  const salvarNomes = () => {
    if (!nomesSujos) return
    onPlayersSave?.(nomes)
  }

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
      {/* Fechar (ingame): flutua no canto superior direito do card. */}
      {onClose && (
        <button
          type="button"
          onClick={() => {
            salvarNomes()
            onClose()
          }}
          aria-label="Fechar e voltar ao jogo"
          className="absolute top-3 right-3 z-30 rounded-full p-2 active:scale-95 transition-transform"
          style={{ color: "var(--setup-card-cinza)" }}
        >
          <X className="h-5 w-5" />
        </button>
      )}

      {/* CARD CLARO ocupa a tela CHEIA (sem quadra ao fundo — ela era efêmera e
          forçava scroll): banner-título → regras → CTA. */}
      <div className="setup-card relative z-20 flex min-h-0 flex-1 flex-col">
        {/* BANNER-TÍTULO: o NOME GRANDE do esporte editado É o seletor. Tocar
            expande as 6 quadrinhas; ao escolher, recolhe e o banner atualiza.
            Deixa inequívoco QUAL esporte está sendo configurado (cada um tem
            regras próprias de desempate/vantagem). */}
        <div className="px-4 pt-3">
          <button
            type="button"
            onClick={() => setSelectorOpen((o) => !o)}
            aria-expanded={selectorOpen}
            aria-label={`Esporte: ${SHORT_NAME[sport]}. Tocar para trocar.`}
            className="flex w-full items-center gap-3 text-left"
          >
            <span className="court-glyph shrink-0">
              <SportCourtGlyph sport={sport} />
            </span>
            <span className="min-w-0 flex-1 truncate text-4xl font-black uppercase leading-none tracking-tight">
              {SHORT_NAME[sport]}
            </span>
            <span
              className="inline-flex shrink-0 items-center gap-1 text-sm font-bold"
              style={{ color: "var(--setup-card-cinza)" }}
            >
              {selectorOpen ? "fechar" : "trocar"}
              <ChevronDown className={`h-4 w-4 transition-transform ${selectorOpen ? "rotate-180" : ""}`} />
            </span>
          </button>

          {/* SELETOR EXPANDIDO: as 6 quadrinhas (mesma lógica selectSport). Ao
              escolher, recolhe. Recolhido por padrão quando veio da quadra (QR). */}
          {selectorOpen && (
            <div className="setup-selector mt-3">
              {SPORTS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    selectSport(s.id)
                    setSelectorOpen(false)
                  }}
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
          )}
        </div>

        {/* BARRA DE ABAS — filho FIXO do flex column, entre o banner e o miolo.
            O miolo é flex-1, então ele se ajusta sozinho e nada precisa de
            altura calculada. Reusa .rule-group/.rule-option: a mesma linguagem
            dos botões de escolha do card, sem CSS novo. */}
        {temPlayers && (
        <div className="px-4 pt-3" role="tablist" aria-label="Seções da configuração">
          <div className="rule-group">
            {[
              { v: "jogo" as const, label: "Jogo/Quadra" },
              { v: "players" as const, label: "Players" },
            ].map((t) => (
              <button
                key={t.v}
                type="button"
                role="tab"
                aria-selected={aba === t.v}
                onClick={() => {
                  // Sair da aba Players salva o pendente (rede de segurança do
                  // onBlur). Só grava se mudou — sem broadcast à toa.
                  if (aba === "players" && t.v !== "players") salvarNomes()
                  setAba(t.v)
                }}
                className={`rule-option ${aba === t.v ? "on" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        )}

        {/* MIOLO rolável (safety-net; o alvo é caber sem rolar): regras + ações.
            O CONTAINER é o mesmo de sempre (scroll, paddings, espaçamento); só o
            CONTEÚDO alterna por aba — assim a config não sente a mudança. */}
        <div className="flex-1 overflow-y-auto px-4 pt-2 pb-3 space-y-3" role="tabpanel">
          {abaAtual === "players" ? (
            <AbaPlayers
              duplas={gameType === "duplas"}
              gameType={gameType}
              onFormato={escolherFormato}
              entrarUrl={entrarUrl}
              nomes={nomes}
              setNomes={setNomes}
              previews={playerPreviews}
              perfilHref={perfilHref}
              onSalvar={salvarNomes}
              onLogin={
                onSlotLogin
                  ? (slot) => {
                      // SALVA ANTES DE SAIR. O login com Google descarrega a
                      // página, e o que estivesse digitado e ainda não salvo se
                      // perderia — o mesmo cuidado que o CTA JOGAR já toma.
                      salvarNomes()
                      onSlotLogin(slot)
                    }
                  : undefined
              }
            />
          ) : (
            <>
          {context === "ingame" && sportChanged && (
            <p className="text-xs leading-snug" style={{ color: "var(--setup-card-cinza)" }}>
              Trocar de esporte inicia uma NOVA partida (o placar atual será descartado).
            </p>
          )}

          {/* SIMPLES/DUPLAS — propriedade fundamental da partida (define quantas
              pílulas de nome). Antes das regras de propósito. Molde rule-group. */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wide mb-1.5">Formato</div>
            <ToggleFormato gameType={gameType} onSelect={escolherFormato} />
          </div>

          {controls.map((c) => {
            const current = c.get(rules)
            return (
              <div key={c.key}>
                <div className="text-xs font-bold uppercase tracking-wide mb-1.5">{c.label}</div>
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
              <div className="text-xs font-bold uppercase tracking-wide mb-1.5">Avisar troca de lado</div>
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
            <div className="text-xs font-bold uppercase tracking-wide mb-1.5">Cores</div>
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
            </>
          )}
        </div>

        {/* BASE do card: CTA JOGAR FIXO (fora do scroll), sempre visível. */}
        <div className="px-4 pt-2 pb-4 border-t" style={{ borderColor: "var(--setup-card-borda)" }}>
          <button
            type="button"
            className="play-button"
            onClick={() => {
              // Quem digita e toca DIRETO no JOGAR não perde o nome: o blur do
              // campo pode não chegar antes. `salvarNomes` só age se mudou.
              salvarNomes()
              onConfirm(sport, rules, sportChanged, theme, sideChangeAlert, gameType)
            }}
          >
            JOGAR
          </button>
        </div>
      </div>
    </div>
  )
}
