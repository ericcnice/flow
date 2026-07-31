import type React from "react"
import Script from "next/script"
import "@/app/globals.css"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { CoachBridge } from "@/components/auth/coach-bridge"

const inter = Inter({ subsets: ["latin"] })

export const metadata = {
  title: "PWER Flow — O placar inteligente para esportes de raquete",
  description:
    "Placar para tênis, beach tennis, padel, squash, ping pong e pickleball. Funciona offline, com voz de árbitro no estilo Grand Slam.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          {children}
          {/* TELEMETRIA (Umami) — leve, sem cookies, sem PII. Só entra quando as
              DUAS envs existem: sem elas o app roda idêntico e o lib/analytics
              vira no-op silencioso. É o que permite dev/preview sem medir e
              produção medindo, sem `if` espalhado pelo código.
              `afterInteractive`: nada de telemetria disputa a abertura da tela
              com a jornada de QR, que é offline-first e cronometrada. */}
          {process.env.NEXT_PUBLIC_UMAMI_SRC && process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID && (
            <Script
              src={process.env.NEXT_PUBLIC_UMAMI_SRC}
              data-website-id={process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID}
              strategy="afterInteractive"
            />
          )}
          {/* Ponte do coach (A2.2): pós-login, chama claim_coach_membership.
              Inerte para anônimo/jogador comum; mostra o feedback só ao promover. */}
          <CoachBridge />
        </ThemeProvider>
      </body>
    </html>
  )
}
