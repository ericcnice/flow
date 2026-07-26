/**
 * A FONTE DA MARCA — Audiowide, via next/font/google.
 *
 * POR QUE next/font e NÃO @font-face local: o projeto já usa next/font para a
 * Inter (app/layout.tsx), e o caminho local está QUEBRADO — app/fonts.css
 * declara Teko e DS-Digital apontando para /fonts/*.woff2, mas `public/fonts/`
 * não existe no repositório; as duas caem em fallback silencioso. Repetir esse
 * caminho seria plantar o mesmo bug na marca.
 *
 * `display: 'swap'` é deliberado: o texto aparece na fonte de fallback e troca
 * quando a Audiowide chega. Na tela de jogo (offline-first) o "w" é DECORATIVO
 * — melhor uma letra na fonte errada por um instante do que um vazio (FOIT) ou,
 * pior, algo que dependa de rede para renderizar.
 *
 * Instanciado UMA vez aqui e importado pelos componentes de marca: o next/font
 * deduplica por configuração, e assim a marca renderiza idêntica em todo lugar.
 */

import { Audiowide } from 'next/font/google'

export const audiowide = Audiowide({
  subsets: ['latin'],
  weight: '400', // a Audiowide tem um peso só
  display: 'swap',
})
