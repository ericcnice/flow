/**
 * LANDING de PLATAFORMA (raiz do produto). Substitui o antigo grid de quadras
 * de admin (movido para /admin). Tom de plataforma estabelecida, mobile-first,
 * alto contraste, coerente com a estética do placar (tema neutro P&B + variáveis
 * de cor já existentes). NÃO lista nem nomeia clubes — o contexto de clube segue
 * acessível só via URL direta /[clube]/... (rota da jornada de contexto).
 *
 * Server Component estático (sem estado): só marcação + um CTA de WhatsApp.
 */

import { MessageCircle } from "lucide-react"

export const metadata = {
  title: "PWER Flow — O placar inteligente para esportes de raquete",
  description:
    "Placar para tênis, beach tennis, padel, squash, ping pong e pickleball. Funciona offline, com voz de árbitro no estilo Grand Slam.",
}

// NÚMERO DE CONTATO (só dígitos, DDI 55 + DDD 11 + número).
const WHATSAPP_NUMBER = "5511950507175"
const WHATSAPP_MSG = encodeURIComponent("Olá! Quero saber mais sobre o Flow no meu clube.")
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_MSG}`

export default function Home() {
  return (
    <main
      className="tema-neutro min-h-[100dvh] w-full flex flex-col items-center px-6 py-12"
      style={{ backgroundColor: "var(--palco-fundo)", color: "var(--palco-texto)" }}
    >
      <div className="w-full max-w-md mx-auto flex flex-col items-center text-center gap-9">
        {/* Marca (texto estilizado, sem logo de imagem por ora). */}
        <div className="flex flex-col items-center leading-none">
          <span className="text-[11px] font-semibold uppercase tracking-[0.5em] opacity-50 pl-[0.5em]">
            PWER
          </span>
          <span className="mt-1 text-5xl font-black tracking-tight">Flow</span>
        </div>

        {/* Headline de plataforma. */}
        <h1 className="text-2xl md:text-3xl font-bold leading-snug text-balance">
          O placar inteligente para esportes de raquete.
        </h1>

        {/* Subheadline: 6 esportes + offline + voz de árbitro. */}
        <p className="text-sm md:text-base leading-relaxed opacity-75 text-balance">
          Tênis, beach tennis, padel, squash, ping pong e pickleball — num só lugar.
          Funciona offline, na quadra, com voz de árbitro no estilo Grand Slam.
        </p>

        {/* Mock do placar em CSS (linguagem visual do app: dois blocos, número
            gigante), sem imagem externa. */}
        <div className="w-full max-w-[320px] rounded-3xl overflow-hidden shadow-2xl select-none">
          <div className="grid grid-cols-2" style={{ gap: "2px", background: "var(--palco-divisor)" }}>
            <div
              className="px-5 py-6 flex flex-col items-start gap-3"
              style={{ backgroundColor: "var(--lado-a-bg)", color: "var(--lado-a-texto)" }}
            >
              <span className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest opacity-70">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: "currentColor" }} />
                Saque
              </span>
              <span className="mono-tabular font-black leading-none text-6xl">40</span>
            </div>
            <div
              className="px-5 py-6 flex flex-col items-start gap-3"
              style={{ backgroundColor: "var(--lado-b-bg)", color: "var(--lado-b-texto)" }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-widest opacity-60">Rival</span>
              <span className="mono-tabular font-black leading-none text-6xl">30</span>
            </div>
          </div>
          <div
            className="flex items-center justify-center gap-4 py-2 text-[11px] uppercase tracking-widest"
            style={{ backgroundColor: "var(--palco-fundo)", color: "var(--palco-discreto)" }}
          >
            <span>
              Sets <b className="text-inherit opacity-100">1–0</b>
            </span>
            <span className="opacity-40">·</span>
            <span>
              Games <b>4–3</b>
            </span>
          </div>
        </div>

        {/* Linha aspiracional (sem estatística inventada). */}
        <p className="text-base md:text-lg font-semibold text-balance">
          Feito para clubes, professores e atletas.
        </p>

        {/* CTA de WhatsApp (lead). Verde WhatsApp, destacado. */}
        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full inline-flex items-center justify-center gap-2.5 rounded-full px-6 py-4
            font-bold text-base md:text-lg shadow-lg active:scale-[0.98] transition-transform"
          style={{ backgroundColor: "#25D366", color: "#0a1f14" }}
        >
          <MessageCircle className="h-5 w-5" />
          Quer o Flow no seu clube? Fale com a gente
        </a>

        <p className="text-xs opacity-40 mt-2">PWER Flow · placar para esportes de raquete</p>
      </div>
    </main>
  )
}
