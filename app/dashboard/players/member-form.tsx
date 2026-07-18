'use client'

/**
 * Modal de cadastro E edição de pessoa — o MESMO formulário para os dois casos.
 * `member = null` → cadastro (addMember). `member` preenchido → edição
 * (updateMember, com o id amarrado via .bind no servidor).
 *
 * O envio vai por SERVER ACTION, nunca por insert/update direto do client:
 * `members` é sensível e a RLS só libera super_admin, então validação e
 * autorização acontecem no servidor, antes de tocar no banco.
 *
 * Overlay inline no mesmo padrão dos outros modais do app (fecha ao tocar
 * fora, painel com stopPropagation) — o projeto não tem componente de Dialog.
 */

import { useActionState, useEffect, useRef, useState } from 'react'
import { X, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ImageUrlField } from '../image-url-field'
import { addMember, updateMember, type FormState } from './actions'

const estadoInicial: FormState = { ok: false }

export type MemberFormData = {
  id: string
  name: string
  last_name: string | null
  slug: string | null
  email: string | null
  phone: string | null
  role: string
  club_slug: string | null
  address: Record<string, string> | null
  avatar_url: string | null
}

type CepStatus = 'idle' | 'buscando' | 'ok' | 'nao-encontrado' | 'erro'

/**
 * Snapshot do que o formulário ENVIARIA agora — a régua para saber se mudou algo.
 *
 * Lê do FormData, e não de estado React, porque os valores não moram todos aqui:
 * o ImageUrlField é self-contained e guarda a própria url. Como todo campo emite
 * <input name=...>, o DOM do form é o único lugar onde tudo converge — e é
 * exatamente o que a Server Action recebe. Assim a comparação enxerga o VALOR do
 * campo de imagem sem depender do estado de preview dele.
 *
 * A comparação é de valores CRUS; o servidor ainda normaliza depois (trim,
 * '' → null, montarEndereco). Isso erra só para o lado seguro: cru-igual implica
 * payload-igual, então nunca escondemos uma mudança real. O inverso não vale — um
 * espaço no fim habilita o botão para algo que normaliza em nada, e aí acontece
 * exatamente o que acontece hoje.
 */
function serializarForm(form: HTMLFormElement): string {
  return JSON.stringify([...new FormData(form).entries()].map(([k, v]) => [k, String(v)]))
}

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

