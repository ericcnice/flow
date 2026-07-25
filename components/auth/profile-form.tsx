'use client'

/**
 * Formulário de PERFIL compartilhado (A1.3c) — extraído do ProfileModal (A1.2).
 * Usado em DOIS modos:
 *  - "cadastro" (ProfileModal, obrigatório, 1º login): pré do OAuth, username
 *    SUGERIDO de nome+sobrenome.
 *  - "editar" (/perfil › Meus dados): pré dos dados ATUAIS, com "Cancelar".
 *
 * Campos: nome, sobrenome, username (check em tempo real, IGNORANDO o próprio
 * valor atual), email (travado), celular (máscara libphonenumber-js + E.164 +
 * check de unicidade). Salvar só habilita com tudo válido+disponível. Grava
 * profiles.name + profiles.phone (update self) + username em user_metadata.
 */

import { useEffect, useRef, useState } from 'react'
import { AsYouType, isValidPhoneNumber, parsePhoneNumber } from 'libphonenumber-js'
import { Check, Loader2 } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { createBrowserSupabaseClient } from '@/lib/supabase/browser-client'
import { IDADE_MINIMA, TOS_VERSION, idadeEmAnos } from '@/lib/legal'
import { saveConsentInitial } from '@/lib/supabase/consents'

const DEFAULT_COUNTRY = 'BR' as const
const USERNAME_RE = /^[a-z0-9][a-z0-9-]{2,29}$/

// 'taken' = o valor É de outra pessoa. 'erro' = NÃO DEU para verificar (RPC/rede).
// Os dois bloqueiam o Salvar, mas por motivos opostos — misturá-los num 'idle'
// mudo era o que deixava o botão morto sem explicação.
type Avail = 'idle' | 'checking' | 'ok' | 'taken' | 'erro'

/** "Eric Nice" → "ericnice". */
export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 30)
}

/** Divide no 1º espaço: "Eric Nice" → ["Eric","Nice"]. */
export function splitName(full: string | undefined): [string, string] {
  const t = (full ?? '').trim()
  if (!t) return ['', '']
  const i = t.indexOf(' ')
  return i === -1 ? [t, ''] : [t.slice(0, i), t.slice(i + 1).trim()]
}

/**
 * Check de disponibilidade (debounce 400ms) contra uma RPC boolean. `own` = o
 * valor ATUAL do usuário — se o digitado for igual, é "disponível" na hora (não
 * acusa como ocupado o que já é dele; e prepara a A2, quando o username virar
 * members.slug e a RPC passaria a encontrá-lo).
 */
function useAvailability(rpc: string, argKey: string, value: string, ready: boolean, own?: string): Avail {
  const [status, setStatus] = useState<Avail>('idle')
  useEffect(() => {
    if (!ready || !value) {
      setStatus('idle')
      return
    }
    if (own && value.toLowerCase() === own.toLowerCase()) {
      setStatus('ok')
      return
    }
    setStatus('checking')
    let alive = true
    const t = setTimeout(async () => {
      const supabase = createBrowserSupabaseClient()
      const { data, error } = await supabase.rpc(rpc, { [argKey]: value })
      if (!alive) return
      setStatus(error ? 'erro' : data ? 'ok' : 'taken')
    }, 400)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [rpc, argKey, value, ready, own])
  return status
}

function StatusPill({ status, invalid }: { status: Avail; invalid: boolean }) {
  if (invalid) return <span className="text-xs text-muted-foreground">—</span>
  if (status === 'checking')
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> verificando
      </span>
    )
  if (status === 'ok')
    return (
      <span className="inline-flex items-center gap-1 text-xs text-primary">
        <Check className="h-3 w-3" /> disponível
      </span>
    )
  if (status === 'taken') return <span className="text-xs text-destructive">✗ indisponível</span>
  if (status === 'erro') return <span className="text-xs text-white/50">não deu para verificar</span>
  return null
}

