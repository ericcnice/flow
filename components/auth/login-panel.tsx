'use client'

/**
 * Painel de LOGIN compartilhado (Google OAuth + email OTP), extraído do
 * app/login/page.tsx (A1.2). Usado em DOIS lugares com o MESMO fluxo:
 *  - /login do dashboard (destino /dashboard);
 *  - modal de login DENTRO do app (destino = a própria página do jogo).
 *
 * Parametrizado por `next` (destino pós-OAuth, validado no /auth/callback) e
 * `onAuthenticated` (chamado após o OTP verificar em-tela, sem redirect). O
 * Google REDIRECIONA (retorna via /auth/callback?next=); o OTP resolve aqui.
 *
 * Usa o browser-client (sessão em COOKIE) — NUNCA o client.ts do Realtime.
 */

import { useState } from 'react'
import { Loader2, Mail, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createBrowserSupabaseClient } from '@/lib/supabase/browser-client'

/** Logo do Google — a lucide-react não traz ícones de marca. */
function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
      <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

type Etapa = 'email' | 'codigo'

export function LoginPanel({
  next = '/dashboard',
  onAuthenticated,
}: {
  /** Destino pós-OAuth (validado no /auth/callback). O OTP usa onAuthenticated. */
  next?: string
  /** Chamado após o OTP verificar (o Google não passa por aqui — redireciona). */
  onAuthenticated?: () => void
}) {
  const [etapa, setEtapa] = useState<Etapa>('email')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function entrarComGoogle() {
    setErro(null)
    setCarregando(true)
    const supabase = createBrowserSupabaseClient()
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
    // Sucesso → o browser navega para o Google e nada abaixo roda.
    if (error) {
      setErro(error.message)
      setCarregando(false)
    }
  }

  async function enviarCodigo(e: { preventDefault: () => void }) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
    setCarregando(false)
    if (error) {
      setErro(error.message)
      return
    }
    setEtapa('codigo')
  }

  async function verificarCodigo(e: { preventDefault: () => void }) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    const supabase = createBrowserSupabaseClient()
    const { error } = await supabase.auth.verifyOtp({ email, token: codigo, type: 'email' })
    if (error) {
      setErro(error.message)
      setCarregando(false)
      return
    }
    // Sessão gravada no cookie. O caller decide o que fazer (push /dashboard, ou
    // fechar o modal e abrir o perfil).
    onAuthenticated?.()
  }

  return (
    <div className="w-full">
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
              <Label htmlFor="login-email" className="text-sm">
                Email
              </Label>
              <Input
                id="login-email"
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
            <Label htmlFor="login-codigo" className="text-sm">
              Código de 6 dígitos
            </Label>
            <Input
              id="login-codigo"
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
  )
}
