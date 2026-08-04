"use server"

/**
 * OPERAÇÃO DO TELÃO — ligar/desligar quadra ↔ partida.
 *
 * ⚠️ A TRANCA É AQUI, não na página. A página que esconde o formulário sem
 * token é conveniência; uma Server Action é um endpoint, e quem descobrir o
 * nome dela a chama direto. Por isso o token é revalidado em TODA ação — a
 * mesma disciplina do requireSuperAdmin() do dashboard, com a diferença de que
 * aqui a autorização é POSSE DE TOKEN, não identidade.
 *
 * POR QUE TOKEN E NÃO PAPEL: o parceiro precisa ligar uma partida ao telão
 * dele, não administrar o produto. Papéis com escopo por clube exigiriam tocar
 * as três camadas de autorização do dashboard e a RLS — engenharia grande para
 * um piloto de um clube. Token de capacidade é o mesmo modelo que a sala ao
 * vivo e o /remoto já usam, e não encosta em nada do que existe.
 */

import { revalidatePath } from "next/cache"
import { clubBySlug } from "@/lib/clubs-config"
import { gravarLink, apagarLink } from "@/lib/supabase/telao"
import { operacaoAutorizada } from "@/lib/telao-auth"

export type ResultadoOperacao = { ok: boolean; erro?: string }

/**
 * Recebe o LINK DE TRANSMISSÃO colado e guarda só o que interessa.
 *
 * Extrai `match` e `view` e DESCARTA o resto: guardar a URL inteira e jogá-la
 * num iframe deixaria o telão apontar para qualquer endereço que alguém
 * colasse. O que é guardado são dois identificadores; a URL é remontada pelo
 * servidor na hora de exibir.
 */
export async function ligarQuadra(
  _prev: ResultadoOperacao | null,
  formData: FormData,
): Promise<ResultadoOperacao> {
  const token = String(formData.get("token") ?? "")
  const clube = String(formData.get("clube") ?? "")
  const quadra = String(formData.get("quadra") ?? "")
  const link = String(formData.get("link") ?? "").trim()

  if (!operacaoAutorizada(token)) return { ok: false, erro: "Sem permissão." }

  const club = clubBySlug(clube)
  if (!club || !club.quadras.includes(quadra)) {
    return { ok: false, erro: "Quadra inválida." }
  }
  if (!link) return { ok: false, erro: "Cole o link de transmissão." }

  let matchId: string | null = null
  let viewToken = ""
  try {
    // `new URL` com base cobre link colado inteiro E caminho relativo — o
    // parceiro pode colar o que o botão de compartilhar der.
    const u = new URL(link, "https://flow.pwer.com.br")
    matchId = u.searchParams.get("match")
    viewToken = u.searchParams.get("view") ?? u.searchParams.get("v") ?? ""
  } catch {
    return { ok: false, erro: "Link não reconhecido." }
  }

  if (!viewToken) {
    return { ok: false, erro: "Esse link não tem transmissão. Use o link de assistir." }
  }

  const ok = await gravarLink(club.id, quadra, viewToken, matchId)
  if (!ok) return { ok: false, erro: "Não deu para salvar agora." }

  revalidatePath(`/${club.id}/telao`)
  return { ok: true }
}

/** Desliga a quadra — o telão volta a "aguardando partida". */
export async function desligarQuadra(
  _prev: ResultadoOperacao | null,
  formData: FormData,
): Promise<ResultadoOperacao> {
  const token = String(formData.get("token") ?? "")
  const clube = String(formData.get("clube") ?? "")
  const quadra = String(formData.get("quadra") ?? "")

  if (!operacaoAutorizada(token)) return { ok: false, erro: "Sem permissão." }
  const club = clubBySlug(clube)
  if (!club || !club.quadras.includes(quadra)) return { ok: false, erro: "Quadra inválida." }

  const ok = await apagarLink(club.id, quadra)
  if (!ok) return { ok: false, erro: "Não deu para salvar agora." }

  revalidatePath(`/${club.id}/telao`)
  return { ok: true }
}
