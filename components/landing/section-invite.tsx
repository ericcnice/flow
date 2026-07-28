/**
 * O BENEFÍCIO-ÂNCORA — "convide seus amigos para fazerem parte da sua história".
 *
 * Ganha uma seção inteira (e não um card numa grade de features) porque é a
 * mensagem central do produto: o jogo não é um registro individual, é uma
 * MEMÓRIA COMPARTILHADA. É a resposta ao "quem jogou com a Kika, e quanto foi?"
 * da validação de campo.
 *
 * ⚠️ REGRA DOS BADGES — HONESTIDADE: a frase tem duas metades e só UMA está no
 * ar hoje.
 *  • JOGAR JUNTO identificado (escanear e entrar no placar com nome e foto) já
 *    funciona — é a 1c, corrigida hoje. SEM badge.
 *  • O HISTÓRICO COMPARTILHADO ("cada jogo fica guardado na história de todos")
 *    ainda NÃO: `matches` tem um único `owner_id` e RLS self, então quem foi
 *    convidado não veria a partida. Depende de `participant_ids`, já mapeado.
 *    LEVA o badge "Em breve".
 * O badge não aparece em mais lugar nenhum desta página. Espalhá-lo por
 * benefícios que já funcionam faria o produto pronto parecer promessa — e
 * prometer o que não se cumpre queima justamente a mensagem mais forte.
 */

import { QrCode, Users } from 'lucide-react'

export function SectionInvite() {
  return (
    <section id="amigos" className="border-t border-border/60 bg-card/40">
      <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          O melhor do Flow
        </p>

        <h2 className="mt-3 max-w-3xl text-balance text-3xl font-black uppercase leading-[0.95] tracking-tight sm:text-5xl">
          Convide seus amigos para fazerem parte da{' '}
          <span className="l-grad-text">sua história</span>
        </h2>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {/* JÁ FUNCIONA — sem badge. */}
          <div className="rounded-2xl border border-border/60 bg-background p-6">
            <QrCode className="h-6 w-6 text-primary" aria-hidden />
            <h3 className="mt-4 text-lg font-black uppercase tracking-tight">
              Todos entram no mesmo jogo
            </h3>
            <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">
              Seus amigos escaneiam o QR da partida e entram com o nome e a foto
              deles. O placar mostra quem está jogando de verdade — não
              &ldquo;Jogador 2&rdquo;.
            </p>
          </div>

          {/* PROMESSA — o único badge da página. */}
          <div className="rounded-2xl border border-border/60 bg-background p-6">
            <Users className="h-6 w-6 text-primary" aria-hidden />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-black uppercase tracking-tight">
                O jogo fica na história de todos
              </h3>
              {/* Contorno em degradê + texto BRANCO: `background-clip: text`
                  em 10px sai sujo, e o degradê já está no contorno — repeti-lo
                  no texto seria a mesma ideia duas vezes no mesmo objeto. */}
              <span className="l-soon px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white">
                Em breve
              </span>
            </div>
            <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">
              Cada partida vai para o histórico de cada um que jogou. Daqui a um
              ano, você ainda vai saber contra quem jogou e quanto foi.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
