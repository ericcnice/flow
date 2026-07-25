'use client'

/**
 * LANDING DO CONVITE (CONVITE VIRAL / Fatias B.1b + B.1c) — /convite/{token}.
 *
 * O aluno recebe o link pelo WhatsApp do professor, cai aqui SEM CONTA e precisa
 * ver de quem é o convite ANTES de qualquer login. Por isso a leitura é a RPC
 * pública `get_invite_by_token` (grant a anon), que devolve o MÍNIMO: nome do
 * coach, primeiro nome do aluno e status.
 *
 * O CICLO COMPLETO (B.1c): ler o convite → login (Google/OTP) → CLAIM
 * (`claim_invite` vincula members.profile_id = auth.uid()) → cadastro rápido
 * (ProfileForm com data de nascimento) → sucesso. No roster do professor, o card
 * do aluno vira "Cadastrado".
 *
 * ⚠️ ROTA ANÔNIMA. NÃO pode entrar no matcher do middleware (que é só
 * /dashboard) — se entrasse, todo convidado seria jogado para /login e o convite
 * morreria na porta.
 *
 * Client component de propósito: reusa <LoginPanel> e <ProfileForm> (ambos
 * client) e o useSession; o token vem do path via useParams.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { parsePhoneNumber } from 'libphonenumber-js'
import { Check, Loader2, PartyPopper, Trophy, WifiOff } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { createBrowserSupabaseClient } from '@/lib/supabase/browser-client'
import { useSession } from '@/lib/hooks/use-session'
import { LoginPanel } from '@/components/auth/login-panel'
import { ProfileForm } from '@/components/auth/profile-form'
import { IDADE_MINIMA } from '@/lib/legal'

type Convite = {
  coach_name: string | null
  student_first_name: string | null
  status: string
}

/**
 * Guard de MÓDULO — no máximo UMA tentativa de claim por (uid, token) nesta
 * carga de página. Mesmo motivo da CoachBridge: onAuthStateChange emite mais de
 * uma vez e o effect não pode virar spam de RPC. Reseta no reload, e o
 * claim_invite é idempotente ('already_mine'), então retentar é seguro.
 */
const claimTentado = new Set<string>()

// 'invalido' cobre token inexistente, formato inválido e 'revoked' — a MESMA
// mensagem genérica para os três (não revela se o token um dia existiu). 'erro'
// é separado de propósito: falha de rede não é convite inválido, e dizer
// "não encontrado" para quem está sem sinal seria mentira.
type Fase =
  | 'lendo'
  | 'erro'
  | 'invalido'
  | 'usado' // convite já fechado (visto antes de logar)
  | 'convite' // pending, sem sessão → login
  | 'claiming' // logado, vinculando
  | 'claimUsed' // o claim disse: outra conta ficou com este aluno
  | 'cadastro' // vinculado, falta completar o perfil
  | 'menor' // parede da idade (o fluxo de menor é a B.2)
  | 'sucesso'

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

/** Cartão neutro de mensagem final (inválido / erro / usado / parede). */
function Cartao({
  titulo,
  texto,
  icone,
  children,
}: {
  titulo: string
  texto: string
  icone?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 text-center">
      {icone}
      <h1 className="text-lg font-semibold tracking-tight">{titulo}</h1>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{texto}</p>
      {children}
    </div>
  )
}