export function MemberFormModal({
  member,
  clubes,
  onFechar,
}: {
  member: MemberFormData | null
  clubes: { slug: string; nome: string }[]
  onFechar: () => void
}) {
  const editando = member !== null

  // O id NÃO vai num hidden input (seria editável pelo DevTools) — vai amarrado
  // à action no servidor via .bind.
  const action = editando ? updateMember.bind(null, member.id) : addMember
  const [estado, formAction, pendente] = useActionState(action, estadoInicial)

  // Endereço é estado controlado porque o autocomplete de CEP escreve nele.
  // O resto do form é não-controlado (defaultValue) — mais simples.
  const [endereco, setEndereco] = useState<Record<string, string>>(member?.address ?? {})
  const [cepStatus, setCepStatus] = useState<CepStatus>('idle')

  // `role` voltou a ser NÃO-controlado (defaultValue): o campo de patrocinador
  // que dependia dele foi aposentado — logos agora vivem na entidade `sponsors`
  // (peça A/C.1), não em members.sponsor_logo_url.

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
  //    input descendente, inclusive os que vivem dentro do ImageUrlField. É o
  //    único jeito de saber que a url mudou: quando o estado INTERNO dele muda,
  //    este componente não re-renderiza, então nenhum effect daqui rodaria.
  //
  //  - este effect SEM array de deps: roda após todo render deste componente e
  //    pega escrita PROGRAMÁTICA no estado local — o autocomplete de CEP
  //    preenche rua/bairro/cidade/uf por setState, e setState não dispara evento
  //    de DOM, então o onChange passaria batido.
  //
  // setSujo com o mesmo valor não re-renderiza (React faz bail out): sem loop.
  useEffect(() => {
    recalcularSujo()
  })

  // Só busca quando o usuário MEXE no CEP. Sem isto, abrir a edição de alguém
  // que já tem CEP dispararia uma busca no mount e sobrescreveria um endereço
  // que talvez tenha sido ajustado à mão.
  const cepTocado = useRef(false)

  useEffect(() => {
    if (!cepTocado.current) return

    const digitos = (endereco.cep ?? '').replace(/\D/g, '')
    if (digitos.length !== 8) {
      setCepStatus('idle')
      return
    }

    const ctrl = new AbortController()
    setCepStatus('buscando')
    ;(async () => {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${digitos}/json/`, {
          signal: ctrl.signal,
        })
        // CEP com formato inválido devolve 400 com HTML — res.json() estouraria.
        if (!res.ok) {
          setCepStatus('erro')
          return
        }
        const data = await res.json()
        // CEP inexistente vem como 200 + {"erro":"true"} (string, não boolean).
        if (data?.erro) {
          setCepStatus('nao-encontrado')
          return
        }
        setEndereco((atual) => ({
          ...atual,
          rua: data.logradouro || '',
          bairro: data.bairro || '',
          cidade: data.localidade || '',
          uf: data.uf || '',
          // `complemento` da ViaCEP é a faixa de numeração da rua ("de 612 a
          // 1510 - lado par"), não o complemento da pessoa. Não mapeamos.
        }))
        setCepStatus('ok')
      } catch (err) {
        // Aborto é troca de CEP, não falha. Rede fora → o usuário digita à mão.
        if ((err as Error)?.name !== 'AbortError') setCepStatus('erro')
      }
    })()

    return () => ctrl.abort()
  }, [endereco.cep])

  // Fecha só quando a action confirma sucesso.
  useEffect(() => {
    if (estado.ok) onFechar()
  }, [estado.ok, onFechar])

  const setCampoEndereco = (campo: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEndereco((atual) => ({ ...atual, [campo]: e.target.value }))

  const avisoCep =
    cepStatus === 'buscando'
      ? 'buscando…'
      : cepStatus === 'nao-encontrado'
        ? 'CEP não encontrado — preencha à mão'
        : cepStatus === 'erro'
          ? 'busca indisponível — preencha à mão'
          : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm"
      onClick={onFechar}
      role="dialog"
      aria-modal
      aria-label={editando ? 'Editar pessoa' : 'Adicionar pessoa'}
    >
      <div
        className="my-8 w-full max-w-lg rounded-2xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            {editando ? 'Editar Pessoa' : 'Adicionar Pessoa'}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="name"
              label="Nome *"
              required
              placeholder="Nicholas"
              defaultValue={member?.name ?? ''}
            />
            <Campo
              id="last_name"
              label="Sobrenome"
              placeholder="Ventura"
              defaultValue={member?.last_name ?? ''}
            />
          </div>

          <Campo
            id="slug"
            label="Slug (como quer ser chamado)"
            placeholder="nicholasventura"
            pattern="[a-z0-9\-]+"
            title="Só minúsculas, números e hífen."
            defaultValue={member?.slug ?? ''}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="email"
              label="Email"
              type="email"
              placeholder="voce@exemplo.com"
              defaultValue={member?.email ?? ''}
            />
            <Campo
              id="phone"
              label="Telefone"
              inputMode="tel"
              placeholder="11 95050-7175"
              defaultValue={member?.phone ?? ''}
            />
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
                defaultValue={member?.role ?? 'player'}
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
                defaultValue={member?.club_slug ?? ''}
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
              Imagens
            </legend>
            <div className="flex flex-col gap-4">
              <ImageUrlField
                id="avatar_url"
                label="Foto de perfil"
                valorInicial={member?.avatar_url}
                formato="quadrado"
              />
              {/* O "Logo de patrocinador" foi APOSENTADO daqui: a fonte de
                  verdade dos logos passou a ser a entidade `sponsors` (peça A),
                  administrada em /dashboard/sponsors (peça C.1). A jornada resolve
                  o patrocinador por `sponsors`, não por members.sponsor_logo_url —
                  que segue existindo no banco, mas não é mais editado pela UI. */}
            </div>
          </fieldset>

          <fieldset className="mt-1 rounded-lg border border-border p-4">
            <legend className="px-1.5 text-xs uppercase tracking-widest text-muted-foreground">
              Endereço
            </legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cep" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  CEP
                  {cepStatus === 'buscando' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {cepStatus === 'ok' && <Check className="h-3 w-3 text-primary" />}
                </Label>
                <Input
                  id="cep"
                  name="cep"
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="01310-100"
                  className="border-border bg-background"
                  value={endereco.cep ?? ''}
                  onChange={(e) => {
                    cepTocado.current = true
                    setCampoEndereco('cep')(e)
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <Campo
                  id="rua"
                  label="Rua"
                  placeholder="Av. Paulista"
                  value={endereco.rua ?? ''}
                  onChange={setCampoEndereco('rua')}
                />
              </div>
              <Campo
                id="numero"
                label="Número"
                placeholder="1000"
                value={endereco.numero ?? ''}
                onChange={setCampoEndereco('numero')}
              />
              <Campo
                id="complemento"
                label="Complemento"
                placeholder="Apto 51"
                value={endereco.complemento ?? ''}
                onChange={setCampoEndereco('complemento')}
              />
              <Campo
                id="bairro"
                label="Bairro"
                placeholder="Bela Vista"
                value={endereco.bairro ?? ''}
                onChange={setCampoEndereco('bairro')}
              />
              <div className="sm:col-span-2">
                <Campo
                  id="cidade"
                  label="Cidade"
                  placeholder="São Paulo"
                  value={endereco.cidade ?? ''}
                  onChange={setCampoEndereco('cidade')}
                />
              </div>
              <Campo
                id="uf"
                label="UF"
                maxLength={2}
                placeholder="SP"
                value={endereco.uf ?? ''}
                onChange={setCampoEndereco('uf')}
              />
            </div>
            {avisoCep && <p className="mt-3 text-xs text-muted-foreground">{avisoCep}</p>}
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
            {/* Na EDIÇÃO, sem mudança não há o que salvar: o botão desabilita
                (o Button já dima em `disabled:opacity-50`) e a Server Action
                nem é chamada — economiza a ida à rede, não só a escrita.
                No CADASTRO o `editando` desliga a regra: `sujo` nasce false e
                travaria o "Salvar" de um registro novo. */}
            <Button
              type="submit"
              disabled={pendente || (editando && !sujo)}
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
