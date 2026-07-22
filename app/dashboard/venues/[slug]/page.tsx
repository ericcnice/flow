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
 * Estrutura (redesign): banner/header → <VenueOverview> (acessos do clube,
 * server) → <CourtsPanel> (esportes colapsáveis → cards de quadra unificando
 * acessos + patrocínio + URL/QR/share, client) → endereço/cadastro. Os rollups
 * por-quadra e por-esporte são pré-computados AQUI (server) e passados prontos;
 * o painel é client só pela interatividade (colapsar, dropdown, share nativo).
 */

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ImageOff, MapPin } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { clubBySlug, SPORT_SLUG_TO_ID } from '@/lib/clubs-config'
import { sportById } from '@/lib/sports-catalog'
import { requireSuperAdmin } from '../../guard'
import { TIPOS } from '../constants'
import { type Endereco } from '../../address-fields'
import { VenueImage } from './venue-image'
import { VenueOverview } from './venue-overview'
import { CourtsPanel, type CourtAssoc, type CourtGroup, type SponsorOption } from './courts-panel'
import {
  combinarJanelas,
  porEsporte,
  porQuadra,
  type ParTotais,
  type VisitRow,
} from '@/lib/venue-stats'

type VenueDetalhe = {
  id: string
  name: string
  slug: string
  type: string
  address: Endereco | null
  logo_url: string | null
  photo_url: string | null
  default_sponsor_id: string | null
  active: boolean
  created_at: string
}

/** Linha crua da RPC list_sponsors (o que a página consome dela). */
type SponsorRow = {
  id: string
  slug: string
  name: string
  logo_url: string
  member_id: string | null
  active: boolean
}

const ROTULO_TIPO: Record<string, string> = Object.fromEntries(
  TIPOS.map((t) => [t.valor, t.rotulo]),
)

// INVERSO de SPORT_SLUG_TO_ID: id canônico ('tennis') → slug de URL ('tenis').
// courts.sport é canônico; as URLs da jornada usam o slug de URL. Este mapa é a
// ponte canônico→slug (sem tocar lib/clubs-config: só LÊ o mapa de lá).
const CANONICAL_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SPORT_SLUG_TO_ID).map(([slug, id]) => [id, slug]),
)

