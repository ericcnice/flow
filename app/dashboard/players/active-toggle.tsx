'use client'

/**
 * Alterna `active` de um member. Não deleta: "remover da lista" preserva a
 * linha (e o vínculo futuro com profiles), só tira da lista de ativos.
 *
 * A escrita vai por Server Action, que recheca o papel no servidor — este
 * componente é só o gatilho.
 */

import { useTransition } from 'react'
import { Loader2, RotateCcw, UserMinus } from 'lucide-react'
import { setMemberActive } from './actions'

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const [pendente, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pendente}
      onClick={() => startTransition(() => void setMemberActive(id, !active))}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-50"
      title={active ? 'Remover da lista (mantém o cadastro)' : 'Reativar'}
    >
      {pendente ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : active ? (
        <UserMinus className="h-3.5 w-3.5" />
      ) : (
        <RotateCcw className="h-3.5 w-3.5" />
      )}
      {active ? 'Remover' : 'Reativar'}
    </button>
  )
}
