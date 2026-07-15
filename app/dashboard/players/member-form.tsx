'use client'

/**
 * Botão "Adicionar Pessoa" + modal com o formulário.
 *
 * O envio vai por SERVER ACTION (`addMember`) — nada de insert direto do
 * client. A tabela `members` é sensível e a RLS só libera super_admin; manter
 * a escrita no servidor é o que permite validar e autorizar antes de tocar no
 * banco.
 *
 * Overlay inline no mesmo padrão dos outros modais do app (fecha ao tocar
 * fora, painel com stopPropagation) — o projeto não tem componente de Dialog.
 */

import { useActionState, useEffect, useRef, useState } from 'react'
import { X, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addMember, type FormState } from './actions'

const estadoInicial: FormState = { ok: false }

function Campo({
  id,
  label,
  ...props
}: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={id} name={id} className="border-border bg-background" {...props} />
    </div>
  )
}

export function MemberForm({ clubes }: { clubes: { slug: string; nome: string }[] }) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState(addMember, estadoInicial)
  const formRef = useRef<HTMLFormElement>(null)

  // Fecha e limpa só quando a action confirma sucesso.
  useEffect(() => {
    if (estado.ok) {
      formRef.current?.reset()
      setAberto(false)
    }
  }, [estado.ok])

  if (!aberto) {
    return (
      <Button
        onClick={() => setAberto(true)}
        className="bg-primary font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" />
        Adicionar Pessoa
      </Button>
    )
  }

  return (
    <>
      <Button
        onClick={() => setAberto(true)}
        className="bg-primary font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" />
        Adicionar Pessoa
      </Button>

      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
        onClick={() => setAberto(false)}
        role="dialog"
        aria-modal
        aria-label="Adicionar pessoa"
      >
        <div
          className="my-8 w-full max-w-lg rounded-2xl border border-border bg-card p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Adicionar Pessoa</h2>
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form ref={formRef} action={formAction} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="name" label="Nome *" required placeholder="Nicholas" />
              <Campo id="last_name" label="Sobrenome" placeholder="Ventura" />
            </div>

            <Campo
              id="slug"
              label="Slug (como quer ser chamado)"
              placeholder="nicholasventura"
              pattern="[a-z0-9\-]+"
              title="Só minúsculas, números e hífen."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Campo id="email" label="Email" type="email" placeholder="voce@exemplo.com" />
              <Campo id="phone" label="Telefone" inputMode="tel" placeholder="11 95050-7175" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="role" className="text-xs text-muted-foreground">
                  Papel *
                </Label>
                <select
                  id="role"
                  name="role"
                  required
                  defaultValue="player"
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="player">Player</option>
                  <option value="coach">Coach</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="club_slug" className="text-xs text-muted-foreground">
                  Clube
                </Label>
                <select
                  id="club_slug"
                  name="club_slug"
                  defaultValue=""
                  className="h-10 rounded-md border border-border bg-background px-3 text-sm"
                >
                  <option value="">— sem clube —</option>
                  {clubes.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset className="mt-1 rounded-lg border border-border p-4">
              <legend className="px-1.5 text-xs uppercase tracking-widest text-muted-foreground">
                Endereço
              </legend>
              <div className="grid gap-4 sm:grid-cols-3">
                <Campo id="cep" label="CEP" placeholder="01310-100" />
                <div className="sm:col-span-2">
                  <Campo id="rua" label="Rua" placeholder="Av. Paulista" />
                </div>
                <Campo id="numero" label="Número" placeholder="1000" />
                <Campo id="complemento" label="Complemento" placeholder="Apto 51" />
                <Campo id="bairro" label="Bairro" placeholder="Bela Vista" />
                <div className="sm:col-span-2">
                  <Campo id="cidade" label="Cidade" placeholder="São Paulo" />
                </div>
                <Campo id="uf" label="UF" maxLength={2} placeholder="SP" />
              </div>
            </fieldset>

            {estado.erro && (
              <p role="alert" className="text-sm text-destructive">
                {estado.erro}
              </p>
            )}

            <div className="mt-1 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAberto(false)}
                disabled={pendente}
                className="text-muted-foreground hover:bg-background hover:text-foreground"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={pendente}
                className="bg-primary font-medium text-primary-foreground hover:bg-primary/90"
              >
                {pendente && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
