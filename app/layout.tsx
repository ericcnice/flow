import type React from "react"
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
          {/* Ponte do coach (A2.2): pós-login, chama claim_coach_membership.
              Inerte para anônimo/jogador comum; mostra o feedback só ao promover. */}
          <CoachBridge />
        </ThemeProvider>
      </body>
    </html>
  )
}
