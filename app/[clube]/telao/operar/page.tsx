/**
 * /[clube]/telao/operar?token=… — onde o parceiro liga a partida ao telão.
 *
 * SEM LOGIN E SEM PAPEL, de propósito. A autorização é POSSE DO TOKEN — o mesmo
 * modelo da sala ao vivo e do /remoto. Dar ao parceiro um papel de admin com
 * escopo por clube exigiria mexer nas três camadas de autorização do dashboard
 * e na RLS; é a fundação certa para quando muitos clubes se autoadministrarem,
 * e engenharia cara demais para um piloto de um.
 *
 * A verificação aqui é de UX (não desenhar o formulário para quem não deve). A
 * tranca real está em CADA Server Action — ver actions.ts.
 */

import { notFound } from "next/navigation"
import { clubBySlug } from "@/lib/clubs-config"
import { telaoConfig } from "@/lib/telao-config"
import { lerLinks } from "@/lib/supabase/telao"
import { operacaoAutorizada } from "@/lib/telao-auth"
import { LinhaQuadra } from "./operar-form"

export const dynamic = "force-dynamic"

export default async function OperarPage({
  params,
  searchParams,
}: {
  params: Promise<{ clube: string }>
  searchParams: Promise<{ token?: string }>
}) {
  const { clube } = await params
  const { token } = await searchParams

  const club = clubBySlug(clube)
  const cfg = telaoConfig(clube)
  if (!club || !cfg) notFound()

  // Token ausente ou errado: 404, não "acesso negado". Uma mensagem de negado
  // confirmaria que a rota existe e que há algo a adivinhar ali.
  if (!operacaoAutorizada(token)) notFound()

  const links = await lerLinks(club.id)
  const ligadas = new Set(links.map((l) => l.courtSlug))

  return (
    <main className="min-h-[100dvh] bg-neutral-950 px-4 py-8 text-white">
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <header>
          <h1 className="text-xl font-black uppercase tracking-tight">
            Telão — {club.nome}
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-white/50">
            Ligue cada quadra à partida que está rolando nela. Abra a partida no
            Flow, toque em Compartilhar, copie o link de <strong>assistir</strong> e
            cole aqui.
          </p>
        </header>

        {club.quadras.map((q) => (
          <LinhaQuadra
            key={q}
            clube={club.id}
            quadra={q}
            token={token ?? ""}
            ligada={ligadas.has(q)}
          />
        ))}

        <p className="mt-2 text-center text-[11px] leading-relaxed text-white/30">
          O telão fica em <span className="font-mono">/{club.id}/telao</span> — abra na
          TV e deixe aberto. Ele acompanha as trocas sozinho.
        </p>
      </div>
    </main>
  )
}
