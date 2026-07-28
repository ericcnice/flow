'use client'

/**
 * A FRASE QUE ROTACIONA no hero — a única animação orquestrada da página.
 *
 * REGRA DA ÂNCORA: só a FRASE troca. O wordmark, a tagline e o botão ficam
 * parados. Alternar tudo desorienta; alternar um elemento sobre uma base fixa
 * lê como uma voz falando, não como uma página instável.
 *
 * ALTURA RESERVADA (min-height por breakpoint): as frases têm comprimentos
 * diferentes, e sem reservar espaço o conteúdo abaixo pularia a cada troca —
 * o tipo de defeito que faz uma landing parecer quebrada em celular.
 *
 * `prefers-reduced-motion` é respeitado no CSS (.l-frase), não aqui: a troca
 * continua acontecendo (o conteúdo não se perde), só sem o movimento.
 */

import { useEffect, useState } from 'react'

const FRASES = [
  'Você leva seu jogo a sério?',
  'Seus resultados ao vivo, para o mundo ver.',
  'Seu nome no placar. Sua memória guardada.',
  'Transmita seu jogo. Ao vivo.',
  'Escaneou, jogou.',
]

const INTERVALO_MS = 3800

export function RotatingPhrase() {
  const [i, setI] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % FRASES.length), INTERVALO_MS)
    return () => clearInterval(t)
  }, [])

  return (
    <p
      /* aria-live polite: quem usa leitor de tela ouve a frase mudar sem ser
         interrompido. `key` remonta o nó — é o que faz a animação REDISPARAR
         (trocar só o texto não re-anima um nó que já tem a classe). */
      aria-live="polite"
      className="flex min-h-[4.5rem] items-end sm:min-h-[7rem] lg:min-h-[8.5rem]"
    >
      <span
        key={i}
        className="l-frase text-balance text-3xl font-black uppercase leading-[0.95] tracking-tight text-white sm:text-5xl lg:text-6xl"
      >
        {FRASES[i]}
      </span>
    </p>
  )
}
