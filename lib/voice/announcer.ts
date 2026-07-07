/**
 * Camada de LÓGICA da voz: evento(s) do motor → TEXTO a ser falado.
 *
 * ⚠️ SEPARAÇÃO PROPOSITAL — esta é a fronteira que torna a voz "trocável".
 * Este arquivo NÃO toca som. Ele só decide QUAL FRASE corresponde a QUAL
 * EVENTO (o "roteiro"). Quem efetivamente emite som vive em ./speaker.ts —
 * hoje a voz nativa do navegador (speechSynthesis), robótica e offline: é o
 * "preto e branco antes das cores".
 *
 * Quando a voz de qualidade (áudio pré-gerado) chegar, troca-se APENAS o
 * speaker (ex.: um AudioFileSpeaker que toca `<cue>.mp3`). Este roteiro
 * (evento → { cue, text }) permanece intacto: por isso cada anúncio carrega
 * também um `cue` — uma CHAVE ESTÁVEL, independente de idioma, pronta para
 * mapear um arquivo de áudio no futuro.
 *
 * Regras de ouro:
 *  - Reage SÓ aos eventos que o motor (lib/scoring) já emite. Não recalcula
 *    placar, não conhece a fiação — só lê ScoringEvent[] + GameState.
 *  - Vocabulário FECHADO e pequeno. Sem nomes de jogador (ficam na tela).
 *  - Idioma é parâmetro (default "pt-BR"), para PT/EN configurável no futuro.
 */

import type { GameState, ScoringEvent, ScoringEventType, Side, SideState } from "@/lib/scoring/types"

export type VoiceLang = "pt-BR" | "en-US"

export interface AnnounceContext {
  /** Idioma da locução. Default "pt-BR". */
  lang?: VoiceLang
  /** Esporte ativo (ex.: "tennis"). Só o tênis é 100% afinado; os demais
   *  (rally) caem num modo genérico que canta os números corridos. */
  sport?: string
}

export interface Announcement {
  /** Chave estável do anúncio, independente de idioma. Uso HOJE: só semântico.
   *  Uso FUTURO: nome/rota do áudio pré-gerado (ex.: "point:30-15" → mp3). */
  cue: string
  /** Texto pronto para TTS no idioma escolhido. */
  text: string
}

/** Vocabulário fechado de um idioma. Trocar/expandir aqui, nunca no fluxo. */
interface Vocab {
  /** Rótulos de ponto do tênis: "0" | "15" | "30" | "40". */
  tennisPoint: Record<string, string>
  /** Liga os dois números do game (pt: "quinze A zero"; en: "fifteen love"). */
  connector: string
  advantage: string
  deuce: string
  game: string
  set: string
  match: string
  tiebreak: string
  superTiebreak: string
  sideOut: string
  /** Palavra curta de correção, falada ao desfazer um ponto (undo). */
  corrected: string
  /** Números corridos para esportes de rally (0..N). */
  cardinal: (n: number) => string
}

// --- Cardinais (só o suficiente para placares de rally: 0..40) ---------------
const PT_UNITS = [
  "zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
]
const PT_TENS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"]
function ptCardinal(n: number): string {
  if (n < 0) return String(n)
  if (n < 20) return PT_UNITS[n]
  const t = Math.floor(n / 10)
  const u = n % 10
  if (t > 9) return String(n)
  return u === 0 ? PT_TENS[t] : `${PT_TENS[t]} e ${PT_UNITS[u]}`
}

const EN_UNITS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
]
function enCardinal(n: number): string {
  return n >= 0 && n < 20 ? EN_UNITS[n] : String(n)
}

// --- Tabelas de vocabulário (fechadas) ---------------------------------------
const VOCAB: Record<VoiceLang, Vocab> = {
  "pt-BR": {
    tennisPoint: { "0": "zero", "15": "quinze", "30": "trinta", "40": "quarenta" },
    connector: " a ",
    advantage: "vantagem",
    deuce: "quarenta iguais",
    game: "game",
    set: "set",
    match: "fim de jogo",
    tiebreak: "tie-break",
    superTiebreak: "super tie-break",
    sideOut: "troca de saque",
    corrected: "corrigido",
    cardinal: ptCardinal,
  },
  "en-US": {
    tennisPoint: { "0": "love", "15": "fifteen", "30": "thirty", "40": "forty" },
    connector: " ",
    advantage: "advantage",
    deuce: "deuce",
    game: "game",
    set: "set",
    match: "game, set, match",
    tiebreak: "tiebreak",
    superTiebreak: "super tiebreak",
    sideOut: "side out",
    corrected: "corrected",
    cardinal: enCardinal,
  },
}

/**
 * Famílias de placar "por game" (15/30/40): tênis, beach e padel. Usada para
 * saber como VERBALIZAR um token de placar (rótulo de tênis vs. número corrido)
 * e para reconstruir o placar atual no anúncio de undo.
 */
const TENNIS_FAMILY = new Set(["tennis", "beach", "padel"])

/** Rótulo de exibição de um lado no game de tênis: 0/15/30/40 (ou AD). */
function tennisLabel(s: SideState): string {
  if (s.advantage) return "AD"
  return ["0", "15", "30", "40"][Math.min(s.points, 3)]
}

/** Verbaliza um token de placar. AD → "vantagem"; tênis → 0/15/30/40; senão,
 *  número corrido (cardinal). Dígitos crus caem no fallback (o TTS os fala). */
function scoreWord(token: string, tennis: boolean, vocab: Vocab): string {
  if (token === "AD") return vocab.advantage
  if (tennis) return vocab.tennisPoint[token] ?? token
  const n = Number(token)
  return Number.isFinite(n) ? vocab.cardinal(n) : token
}

