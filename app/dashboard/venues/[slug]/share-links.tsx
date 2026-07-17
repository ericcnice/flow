'use client'

/**
 * Links de compartilhamento da jornada de QR de um venue: uma URL por
 * combinação esporte × quadra, com botão de copiar.
 *
 * ⚠️ CONVENÇÃO TEMPORÁRIA E HARDCODED (ver GRADE abaixo). Esta grade é a mesma
 * que hoje montamos à mão — ela NÃO vem do banco, porque "quadras de um venue"
 * ainda não existe como estrutura de dado. Enquanto não existir, ela é igual
 * para TODO venue, o que é obviamente falso: um condomínio com uma quadra e um
 * clube com oito recebem a mesma lista de 15 links. Quando a estrutura existir,
 * a GRADE sai daqui e vira leitura por venue — e este arquivo passa a só
 * renderizar o que vier.
 */

import { useState } from 'react'
import { Check, Copy, QrCode, TriangleAlert } from 'lucide-react'
import { DOMINIO_PUBLICO } from '../constants'
import { QrModal } from './qr-modal'

/** Coach elegível a patrocinador — já filtrado e achatado no Server Component. */
export type Coach = {
  /** Slug do coach = o segmento /[ad] da URL. Nunca nulo (a query filtra). */
  slug: string
  nome: string
  temLogo: boolean
}

/**
 * Esporte × quadras. Os slugs de esporte são os que a URL aceita (ver
 * SPORT_SLUG_TO_ID em lib/clubs-config.ts): "tenis", "beachtennis", "squash",
 * "pingpong" — e não os ids internos do catálogo ("tennis", "beach",
 * "tabletennis").
 *
 * O sufixo da quadra nomeia o piso (-saibro / -rapida) e faz parte do id: quem
 * valida (resolveClubContext) só checa `includes` numa lista plana, sem vínculo
 * quadra↔esporte. Por isso a grade é escrita à mão aqui em vez de derivada do
 * CLUBS: derivar daria o produto cartesiano (4 esportes × 11 quadras = 44
 * links, incluindo "squash na quadra de saibro"), que passa na validação mas
 * não existe no mundo físico.
 */
const GRADE = [
  {
    esporte: 'tenis',
    nome: 'Tênis',
    quadras: [
      'q1-saibro',
      'q2-saibro',
      'q3-saibro',
      'q4-saibro',
      'q5-saibro',
      'q6-saibro',
      'q7-saibro',
      'q8-rapida',
    ],
  },
  { esporte: 'squash', nome: 'Squash', quadras: ['q1', 'q2', 'q3'] },
  { esporte: 'beachtennis', nome: 'Beach Tennis', quadras: ['q1', 'q2'] },
  { esporte: 'pingpong', nome: 'Ping Pong', quadras: ['q1', 'q2'] },
  // Sem `as const` de propósito: ele tiparia `quadras.length` como o literal
  // `2 | 3 | 8`, e o TS passaria a acusar o singular do plural como código
  // morto — justamente o caso que aparece quando isto virar dado de banco (um
  // condomínio de uma quadra só).
]

