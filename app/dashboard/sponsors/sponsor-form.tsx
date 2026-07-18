'use client'

/**
 * Modal de cadastro E edição de patrocinador — o MESMO formulário para os dois
 * casos. `sponsor = null` → cadastro (addSponsor). Preenchido → edição
 * (updateSponsor, com o id amarrado no servidor via .bind).
 *
 * Mesmo padrão dos modais de members/venues: envio por Server Action (nunca
 * escrita direta do client — aqui a tabela nem tem policy que permita),
 * overlay inline (o projeto não tem componente de Dialog), fecha ao tocar fora,
 * painel com stopPropagation.
 */

import { useActionState, useEffect, useRef, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ImageUrlField } from '../image-url-field'
import { addSponsor, updateSponsor, type FormState } from './actions'

const estadoInicial: FormState = { ok: false }

/** Espelha o regex de slug do banco/action. UX imediata; o banco é quem garante. */
const SLUG_REGEX = /^[a-z0-9-]+$/

export type SponsorFormData = {
  id: string
  slug: string
  name: string
  logo_url: string
  member_id: string | null
}

/** Opção do seletor de vínculo com pessoa. */
export type MemberOption = { id: string; nome: string }

/**
 * Snapshot do que o formulário ENVIARIA agora — a régua para saber se mudou algo.
 * Lê do FormData (e não de estado React) porque o ImageUrlField é self-contained
 * e guarda a própria url; o DOM do form é o único lugar onde tudo converge — e é
 * exatamente o que a Server Action recebe. Comparação de valores CRUS; o servidor
 * normaliza depois (trim, '' → null), o que só erra para o lado seguro.
 */
function serializarForm(form: HTMLFormElement): string {
  return JSON.stringify([...new FormData(form).entries()].map(([k, v]) => [k, String(v)]))
}

export function SponsorFormModal({
  sponsor,
  members,
  onFechar,
}: {
  sponsor: SponsorFormData | null
  members: MemberOption[]
  onFechar: () => void
}) {
  const editando = sponsor !== null

  // O id NÃO vai num hidden input (seria editável pelo DevTools) — vai amarrado
  // à action no servidor via .bind.
  const action = editando ? updateSponsor.bind(null, sponsor.id) : addSponsor
  const [estado, formAction, pendente] = useActionState(action, estadoInicial)

  // Slug é controlado porque alimenta a validação de formato imediata.
  const [slug, setSlug] = useState(sponsor?.slug ?? '')
  const slugInvalido = slug.length > 0 && !SLUG_REGEX.test(slug)

  useEffect(() => {
    if (estado.ok) onFechar()
  }, [estado.ok, onFechar])

  // --- "Salvar alterações" só quando há mudança de verdade (só na EDIÇÃO) ---
  const formRef = useRef<HTMLFormElement>(null)
  const snapshotInicial = useRef<string | null>(null)
  const [sujo, setSujo] = useState(false)

  const recalcularSujo = () => {
    if (!formRef.current) return
    const atual = serializarForm(formRef.current)
    // 1º render: os defaultValue já estão no DOM, então este É o original.
    if (snapshotInicial.current === null) {
      snapshotInicial.current = atual
      return
    }
    setSujo(atual !== snapshotInicial.current)
  }

  // DOIS gatilhos, porque nenhum sozinho cobre tudo:
  //  - onChange no <form>: eventos de digitação borbulham de QUALQUER input
  //    descendente, inclusive os do ImageUrlField (cujo estado interno não
  //    re-renderiza este componente).
  //  - este effect SEM array de deps: roda após todo render deste componente,
  //    cobrindo estado local (o slug controlado).
  // setSujo com o mesmo valor não re-renderiza (React faz bail out): sem loop.
  useEffect(() => {
    recalcularSujo()
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onFechar}
      role="dialog"
      aria-modal
      aria-label={editando ? 'Editar patrocinador' : 'Adicionar patrocinador'}
    >
      <div
        className="my-8 w-full max-w-lg rounded-2xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            {editando ? 'Editar Patrocinador' : 'Adicionar Patrocinador'}
          </h2>
          <button
            type="button"
            onClick={onFechar}
            className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          ref={formRef}
          action={formAction}
          onChange={recalcularSujo}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name" className="text-xs text-muted-foreground">
              Nome *
            </Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="Coca-Cola"
              defaultValue={sponsor?.name ?? ''}
              className="border-border bg-background"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="slug" className="text-xs text-muted-foreground">
              Slug *
            </Label>
            <Input
              id="slug"
              name="slug"
              required
              placeholder="coca-cola"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              aria-invalid={slugInvalido}
              aria-describedby="slug-ajuda"
              className="border-border bg-background font-mono"
            />
            <p id="slug-ajuda" className="text-xs leading-relaxed">
              {slugInvalido ? (
                <span className="text-destructive">
                  Use só minúsculas, números e hífen — sem espaços nem acentos.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Chave que viaja na URL da jornada (o segmento /[ad]). Definitiva —
                  evite trocar depois de impresso.
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="member_id" className="text-xs text-muted-foreground">
              Pessoa vinculada
            </Label>
            <select
              id="member_id"
              name="member_id"
              defaultValue={sponsor?.member_id ?? ''}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              {/* Default = marca solta (member_id null): patrocinador sem pessoa,
                  ex.: Coca-Cola. Vincular a um coach é opcional. */}
              <option value="">Nenhum (marca)</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="mt-1 rounded-lg border border-border p-4">
            <legend className="px-1.5 text-xs uppercase tracking-widest text-muted-foreground">
              Logo
            </legend>
            {/* 1080x1080 (quadrado), mesmo padrão das demais imagens do painel.
                Sem upload: cola a URL já hospedada (idealmente Supabase Storage,
                por causa do CORS da tela de compartilhar — ver sponsors.ts). */}
            <ImageUrlField
              id="logo_url"
              label="Logo do patrocinador (1080×1080)"
              valorInicial={sponsor?.logo_url}
              formato="quadrado"
            />
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
              onClick={onFechar}
              disabled={pendente}
              className="text-muted-foreground hover:bg-background hover:text-foreground"
            >
              Cancelar
            </Button>
            {/* Na EDIÇÃO, sem mudança não há o que salvar: o botão desabilita e a
                Server Action nem é chamada. No CADASTRO o `editando` desliga a
                regra: `sujo` nasce false e travaria o "Salvar" de um registro novo. */}
            <Button
              type="submit"
              disabled={pendente || slugInvalido || (editando && !sujo)}
              className="bg-primary font-medium text-primary-foreground hover:bg-primary/90"
            >
              {pendente && <Loader2 className="h-4 w-4 animate-spin" />}
              {editando ? 'Salvar alterações' : 'Salvar'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
