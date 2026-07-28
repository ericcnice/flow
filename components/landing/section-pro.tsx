/**
 * PROFESSOR E CLUBE — secundário, e DEPOIS do jogador.
 *
 * A inversão é a tese comercial: o jogador é o gancho que depois vende para
 * professor e clube. A landing antiga dava a esses dois públicos duas seções
 * inteiras no meio do caminho, competindo com quem realmente precisa ser
 * encantado primeiro. Aqui viram um convite curto, no fim, para quem se
 * reconhecer.
 *
 * O destino é o WhatsApp do Eric por ora — venda consultiva se faz conversando.
 * A L2 troca por um pré-cadastro com captura de dados.
 */

import { MessageCircle } from 'lucide-react'

const WHATSAPP =
  'https://wa.me/5511950507175?text=Ol%C3%A1%2C%20quero%20saber%20mais%20sobre%20o%20Flow'

export function SectionPro() {
  return (
    <section id="professores" className="border-t border-border/60 bg-card/40">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-5 py-14 sm:flex-row sm:items-center sm:justify-between sm:py-16">
        <div className="max-w-lg">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Para quem organiza o jogo
          </p>
          <h2 className="mt-3 text-2xl font-black uppercase leading-tight tracking-tight sm:text-3xl">
            É professor ou clube?
          </h2>
          <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">
            Turmas, alunos identificados, ranking e o placar com a marca do seu
            espaço. Conheça os benefícios para você.
          </p>
        </div>

        <a
          href={WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
          data-flow-cta="pro-whatsapp"
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full border border-border bg-background px-7 text-sm font-black uppercase tracking-wide transition-colors hover:border-primary hover:text-primary"
        >
          <MessageCircle className="h-4 w-4" />
          Falar com a gente
        </a>
      </div>
    </section>
  )
}