function LinhaLink({ url, onVerQr }: { url: string; onVerQr: () => void }) {
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(`https://${url}`)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch (err) {
      console.error('Copiar link falhou:', err)
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
      {/* min-w-0 + truncate: sem isso a URL longa estoura a largura no mobile
          em vez de encurtar. */}
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
        {url}
      </span>
      <button
        type="button"
        onClick={onVerQr}
        aria-label={`Ver QR code de ${url}`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
      >
        <QrCode className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Ver QR</span>
      </button>
      <button
        type="button"
        onClick={copiar}
        aria-label={`Copiar ${url}`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
      >
        {copiado ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        <span className="hidden sm:inline">{copiado ? 'Copiado' : 'Copiar'}</span>
      </button>
    </div>
  )
}

export function ShareLinks({
  slug,
  naJornada,
  coaches,
}: {
  slug: string
  naJornada: boolean
  coaches: Coach[]
}) {
  // '' = "— nenhum —". O patrocinador é só um SUFIXO da URL: trocar o select
  // re-renderiza e cada linha remonta sua própria URL a partir dele. Não há
  // lista duplicada em estado para sincronizar — a URL é derivada, não guardada.
  const [patrocinador, setPatrocinador] = useState('')
  // URL cujo QR está aberto. null = modal fechado.
  const [qrAberto, setQrAberto] = useState<string | null>(null)

  const total = GRADE.reduce((n, g) => n + g.quadras.length, 0)
  const coachSelecionado = coaches.find((c) => c.slug === patrocinador) ?? null

  /** O /[ad] da jornada é o último segmento — daí sufixo, não interpolação. */
  const sufixo = patrocinador ? `/${patrocinador}` : ''
  const montarUrl = (esporte: string, quadra: string) =>
    `${DOMINIO_PUBLICO}/${slug}/${esporte}/${quadra}${sufixo}`

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">Links de compartilhamento</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {total} combinações de esporte e quadra, pela convenção padrão.
      </p>

      <div className="mt-4 flex flex-col gap-1.5">
        <label htmlFor="patrocinador" className="text-xs text-muted-foreground">
          Patrocinador (opcional)
        </label>
        <select
          id="patrocinador"
          value={patrocinador}
          onChange={(e) => setPatrocinador(e.target.value)}
          className="h-10 rounded-md border border-border bg-card px-3 text-sm sm:max-w-xs"
        >
          <option value="">— nenhum —</option>
          {coaches.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.nome}
              {c.temLogo ? '' : ' (sem logo)'}
            </option>
          ))}
        </select>

        {coaches.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhum coach ativo com slug cadastrado. O slug é o que vira o último
            segmento da URL.
          </p>
        )}

        {coachSelecionado && !coachSelecionado.temLogo && (
          <p className="text-xs text-muted-foreground">
            {coachSelecionado.nome} não tem logo de patrocinador cadastrado — os links
            funcionam, mas a tela de patrocinador será pulada na abertura.
          </p>
        )}
      </div>

      {/* Um QR impresso a partir de um link morto é o pior desfecho possível
          deste painel — por isso o aviso é forte e não um rodapé discreto.
          `naJornada` vem do CLUBS (lib/clubs-config), que é quem a abertura de
          fato consulta: sem entrada lá, resolveClubContext devolve null e o
          scan redireciona para "/". */}
      {!naJornada && (
        <div
          role="alert"
          className="mt-4 flex gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="text-sm leading-relaxed">
            <p className="font-medium text-destructive">
              Este local ainda não está na jornada de QR.
            </p>
            <p className="mt-1 text-muted-foreground">
              A jornada é servida por <span className="font-mono text-xs">lib/clubs-config.ts</span>,
              e o slug <span className="font-mono text-xs">{slug}</span> não está lá. Os links
              abaixo montam, mas hoje caem na home ao serem abertos —{' '}
              <strong className="font-medium text-foreground">não imprima QR a partir deles</strong>{' '}
              antes de cadastrar o local no config.
            </p>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-6">
        {GRADE.map((g) => (
          <div key={g.esporte}>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {g.nome}
              <span className="ml-2 font-normal normal-case tracking-normal opacity-70">
                {g.quadras.length} {g.quadras.length === 1 ? 'quadra' : 'quadras'}
              </span>
            </h3>
            <div className="mt-2 flex flex-col gap-2">
              {g.quadras.map((q) => {
                const url = montarUrl(g.esporte, q)
                return <LinhaLink key={q} url={url} onVerQr={() => setQrAberto(url)} />
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Nome do arquivo a partir da própria URL, sem o domínio:
          flow.pwer.com.br/spac/tenis/q1-saibro/nicholas
          → qr-spac-tenis-q1-saibro-nicholas.png — assim o PNG baixado se
          identifica sozinho na pasta de downloads, patrocinador incluído. */}
      {qrAberto && (
        <QrModal
          url={qrAberto}
          nomeArquivo={`qr-${qrAberto.split('/').slice(1).join('-')}.png`}
          onFechar={() => setQrAberto(null)}
        />
      )}
    </section>
  )
}
