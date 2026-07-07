/** @type {import('next').NextConfig} */
const nextConfig = {
  // O badge do indicador de DEV fica, por padrão, no canto inferior-ESQUERDO —
  // exatamente onde mora o botão VOLTAR (undo) no rodapé da tela de jogo, e o
  // cobria em `npm run dev` (em produção o badge não existe). Movido para o
  // topo-esquerda, que fica livre (o placar geral é topo-centro).
  devIndicators: {
    position: "top-left",
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
