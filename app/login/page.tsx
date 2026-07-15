/**
 * Tela de LOGIN (rota nova, pública).
 *
 * Camada ADICIONAL: nada aqui interfere no fluxo anônimo de QR → jogo. Quem
 * nunca passar por esta tela usa o app exatamente como antes.
 *
 * Dois caminhos:
 *  - Google (signInWithOAuth) → redireciona para /auth/callback, que troca o
 *    code por sessão.
 *  - OTP por email (signInWithOtp → verifyOtp): código de 6 dígitos, sem senha.
 *
 * Visual: reusa o escopo .tema-landing (globals.css), a mesma paleta preta +
 * amarela da landing, em vez de introduzir um terceiro sistema de cores.
 */

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Mail, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBrowserSupabaseClient } from '@/lib/supabase/browser-client'

/** Logo do Google — a lucide-react não traz ícones de marca. */
function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

type Etapa = 'email' | 'codigo'

export default function LoginPage() {
  const router = useRouter()
  const [etapa, setEtapa] = useState<Etapa>('email')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function entrarComGoogle() {
    setErro(null)
    setCarregando(true)
    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
    // Em caso de sucesso o browser navega para o Google e nada abaixo roda.
    if (error) {
      setErro(error.message)
      setCarregando(false)
    }
  }

  async function enviarCodigo(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    })
    setCarregando(false)
    if (error) {
      setErro(error.message)
      return
    }
    setEtapa('codigo')
  }

  async function verificarCodigo(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: codigo,
      type: 'email',
    })
    if (error) {
      setErro(error.message)
      setCarregando(false)
      return
    }
    // refresh() antes de push() para que o middleware/Server Component já
    // enxerguem o cookie de sessão recém-gravado.
    router.refresh()
    router.push('/dashboard')
  }

  return (
    <main className="tema-landing flex min-h-[100dvh] flex-col items-center justify-center bg-background px-5 py-12 text-foreground">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex flex-col items-center leading-none">
          <span className="pl-[0.5em] text-[11px] font-semibold uppercase tracking-[0.5em] opacity-50">
            PWER
          </span>
          <span className="mt-1 text-4xl font-black tracking-tight">Flow</span>
        </div>

        <h1 className="mb-2 text-center text-2xl font-semibold tracking-tight">Entrar</h1>
        <p className="mb-8 text-center text-sm leading-relaxed text-muted-foreground">
          {etapa === 'email'
            ? 'Acesse sua conta para gerenciar suas partidas.'
            : `Enviamos um código de 6 dígitos para ${email}.`}
        </p>

        {etapa === 'email' ? (
          <>
            <Button
              onClick={entrarComGoogle}
              disabled={carregando}
              variant="outline"
              className="w-full border-border bg-transparent text-foreground hover:bg-card"
            >
              {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
              Continuar com Google
            </Button>

            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs uppercase tracking-widest text-muted-foreground">ou</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={enviarCodigo} className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email" className="text-sm">
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  placeholder="voce@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="border-border bg-card"
                />
              </div>
              <Button
                type="submit"
                disabled={carregando || !email}
                className="w-full bg-primary font-medium text-primary-foreground hover:bg-primary/90"
              >
                {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Enviar código
              </Button>
            </form>
          </>
        ) : (
          <form onSubmit={verificarCodigo} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="codigo" className="text-sm">
                Código de 6 dígitos
              </Label>
              <Input
                id="codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                placeholder="000000"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                className="border-border bg-card text-center text-lg tracking-[0.5em]"
              />
            </div>
            <Button
              type="submit"
              disabled={carregando || codigo.length < 6}
              className="w-full bg-primary font-medium text-primary-foreground hover:bg-primary/90"
            >
              {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
              Entrar
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={carregando}
              onClick={() => {
                setEtapa('email')
                setCodigo('')
                setErro(null)
              }}
              className="w-full text-muted-foreground hover:bg-card hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Usar outro email
            </Button>
          </form>
        )}

        {erro && (
          <p role="alert" className="mt-5 text-center text-sm text-destructive">
            {erro}
          </p>
        )}
      </div>
    </main>
  )
}
