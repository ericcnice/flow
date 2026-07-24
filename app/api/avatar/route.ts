/**
 * UPLOAD DE AVATAR — rota de servidor (plano C). Contorna a "dança de token" do
 * Storage no cliente: o upload roda com SERVICE_ROLE (bypassa RLS), mas a
 * IDENTIDADE vem da SESSÃO DO SERVIDOR (cookies), não do cliente — então o path
 * é derivado do uid REAL e o usuário só sobe na própria pasta.
 *
 * SEGURANÇA:
 *  - o SUPABASE_SERVICE_ROLE_KEY é server-only (SEM NEXT_PUBLIC) → nunca vai ao
 *    bundle do cliente;
 *  - o path `avatars/{uid}/…` usa o uid da sessão validada (getUser), o cliente
 *    NÃO escolhe o path;
 *  - a RLS de storage.objects (fatia 1a) continua existindo e protege o acesso
 *    DIRETO do cliente; o service_role a bypassa só aqui, no servidor.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const MAX = 2 * 1024 * 1024 // 2MB — já vem cropado 512px, então é pequeno

export async function POST(request: NextRequest) {
  // 1. IDENTIDADE pela sessão do servidor (cookies). getUser revalida no Supabase
  //    — não confiamos em nada do cliente para saber QUEM é.
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'not_authenticated' }, { status: 401 })
  }

  // 2. Credenciais de servidor.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 })
  }

  // 3. RECEBE a imagem (multipart/form-data, campo 'file') e valida.
  let file: File | null = null
  try {
    const form = await request.formData()
    const f = form.get('file')
    if (f instanceof File) file = f
  } catch {
    // corpo inválido cai no 400 abaixo
  }
  if (!file) {
    return NextResponse.json({ error: 'no_file' }, { status: 400 })
  }
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'not_an_image' }, { status: 400 })
  }
  if (file.size > MAX) {
    return NextResponse.json({ error: 'too_large' }, { status: 400 })
  }

  // 4. UPLOAD com service_role (bypassa RLS). Path derivado do uid do SERVIDOR
  //    (versionado p/ cache-bust). O cliente não controla nada disto.
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const path = `avatars/${user.id}/${Date.now()}.jpg`
  const { error: upErr } = await admin.storage
    .from('flow-images')
    .upload(path, file, { upsert: true, contentType: 'image/jpeg' })
  if (upErr) {
    return NextResponse.json({ error: 'upload_failed', detail: upErr.message }, { status: 500 })
  }

  const publicUrl = `${url}/storage/v1/object/public/flow-images/${path}`

  // 5. GRAVA profiles.avatar_url (service_role, escopado ao próprio uid).
  const { error: dbErr } = await admin.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
  if (dbErr) {
    return NextResponse.json({ error: 'save_failed', detail: dbErr.message }, { status: 500 })
  }

  return NextResponse.json({ url: publicUrl })
}
