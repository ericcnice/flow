'use client'

/**
 * Alterna `active` de um patrocinador. Não deleta: "remover da lista" preserva a
 * linha (e o vínculo com a pessoa e com court_sponsors), só tira da jornada.
 *
 * A escrita vai por Server Action → RPC, que recheca o papel no banco — este
 * componente é só o gatilho. Mesmo molde do ActiveToggle de members/venues.
 */

import { useTransition } from 'react'
import { Loader2, RotateCcw, EyeOff } from 'lucide-react'
import { setSponsorActive } from './actions'

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [pendente, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pendente}
      onClick={() => startTransition(() => void setSponsorActive(id, !active))}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-50"
      title={active ? 'Desativar (some da jornada, mantém o cadastro)' : 'Reativar'}
    >
      {pendente ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : active ? (
        <EyeOff className="h-3.5 w-3.5" />
      ) : (
        <RotateCcw className="h-3.5 w-3.5" />
      )}
      {active ? 'Desativar' : 'Reativar'}
    </button>
  )
}