/** Linha crua de public.courts (o que a página consome dela). */
type CourtRow = { id: string; sport: string; slug: string; name: string; active: boolean; sort: number }

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
    .select(
      'id, name, slug, type, address, logo_url, photo_url, default_sponsor_id, active, created_at',
    )
    .eq('slug', slug)
    .maybeSingle()

  if (!data) notFound()
  const venue = data as VenueDetalhe

  // Coaches para RESOLVER NOMES no "Por patrocinador" do <VenueOverview>: a
  // telemetria (court_visits) grava o slug do patrocinador, e o coach dá o nome
  // de exibição quando o slug é de um coach. Roda com a sessão do usuário; a RLS
  // de `members` só libera super_admin — exatamente quem chega aqui. Filtros
  // espelham get_sponsor_by_slug (role='coach' + active); `slug not null` é
  // estrutural — o slug É o segmento /[ad] da URL.
  const { data: coachesData } = await supabase
    .from('members')
    .select('slug, name, last_name')
    .eq('role', 'coach')
    .eq('active', true)
    .not('slug', 'is', null)
    .order('name')

  const { data: sponsorsData } = await supabase.rpc('list_sponsors')
  const sponsorRows = (sponsorsData ?? []) as SponsorRow[]

  // Opções para os dropdowns de patrocínio por quadra + a miniatura de logo do
  // card + o select de campanha (que filtra só os ativos no componente). Inclui
  // os INATIVOS — o painel os marca "(inativo)" e alerta sobre a precedência.
  // logo_url alimenta a miniatura do "patrocinador efetivo".
  const sponsorOptions: SponsorOption[] = sponsorRows.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    logo_url: s.logo_url,
    active: s.active,
  }))

  const coaches = (coachesData ?? []).map((c) => ({
    slug: c.slug as string,
    nome: [c.name, c.last_name].filter(Boolean).join(' '),
  }))

  // Quem serve a jornada de QR é o CLUBS estático, não esta tabela — os dois
  // coexistem (ver a nota em ../page.tsx). Se o slug não estiver lá, as URLs
  // montam mas morrem; o CourtsPanel avisa em vez de deixar imprimir QR morto.
  const naJornada = clubBySlug(venue.slug) !== null

  // Contadores de acesso (peça E). Duas janelas no mesmo request: "total" (teto
  // de 3650 dias) e "últimos 7 dias". A RPC é restrita a super_admin no banco.
  // Erro (ex.: migração ainda não rodada) → data null → listas vazias, e a
  // página renderiza tudo 0 sem quebrar. Nunca faz throw (supabase-js devolve
  // { data, error }, não lança).
  // Associações patrocinador↔quadra deste venue (peça C.2). Leitura só via RPC
  // (court_sponsors tem RLS com zero policies). `sport` vem CANÔNICO. Erro →
  // lista vazia, a seção renderiza tudo em "Nenhum" sem quebrar.
  const [statsTotal, stats7d, courtSponsors] = await Promise.all([
    supabase.rpc('get_venue_visit_stats', { p_venue_slug: venue.slug, p_days: 3650 }),
    supabase.rpc('get_venue_visit_stats', { p_venue_slug: venue.slug, p_days: 7 }),
    supabase.rpc('list_court_sponsors', { p_venue_id: venue.id }),
  ])
  const rowsTotal = (statsTotal.data ?? []) as VisitRow[]
  const rows7d = (stats7d.data ?? []) as VisitRow[]
  const courtAssocs = (courtSponsors.data ?? []) as CourtAssoc[]

  // QUADRAS deste venue — FONTE DE VERDADE (Fatia 1): de public.courts, por
  // venue (antes: GRADE hardcoded, 15 iguais p/ todo venue). RLS super_admin
  // (leitura direta com a sessão). Ordenado por sport, sort, slug. Fatia 2:
  // busca TODAS (inclui INATIVAS) — a OPERAÇÃO (cards) usa só as ativas, a
  // GESTÃO enxerga as inativas para reativar. Erro/tabela ausente → lista vazia
  // → o painel mostra estado vazio (não a GRADE). Agrupado por esporte CANÔNICO;
  // slug de URL e nome de exibição vêm do catálogo/mapa (p/ montar as URLs).
  const { data: courtsData } = await supabase
    .from('courts')
    .select('id, sport, slug, name, active, sort')
    .eq('venue_id', venue.id)
    .order('sport', { ascending: true })
    .order('sort', { ascending: true })
    .order('slug', { ascending: true })

  const courtRows = (courtsData ?? []) as CourtRow[]
  const courtGroups: CourtGroup[] = []
  for (const c of courtRows) {
    let g = courtGroups.find((x) => x.sport === c.sport)
    if (!g) {
      g = {
        sport: c.sport,
        esporteSlug: CANONICAL_TO_SLUG[c.sport] ?? c.sport,
        nome: sportById(c.sport).name,
        quadras: [],
      }
      courtGroups.push(g)
    }
    g.quadras.push({ id: c.id, slug: c.slug, name: c.name, active: c.active, sort: c.sort })
  }

  // Rollups pré-computados no SERVER (o client fica burro). Chaveados pelo id
  // CANÔNICO (por-esporte) e por courtKey(canônico, court). Como courts.sport já
  // é canônico, o CourtsPanel lê estes mapas DIRETO (sem sportIdFromSlug).
  const statsByEsporte: Record<string, ParTotais> = combinarJanelas(porEsporte, rowsTotal, rows7d)
  const statsByCourt: Record<string, ParTotais> = combinarJanelas(porQuadra, rowsTotal, rows7d)

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

      <VenueOverview rowsTotal={rowsTotal} rows7d={rows7d} coaches={coaches} />

      <CourtsPanel
        venueId={venue.id}
        venueSlug={venue.slug}
        naJornada={naJornada}
        courtGroups={courtGroups}
        sponsors={sponsorOptions}
        defaultSponsorId={venue.default_sponsor_id}
        associations={courtAssocs}
        statsByEsporte={statsByEsporte}
        statsByCourt={statsByCourt}
      />

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
    </main>
  )
}
