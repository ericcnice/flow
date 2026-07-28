/**
 * LANDING (raiz do produto) — repaginada na fatia L1.
 *
 * O QUE MUDOU, e por quê:
 *  1. O JOGADOR VIRA O HERÓI. A ordem antiga dava seções inteiras a professor e
 *     clube no meio do caminho; agora o jogador é encantado primeiro e os dois
 *     viram um convite curto no fim. É a tese comercial: o jogador é o gancho
 *     que depois vende para professor e clube.
 *  2. A MARCA VESTE A MARCA. O primário era amarelo (#fee100), contradizendo o
 *     logo. Agora é o degradê azul→verde de components/brand/flow-gradient.ts.
 *  3. OS CTAs LEVAM AO APP. Os antigos eram um LOOP fechado de âncoras — o
 *     "sou jogador, quero experimentar" voltava para o topo, e não havia um
 *     único link para uma rota do app. Era isso que travava a distribuição.
 *
 * ORDEM DA PÁGINA = a jornada: quem sou eu (hero) → onde jogo (quadras) → por
 * que vale (amigos, benefícios) → e se eu organizo o jogo? (professor/clube).
 *
 * Continua Server Component estático; só o QR e a frase rotativa são client.
 * O tema segue escopado em .tema-landing, sem tocar nas variáveis do palco
 * (--lado-a-*, --palco-*) usadas em /jogo e /placar.
 */

import { SiteHeader } from '@/components/landing/site-header'
import { Hero } from '@/components/landing/hero'
import { CourtPicker } from '@/components/landing/court-picker'
import { SectionInvite } from '@/components/landing/section-invite'
import { SectionBenefits } from '@/components/landing/section-benefits'
import { SectionPro } from '@/components/landing/section-pro'
import { SiteFooter } from '@/components/landing/site-footer'

export const metadata = {
  title: 'Flow — seu jogo, levado a sério',
  description:
    'Placar ao vivo para tênis, beach tennis, padel, squash, ping pong e pickleball. Escaneou, jogou: sem baixar app, sem cadastro, funciona offline.',
}

export default function Home() {
  return (
    <div className="tema-landing min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <Hero />
        <CourtPicker />
        <SectionInvite />
        <SectionBenefits />
        <SectionPro />
      </main>
      <SiteFooter />
    </div>
  )
}
