import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/client'

// Rota TEMPORÁRIA de verificação de conexão com o Supabase.
// Chama a RPC create_live_match e retorna o resultado como JSON.
// Pode ser removida depois de confirmar a conexão de ponta a ponta.
export async function GET() {
  const { data, error } = await supabase.rpc('create_live_match', {
    p_club_slug: 'teste-flow',
  })

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, details: error },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, data })
}
