/**
 * /[clube]/telao — o TELÃO: vídeo ao vivo + placar do Flow, numa TV.
 *
 * SERVER COMPONENT de propósito: a ligação quadra→partida guarda `view_token`,
 * e ela é lida com service_role. Fazendo isso no servidor, o segredo entra na
 * página já resolvido em URL de iframe — o cliente nunca consulta a tabela nem
 * recebe uma via de descobrir a transmissão de outra quadra.
 *
 * `?quadra=` escolhe a quadra; sem ele, a padrão da config. As cinco quadras
 * com seletor, o grid e o modo torneio são evolução — esta fatia existe para
 * responder duas perguntas em campo: o embed do canal funciona, e o delay
 * entre vídeo e placar incomoda?
 */

import { notFound } from "next/navigation"
import { clubBySlug } from "@/lib/clubs-config"
import { telaoConfig, embedDoCanal, linkDoCanal } from "@/lib/telao-config"
import { lerLink } from "@/lib/supabase/telao"
import { TelaoTela } from "./telao-tela"

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

  const quadra =
    quadraParam && club.quadras.includes(quadraParam) ? quadraParam : cfg.quadraPadrao

  const link = await lerLink(club.id, quadra)

  // A URL do placar é MONTADA aqui a partir dos campos guardados — nunca uma
  // URL colada inteira. Colocar num iframe o que alguém digitou seria abrir a
  // porta para apontar o telão do clube para qualquer lugar.
  const placarUrl = link
    ? `/placar?quadra=${encodeURIComponent(quadra)}&match=${encodeURIComponent(
        link.matchId ?? "",
      )}&view=${encodeURIComponent(link.viewToken)}&clube=${encodeURIComponent(
        club.id,
      )}&sport=squash`
    : null

  return (
    <TelaoTela
      clubeNome={club.nome}
      clubeLogo={club.logo}
      quadra={quadra}
      embedUrl={embedDoCanal(cfg.youtubeChannelId)}
      canalUrl={linkDoCanal(cfg.youtubeChannelId)}
      placarUrl={placarUrl}
    />
  )
}
