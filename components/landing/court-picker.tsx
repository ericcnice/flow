/**
 * O SELETOR DE QUADRAS — o elemento-assinatura da landing e o CTA principal.
 *
 * Seis QUADRAS DE VERDADE, vistas de cima, em suas cores reais (saibro, areia,
 * o azul do padel, a madeira do squash). Não são ícones de raquete: é o mesmo
 * <SportCourtGlyph> que o app usa na tela de setup — o material do próprio
 * produto, não um desenho genérico. Tocar numa quadra LEVA AO JOGO.
 *
 * ⚠️ O DESTINO É A ROTA REAL `/setup?sport=<id>`, e essa é a razão de esta
 * fatia existir: os CTAs antigos eram âncoras que voltavam ao topo, então a
 * landing não tinha saída para o app. Aqui, um toque e a pessoa está na tela de
 * começar o jogo, COM o esporte já escolhido e SEM cadastro — coerente com o
 * inviolável "o usuário joga sem login".
 *
 * O `sport` na URL é o ID CANÔNICO (`tabletennis`, não `pingpong`): é o que
 * /setup e /jogo consomem. Usar o slug de URL aqui cairia direto na armadilha
 * documentada no CLAUDE.md (só "squash" casaria, por coincidência).
 *
 * TÊNIS EM DESTAQUE por ANEL, não por tamanho: seis azulejos iguais preenchem a
 * grade sem sobrar célula vazia, e o anel azul comunica a aposta sem quebrar o
 * ritmo.
 */

import { TrackLink } from '@/components/analytics/track-link'
import { SportCourtGlyph } from '@/components/sport-court'
import { SPORTS } from '@/lib/sports-catalog'

/** O esporte da aposta — ganha o anel e a legenda de apoio. */
const DESTAQUE = 'tennis'

export function CourtPicker() {
  return (
    <section id="quadras" className="border-t border-border/60 bg-background">
      <div className="mx-auto max-w-5xl px-5 py-16 sm:py-20">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
          Escolha sua quadra
        </p>
        <h2 className="mt-3 text-3xl font-black uppercase leading-[0.95] tracking-tight sm:text-5xl">
          Um toque e o<br />
          <span className="l-grad-text">jogo começa</span>
        </h2>
        <p className="mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
          Sem cadastro, sem baixar nada. Escolha o esporte e o placar abre.
        </p>

        <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {SPORTS.map((s) => {
            const destaque = s.id === DESTAQUE
            return (
              <TrackLink
                key={s.id}
                href={`/setup?sport=${s.id}`}
                /* O CLIQUE no esporte é a 1ª intenção real do funil: separa
                   quem só leu a landing de quem quis jogar. E responde a
                   pergunta de descoberta registrada no CLAUDE.md — QUAL esporte
                   o público real escolhe. O `sport` é o ID CANÔNICO
                   (`tabletennis`, não `pingpong`), o mesmo que viaja na URL. */
                evento="sport_selected"
                props={{ sport: s.id }}
                /* data-* estáveis: o analytics da v2 (qual esporte as pessoas
                   escolhem) é a pergunta de descoberta mais barata do produto,
                   e só é barata se o identificador já existir. */
                data-flow-cta="quadra"
                data-flow-sport={s.id}
                className={`l-court ${destaque ? 'l-court-destaque' : ''}`}
                aria-label={`Jogar ${s.name}`}
              >
                <SportCourtGlyph sport={s.id} />

                {/* Legenda sobre a quadra: véu escuro só na base, para o nome
                    ler em qualquer superfície (a areia é clara, o saibro não). */}
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/55 to-transparent px-2.5 pb-2.5 pt-8">
                  <span className="block truncate text-sm font-black uppercase leading-none tracking-tight text-white">
                    {s.name}
                  </span>
                  {destaque && (
                    <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">
                      Mais jogado
                    </span>
                  )}
                </span>
              </TrackLink>
            )
          })}
        </div>
      </div>
    </section>
  )
}
