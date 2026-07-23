/**
 * Casca visual das páginas legais (/termos, /privacidade). Server component puro
 * — o conteúdo vem como children de cada página (arquivo editável). Mostra o
 * título, a versão vigente (TOS_VERSION) e a data de vigência, com um link de
 * volta ao início.
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { TOS_VERSION } from '@/lib/legal'

export function LegalShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-[100dvh] max-w-2xl bg-neutral-950 px-5 py-8 text-white">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-white/60 transition hover:text-white">
        <ArrowLeft className="h-4 w-4" />
        Início
      </Link>

      <header className="mt-6 border-b border-white/10 pb-4">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-white/45">
          Versão <span className="font-mono">{TOS_VERSION}</span> · vigente desde {TOS_VERSION}
        </p>
      </header>

      <div className="legal-prose mt-6 space-y-5 text-sm leading-relaxed text-white/75 [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-bold [&_h2]:text-white [&_li]:ml-4 [&_li]:list-disc [&_strong]:text-white">
        {children}
      </div>

      <p className="mt-10 rounded-lg border border-amber-400/25 bg-amber-400/5 p-3 text-xs text-amber-200/70">
        <strong className="text-amber-200/90">Nota de preenchimento:</strong> os trechos entre colchetes{' '}
        <span className="font-mono">[ASSIM]</span> são PLACEHOLDERS a serem preenchidos antes da publicação real
        (razão social, CNPJ, contato do encarregado, etc.). Este é um conteúdo-base honesto, não aconselhamento
        jurídico — revise com apoio jurídico.
      </p>
    </main>
  )
}
