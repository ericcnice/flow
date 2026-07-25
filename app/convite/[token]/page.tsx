'use client'

/**
 * LANDING DO CONVITE (CONVITE VIRAL / Fatia B.1b) — /convite/{token}.
 *
 * O aluno recebe o link pelo WhatsApp do professor, cai aqui SEM CONTA e precisa
 * ver de quem é o convite ANTES de qualquer login. Por isso a leitura é a RPC
 * pública `get_invite_by_token` (grant a anon), que devolve o MÍNIMO: nome do
 * coach, primeiro nome do aluno e status.
 *
 * ⚠️ ROTA ANÔNIMA. NÃO pode entrar no matcher do middleware (que é só
 * /dashboard) — se entrasse, todo convidado seria jogado para /login e o convite
 * morreria na porta.
 *
 * Client component de propósito: reusa o <LoginPanel> (client) e o useSession, e
 * o token vem do path via useParams. A RPC funciona igual pelo cliente anônimo.
 *
 * NESTA FATIA NÃO HÁ CLAIM. Ler o convite, mostrar os estados e oferecer o
 * login — só isso. Vincular a conta ao member do roster (claim_invite) e o
 * cadastro completo (nome/username/celular/nascimento + T&C) são a B.1c.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Check, Loader2, Trophy, WifiOff } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase/browser-client'
import { useSession } from '@/lib/hooks/use-session'
import { LoginPanel } from '@/components/auth/login-panel'

type Convite = {
  coach_name: string | null
  student_first_name: string | null
  status: string
}

// 'invalido' cobre token inexistente, formato inválido e 'revoked' — a MESMA
// mensagem genérica para os três (não revela se o token um dia existiu). 'erro'
// é separado de propósito: falha de rede não é convite inválido, e dizer
// "não encontrado" para quem está sem sinal seria mentira.
type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro' }
  | { tipo: 'invalido' }
  | { tipo: 'ativo'; convite: Convite }
  | { tipo: 'usado' }

/** Wordmark da landing (mesmo padrão de app/login/page.tsx). */
function Wordmark() {
  return (
    <div className="mb-8 flex flex-col items-center leading-none">
      <span className="pl-[0.5em] text-[11px] font-semibold uppercase tracking-[0.5em] opacity-50">PWER</span>
      <span className="mt-1 text-4xl font-black tracking-tight">Flow</span>
    </div>
  )
}

/** Moldura comum: tema da landing (sem ele os botões do LoginPanel saem sem contraste). */
function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="tema-landing flex min-h-[100dvh] flex-col items-center justify-center bg-background px-5 py-12 text-foreground">
      <div className="w-full max-w-sm">
        <Wordmark />
        {children}
      </div>
    </main>
  )
}

