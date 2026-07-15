'use client'

/**
 * Campo de URL de imagem com preview ao vivo. Usado pelos dois campos de
 * imagem do local (logo e foto do espaço).
 *
 * Não há upload: o super_admin cola uma URL já hospedada (ex.: Supabase
 * Storage). O preview existe justamente porque não validamos o formato no
 * banco — é o olho de quem cola que confirma se o link é o certo.
 *
 * <img> simples, NÃO next/image: o projeto roda com images.unoptimized, e o
 * next/image exigiria cadastrar cada host remoto em `remotePatterns` — atrito
 * novo a cada domínio diferente que você usasse.
 */

import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Estado = 'vazio' | 'carregando' | 'ok' | 'erro'

export function ImageUrlField({
  id,
  label,
  valorInicial,
  formato = 'quadrado',
}: {
  id: string
  label: string
  valorInicial?: string | null
  /** Só muda a moldura do preview; não afeta o valor salvo. */
  formato?: 'quadrado' | 'panorama'
}) {
  const [url, setUrl] = useState(valorInicial ?? '')
  const [estado, setEstado] = useState<Estado>(valorInicial ? 'carregando' : 'vazio')

  // Toda troca de URL reinicia o preview. Sem isto, um erro de uma URL anterior
  // ficaria grudado na tela depois de colar uma URL boa.
  useEffect(() => {
    setEstado(url.trim() ? 'carregando' : 'vazio')
  }, [url])

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={id}
        name={id}
        type="url"
        inputMode="url"
        placeholder="Cole aqui a URL da imagem, ex: Supabase Storage"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        className="border-border bg-background"
      />

      {estado !== 'vazio' && (
        <div
          className={`mt-1 flex items-center justify-center overflow-hidden rounded-lg border border-border bg-background ${
            formato === 'quadrado' ? 'h-20 w-20' : 'h-24 w-full max-w-[16rem]'
          }`}
        >
          {estado === 'erro' ? (
            <div className="flex flex-col items-center gap-1 px-2 text-center">
              <ImageOff className="h-4 w-4 text-muted-foreground" />
              <span className="text-[10px] leading-tight text-muted-foreground">
                imagem não carregou
              </span>
            </div>
          ) : (
            // A tag fica montada mesmo em 'carregando' — é ela quem dispara
            // onLoad/onError. Escondê-la antes disso impediria o preview.
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={url}
              alt=""
              className={`h-full w-full object-contain ${estado === 'carregando' ? 'opacity-0' : ''}`}
              onLoad={() => setEstado('ok')}
              onError={() => setEstado('erro')}
            />
          )}
        </div>
      )}
    </div>
  )
}