export default function ConvitePage() {
  const params = useParams<{ token: string | string[] }>()
  const token = Array.isArray(params?.token) ? params.token[0] : (params?.token ?? '')
  const { user } = useSession()

  const [fase, setFase] = useState<Fase>('lendo')
  const [convite, setConvite] = useState<Convite | null>(null)
  // Celular do member (o número por onde o convite chegou) para pré-preencher.
  const [telefoneInicial, setTelefoneInicial] = useState<string>('')

  // ------------------------------------------------------------ 1. ler o convite
  useEffect(() => {
    if (!token) {
      setFase('invalido')
      return
    }
    let alive = true
    const supabase = createBrowserSupabaseClient()

    supabase.rpc('get_invite_by_token', { p_token: token }).then(({ data, error }) => {
      if (!alive) return
      if (error) {
        setFase('erro')
        return
      }
      // `returns table` chega como array de linhas; vazio = token desconhecido.
      const linha = (Array.isArray(data) ? data[0] : data) as Convite | undefined | null
      if (!linha) {
        setFase('invalido')
        return
      }
      setConvite(linha)
      if (linha.status === 'registered') {
        setFase('usado')
        return
      }
      if (linha.status !== 'pending') {
        // 'revoked' (aluno removido do roster) → mensagem genérica, igual a
        // token inexistente.
        setFase('invalido')
        return
      }
      setFase('convite')
    })

    return () => {
      alive = false
    }
  }, [token])

  // ------------------------------------------------- 2. claim quando há sessão
  // Cobre os DOIS caminhos de login com um effect só: no Google o usuário CHEGA
  // com sessão (roda no mount); no OTP a sessão aparece durante a vida da página
  // (o onAuthStateChange do useSession re-renderiza e o effect roda).
  const aposClaim = useCallback(
    async (u: User) => {
      const supabase = createBrowserSupabaseClient()

      // Perfil já completo (alguém que JÁ usava o Flow aceitando um convite) →
      // pula o cadastro. Mesma régua de completude do resto do app (nome+celular).
      const { data: perfil } = await supabase
        .from('profiles')
        .select('name, phone')
        .eq('id', u.id)
        .maybeSingle()

      if (perfil?.name && perfil?.phone) {
        setFase('sucesso')
        return
      }

      // Celular que o professor cadastrou no roster: o convite chegou POR ELE,
      // então é o número certo. Vem de RPC própria (a leitura pública nunca
      // devolve telefone) e só depois do claim — a RPC exige ser o dono.
      const { data: tel } = await supabase.rpc('get_claimed_member_phone', { p_token: token })
      if (typeof tel === 'string' && tel) {
        try {
          setTelefoneInicial(parsePhoneNumber(tel)?.formatInternational() ?? tel)
        } catch {
          setTelefoneInicial(tel)
        }
      }
      setFase('cadastro')
    },
    [token],
  )

  useEffect(() => {
    if (!user || !token) return
    // Só vale a pena reivindicar um convite que a leitura disse estar pendente.
    if (convite?.status !== 'pending') return

    const chave = `${user.id}:${token}`
    if (claimTentado.has(chave)) return
    claimTentado.add(chave)

    let alive = true
    const supabase = createBrowserSupabaseClient()
    setFase('claiming')

    supabase.rpc('claim_invite', { p_token: token }).then(({ data, error }) => {
      if (!alive) return
      if (error) {
        setFase('erro')
        return
      }
      const codigo = data as string
      if (codigo === 'claimed' || codigo === 'already_mine') {
        void aposClaim(user)
        return
      }
      if (codigo === 'used') {
        // Outra conta ficou com este aluno. Não vinculamos nada.
        setFase('claimUsed')
        return
      }
      // 'invalid' | 'noop' → genérico.
      setFase('invalido')
    })

    return () => {
      alive = false
    }
  }, [user, token, convite?.status, aposClaim])

  // Sem artigo antes do nome ("A Ana" / "O Nicholas"): o banco não sabe o gênero
  // de quem convidou, e errar isso na primeira frase que a pessoa lê seria pior
  // do que a frase mais curta.
  const coach = (convite?.coach_name ?? '').trim() || 'Seu professor'

  // ------------------------------------------------------------------ telas
  if (fase === 'lendo' || fase === 'claiming') {
    return (
      <Moldura>
        <div className="flex flex-col items-center gap-3 py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          {fase === 'claiming' && (
            <p className="text-sm text-muted-foreground">Conectando você a {coach}…</p>
          )}
        </div>
      </Moldura>
    )
  }

  if (fase === 'erro') {
    return (
      <Moldura>
        <Cartao
          icone={<WifiOff className="mx-auto mb-3 h-7 w-7 text-muted-foreground" aria-hidden />}
          titulo="Não deu para carregar o convite"
          texto="Verifique sua conexão e abra o link de novo."
        />
      </Moldura>
    )
  }

  if (fase === 'invalido') {
    return (
      <Moldura>
        <Cartao titulo="Convite não encontrado" texto="Peça um novo link ao seu professor." />
      </Moldura>
    )
  }

  if (fase === 'claimUsed') {
    return (
      <Moldura>
        <Cartao
          titulo="Este convite já foi usado"
          texto="Outra conta já se conectou com este convite. Fale com seu professor para receber um novo."
        />
      </Moldura>
    )
  }

  if (fase === 'usado') {
    return (
      <Moldura>
        <Cartao
          icone={<Check className="mx-auto mb-3 h-7 w-7 text-primary" aria-hidden />}
          titulo="Este convite já foi usado"
          texto="Se a conta é sua, é só entrar."
        >
          {/* Caso PROVÁVEL: a própria pessoa reabrindo a mensagem antiga. */}
          <Link
            href={user ? '/perfil' : '/login'}
            className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
          >
            {user ? 'Ir para meu perfil' : 'Entrar'}
          </Link>
        </Cartao>
      </Moldura>
    )
  }

  // PAREDE DA IDADE. O vínculo com o professor JÁ existe (o claim rodou antes do
  // formulário), mas nenhum dado de cadastro foi gravado. O fluxo com
  // consentimento parental é a B.2 — aqui a porta é fechada com gentileza.
  if (fase === 'menor') {
    return (
      <Moldura>
        <Cartao
          titulo={`Precisamos de um responsável`}
          texto={`Para menores de ${IDADE_MINIMA} anos, quem faz o cadastro é o pai, a mãe ou o responsável. Peça para ele abrir este mesmo link.`}
        />
      </Moldura>
    )
  }

  if (fase === 'sucesso') {
    return (
      <Moldura>
        <div className="rounded-2xl border border-primary/20 bg-card p-6 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
            <PartyPopper className="h-7 w-7 text-primary" aria-hidden />
          </span>
          <h1 className="text-xl font-bold tracking-tight">Pronto!</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            Você está conectado a <span className="font-semibold text-foreground">{coach}</span>.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Link
              href="/setup"
              className="flex h-12 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground transition hover:bg-primary/90"
            >
              Começar a jogar
            </Link>
            <Link
              href="/perfil"
              className="flex h-11 items-center justify-center rounded-lg border border-border text-sm font-semibold text-foreground/80 transition hover:bg-card"
            >
              Ver meu perfil
            </Link>
          </div>
        </div>
      </Moldura>
    )
  }

  // ---------------------------------------- CADASTRO (vinculado, falta o perfil)
  if (fase === 'cadastro' && user) {
    return (
      <Moldura>
        <h1 className="text-center text-xl font-semibold tracking-tight">Complete seu cadastro</h1>
        <p className="mx-auto mt-1.5 mb-5 max-w-xs text-center text-sm text-muted-foreground">
          Falta pouco para você entrar na lista de {coach}.
        </p>
        <div className="rounded-2xl border border-white/10 bg-neutral-900 p-5 text-white">
          {/* Email NÃO é pedido (vem do login, travado no form). Celular
              pré-preenchido com o número do roster — editável. Nascimento só
              aparece porque pedirNascimento está ligado AQUI. */}
          <ProfileForm
            user={user}
            mode="cadastro"
            telefoneInicial={telefoneInicial}
            pedirNascimento
            onMenorDeIdade={() => setFase('menor')}
            onDone={() => setFase('sucesso')}
          />
        </div>
      </Moldura>
    )
  }

  // ---------------------------------------------------------- convite ATIVO
  return (
    <Moldura>
      {convite?.student_first_name && (
        <p className="mb-2 text-center text-sm text-muted-foreground">
          Olá, {convite.student_first_name}!
        </p>
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

      {/* next={/convite/{token}} é o que faz o TOKEN SOBREVIVER ao round-trip do
          Google: o LoginPanel monta /auth/callback?next=…, e o callback (que
          aceita só caminhos internos) devolve o usuário para ESTA página, com o
          token ainda no path. O OTP nem sai daqui — a sessão aparece e o effect
          do claim dispara sozinho. */}
      <LoginPanel next={`/convite/${token}`} onAuthenticated={() => {}} />
    </Moldura>
  )
}
