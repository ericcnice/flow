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

import type { GameState, ScoringEvent, ScoringEventType } from "@/lib/scoring/types"

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
    cardinal: enCardinal,
  },
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

/** Constrói o anúncio de um POINT (canta o placar do game). */
function pointAnnouncement(ev: ScoringEvent, sport: string, vocab: Vocab): Announcement | null {
  const detail = ev.detail ?? ""
  const [a, b] = detail.split("-")
  if (a === undefined || b === undefined) return null
  const cue = `point:${detail}`

  if (sport === "tennis") {
    const wa = vocab.tennisPoint[a] ?? a
    const wb = vocab.tennisPoint[b] ?? b
    return { cue, text: `${wa}${vocab.connector}${wb}` }
  }

  // Rally (squash / tênis de mesa / etc.): números corridos.
  const na = Number(a)
  const nb = Number(b)
  const wa = Number.isFinite(na) ? vocab.cardinal(na) : a
  const wb = Number.isFinite(nb) ? vocab.cardinal(nb) : b
  return { cue, text: `${wa}${vocab.connector}${wb}` }
}

/**
 * Ponto de entrada da CAMADA DE LÓGICA: recebe os eventos do último ponto
 * (engine.getLastEvents()) + o estado atual e devolve o que falar — ou null
 * quando não há nada a anunciar. Não emite som (isso é do speaker).
 */
export function announce(
  events: ScoringEvent[],
  _state: GameState,
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
      return pointAnnouncement(ev, sport, vocab)
    default:
      return null
  }
}
