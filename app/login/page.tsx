/**
 * Tela de LOGIN do DASHBOARD (rota pública). Camada ADICIONAL: nada aqui
 * interfere no fluxo anônimo de QR → jogo.
 *
 * A mecânica (Google OAuth + email OTP) vive no <LoginPanel> compartilhado
 * (A1.2) — o mesmo painel do modal de login dentro do app. Esta página é só a
 * moldura (paleta .tema-landing da landing) + destino /dashboard.
 */

'use client'

import { useRouter } from 'next/navigation'
import { LoginPanel } from '@/components/auth/login-panel'

export default function LoginPage() {
  const router = useRouter()

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
          Acesse sua conta para gerenciar suas partidas.
        </p>

        <LoginPanel
          next="/dashboard"
          onAuthenticated={() => {
            // refresh() antes de push() para o middleware/Server Component já
            // enxergarem o cookie de sessão recém-gravado.
            router.refresh()
            router.push('/dashboard')
          }}
        />
      </div>
    </main>
  )
}
