/**
 * Camada de SOM — TROCÁVEL. É a única parte que efetivamente emite áudio.
 *
 * Hoje: voz NATIVA do navegador (Web Speech API / speechSynthesis) — robótica,
 * offline, zero dependência. É o "preto e branco antes das cores": funcional e
 * suficiente para validar QUANDO falar o quê.
 *
 * Amanhã: a voz de qualidade (áudio pré-gerado) entra criando OUTRO Speaker
 * (ex.: um `AudioFileSpeaker` que toca `<cue>.mp3` via <audio>/AudioContext) e
 * troca-se só a instância injetada na tela. A lógica evento→texto/cue vive em
 * ./announcer.ts e NÃO muda. É por isso que o contrato abaixo fala em `text`
 * (para TTS agora) — um speaker de arquivos usaria o `cue` do Announcement.
 */

export interface Speaker {
  /** Fala o texto. Não bloqueia: retorna imediatamente. Cancela qualquer fala
   *  em andamento antes (nada de fila acumulando). */
  speak(text: string, opts?: { lang?: string }): void
  /** Interrompe imediatamente qualquer fala em andamento. */
  cancel(): void
  /** Se esta implementação consegue emitir som neste ambiente. */
  isSupported(): boolean
}

/**
 * Speaker baseado em window.speechSynthesis.
 *
 * Detalhes que importam:
 *  - NÃO bloqueia a UI: speechSynthesis.speak() enfileira e retorna na hora; a
 *    síntese roda fora do fluxo de renderização.
 *  - SEM fila: cada speak() chama cancel() antes, então um ponto novo
 *    interrompe o anúncio anterior em vez de empilhar.
 *  - Voz pt-BR do sistema quando existir; senão, a voz padrão do idioma. As
 *    vozes carregam de forma assíncrona (getVoices() pode vir vazio no início),
 *    então a seleção é adiada e recalculada até as vozes existirem.
 */
export function createSpeechSynthesisSpeaker(): Speaker {
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined"

  let cachedVoice: SpeechSynthesisVoice | null = null
  let cachedLang = ""

  function pickVoice(lang: string): SpeechSynthesisVoice | null {
    if (!supported) return null
    if (cachedVoice && cachedLang === lang) return cachedVoice

    const voices = window.speechSynthesis.getVoices()
    if (!voices.length) return null // ainda não carregou; deixa o utterance.lang resolver

    const norm = lang.toLowerCase()
    const base = norm.split("-")[0]
    const exact = voices.find((v) => v.lang?.toLowerCase() === norm)
    const byPrefix = voices.find((v) => v.lang?.toLowerCase().startsWith(base))

    cachedVoice = exact ?? byPrefix ?? null
    cachedLang = lang
    return cachedVoice
  }

  // Quando o navegador terminar de carregar as vozes, invalida o cache para a
  // próxima seleção reavaliar (algumas engines só populam após este evento).
  if (supported && typeof window.speechSynthesis.addEventListener === "function") {
    window.speechSynthesis.addEventListener("voiceschanged", () => {
      cachedVoice = null
      cachedLang = ""
    })
  }

  return {
    isSupported: () => supported,

    cancel: () => {
      if (supported) window.speechSynthesis.cancel()
    },

    speak: (text, opts) => {
      if (!supported || !text) return
      const lang = opts?.lang ?? "pt-BR"

      // Nada de fila: interrompe o que estiver falando e fala o novo.
      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = lang
      const voice = pickVoice(lang)
      if (voice) utterance.voice = voice
      utterance.rate = 1
      utterance.pitch = 1
      utterance.volume = 1

      window.speechSynthesis.speak(utterance)
    },
  }
}
