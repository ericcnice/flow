/**
 * Detalhe de um local (padrão list+detail: a listagem segue dona da edição
 * rápida, da busca e do criar/remover — esta página é de LEITURA).
 *
 * Server Component: a query roda com a sessão do usuário, então a RLS de
 * `venues` (super_admin exclusivo) é aplicada pelo Postgres. O
 * requireSuperAdmin() aqui é defense in depth — o layout já o roda, mas a
 * convenção da casa é a página chamar de novo (ver a nota em guard.ts); o
 * cache() do React faz a query de papel rodar uma vez só por request.
 *
 * O que esta tela mostra hoje é só o que EXISTE: dados do venue + os links da
 * jornada por convenção hardcoded. Grade de QR por quadra de verdade,
 * estatísticas e a página pública /c/[slug] ficam para quando houver estrutura
 * de quadras por venue e a frente de analytics.
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ImageOff, MapPin } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { clubBySlug } from '@/lib/clubs-config'
import { requireSuperAdmin } from '../../guard'
import { TIPOS } from '../constants'
import { type Endereco } from '../../address-fields'
import { ShareLinks, type Coach } from './share-links'
import { VenueImage } from './venue-image'
import { VisitStats, type VisitRow } from './visit-stats'

type VenueDetalhe = {
  id: string
  name: string
  slug: string
  type: string
  address: Endereco | null
  logo_url: string | null
  photo_url: string | null
  active: boolean
  created_at: string
}

const ROTULO_TIPO: Record<string, string> = Object.fromEntries(
  TIPOS.map((t) => [t.valor, t.rotulo]),
)

/**
 * Endereço em linhas legíveis. Cada campo do jsonb é opcional (o formulário
 * omite o que veio vazio), então tudo aqui é condicional — e um endereço só com
 * cidade tem que sair bem, não como uma linha de vírgulas soltas.
 */
function linhasEndereco(a: Endereco | null): string[] {
  if (!a) return []
  const linhas: string[] = []

  const rua = [a.rua, a.numero].filter(Boolean).join(', ')
  const comRua = [rua, a.complemento].filter(Boolean).join(' — ')
  if (comRua) linhas.push(comRua)

  if (a.bairro) linhas.push(a.bairro)

  const cidade = a.cidade && a.uf ? `${a.cidade}/${a.uf}` : a.cidade || a.uf
  if (cidade) linhas.push(cidade)

  if (a.cep) linhas.push(`CEP ${a.cep}`)
  return linhas
}

