'use client'

/**
 * Modal de PERFIL OBRIGATÓRIO (A1.2), aberto após o 1º login quando o perfil
 * está incompleto. Campos: nome, sobrenome, username (check em tempo real),
 * email (travado, veio verificado), celular (máscara internacional + E.164 +
 * check de unicidade). Salvar só habilita com TUDO válido e disponível.
 *
 * Ao salvar: grava profiles.name (nome completo) + profiles.phone (E.164) via
 * update self (a policy da A1.1 permite). O USERNAME vai para user_metadata
 * (pendência A2: a ponte profile↔member vira members.slug de lá — ver README do
 * commit). Molde glass dos modais do app.
 */

import { useEffect, useRef, useState } from 'react'
import { AsYouType, isValidPhoneNumber, parsePhoneNumber } from 'libphonenumber-js'
import { Check, Loader2 } from 'lucide-react'
import type { User } from '@supabase/supabase-js'
import { createBrowserSupabaseClient } from '@/lib/supabase/browser-client'

const DEFAULT_COUNTRY = 'BR' as const
const USERNAME_RE = /^[a-z0-9][a-z0-9-]{2,29}$/

type Avail = 'idle' | 'checking' | 'ok' | 'taken'

/** Normaliza "Eric Nice" → "ericnice" (sem acento, minúsculo, só [a-z0-9]). */
function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 30)
}

/** Divide o nome do OAuth no primeiro espaço: "Eric Nice" → ["Eric","Nice"]. */
function splitName(full: string | undefined): [string, string] {
  const t = (full ?? '').trim()
  if (!t) return ['', '']
  const i = t.indexOf(' ')
  return i === -1 ? [t, ''] : [t.slice(0, i), t.slice(i + 1).trim()]
}

/** Check de disponibilidade com debounce (400ms) contra uma RPC boolean. */
function useAvailability(rpc: string, argKey: string, value: string, ready: boolean): Avail {
  const [status, setStatus] = useState<Avail>('idle')
  useEffect(() => {
    if (!ready || !value) {
      setStatus('idle')
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
  }, [rpc, argKey, value, ready])
  return status
}

/** Pílula de estado do check (verificando / disponível / indisponível). */
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

export function ProfileModal({ user, onDone }: { user: User; onDone: () => void }) {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>
  const [pnome, psobre] = splitName((meta.full_name as string) ?? (meta.name as string))

  const [nome, setNome] = useState(pnome)
  const [sobrenome, setSobrenome] = useState(psobre)
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const usernameTocado = useRef(false)
  const variacaoTentada = useRef(false)

  // Sugestão automática do username enquanto o usuário não o tocou.
  useEffect(() => {
    if (usernameTocado.current) return
    setUsername(slugify(`${nome}${sobrenome}`))
    variacaoTentada.current = false
  }, [nome, sobrenome])

  const usernameValido = USERNAME_RE.test(username)
  const usernameAvail = useAvailability('check_username_available', 'p_username', username, usernameValido)

  // Se a sugestão veio ocupada e o usuário não editou, tenta "base2" uma vez.
  useEffect(() => {
    if (usernameAvail === 'taken' && !usernameTocado.current && !variacaoTentada.current) {
      variacaoTentada.current = true
      setUsername((u) => `${u}2`.slice(0, 30))
    }
  }, [usernameAvail])

  // Telefone: máscara AsYouType (default BR) + validação + E.164.
  const e164 = isValidPhoneNumber(phone, DEFAULT_COUNTRY)
    ? (parsePhoneNumber(phone, DEFAULT_COUNTRY)?.number ?? '')
    : ''
  const phoneValido = e164 !== ''
  const phoneAvail = useAvailability('check_phone_available', 'p_phone', e164, phoneValido)

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
    const supabase = createBrowserSupabaseClient()
    const nomeCompleto = `${nome.trim()} ${sobrenome.trim()}`.trim()

    // profiles: name + phone (update self — policy da A1.1).
    const { error: pErr } = await supabase
      .from('profiles')
      .update({ name: nomeCompleto, phone: e164 })
      .eq('id', user.id)
    if (pErr) {
      setErro(pErr.message)
      setSalvando(false)
      return
    }

    // username → user_metadata (A2 lê para criar members.slug na ponte).
    const { error: uErr } = await supabase.auth.updateUser({ data: { username } })
    if (uErr) {
      setErro(uErr.message)
      setSalvando(false)
      return
    }

    setSalvando(false)
    onDone()
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Complete seu perfil"
    >
      <div className="w-full max-w-sm rounded-2xl bg-neutral-900 text-white shadow-2xl ring-1 ring-white/10">
        <div className="border-b border-white/10 px-5 py-4">
          <h2 className="text-base font-bold uppercase tracking-wide">Complete seu perfil</h2>
          <p className="mt-1 text-xs text-white/60">Precisamos do seu nome, um @username e o celular.</p>
        </div>

        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto px-5 py-5">
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

          <button
            type="button"
            onClick={salvar}
            disabled={!podeSalvar}
            className="mt-1 flex h-12 items-center justify-center gap-2 rounded-lg bg-white text-base font-bold text-neutral-900 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {salvando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
