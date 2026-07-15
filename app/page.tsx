/**
 * LANDING de PLATAFORMA (raiz do produto). Landing completa gerada no v0,
 * montada a partir de components/landing/. Substitui a landing provisória
 * de seção única que vivia aqui. O grid de quadras de admin segue em /admin,
 * e o contexto de clube segue acessível só via URL direta /[clube]/...
 *
 * O tema é escopado em .tema-landing (paleta preto + amarelo, definida em
 * globals.css): a landing tem cores próprias sem tocar nas variáveis do
 * palco (--lado-a-*, --palco-*) usadas em /jogo e /placar.
 *
 * Server Component estático — nenhum componente da landing usa 'use client'.
 */

import { SiteHeader } from "@/components/landing/site-header"
import { Hero } from "@/components/landing/hero"
import { SectionPlayer } from "@/components/landing/section-player"
import { SectionCoach } from "@/components/landing/section-coach"
import { SectionClubs } from "@/components/landing/section-clubs"
import { HowItWorks } from "@/components/landing/how-it-works"
import { FinalCta } from "@/components/landing/final-cta"
import { SiteFooter } from "@/components/landing/site-footer"

export const metadata = {
  title: "PWER Flow — O placar inteligente para esportes de raquete",
  description:
    "Placar para tênis, beach tennis, padel, squash, ping pong e pickleball. Funciona offline, com voz de árbitro no estilo Grand Slam.",
}

export default function Home() {
  return (
    <div className="tema-landing min-h-screen bg-background text-foreground">
      <SiteHeader />
      <main>
        <Hero />
        <SectionPlayer />
        <SectionCoach />
        <SectionClubs />
        <HowItWorks />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  )
}
