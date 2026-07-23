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

const DEFAULT_COUNTRY = 'BR' as const
const USERNAME_RE = /^[a-z0-9][a-z0-9-]{2,29}$/

type Avail = 'idle' | 'checking' | 'ok' | 'taken'

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
      setStatus(error ? 'idle' : data ? 'ok' : 'taken')
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
  return null
}

export function ProfileForm({
  user,
  mode,
  initial,
  ownUsername,
  currentPhone,
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
  onDone: () => void
  onCancel?: () => void
}) {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const [defNome, defSobre] = splitName((meta.full_name as string) ?? (meta.name as string))

  const [nome, setNome] = useState(initial?.nome ?? defNome)
  const [sobrenome, setSobrenome] = useState(initial?.sobrenome ?? defSobre)
  const [username, setUsername] = useState(initial?.username ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  // No modo editar o usuário já "tocou" (não auto-sugere sobre o valor atual).
  const usernameTocado = useRef(mode === 'editar')
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

  const podeSalvar =
    nome.trim() !== '' &&
    sobrenome.trim() !== '' &&
    usernameValido &&
    usernameAvail === 'ok' &&
    phoneValido &&
    phoneAvail === 'ok' &&
    !salvando

  async function salvar() {
    if (!podeSalvar) return
    setSalvando(true)
    setErro(null)
    setOk(false)
    const supabase = createBrowserSupabaseClient()
    const nomeCompleto = `${nome.trim()} ${sobrenome.trim()}`.trim()

    const { error: pErr } = await supabase
      .from('profiles')
      .update({ name: nomeCompleto, phone: e164 })
      .eq('id', user.id)
    if (pErr) {
      setErro(pErr.message)
      setSalvando(false)
      return
    }
    const { error: uErr } = await supabase.auth.updateUser({ data: { username } })
    if (uErr) {
      setErro(uErr.message)
      setSalvando(false)
      return
    }
    setSalvando(false)
    setOk(true)
    onDone()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Nome</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="h-11 rounded-lg border border-white/20 bg-white/10 px-3 text-base"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/60">Sobrenome</span>
          <input
            value={sobrenome}
            onChange={(e) => setSobrenome(e.target.value)}
            className="h-11 rounded-lg border border-white/20 bg-white/10 px-3 text-base"
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
