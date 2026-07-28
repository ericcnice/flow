/**
 * O HERO — o atleta, a voz e a porta.
 *
 * A TESE da página: o jogador é o herói, não o produto. Por isso o hero não é
 * "texto à esquerda, mockup do app à direita" (o que estava aqui, e o que toda
 * landing de SaaS faz): é uma FOTO DE ATLETA em tela cheia com a frase por
 * cima. O placar aparece depois, quando a pessoa já se reconheceu.
 *
 * 📸 A IMAGEM: `/public/hero-player.jpg`. O arquivo AINDA NÃO EXISTE — é aqui
 * que o Eric troca pela versão final. Enquanto não existir, a página não quebra
 * e nem mostra ícone de imagem quebrada: a foto entra como `background-image`
 * sobre um degradê escuro, então a ausência do arquivo simplesmente deixa o
 * degradê aparecendo. Trocar = soltar o arquivo com esse nome em /public.
 * Recomendação: retrato/vertical no celular, atleta à direita ou centro, com
 * área escura à esquerda/base para o texto respirar.
 *
 * O véu por cima da foto não é decoração: é o que garante contraste do texto
 * branco sobre QUALQUER foto que o Eric coloque depois.
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { FlowWordmark } from '@/components/brand/flow-wordmark'
import { RotatingPhrase } from '@/components/landing/rotating-phrase'
import { BrandQr } from '@/components/landing/brand-qr'

export function Hero() {
  return (
    <section id="top" className="relative isolate overflow-hidden">
      {/* CAMADA 1 — a foto. Ausente hoje: o fundo escuro sustenta a tela. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-20 bg-[#06070a] bg-cover bg-[center_top]"
        style={{ backgroundImage: "url('/hero-player.jpg')" }}
      />
      {/* CAMADA 2 — o véu que garante o contraste do texto sobre a foto. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-[#06070a] via-[#06070a]/85 to-[#06070a]/40"
      />
      {/* CAMADA 3 — o sopro da marca (azul→verde) vindo da base. Sutil: é
          assinatura de cor, não um holofote. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 -z-10 h-64 opacity-25 blur-3xl"
        style={{ backgroundImage: 'var(--l-grad)' }}
      />

      <div className="mx-auto flex min-h-[88svh] max-w-5xl flex-col justify-end px-5 pb-14 pt-24 sm:min-h-[92svh] sm:pb-20">
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0 flex-1">
            <FlowWordmark size={44} className="sm:hidden" />
            <FlowWordmark size={64} className="hidden sm:inline-block" />

            <div className="l-grad-rule mt-5 w-24" aria-hidden />

            <div className="mt-6">
              <RotatingPhrase />
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="#quadras"
                data-flow-cta="hero-jogar"
                className="l-grad-fill inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-black uppercase tracking-wide transition-transform active:scale-[0.97]"
              >
                Jogar agora
                <ArrowRight className="h-4 w-4" />
              </Link>
              <span className="text-sm text-white/50">
                Grátis, sem cadastro, sem baixar app.
              </span>
            </div>
          </div>

          {/* O QR só no desktop: no celular ninguém escaneia a própria tela, e
              o espaço vale mais para a frase. */}
          <div className="hidden shrink-0 lg:block">
            <BrandQr />
          </div>
        </div>
      </div>
    </section>
  )
}
