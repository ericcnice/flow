/**
 * A CASCA DO APP — o layout das telas que PRECISAM de navegação (fatia N2).
 *
 * ⚠️ O ROUTE GROUP `(app)` NÃO MUDA NENHUMA URL. Os parênteses são a convenção
 * do App Router para agrupar rotas sem afetar o caminho: `app/(app)/perfil` →
 * `/perfil`, igual a antes. Nada de link, QR impresso ou `?voltar=` muda.
 *
 * POR QUE UM ROUTE GROUP E NÃO UM `if (pathname)` NO HEADER: as telas de
 * FULLSCREEN (/jogo, /placar, a jornada de QR do clube, a landing do convite)
 * ficam FORA deste grupo — elas não passam por este layout, então a navegação
 * não pode vazar nelas. Um header que se esconde sozinho depende de alguém
 * lembrar de atualizar a lista de exceções a cada rota nova; este desenho não
 * depende de ninguém lembrar de nada. Foi a razão de a investigação preferi-lo.
 *
 * QUEM ESTÁ AQUI DENTRO: /perfil, /setup, /placares, /termos, /privacidade.
 * QUEM ESTÁ FORA (e por quê):
 *  • /jogo, /placar — fullscreen: a tela de marcar ponto não divide altura com
 *    header nenhum, e um alvo de toque perto do placar seria um ponto errado;
 *  • /[clube]/[esporte]/[quadra] — a jornada de QR é uma sequência cronometrada,
 *    imersiva, com o branding do clube;
 *  • /convite/[token] — a recepção do convite é uma tela de foco único;
 *  • / (a landing) — tem o header PRÓPRIO dela, transparente sobre a foto do
 *    hero, com as mesmas duas ações (Jogar e Entrar). Envolvê-la aqui daria
 *    dois headers empilhados;
 *  • /dashboard — já tem a casca dele; /login e /admin são telas de foco único.
 *
 * ALTURA: `h-dvh` + coluna flex, com o miolo em `flex-1 min-h-0 overflow-y-auto`.
 * Assim o header fica fixo e o CONTEÚDO rola por dentro — em vez de a página
 * inteira ficar 100dvh + 56px de header e ganhar um scroll fantasma. É o que
 * permite o /setup (um card de altura cheia com CTA na base) conviver com a
 * casca sem o botão "JOGO!" cair para fora da tela.
 */

import type React from 'react'
import { AppHeader } from '@/components/shell/app-header'

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-neutral-950">
      <AppHeader />
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
