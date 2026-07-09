import type { MetadataRoute } from "next"

/**
 * Manifest PWA (Next 15 App Router — gera /manifest.webmanifest e injeta o
 * <link rel="manifest"> automaticamente). Os ícones de instalação ("adicionar
 * à tela inicial") reaproveitam o MESMO desenho da bola de tênis do indicador
 * de saque: bola amarela (#FEE100) sobre azul-marinho (#0a1f47), a paleta do
 * tema azul-amarelo (default do app). O ícone maskable é o full-bleed quadrado
 * (a plataforma aplica o recorte), os demais são a versão arredondada.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gerenciador de Partidas de Tênis",
    short_name: "Placar",
    description: "Placar para partidas de tênis, padel, beach, squash, ping pong e pickleball",
    start_url: "/",
    display: "standalone",
    background_color: "#0a1f47",
    theme_color: "#0a1f47",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
