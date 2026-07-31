/**
 * TELEMETRIA DE PRODUTO (funil de validação) — Umami.
 *
 * POR QUE UMAMI: leve (~2 KB), privacy-first, sem cookies e sem PII. O
 * `CLAUDE.md` já registrava a preferência por algo leve e explicitamente NÃO
 * Google Analytics; isto cumpre aquele registro.
 *
 * ⚠️ ISTO NÃO É O HISTÓRICO, e a separação é deliberada. `matches` exige
 * `owner_id = auth.uid()` (RLS) e continua exigindo — histórico é do DONO.
 * A telemetria mede o PRODUTO e por isso mede o ANÔNIMO, que é a maior parte
 * do tráfego (jogar sem login é inviolável). As duas coisas convivem sem se
 * tocar: um jogo anônimo emite `game_completed` e NÃO grava histórico.
 *
 * ⚠️ NÃO SUBSTITUI `court_visits`. Aquela telemetria mede o QR FÍSICO da quadra
 * (venue/sport/quadra/sponsor) e segue intacta. Esta mede a jornada do produto.
 * Coexistem, com perguntas diferentes.
 *
 * NUNCA QUEBRA NADA: sem o script carregado (env ausente, bloqueador, offline),
 * todas as funções viram no-op silencioso. Nenhuma chamada aqui pode adicionar
 * latência, fricção ou erro ao jogo — a instrumentação é passiva por contrato.
 *
 * OFFLINE: nesta fase os eventos são "dispara se online" — perder um evento em
 * quadra sem sinal é aceitável e INTENCIONAL. Quando o uso em quadra pedir, o
 * molde pronto é a fila de `lib/supabase/matches.ts` (enqueue + flush + localId).
 */

/** Onde a origem da visita fica guardada. SESSÃO: dura a visita, não a vida. */
const CHAVE_ORIGEM = "flow_origem"

/** Prefixo dos marcadores de "já disparei este evento nesta visita". */
const PREFIXO_EVENTO = "flow_ev_"

/** Sem parâmetro de campanha, a visita é orgânica/direta. */
const ORIGEM_PADRAO = "direct"

/**
 * O parâmetro de campanha na URL. Aceita o `utm_source` canônico E o atalho
 * `?f=` — que é o que se digita à mão num story ou numa bio do Instagram, onde
 * cada caractere conta. O que vier primeiro vence.
 *
 * Limitado a 60 caracteres: o valor vem da URL, ou seja, de fora. Um slug de
 * campanha nunca precisa de mais que isso, e o corte evita que alguém encha o
 * sessionStorage (ou o painel) com lixo.
 */
function origemDaUrl(): string | null {
  try {
    const p = new URLSearchParams(window.location.search)
    const v = (p.get("utm_source") ?? p.get("f") ?? "").trim()
    return v ? v.slice(0, 60) : null
  } catch {
    return null
  }
}

/**
 * A ORIGEM desta visita, carimbada em todos os eventos.
 *
 * A URL sempre vence e (re)grava: quem chega por um link novo passa a contar
 * para a campanha nova. Sem parâmetro, vale o que a visita já tinha guardado —
 * é isso que faz a origem SOBREVIVER à navegação (landing → setup → jogo), que
 * é o ponto inteiro: sem isso, só a landing teria atribuição e o funil seria
 * uma sequência de eventos órfãos.
 */
export function origem(): string {
  if (typeof window === "undefined") return ORIGEM_PADRAO
  const daUrl = origemDaUrl()
  try {
    if (daUrl) {
      sessionStorage.setItem(CHAVE_ORIGEM, daUrl)
      return daUrl
    }
    return sessionStorage.getItem(CHAVE_ORIGEM) || ORIGEM_PADRAO
  } catch {
    // Aba privada / storage bloqueado: a origem vale só para este pageview.
    return daUrl ?? ORIGEM_PADRAO
  }
}

type Props = Record<string, string | number | boolean>

/**
 * Emite um evento. No-op silencioso se o Umami não estiver lá.
 *
 * SEM PII, por contrato: nunca passar nome, e-mail, foto ou id de jogador. Os
 * eventos descrevem O QUE aconteceu no produto, nunca QUEM fez.
 */
export function track(evento: string, props?: Props): void {
  if (typeof window === "undefined") return
  try {
    const umami = (window as unknown as { umami?: { track?: (e: string, p?: Props) => void } }).umami
    if (typeof umami?.track !== "function") return
    umami.track(evento, { origem: origem(), ...(props ?? {}) })
  } catch {
    // Telemetria NUNCA propaga erro para a tela.
  }
}

/**
 * Emite UMA VEZ por visita, para a chave dada. Existe porque recarregar a
 * página não é um evento novo: sem isto, um refresh no meio de uma partida
 * contaria outro `game_started` e a taxa de conclusão do funil viria menor do
 * que a realidade.
 */
export function trackUmaVez(chave: string, evento: string, props?: Props): void {
  if (typeof window === "undefined") return
  try {
    const k = PREFIXO_EVENTO + chave
    if (sessionStorage.getItem(k)) return
    sessionStorage.setItem(k, "1")
  } catch {
    // Sem storage não há dedup — melhor contar a mais que não contar.
  }
  track(evento, props)
}
