/**
 * OS BENEFÍCIOS que JÁ funcionam — nenhum badge aqui, de propósito.
 *
 * Ordenados pelo ARCO DE UMA PARTIDA (jogar → transmitir → guardar): é a ordem
 * em que a pessoa vive as coisas.
 *
 * SEM numeração 01/02/03, de propósito. Ela dá ritmo visual barato, mas afirma
 * uma SEQUÊNCIA que não é verdade — não são três passos a executar em ordem,
 * são três coisas que acontecem. E cada lugar a mais em que o degradê aparece
 * enfraquece os poucos onde ele significa alguma coisa (a marca, o CTA, a
 * quadra em destaque, o "Em breve").
 *
 * O tom é de ORGULHO, não utilitário: "seu nome no placar", não "gestão de
 * dados de partida". Quem lê está pensando no próprio jogo.
 */

import { BadgeCheck, Radio, History } from 'lucide-react'

const BENEFICIOS = [
  {
    Icon: BadgeCheck,
    titulo: 'Seu nome no placar',
    texto:
      'Entrou com sua carteirinha, aparece com foto e o selo de verificado. O placar sabe quem você é — e quem assiste também.',
  },
  {
    Icon: Radio,
    titulo: 'Transmita para a galera',
    texto:
      'Mande o link e sua família e seus amigos acompanham cada ponto ao vivo, de onde estiverem. Sem instalar nada.',
  },
  {
    Icon: History,
    titulo: 'Guarde a memória',
    texto:
      'Todo jogo que você encerra vai para os seus jogos. Lembra quanto foi a partida de semana passada? Agora lembra.',
  },
]

export function SectionBenefits() {
  return (
    <section id="beneficios" className="border-t border-border/60 bg-background">
      <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
        <div className="grid gap-10 sm:grid-cols-3 sm:gap-8">
          {BENEFICIOS.map(({ Icon, titulo, texto }) => (
            <div key={titulo}>
              <Icon className="h-6 w-6 text-primary" aria-hidden />
              <h3 className="mt-4 text-xl font-black uppercase leading-tight tracking-tight">
                {titulo}
              </h3>
              <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">{texto}</p>
            </div>
          ))}
        </div>

        {/* A FAIXA do "sem baixar app": é um COMO, não um porquê — por isso vira
            uma linha fina no fim, e não um quarto card competindo com os três. */}
        <div className="mt-14 flex flex-col gap-2 rounded-2xl border border-border/60 bg-card/40 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-lg font-black uppercase tracking-tight">
            Sem baixar app. Sem cadastro.
          </p>
          <p className="text-sm text-muted-foreground">
            Abre no navegador e funciona até sem internet na quadra.
          </p>
        </div>
      </div>
    </section>
  )
}
