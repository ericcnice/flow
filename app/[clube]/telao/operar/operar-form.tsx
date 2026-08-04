"use client"

/**
 * Uma linha de quadra na tela de operação: o estado atual + colar o link.
 * Pensada para o CELULAR do parceiro, em pé na quadra — alvos grandes, nada de
 * confirmação em cascata.
 */

import { useActionState } from "react"
import { Check, Link2, X } from "lucide-react"
import { ligarQuadra, desligarQuadra, type ResultadoOperacao } from "./actions"

export function LinhaQuadra({
  clube,
  quadra,
  token,
  ligada,
}: {
  clube: string
  quadra: string
  token: string
  ligada: boolean
}) {
  const [rLigar, actLigar, ligando] = useActionState<ResultadoOperacao | null, FormData>(
    ligarQuadra,
    null,
  )
  const [rDesligar, actDesligar, desligando] = useActionState<
    ResultadoOperacao | null,
    FormData
  >(desligarQuadra, null)

  const erro = rLigar?.erro ?? rDesligar?.erro
  const salvou = rLigar?.ok || rDesligar?.ok

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-base font-black uppercase tracking-wide">
          Quadra {quadra.replace(/^q/i, "")}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
            ligada ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-white/40"
          }`}
        >
          {ligada ? <Check className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
          {ligada ? "Ao vivo no telão" : "Sem partida"}
        </span>
      </div>

      <form action={actLigar} className="flex flex-col gap-2">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="clube" value={clube} />
        <input type="hidden" name="quadra" value={quadra} />
        <input
          name="link"
          type="url"
          inputMode="url"
          placeholder="Cole o link de assistir da partida"
          className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-3 text-sm text-white outline-none placeholder:text-white/25 focus:border-white/40"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={ligando}
            className="flex-1 rounded-full bg-white px-4 py-3 text-sm font-black uppercase tracking-wide text-black active:scale-95 transition disabled:opacity-50"
          >
            {ligando ? "Ligando…" : "Ligar no telão"}
          </button>
          {ligada && (
            <button
              type="submit"
              formAction={actDesligar}
              disabled={desligando}
              aria-label="Desligar esta quadra do telão"
              className="rounded-full border border-white/20 px-4 py-3 text-white/60 active:scale-95 transition disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </form>

      {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}
      {salvou && !erro && <p className="mt-2 text-xs text-emerald-400">Pronto.</p>}
    </div>
  )
}