export default async function VenueDetailPage({
  params,
}: {
  // Next 15: params é assíncrono.
  params: Promise<{ slug: string }>
}) {
  await requireSuperAdmin()
  const { slug } = await params

  const supabase = await createServerSupabaseClient()
  // maybeSingle: `slug` é UNIQUE em venues, então ou vem uma linha ou nenhuma.
  const { data } = await supabase
    .from('venues')
    .select('id, name, slug, type, address, logo_url, photo_url, active, created_at')
    .eq('slug', slug)
    .maybeSingle()

  if (!data) notFound()
  const venue = data as VenueDetalhe

  // Coaches para o seletor de patrocinador. Roda com a sessão do usuário, e a
  // RLS de `members` só libera super_admin — que é exatamente quem chega aqui.
  //
  // Os filtros espelham os da RPC get_sponsor_by_slug (role='coach' + active),
  // que é quem a jornada de fato consulta: listar alguém que a RPC não devolve
  // seria oferecer uma URL que não resolve. O `slug not null` é estrutural — o
  // slug É o segmento /[ad] da URL; sem ele não há o que montar.
  const { data: coachesData } = await supabase
    .from('members')
    .select('id, slug, name, last_name')
    .eq('role', 'coach')
    .eq('active', true)
    .not('slug', 'is', null)
    .order('name')

  // "temLogo" agora vem de `sponsors` (peça A/C.1), não mais de
  // members.sponsor_logo_url (aposentado): um coach "tem logo" quando existe um
  // patrocinador ATIVO vinculado a ele (member_id). É o que a jornada de fato
  // resolve. list_sponsors é a única leitura possível de sponsors (RLS com zero
  // policies) e já roda sob a guarda de super_admin no banco; erro → conjunto
  // vazio → todos sem logo (degrada seguro, o seletor só deixa de avisar).
  const { data: sponsorsData } = await supabase.rpc('list_sponsors')
  const coachesComLogo = new Set(
    (sponsorsData ?? [])
      .filter((s: { active: boolean; member_id: string | null }) => s.active && s.member_id)
      .map((s: { member_id: string | null }) => s.member_id as string),
  )

  const coaches: Coach[] = (coachesData ?? []).map((c) => ({
    slug: c.slug as string,
    nome: [c.name, c.last_name].filter(Boolean).join(' '),
    // Sem logo a URL monta e a jornada NÃO quebra — o resolveSponsor devolve
    // null e a Tela 2 é pulada. Mas o QR fica sem propósito, então o seletor
    // avisa em vez de deixar imprimir um patrocínio que não aparece.
    temLogo: coachesComLogo.has(c.id as string),
  }))

  // Quem serve a jornada de QR é o CLUBS estático, não esta tabela — os dois
  // coexistem (ver a nota em ../page.tsx). Se o slug não estiver lá, os links
  // montam mas morrem; o ShareLinks avisa em vez de deixar imprimir QR morto.
  const naJornada = clubBySlug(venue.slug) !== null

  // Contadores de acesso (peça E). Duas janelas no mesmo request: "total" (teto
  // de 3650 dias) e "últimos 7 dias". A RPC é restrita a super_admin no banco.
  // Erro (ex.: migração ainda não rodada) → data null → listas vazias, e a
  // página renderiza tudo 0 sem quebrar. Nunca faz throw (supabase-js devolve
  // { data, error }, não lança).
  const [statsTotal, stats7d] = await Promise.all([
    supabase.rpc('get_venue_visit_stats', { p_venue_slug: venue.slug, p_days: 3650 }),
    supabase.rpc('get_venue_visit_stats', { p_venue_slug: venue.slug, p_days: 7 }),
  ])
  const rowsTotal = (statsTotal.data ?? []) as VisitRow[]
  const rows7d = (stats7d.data ?? []) as VisitRow[]

  const endereco = linhasEndereco(venue.address)
  const cadastradoEm = new Date(venue.created_at).toLocaleDateString('pt-BR')

  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <Link
        href="/dashboard/venues"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Courts
      </Link>

      {/* FOTO do espaço: primeira vez que ela aparece no painel — a listagem só
          usa o logo, num avatar de 36px. Banner baixo no mobile, mais alto a
          partir do sm. */}
      <div className="mt-6 flex h-40 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card sm:h-56">
        <VenueImage
          src={venue.photo_url}
          alt={`Foto de ${venue.name}`}
          className="h-full w-full object-cover"
          fallback={
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <ImageOff className="h-6 w-6" />
              <span className="text-xs">sem foto do espaço</span>
            </div>
          }
        />
      </div>

      {/* Cabeçalho: empilha no mobile, vira linha no sm. O logo sobe sobre o
          banner (-mt) para amarrar os dois blocos. */}
      <header className="-mt-8 flex flex-col gap-4 px-1 sm:flex-row sm:items-end">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-background">
          <VenueImage
            src={venue.logo_url}
            alt={`Logo de ${venue.name}`}
            className="h-full w-full object-contain"
            fallback={
              <span className="text-2xl font-semibold text-muted-foreground">
                {venue.name.trim().charAt(0).toUpperCase() || '?'}
              </span>
            }
          />
        </div>

        <div className="min-w-0 flex-1 sm:pb-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{venue.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs font-medium">
              {ROTULO_TIPO[venue.type] ?? venue.type}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 text-xs ${
                venue.active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${venue.active ? 'bg-primary' : 'bg-muted-foreground'}`}
              />
              {venue.active ? 'Ativo' : 'Inativo'}
            </span>
            <span className="font-mono text-xs text-muted-foreground">/{venue.slug}</span>
          </div>
        </div>
      </header>

      <VisitStats rowsTotal={rowsTotal} rows7d={rows7d} coaches={coaches} />

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Endereço
          </h2>
          {endereco.length > 0 ? (
            <address className="mt-2 flex flex-col gap-0.5 text-sm not-italic leading-relaxed">
              {endereco.map((linha) => (
                <span key={linha}>{linha}</span>
              ))}
            </address>
          ) : (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              Nenhum endereço cadastrado.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Cadastro
          </h2>
          <p className="mt-2 text-sm leading-relaxed">
            Cadastrado em {cadastradoEm}.
          </p>
        </div>
      </section>

      <ShareLinks slug={venue.slug} naJornada={naJornada} coaches={coaches} />
    </main>
  )
}
