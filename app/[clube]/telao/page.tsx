/**
 * /[clube]/telao — o TELÃO: vídeo ao vivo + placar do Flow, numa TV.
 *
 * SERVER COMPONENT de propósito: a ligação quadra→partida guarda `view_token`,
 * e ela é lida com service_role. Fazendo isso no servidor, o segredo entra na
 * página já resolvido em URL de iframe — o cliente nunca consulta a tabela nem
 * recebe uma via de construir o endereço de outra transmissão.
 *
 * A DIVISÃO DE PODERES desta feature:
 *  • FONTE (aqui, servidor): quais quadras existem, qual partida está ligada a
 *    cada uma, qual o vídeo. Compartilhada — muda no /operar e vale para TODAS
 *    as telas que abrirem esta URL.
 *  • VIEW (no cliente): como ESTA tela exibe a fonte. Local, por aparelho — ver
 *    telao-prefs.ts. A URL do telão roda o mundo (bar, hotel, casa, saguão), e
 *    cada tela quer uma coisa diferente do mesmo material.
 *
 * `?quadra=` FIXA a tela numa quadra (o telão pendurado na parede daquela
 * quadra). Sem ele, a tela escolhe — e lembra a escolha.
 */

import { notFound } from "next/navigation"
import { clubBySlug, quadraLabel } from "@/lib/clubs-config"
import { telaoConfig } from "@/lib/telao-config"
import { embedDaQuadra, linkDeEscape } from "@/lib/telao-youtube"
import { lerLinks, lerCanal } from "@/lib/supabase/telao"
import { lerEstados } from "@/lib/supabase/telao-estado"
import { resumoDoState } from "@/lib/telao-resumo"
import { TelaoTela } from "./telao-tela"
import type { QuadraTelao } from "./tipos"

// Sem cache: a ligação muda quando o parceiro troca a partida, e a TV relê a
// cada 20s. Uma página cacheada mostraria o jogo anterior.
export const dynamic = "force-dynamic"

export default async function TelaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ clube: string }>
  searchParams: Promise<{ quadra?: string }>
}) {
  const { clube } = await params
  const { quadra: quadraParam } = await searchParams

  const club = clubBySlug(clube)
  const cfg = telaoConfig(clube)
  // Sem clube no catálogo ou sem config de telão não há o que montar. 404 em vez
  // de tela vazia: /qualquercoisa/telao não deve parecer um telão quebrado.
  if (!club || !cfg) notFound()

  const fixada = !!quadraParam && club.quadras.includes(quadraParam)
  const quadraInicial = fixada ? quadraParam! : cfg.quadraPadrao

  // UMA leitura para TODAS as quadras, e não uma por quadra: a tela agora
  // oferece a troca de destaque, e ir ao banco a cada toque tornaria a troca
  // lenta justamente no gesto que precisa ser instantâneo numa TV.
  //
  // ⚠️ Isto manda ao cliente a URL de placar das CINCO quadras, e não de uma.
  // NÃO é exposição nova: quem tem a página já podia pedir `?quadra=q2`, `q3`…
  // e obter as mesmas URLs uma a uma. O que muda é o número de idas ao
  // servidor, não o que é alcançável a partir desta página.
  const [links, canalSalvo] = await Promise.all([lerLinks(club.id), lerCanal(club.id)])
  const porQuadra = new Map(links.map((l) => [l.courtSlug, l]))

  // PRECEDÊNCIA DO VÍDEO: o da quadra vence o do clube, e o do clube vence o do
  // catálogo. O último é só compatibilidade — o canal saiu do código na 2a
  // justamente para o parceiro poder trocá-lo sem depender de deploy.
  const canal = canalSalvo || cfg.youtubeChannelId || null

  // O PLACAR-RESUMO das quadras COM partida, para os cartões do carrossel.
  //
  // ⚠️ Aqui, e não no cliente: buscar o placar de cada quadra pelo navegador
  // exigiria mandar o `view_token` de cada sala para lá — o telão viraria um
  // distribuidor das credenciais de leitura de todas as transmissões do clube.
  // O servidor lê, resume, e o cliente recebe nomes e números.
  //
  // Custa uma segunda ida ao banco (depende dos tokens que a primeira trouxe),
  // com teto de 2s e falha isolada por quadra — ver lib/supabase/telao-estado.
  const comPartida = links.filter((l) => l.viewToken)
  const estados = await lerEstados(
    comPartida.map((l) => ({ quadra: l.courtSlug, viewToken: l.viewToken! })),
  )
  // O esporte do clube quando ele só tem um (o caso do piloto) — o `state` da
  // sala manda, quando a traz. Erra o esporte, erra a REGRA do placar.
  const esportePadrao = club.esportes.length === 1 ? club.esportes[0] : "tennis"

  const quadras: QuadraTelao[] = club.quadras.map((slug) => {
    const link = porQuadra.get(slug)
    const estado = estados.get(slug) as Record<string, unknown> | undefined
    const esporte =
      typeof estado?.sport === "string" && estado.sport ? estado.sport : esportePadrao
    return {
      slug,
      numero: quadraLabel(slug),
      resumo: estado ? resumoDoState(estado, esporte) : null,
      embedUrl: embedDaQuadra(link?.videoUrl, canal),
      canalUrl: linkDeEscape(link?.videoUrl, canal),
      // A URL do placar é MONTADA aqui a partir dos campos guardados — nunca
      // uma URL colada inteira. Colocar num iframe o que alguém digitou seria
      // abrir a porta para apontar o telão do clube para qualquer lugar.
      placarUrl: link?.viewToken
        ? `/placar?quadra=${encodeURIComponent(slug)}&match=${encodeURIComponent(
            link.matchId ?? "",
          )}&view=${encodeURIComponent(link.viewToken)}&clube=${encodeURIComponent(
            club.id,
          )}&sport=squash`
        : null,
    }
  })

  return (
    <TelaoTela
      clubeId={club.id}
      clubeNome={club.nome}
      clubeLogo={club.logo}
      quadras={quadras}
      quadraInicial={quadraInicial}
      destaqueFixado={fixada}
    />
  )
}
