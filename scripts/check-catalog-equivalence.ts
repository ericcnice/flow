/**
 * TESTE DE EQUIVALÊNCIA bundle × banco (Fatia 3a).
 *
 * Prova "bundle ⊆ banco" ANTES de ligar a resolução em camadas (Fatia 3b): para
 * cada (clube, esporte, quadra) que o CLUBS estático (lib/clubs-config.ts)
 * conhece, confirma que o catálogo público do banco (RPC get_public_clubs)
 * contém aquele clube ATIVO com aquele esporte e aquela quadra ATIVOS.
 *
 * É um SCRIPT, não um dos testes de CI: depende de rede/banco (a IA do Supabase
 * roda a migração no painel; o CI não tem o banco). Rodar manualmente:
 *
 *   npx tsx --env-file=.env.local scripts/check-catalog-equivalence.ts
 *
 * (usa NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY — a RPC é
 * pública/anon, então a anon key basta). Sai com código != 0 se algo do bundle
 * faltar no banco — o gate para o 3c (remover o bundle) é a saída ZERO.
 *
 * NOTA: o CLUBS.quadras é uma lista PLANA (sem vínculo esporte↔quadra), então
 * este script checa: (a) clube presente e ativo; (b) cada esporte oferecido tem
 * ≥1 quadra no banco; (c) cada slug de quadra do bundle existe no banco (em algum
 * esporte). Não valida o par exato esporte×quadra — o bundle não o expressa.
 */

import { createClient } from "@supabase/supabase-js"
import { CLUBS } from "@/lib/clubs-config"

type PublicCourt = { sport: string; slug: string; name: string }
type PublicClub = { slug: string; name: string; logo_url: string | null; courts: PublicCourt[] }

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY no ambiente.")
    process.exit(2)
  }

  const supabase = createClient(url, key)
  const { data, error } = await supabase.rpc("get_public_clubs")
  if (error) {
    console.error("RPC get_public_clubs falhou:", error.message)
    process.exit(2)
  }

  const clubesDoBanco = (data ?? []) as PublicClub[]
  const porSlug = new Map(clubesDoBanco.map((c) => [c.slug.toLowerCase(), c]))

  const falhas: string[] = []
  let checados = 0

  for (const club of Object.values(CLUBS)) {
    const noBanco = porSlug.get(club.id.toLowerCase())
    if (!noBanco) {
      falhas.push(`Clube "${club.id}" NÃO está no banco (ausente ou inativo).`)
      continue
    }

    const esportesNoBanco = new Set(noBanco.courts.map((c) => c.sport))
    const quadrasNoBanco = new Set(noBanco.courts.map((c) => c.slug.toLowerCase()))

    // (b) cada esporte oferecido tem ≥1 quadra no banco.
    for (const sport of club.esportes) {
      checados++
      if (!esportesNoBanco.has(sport)) {
        falhas.push(`Clube "${club.id}": esporte "${sport}" do bundle NÃO tem quadra no banco.`)
      }
    }

    // (c) cada slug de quadra do bundle existe no banco (em algum esporte).
    for (const quadra of club.quadras) {
      checados++
      if (!quadrasNoBanco.has(quadra.toLowerCase())) {
        falhas.push(`Clube "${club.id}": quadra "${quadra}" do bundle NÃO existe no banco.`)
      }
    }
  }

  console.log(`\nEquivalência bundle × banco — ${Object.keys(CLUBS).length} clube(s), ${checados} checagem(ns).`)
  if (falhas.length === 0) {
    console.log("✓ bundle ⊆ banco: tudo que o CLUBS conhece existe (e está ativo) no banco.")
    process.exit(0)
  }
  console.error(`\n✗ ${falhas.length} divergência(s):`)
  for (const f of falhas) console.error("  - " + f)
  console.error("\nNÃO ligar o 3c até zerar. (Para o 3b a união-com-piso ainda protege o impresso.)")
  process.exit(1)
}

main().catch((err) => {
  console.error("Erro inesperado:", err)
  process.exit(2)
})
