'use client'

/**
 * AVATAR EDITÁVEL do /perfil (sistema de avatar, fatia 1b). Mostra a foto atual
 * (com fallback à inicial), com um badge de câmera; tocar abre o seletor de
 * arquivo → modal de CROP circular (react-easy-crop) → canvas 512×512 → JPEG →
 * upload no Storage (flow-images/avatars/{uid}/{timestamp}.jpg, path versionado
 * p/ cache-bust; a policy da 1a permite a própria pasta) → grava a URL pública em
 * profiles.avatar_url (update self). Reflete a nova foto na hora via onUploaded.
 *
 * A cascata completa de leitura (Storage → Google → inicial em todo lugar) é a
 * 1c; aqui o /perfil já passa displayUrl = profiles.avatar_url ?? Google.
 */

import { useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Camera, Check, Loader2, X } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { createBrowserSupabaseClient } from '@/lib/supabase/browser-client'

const MAX_FILE = 10 * 1024 * 1024 // 10MB — rejeita arquivos absurdos antes do crop
const LADO = 512 // alvo do avatar (px)

// Desenha a área recortada (px da imagem natural) num canvas LADO×LADO e exporta
// JPEG 0.85 (~30–80KB). Retorna null se o canvas/2d falhar.
async function recortarParaBlob(src: string, area: Area): Promise<Blob | null> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = src
  })
  const canvas = document.createElement('canvas')
  canvas.width = LADO
  canvas.height = LADO
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, LADO, LADO)
  // DEBUG (temporário): dimensões naturais + área de recorte → detecta área
  // degenerada (width/height 0) que faria o draw não desenhar nada.
  console.log('[avatar] draw', { natW: img.naturalWidth, natH: img.naturalHeight, area })
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85))
}

export function AvatarUploader({
  user,
  displayUrl,
  inicial,
  onUploaded,
}: {
  user: User
  displayUrl: string | null
  inicial: string
  onUploaded: (url: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [imgErro, setImgErro] = useState(false)
  const [cropSrc, setCropSrc] = useState<string | null>(null) // object URL do arquivo escolhido
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [areaPx, setAreaPx] = useState<Area | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite re-escolher o mesmo arquivo depois
    if (!file) return
    if (file.size > MAX_FILE) {
      setErro('Imagem muito grande (máx. 10MB). Escolha outra.')
      return
    }
    setErro(null)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setAreaPx(null)
    setCropSrc(URL.createObjectURL(file))
  }

  function fecharCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropSrc(null)
  }

  async function confirmar() {
    if (!cropSrc || !areaPx) return
    setEnviando(true)
    setErro(null)
    try {
      const blob = await recortarParaBlob(cropSrc, areaPx)
      // DEBUG (temporário): o blob tem tamanho > 0 e type image/jpeg? size 0/undef
      // → culpado é o canvas/blob (vazio/tainted). Ver antes do upload.
      console.log('[avatar] blob', { size: blob?.size, type: blob?.type })
      if (!blob) {
        setErro('Não deu para processar a imagem. Tente outra.')
        setEnviando(false)
        return
      }
      const supabase = createBrowserSupabaseClient()
      // Path versionado (cache-bust) na pasta do próprio uid — a policy da 1a permite.
      const path = `avatars/${user.id}/${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage
        .from('flow-images')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (upErr) {
        // DEBUG (temporário): mensagem REAL do 400 (o supabase-js às vezes engole).
        console.error('[avatar] upload error:', JSON.stringify(upErr), upErr)
        setErro('Não deu para enviar a foto agora. Tente novamente.')
        setEnviando(false)
        return
      }
      const { data: pub } = supabase.storage.from('flow-images').getPublicUrl(path)
      const url = pub.publicUrl
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id)
      if (dbErr) {
        setErro('A foto subiu, mas não deu para salvar. Tente novamente.')
        setEnviando(false)
        return
      }
      setImgErro(false)
      onUploaded(url) // reflete na hora no header
      setEnviando(false)
      fecharCrop()
      setSucesso(true)
      window.setTimeout(() => setSucesso(false), 2500)
    } catch {
      setErro('Não deu para processar a imagem. Tente novamente.')
      setEnviando(false)
    }
  }

  const mostraFoto = displayUrl && !imgErro

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" onChange={escolherArquivo} className="hidden" />

      {/* Avatar clicável + badge de câmera + overlay de envio. */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label="Trocar foto de perfil"
        className="relative h-16 w-16 shrink-0"
      >
        {mostraFoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayUrl}
            alt=""
            onError={() => setImgErro(true)}
            className="h-16 w-16 rounded-full object-cover ring-1 ring-white/15"
          />
        ) : (
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-2xl font-black">
            {inicial}
          </span>
        )}
        <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-neutral-800 ring-2 ring-neutral-950">
          {enviando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-white/80" />
          ) : (
            <Camera className="h-3.5 w-3.5 text-white/70" />
          )}
        </span>
      </button>

      {/* Erro fora do modal (ex.: arquivo grande antes do crop). */}
      {erro && !cropSrc && (
        <p role="alert" className="mt-1 text-xs text-red-400">
          {erro}
        </p>
      )}

      {/* Toast de sucesso. */}
      {sucesso && (
        <div role="status" className="fixed inset-x-0 bottom-5 z-[90] flex justify-center px-4">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-neutral-900/95 px-4 py-2.5 text-sm font-semibold text-white shadow-2xl">
            <Check className="h-4 w-4 text-emerald-400" /> Foto atualizada
          </div>
        </div>
      )}

      {/* MODAL DE CROP (circular). */}
      {cropSrc && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Enquadrar foto"
        >
          <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 text-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <h3 className="text-base font-bold">Enquadrar foto</h3>
              <button
                type="button"
                onClick={fecharCrop}
                disabled={enviando}
                aria-label="Fechar"
                className="rounded-full p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative h-72 w-full bg-black">
              <Cropper
                image={cropSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_area, px) => setAreaPx(px)}
              />
            </div>

            <div className="flex flex-col gap-3 px-5 py-4">
              <label className="flex items-center gap-3 text-xs text-white/60">
                Zoom
                <input
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-white"
                />
              </label>

              {erro && (
                <p role="alert" className="text-sm text-red-400">
                  {erro}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={fecharCrop}
                  disabled={enviando}
                  className="h-12 flex-1 rounded-lg bg-white/10 text-base font-bold text-white transition hover:bg-white/15 disabled:opacity-40"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmar}
                  disabled={enviando || !areaPx}
                  className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-white text-base font-bold text-neutral-900 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                  {enviando ? 'Enviando…' : 'Salvar foto'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