export default function ConvitePage() {
  const params = useParams<{ token: string | string[] }>()
  const token = Array.isArray(params?.token) ? params.token[0] : (params?.token ?? '')
  const { user } = useSession()

  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })

  useEffect(() => {
    if (!token) {
      setEstado({ tipo: 'invalido' })
      return
    }
    let alive = true
    const supabase = createBrowserSupabaseClient()

    supabase.rpc('get_invite_by_token', { p_token: token }).then(({ data, error }) => {
      if (!alive) return
      if (error) {
        setEstado({ tipo: 'erro' })
        return
      }
      // `returns table` chega como array de linhas; vazio = token desconhecido.
      const linha = (Array.isArray(data) ? data[0] : data) as Convite | undefined | null
      if (!linha) {
        setEstado({ tipo: 'invalido' })
        return
      }
      if (linha.status === 'registered') {
        setEstado({ tipo: 'usado' })
        return
      }
      if (linha.status !== 'pending') {
        // 'revoked' (aluno removido do roster) → mensagem genérica, igual a
        // token inexistente.
        setEstado({ tipo: 'invalido' })
        return
      }
      setEstado({ tipo: 'ativo', convite: linha })
    })

    return () => {
      alive = false
    }
  }, [token])

  if (estado.tipo === 'carregando') {
    return (
      <Moldura>
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Moldura>
    )
  }

  if (estado.tipo === 'erro') {
    return (
      <Moldura>
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <WifiOff className="mx-auto mb-3 h-7 w-7 text-muted-foreground" aria-hidden />
          <h1 className="text-lg font-semibold tracking-tight">Não deu para carregar o convite</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Verifique sua conexão e abra o link de novo.
          </p>
        </div>
      </Moldura>
    )
  }

  if (estado.tipo === 'invalido') {
    return (
      <Moldura>
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold tracking-tight">Convite não encontrado</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Peça um novo link ao seu professor.
          </p>
        </div>
      </Moldura>
    )
  }

  if (estado.tipo === 'usado') {
    return (
      <Moldura>
        <div className="rounded-2xl border border-border bg-card p-6 text-center">
          <Check className="mx-auto mb-3 h-7 w-7 text-primary" aria-hidden />
          <h1 className="text-lg font-semibold tracking-tight">Este convite já foi usado</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Se a conta é sua, é só entrar.
          </p>
          {/* Caso PROVÁVEL: a própria pessoa reabrindo a mensagem antiga. */}
          <Link
            href={user ? '/perfil' : '/login'}
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
          >
            {user ? 'Ir para meu perfil' : 'Entrar'}
          </Link>
        </div>
      </Moldura>
    )
  }

  // ---------------------------------------------------------- convite ATIVO
  const { coach_name, student_first_name } = estado.convite
  // Sem artigo antes do nome ("A Ana" / "O Nicholas"): o banco não sabe o gênero
  // de quem convidou, e errar isso na primeira frase que a pessoa lê seria pior
  // do que a frase mais curta.
  const coach = (coach_name ?? '').trim() || 'Seu professor'

  return (
    <Moldura>
      {student_first_name && (
        <p className="mb-2 text-center text-sm text-muted-foreground">Olá, {student_first_name}!</p>
      )}

      {/* O NOME DO COACH é a prova social — é o que converte. Por isso é o
          elemento de maior peso da tela. */}
      <h1 className="text-center text-2xl font-semibold leading-snug tracking-tight">
        <span className="font-black">{coach}</span> te convidou para o Flow
      </h1>

      {/* Curto de propósito: quem chegou aqui já foi convencido pela PESSOA, não
          pelo produto. Três linhas bastam para dar contexto. */}
      <ul className="mx-auto mt-6 mb-8 flex max-w-xs flex-col gap-2.5 text-sm">
        {[
          'Marca os pontos e guarda os jogos',
          'Funciona offline, na quadra',
          'Seu histórico de partidas, sempre com você',
        ].map((linha) => (
          <li key={linha} className="flex items-start gap-2.5">
            <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="text-foreground/85">{linha}</span>
          </li>
        ))}
      </ul>

      {user ? (
        /* PROVISÓRIO (B.1b): o usuário voltou do login mas o claim ainda não
           existe. A B.1c troca isto pelo cadastro completo + claim_invite. */
        <div className="rounded-2xl border border-border bg-card p-5 text-center">
          <Check className="mx-auto mb-2 h-6 w-6 text-primary" aria-hidden />
          <p className="text-sm font-semibold">Você está conectado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Em breve: finalizar seu cadastro e conectar com {coach}.
          </p>
        </div>
      ) : (
        /* next={/convite/{token}} é o que faz o TOKEN SOBREVIVER ao round-trip
           do Google: o LoginPanel monta /auth/callback?next=…, e o callback
           (que aceita só caminhos internos) devolve o usuário para ESTA página,
           com o token ainda no path. O OTP nem sai daqui. */
        <LoginPanel next={`/convite/${token}`} onAuthenticated={() => {}} />
      )}
    </Moldura>
  )
}