export function ProfileForm({
  user,
  mode,
  initial,
  ownUsername,
  currentPhone,
  telefoneInicial,
  pedirNascimento = false,
  onMenorDeIdade,
  onDone,
  onCancel,
}: {
  user: User
  mode: 'cadastro' | 'editar'
  /** Valores iniciais no modo editar (do perfil atual). */
  initial?: { nome: string; sobrenome: string; username: string; phone: string }
  /** Username atual — ignorado no check de disponibilidade. */
  ownUsername?: string
  /** Celular atual em E.164 — ignorado no check (não acusa o próprio número). */
  currentPhone?: string
  /**
   * Celular PRÉ-PREENCHIDO no cadastro (landing do convite: o número que o
   * professor já tinha no roster — o convite chegou por ele, então está
   * validado na prática). Editável. Só vale quando não há `initial`.
   */
  telefoneInicial?: string
  /**
   * Pede DATA DE NASCIMENTO (LGPD art. 14). OPT-IN: default false, então os
   * chamadores existentes (ProfileModal da tela de fim de jogo, /perfil › Meus
   * dados) seguem EXATAMENTE como estavam — o campo nem é renderizado.
   */
  pedirNascimento?: boolean
  /**
   * Chamado quando a idade fica abaixo de IDADE_MINIMA. NADA é gravado: o
   * chamador mostra a parede (o fluxo de menor com consentimento parental é a
   * B.2). Sem este callback o form apenas recusa o Salvar.
   */
  onMenorDeIdade?: (idade: number) => void
  onDone: () => void
  onCancel?: () => void
}) {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const [defNome, defSobre] = splitName((meta.full_name as string) ?? (meta.name as string))

  const [nome, setNome] = useState(initial?.nome ?? defNome)
  const [sobrenome, setSobrenome] = useState(initial?.sobrenome ?? defSobre)
  const [username, setUsername] = useState(initial?.username ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? telefoneInicial ?? '')
  const [nascimento, setNascimento] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  // CONSENTIMENTOS (só no cadastro): T&C obrigatório, marketing opcional.
  const [aceiteTos, setAceiteTos] = useState(false)
  const [marketing, setMarketing] = useState(false)

  // No modo editar o usuário já "tocou" (não auto-sugere sobre o valor atual).
  // Idem quando o cadastro chega COM username (convite de quem já tinha perfil):
  // sem isto, a sugestão automática trocaria o @ que a pessoa já usa.
  const usernameTocado = useRef(mode === 'editar' || Boolean(initial?.username))
  const variacaoTentada = useRef(false)

  // Sugestão automática — SÓ no cadastro e enquanto não tocou.
  useEffect(() => {
    if (mode !== 'cadastro' || usernameTocado.current) return
    setUsername(slugify(`${nome}${sobrenome}`))
    variacaoTentada.current = false
  }, [mode, nome, sobrenome])

  const usernameValido = USERNAME_RE.test(username)
  const usernameAvail = useAvailability('check_username_available', 'p_username', username, usernameValido, ownUsername)

  useEffect(() => {
    if (usernameAvail === 'taken' && !usernameTocado.current && !variacaoTentada.current) {
      variacaoTentada.current = true
      setUsername((u) => `${u}2`.slice(0, 30))
    }
  }, [usernameAvail])

  const e164 = isValidPhoneNumber(phone, DEFAULT_COUNTRY)
    ? (parsePhoneNumber(phone, DEFAULT_COUNTRY)?.number ?? '')
    : ''
  const phoneValido = e164 !== ''
  // `currentPhone` (E.164) é o próprio número do usuário — se o digitado
  // (normalizado) for igual, é "disponível" na hora (não acusa o próprio como
  // ocupado). No cadastro currentPhone é undefined → check normal via RPC.
  const phoneAvail = useAvailability('check_phone_available', 'p_phone', e164, phoneValido, currentPhone)

  // DIRTY CHECK (só no editar): Salvar só habilita se algo divergir dos valores
  // ORIGINAIS do profile (nome/sobrenome/username/celular-E.164). No cadastro não
  // há "original" → sempre "sujo" (o fluxo de completar-perfil não muda).
  const dirty =
    mode !== 'editar' ||
    nome.trim() !== (initial?.nome ?? '').trim() ||
    sobrenome.trim() !== (initial?.sobrenome ?? '').trim() ||
    username !== (initial?.username ?? '') ||
    e164 !== (currentPhone ?? '')

  // NASCIMENTO (só quando pedirNascimento). Faixa razoável: nem futuro, nem
  // mais de 120 anos. A idade em si só é conferida no salvar — acusar "menor de
  // idade" enquanto a pessoa ainda digita o ano seria hostil.
  const idade = nascimento ? idadeEmAnos(nascimento) : null
  const nascimentoValido = idade !== null && idade >= 0 && idade <= 120
  const nascimentoInvalido = nascimento !== '' && !nascimentoValido

  const podeSalvar =
    nome.trim() !== '' &&
    sobrenome.trim() !== '' &&
    usernameValido &&
    usernameAvail === 'ok' &&
    phoneValido &&
    phoneAvail === 'ok' &&
    (!pedirNascimento || nascimentoValido) &&
    (mode === 'editar' || aceiteTos) && // T&C obrigatório no cadastro
    dirty &&
    !salvando

  // POR QUE o Salvar está desabilitado. Botão morto sem explicação é becoo sem
  // saída — a pessoa não tem como descobrir que o problema é o celular do
  // cadastro do professor já estar em outra conta, por exemplo. Só fala dos
  // motivos ACIONÁVEIS (campo vazio não precisa de aviso: está visivelmente
  // vazio) e some assim que a pendência é resolvida.
  const motivoBloqueio = (() => {
    if (salvando || podeSalvar) return null
    if (usernameAvail === 'taken') return 'Este @username já está em uso. Escolha outro.'
    if (phoneAvail === 'taken') return 'Este celular já está cadastrado em outra conta.'
    if (usernameAvail === 'erro' || phoneAvail === 'erro')
      return 'Não deu para verificar a disponibilidade agora. Confira sua conexão e tente de novo.'
    if (usernameAvail === 'checking' || phoneAvail === 'checking') return null // transitório
    if (pedirNascimento && !nascimentoValido) return 'Informe sua data de nascimento.'
    if (mode === 'cadastro' && !aceiteTos) return 'Aceite os Termos para continuar.'
    return null
  })()

  async function salvar() {
    if (!podeSalvar) return

    // PAREDE DA IDADE — antes de QUALQUER escrita. O menor não tem cadastro
    // gravado pela metade: o chamador assume e mostra a parede (a B.2 constrói
    // o consentimento parental). A linha é IDADE_MINIMA, em lib/legal.ts.
    if (pedirNascimento && idade !== null && idade < IDADE_MINIMA) {
      onMenorDeIdade?.(idade)
      return
    }

    setSalvando(true)
    setErro(null)
    setOk(false)
    const supabase = createBrowserSupabaseClient()
    const nomeCompleto = `${nome.trim()} ${sobrenome.trim()}`.trim()

    // birth_date só entra no payload quando foi pedido — os chamadores antigos
    // enviam exatamente as mesmas colunas de antes.
    // .select('id') NÃO é enfeite: um UPDATE que a RLS filtra (auth.uid() nulo
    // ou de outra sessão) volta 204 SEM ERRO. Sem pedir as linhas afetadas, o
    // "não gravou nada" era indistinguível de sucesso — e virava um "Pronto!"
    // silencioso com o perfil intacto no banco.
    const { data: linhas, error: pErr } = await supabase
      .from('profiles')
      .update(
        pedirNascimento
          ? { name: nomeCompleto, phone: e164, birth_date: nascimento }
          : { name: nomeCompleto, phone: e164 },
      )
      .eq('id', user.id)
      .select('id')
    if (pErr) {
      setErro(pErr.message)
      setSalvando(false)
      return
    }
    if (!linhas || linhas.length === 0) {
      setErro('Não foi possível salvar. Entre novamente e tente de novo.')
      setSalvando(false)
      return
    }
    const { error: uErr } = await supabase.auth.updateUser({ data: { username } })
    if (uErr) {
      setErro(uErr.message)
      setSalvando(false)
      return
    }
    // Grava o aceite de T&C (versionado) + marketing SÓ no cadastro; no editar,
    // consentimentos vivem na sua própria seção do /perfil.
    if (mode === 'cadastro') {
      const { error: cErr } = await saveConsentInitial(user.id, { tosVersion: TOS_VERSION, marketing })
      if (cErr) {
        setErro(cErr)
        setSalvando(false)
        return
      }
    }
    setSalvando(false)
    setOk(true)
    onDone()
  }

  return (
    <div className="flex flex-col gap-3">
      {/* EMPILHADOS (largura total) — lado a lado estourava a largura no mobile
          (scroll horizontal) com sobrenomes longos. */}
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Nome</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="h-11 w-full rounded-lg border border-white/20 bg-white/10 px-3 text-base"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Sobrenome</span>
          <input
            value={sobrenome}
            onChange={(e) => setSobrenome(e.target.value)}
            className="h-11 w-full rounded-lg border border-white/20 bg-white/10 px-3 text-base"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-white/60">
          Username
          <StatusPill status={usernameAvail} invalid={username.length > 0 && !usernameValido} />
        </span>
        <div className="flex items-center rounded-lg border border-white/20 bg-white/10 px-3">
          <span className="text-white/40">@</span>
          <input
            value={username}
            onChange={(e) => {
              usernameTocado.current = true
              setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
            }}
            placeholder="ericnice"
            className="h-11 flex-1 bg-transparent px-1 font-mono text-base"
          />
        </div>
        {username.length > 0 && !usernameValido && (
          <span className="text-xs text-white/50">3–30, minúsculas/números/hífen, começa com letra ou número.</span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Email</span>
        <input
          value={user.email ?? ''}
          readOnly
          className="h-11 cursor-not-allowed rounded-lg border border-white/10 bg-white/5 px-3 text-base text-white/60"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-white/60">
          Celular
          <StatusPill status={phoneAvail} invalid={phone.length > 0 && !phoneValido} />
        </span>
        <input
          value={phone}
          onChange={(e) => setPhone(new AsYouType(DEFAULT_COUNTRY).input(e.target.value))}
          inputMode="tel"
          placeholder="+55 (11) 95050-7175"
          className="h-11 rounded-lg border border-white/20 bg-white/10 px-3 text-base"
        />
        {phone.length > 0 && !phoneValido && (
          <span className="text-xs text-white/50">Número inválido. Use +código para outros países.</span>
        )}
      </label>

      {/* NASCIMENTO — só quando pedido (landing do convite). O <input type=date>
          usa o seletor nativo do celular, que é o caminho mais rápido no mobile. */}
      {pedirNascimento && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
            Data de nascimento
          </span>
          <input
            type="date"
            value={nascimento}
            onChange={(e) => setNascimento(e.target.value)}
            className="h-11 w-full min-w-0 rounded-lg border border-white/20 bg-white/10 px-3 text-base"
          />
          {nascimentoInvalido && <span className="text-xs text-white/50">Data inválida.</span>}
        </label>
      )}

      {mode === 'cadastro' && (
        <div className="flex flex-col gap-2.5 rounded-lg border border-white/10 bg-white/5 p-3">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-white/80">
            <input
              type="checkbox"
              checked={aceiteTos}
              onChange={(e) => setAceiteTos(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-white"
            />
            <span>
              Li e aceito os{' '}
              <a href="/termos" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white">
                Termos de Uso
              </a>{' '}
              e a{' '}
              <a href="/privacidade" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white">
                Política de Privacidade
              </a>
              . <span className="text-white/50">(obrigatório)</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-white/80">
            <input
              type="checkbox"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-white"
            />
            <span>
              Quero receber novidades do Flow por email. <span className="text-white/50">(opcional)</span>
            </span>
          </label>
        </div>
      )}

      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      {ok && mode === 'editar' && (
        <p className="inline-flex items-center gap-1.5 text-sm text-primary">
          <Check className="h-4 w-4" /> Salvo.
        </p>
      )}
      {motivoBloqueio && <p className="text-sm text-white/60">{motivoBloqueio}</p>}

      <div className="mt-1 flex gap-2">
        {mode === 'editar' && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="h-12 flex-1 rounded-lg bg-white/10 text-base font-bold text-white transition hover:bg-white/15"
          >
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={salvar}
          disabled={!podeSalvar}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-white text-base font-bold text-neutral-900 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {salvando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
          Salvar
        </button>
      </div>
    </div>
  )
}
