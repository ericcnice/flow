'use client'

/**
 * Modal de cadastro E edição de local — o MESMO formulário para os dois casos.
 * `venue = null` → cadastro (addVenue). Preenchido → edição (updateVenue, com
 * o id amarrado no servidor via .bind).
 *
 * Mesmo padrão do modal de members: envio por Server Action (nunca insert
 * direto do client), overlay inline (o projeto não tem componente de Dialog),
 * fecha ao tocar fora, painel com stopPropagation.
 */

import { useActionState, useEffect, useRef, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AddressFields, type Endereco } from '../address-fields'
import { ImageUrlField } from '../image-url-field'
import { addVenue, updateVenue, type FormState } from './actions'
import { SLUG_REGEX, TIPOS } from './constants'

const estadoInicial: FormState = { ok: false }

/** Domínio só para o PREVIEW da URL. A rota /c/[slug] ainda não existe. */
const DOMINIO_PUBLICO = 'flow.pwer.com.br'

/**
 * Snapshot do que o formulário ENVIARIA agora — a régua para saber se mudou algo.
 *
 * Lê do FormData, e não de estado React, porque quase nada mora aqui: o
 * ImageUrlField e o AddressFields são self-contained e guardam o próprio estado
 * ("Self-contained de propósito", diz o address-fields). Como todo campo emite
 * <input name=...>, o DOM do form é o único lugar onde tudo converge — e é
 * exatamente o que a Server Action recebe. Assim a comparação enxerga o VALOR do
 * campo de imagem sem depender do estado de preview dele.
 *
 * A comparação é de valores CRUS; o servidor ainda normaliza depois (trim,
 * '' → null, montarEndereco). Isso erra só para o lado seguro: cru-igual implica
 * payload-igual, então nunca escondemos uma mudança real.
 */
function serializarForm(form: HTMLFormElement): string {
  return JSON.stringify([...new FormData(form).entries()].map(([k, v]) => [k, String(v)]))
}

export type VenueFormData = {
  id: string
  name: string
  slug: string
  type: string
  address: Endereco | null
  logo_url: string | null
  photo_url: string | null
}

export function VenueFormModal({
  venue,
  onFechar,
}: {
  venue: VenueFormData | null
  onFechar: () => void
}) {
  const editando = venue !== null

  // O id NÃO vai num hidden input (seria editável pelo DevTools) — vai amarrado
  // à action no servidor via .bind.
  const action = editando ? updateVenue.bind(null, venue.id) : addVenue
  const [estado, formAction, pendente] = useActionState(action, estadoInicial)

  // Slug é controlado porque alimenta o preview da URL em tempo real e a
  // validação de formato imediata.
  const [slug, setSlug] = useState(venue?.slug ?? '')

  useEffect(() => {
    if (estado.ok) onFechar()
  }, [estado.ok, onFechar])

  // Espelha o CHECK `venues_slug_formato` do banco para dar feedback ANTES de
  // tentar salvar. O banco continua sendo quem garante — isto é só UX.
  const slugInvalido = slug.length > 0 && !SLUG_REGEX.test(slug)

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
  //
  //  - onChange no <form> (abaixo): eventos de digitação borbulham de QUALQUER
  //    input descendente, inclusive os do ImageUrlField e do AddressFields.
  //    Aqui ele carrega quase todo o peso: quando o estado INTERNO desses filhos
  //    muda, este componente não re-renderiza, e nenhum effect daqui rodaria.
  //
  //  - este effect SEM array de deps: roda após todo render deste componente,
  //    cobrindo o que vier de estado local (ex.: o slug controlado).
  //
  // Buraco conhecido, herdado do desenho self-contained: o autocomplete de CEP
  // vive DENTRO do AddressFields e preenche rua/bairro por setState — sem evento
  // de DOM e sem re-render daqui, nenhum dos dois gatilhos o vê. Na prática não
  // aparece, porque digitar o CEP já dispara o onChange e marca sujo antes. Só
  // escaparia se alguém redigitasse o CEP IDÊNTICO ao salvo num endereço que
  // tenha sido ajustado à mão. Fechar isso exigiria o AddressFields avisar o pai
  // — quebrando o encapsulamento dele por um caso de canto.
  //
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
      aria-label={editando ? 'Editar local' : 'Adicionar local'}
    >
      <div
        className="my-8 w-full max-w-lg rounded-2xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            {editando ? 'Editar Local' : 'Adicionar Local'}
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
              placeholder="SPAC"
              defaultValue={venue?.name ?? ''}
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
              placeholder="spac"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              aria-invalid={slugInvalido}
              aria-describedby="slug-preview"
              className="border-border bg-background font-mono"
            />
            <p id="slug-preview" className="text-xs leading-relaxed">
              {slugInvalido ? (
                <span className="text-destructive">
                  Use só minúsculas, números e hífen — sem espaços nem acentos.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Este local ficará disponível publicamente em:{' '}
                  <span className="font-mono text-foreground">
                    {DOMINIO_PUBLICO}/c/{slug || '…'}
                  </span>
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type" className="text-xs text-muted-foreground">
              Tipo *
            </Label>
            <select
              id="type"
              name="type"
              required
              defaultValue={venue?.type ?? 'club'}
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            >
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="mt-1 rounded-lg border border-border p-4">
            <legend className="px-1.5 text-xs uppercase tracking-widest text-muted-foreground">
              Imagens
            </legend>
            <div className="flex flex-col gap-4">
              <ImageUrlField
                id="logo_url"
                label="Logo do local"
                valorInicial={venue?.logo_url}
                formato="quadrado"
              />
              <ImageUrlField
                id="photo_url"
                label="Foto do espaço/quadra"
                valorInicial={venue?.photo_url}
                formato="panorama"
              />
            </div>
          </fieldset>

          <AddressFields valorInicial={venue?.address ?? null} />

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
            {/* Na EDIÇÃO, sem mudança não há o que salvar: o botão desabilita
                (o Button já dima em `disabled:opacity-50`) e a Server Action
                nem é chamada — economiza a ida à rede, não só a escrita.
                No CADASTRO o `editando` desliga a regra: `sujo` nasce false e
                travaria o "Salvar" de um local novo. */}
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
