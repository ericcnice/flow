"use client"

/**
 * Uma linha de quadra na tela de operação: o estado atual + colar o link.
 * Pensada para o CELULAR do parceiro, em pé na quadra — alvos grandes, nada de
 * confirmação em cascata.
 */

import { useActionState } from "react"
import { Check, Link2, X } from "lucide-react"
import {
  ligarQuadra,
  desligarQuadra,
  salvarCanal,
  salvarVideoQuadra,
  type ResultadoOperacao,
} from "./actions"

/**
 * O CANAL DO CLUBE — a config que vale para todas as quadras.
 *
 * Está aqui, e não no código, porque é o parceiro quem precisa trocá-la. Na
 * Fatia 1 ela vivia no catálogo estático: funcionava, mas enterrava numa
 * constante uma informação que muda quando o clube muda de canal — e config
 * invisível é config que ninguém lembra que existe.
 */
export function CampoCanal({
  clube,
  token,
  atual,
}: {
  clube: string
  token: string
  atual: string | null
}) {
  const [r, act, salvando] = useActionState<ResultadoOperacao | null, FormData>(salvarCanal, null)

  return (
    <form action={act} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="clube" value={clube} />
      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-white/50">
        Canal do YouTube do clube
      </label>
      <p className="mb-3 text-xs leading-relaxed text-white/40">
        Vale para todas as quadras: o telão pega o que estiver ao vivo agora. Cole
        o ID do canal (começa com <span className="font-mono">UC…</span>) ou o link
        dele.
      </p>
      <div className="flex gap-2">
        <input
          name="canal"
          defaultValue={atual ?? ""}
          placeholder="UCxxxxxxxxxxxxxxxxxxxxxx"
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/40 px-3 py-3 font-mono text-sm text-white outline-none placeholder:text-white/25 focus:border-white/40"
        />
        <button
          type="submit"
          disabled={salvando}
          className="shrink-0 rounded-full bg-white px-5 py-3 text-sm font-black uppercase tracking-wide text-black active:scale-95 transition disabled:opacity-50"
        >
          {salvando ? "…" : "Salvar"}
        </button>
      </div>
      {r?.erro && <p className="mt-2 text-xs text-red-400">{r.erro}</p>}
      {r?.ok && !r.erro && <p className="mt-2 text-xs text-emerald-400">Canal salvo.</p>}
    </form>
  )
}

export function LinhaQuadra({
  clube,
  quadra,
  token,
  ligada,
  videoAtual,
}: {
  clube: string
  quadra: string
  token: string
  ligada: boolean
  /** ID do vídeo próprio desta quadra. null = usa o canal do clube. */
  videoAtual: string | null
}) {
  const [rLigar, actLigar, ligando] = useActionState<ResultadoOperacao | null, FormData>(
    ligarQuadra,
    null,
  )
  const [rDesligar, actDesligar, desligando] = useActionState<
    ResultadoOperacao | null,
    FormData
  >(desligarQuadra, null)
  const [rVideo, actVideo, salvandoVideo] = useActionState<ResultadoOperacao | null, FormData>(
    salvarVideoQuadra,
    null,
  )

  const erro = rLigar?.erro ?? rDesligar?.erro ?? rVideo?.erro
  const salvou = rLigar?.ok || rDesligar?.ok || rVideo?.ok

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

      {/* VÍDEO PRÓPRIO — opcional, e por isso vem depois e mais discreto: a
          maioria dos clubes tem uma transmissão só e nunca vai preencher isto.
          Quem tem câmera por quadra encontra; quem não tem, não tropeça. */}
      <form action={actVideo} className="mt-3 border-t border-white/10 pt-3">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="clube" value={clube} />
        <input type="hidden" name="quadra" value={quadra} />
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-white/35">
          Vídeo só desta quadra {videoAtual ? "" : "(opcional)"}
        </label>
        <div className="flex gap-2">
          <input
            name="video"
            defaultValue={videoAtual ?? ""}
            placeholder="Link do YouTube — vazio usa o canal do clube"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-xs text-white outline-none placeholder:text-white/20 focus:border-white/30"
          />
          <button
            type="submit"
            disabled={salvandoVideo}
            className="shrink-0 rounded-full border border-white/20 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white/70 active:scale-95 transition disabled:opacity-50"
          >
            {salvandoVideo ? "…" : "Salvar"}
          </button>
        </div>
      </form>

      {erro && <p className="mt-2 text-xs text-red-400">{erro}</p>}
      {salvou && !erro && <p className="mt-2 text-xs text-emerald-400">Pronto.</p>}
    </div>
  )
}