/**
 * Ordena o par (lado A, lado B) por QUEM SACA — convenção universal do anúncio:
 * fala-se primeiro o placar do SACADOR (ex.: sacador 30, recebedor 15 →
 * "trinta a quinze"). Vale para todas as famílias suportadas (tênis/beach/padel,
 * squash/ping pong, pickleball). Lê o `server` do GameState (o mesmo campo da
 * bolinha de saque) — NÃO altera o motor, só reordena o texto.
 */
function serverFirst<T>(a: T, b: T, server: Side): [T, T] {
  return server === "B" ? [b, a] : [a, b]
}

/**
 * Ordem de importância: quando um ponto fecha um game/set/partida, o motor
 * emite vários eventos juntos (ex.: [POINT, GAME, SET]). Anunciamos o MAIS
 * significativo — a voz "canta" só uma coisa por ponto (nada de fila).
 */
const PRIORITY: ScoringEventType[] = [
  "MATCH",
  "SET",
  "GAME",
  "TIEBREAK_START",
  "SIDE_OUT",
  "ADVANTAGE",
  "DEUCE",
  "POINT",
]

function pickPrimary(events: ScoringEvent[]): ScoringEvent | null {
  for (const type of PRIORITY) {
    const found = events.find((e) => e.type === type)
    if (found) return found
  }
  return null
}

/**
 * Constrói o anúncio de um POINT (canta o placar do game), SEMPRE começando pelo
 * lado que está SACANDO (server). O `detail` do motor vem em ordem fixa A-B; aqui
 * reordenamos por `server`. O `cue` também reflete a ordem falada (chave estável
 * para o áudio pré-gerado futuro), independente de qual lado saca.
 */
function pointAnnouncement(ev: ScoringEvent, sport: string, vocab: Vocab, server: Side): Announcement | null {
  const detail = ev.detail ?? ""
  const [a, b] = detail.split("-")
  if (a === undefined || b === undefined) return null

  const tennis = TENNIS_FAMILY.has(sport)
  const [ta, tb] = serverFirst(a, b, server) // tokens crus, sacador primeiro
  const first = scoreWord(ta, tennis, vocab)
  const second = scoreWord(tb, tennis, vocab)
  return { cue: `point:${ta}-${tb}`, text: `${first}${vocab.connector}${second}` }
}

/**
 * Anúncio ao DESFAZER um ponto (undo): palavra curta de correção + o placar
 * atual corrigido (recantado), para o jogador ouvir onde o game voltou. O undo
 * não emite evento do motor, então reconstruímos o placar a partir do estado —
 * ordenado por quem saca, igual ao anúncio normal. Fala, ex.: "corrigido, trinta
 * a quinze". Continua no vocabulário fechado, sem frases longas.
 */
export function announceUndo(state: GameState, ctx: AnnounceContext = {}): Announcement | null {
  const lang = ctx.lang ?? "pt-BR"
  const sport = ctx.sport ?? "tennis"
  const vocab = VOCAB[lang] ?? VOCAB["pt-BR"]
  const tennis = TENNIS_FAMILY.has(sport)

  // Placar atual por família: tênis (15/30/40, ou tiebreak em números corridos)
  // vs. rally/side-out (pontos corridos do game).
  let aTok: string
  let bTok: string
  if (tennis && !state.isTiebreak) {
    aTok = tennisLabel(state.A)
    bTok = tennisLabel(state.B)
  } else if (tennis && state.isTiebreak) {
    aTok = String(state.A.tiebreakPoints)
    bTok = String(state.B.tiebreakPoints)
  } else {
    aTok = String(state.A.points)
    bTok = String(state.B.points)
  }

  const [ta, tb] = serverFirst(aTok, bTok, state.server)
  const first = scoreWord(ta, tennis, vocab)
  const second = scoreWord(tb, tennis, vocab)
  return { cue: "undo", text: `${vocab.corrected}, ${first}${vocab.connector}${second}` }
}

/**
 * Ponto de entrada da CAMADA DE LÓGICA: recebe os eventos do último ponto
 * (engine.getLastEvents()) + o estado atual e devolve o que falar — ou null
 * quando não há nada a anunciar. Não emite som (isso é do speaker).
 */
export function announce(
  events: ScoringEvent[],
  state: GameState,
  ctx: AnnounceContext = {},
): Announcement | null {
  if (!events || events.length === 0) return null

  const lang = ctx.lang ?? "pt-BR"
  const sport = ctx.sport ?? "tennis"
  const vocab = VOCAB[lang] ?? VOCAB["pt-BR"]

  const ev = pickPrimary(events)
  if (!ev) return null

  switch (ev.type) {
    case "MATCH":
      return { cue: `match:${ev.side ?? ""}`, text: vocab.match }
    case "SET":
      return { cue: `set:${ev.side ?? ""}`, text: vocab.set }
    case "GAME":
      return { cue: `game:${ev.side ?? ""}`, text: vocab.game }
    case "TIEBREAK_START": {
      const sup = ev.detail === "super"
      return sup
        ? { cue: "supertiebreak", text: vocab.superTiebreak }
        : { cue: "tiebreak", text: vocab.tiebreak }
    }
    case "ADVANTAGE":
      return { cue: `advantage:${ev.side ?? ""}`, text: vocab.advantage }
    case "DEUCE":
      return { cue: "deuce", text: vocab.deuce }
    case "SIDE_OUT":
      return { cue: "sideout", text: vocab.sideOut }
    case "POINT":
      return pointAnnouncement(ev, sport, vocab, state.server)
    default:
      return null
  }
}
