'use client'

/**
 * Campos de endereço com autocomplete de CEP (ViaCEP). Componente COMPARTILHADO
 * do dashboard — nasceu para o cadastro de locais, mas não tem nada de
 * específico de locais.
 *
 * ⚠️ DUPLICAÇÃO CONHECIDA: `app/dashboard/players/member-form.tsx` tem hoje uma
 * cópia inline desta mesma lógica. Este arquivo é a versão canônica; migrar o
 * member-form para cá é uma mudança pequena e isolada, ainda não autorizada.
 * Enquanto as duas existirem, corrigir um bug de CEP exige tocar nas duas.
 *
 * Self-contained de propósito: guarda o próprio estado e emite <input name=...>,
 * então o formulário que o usa só precisa lê-lo via FormData na Server Action.
 * Quem consome não precisa saber que existe ViaCEP no meio.
 *
 * Chaves emitidas: cep, rua, numero, complemento, bairro, cidade, uf.
 */

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type Endereco = Record<string, string>

type CepStatus = 'idle' | 'buscando' | 'ok' | 'nao-encontrado' | 'erro'

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

export function AddressFields({ valorInicial }: { valorInicial?: Endereco | null }) {
  const [endereco, setEndereco] = useState<Endereco>(valorInicial ?? {})
  const [cepStatus, setCepStatus] = useState<CepStatus>('idle')

  // Só busca quando o usuário MEXE no CEP. Sem isto, abrir a edição de um
  // registro que já tem CEP dispararia uma busca no mount e sobrescreveria um
  // endereço que talvez tenha sido ajustado à mão.
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
          // 1510 - lado par"), não o complemento do endereço. Não mapeamos.
        }))
        setCepStatus('ok')
      } catch (err) {
        // Aborto é troca de CEP, não falha. Rede fora → digita-se à mão.
        if ((err as Error)?.name !== 'AbortError') setCepStatus('erro')
      }
    })()

    return () => ctrl.abort()
  }, [endereco.cep])

  const setCampo = (campo: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setEndereco((atual) => ({ ...atual, [campo]: e.target.value }))

  const aviso =
    cepStatus === 'buscando'
      ? 'buscando…'
      : cepStatus === 'nao-encontrado'
        ? 'CEP não encontrado — preencha à mão'
        : cepStatus === 'erro'
          ? 'busca indisponível — preencha à mão'
          : null

  return (
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
              setCampo('cep')(e)
            }}
          />
        </div>
        <div className="sm:col-span-2">
          <Campo
            id="rua"
            label="Rua"
            placeholder="Av. Paulista"
            value={endereco.rua ?? ''}
            onChange={setCampo('rua')}
          />
        </div>
        <Campo
          id="numero"
          label="Número"
          placeholder="1000"
          value={endereco.numero ?? ''}
          onChange={setCampo('numero')}
        />
        <Campo
          id="complemento"
          label="Complemento"
          placeholder="Bloco B"
          value={endereco.complemento ?? ''}
          onChange={setCampo('complemento')}
        />
        <Campo
          id="bairro"
          label="Bairro"
          placeholder="Bela Vista"
          value={endereco.bairro ?? ''}
          onChange={setCampo('bairro')}
        />
        <div className="sm:col-span-2">
          <Campo
            id="cidade"
            label="Cidade"
            placeholder="São Paulo"
            value={endereco.cidade ?? ''}
            onChange={setCampo('cidade')}
          />
        </div>
        <Campo
          id="uf"
          label="UF"
          maxLength={2}
          placeholder="SP"
          value={endereco.uf ?? ''}
          onChange={setCampo('uf')}
        />
      </div>
      {aviso && <p className="mt-3 text-xs text-muted-foreground">{aviso}</p>}
    </fieldset>
  )
}
