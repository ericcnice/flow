'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/client'
import {
  applyLiveMatchAction,
  createLiveMatch,
  getLiveMatchState,
  getLiveMatchTopic,
  type LiveMatchAction,
  type LiveMatchRoom,
  type LiveMatchState,
} from '@/lib/supabase/live-match'

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'error'

/**
 * Gera um id de sessão único para usar como presence key.
 *
 * `crypto.randomUUID()` só existe em contexto SEGURO (HTTPS ou localhost). Ao
 * acessar por HTTP puro (ex.: IP da rede local) ela é `undefined` e quebra. Este
 * helper tenta, em ordem: randomUUID → getRandomValues → Math.random+timestamp.
 * Não precisa ser um UUID perfeito, só único o bastante para esta sessão.
 */
function generateSessionId(): string {
  const c: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined

  if (c?.randomUUID) {
    try {
      return c.randomUUID()
    } catch {
      // cai para os fallbacks abaixo
    }
  }

  if (c?.getRandomValues) {
    try {
      const bytes = new Uint8Array(16)
      c.getRandomValues(bytes)
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      return `sess-${hex}`
    } catch {
      // cai para o fallback final
    }
  }

  // Último recurso: sem Web Crypto (contexto não seguro e antigo).
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random()
    .toString(36)
    .slice(2)}`
}

/** Papel do client neste canal — usado apenas para a contagem de presença. */
export type MatchRole = 'editor' | 'viewer'

export interface UseRealtimeMatchOptions {
  viewToken?: string
  matchId?: string
  /** Papel ao auto-conectar via options. Default: 'viewer'. */
  role?: MatchRole
}

export interface UseRealtimeMatch {
  status: RealtimeStatus
  /** state.actions mais recente (via broadcast ou leitura inicial); null se ainda não há. */
  state: any
  /** state.rules mais recente do remoto (repassado do payload completo); null se ausente. */
  remoteRules: any
  /** state.firstServer mais recente do remoto ('A'|'B'); null se ausente. */
  remoteFirstServer: string | null
  /** state.players mais recente do remoto (raiz do state); null se ausente. */
  remotePlayers: any
  /** state.theme mais recente do remoto (raiz do state); null se ausente. */
  remoteTheme: string | null
  /** state.scoreType mais recente do remoto (raiz do state); null se ausente. */
  remoteScoreType: string | null
  /**
   * Total de conexões distintas ativas no canal (editores + espectadores).
   * COSMÉTICO: ver nota de "sem enforcement" na doc do hook abaixo.
   */
  presenceCount: number
  /**
   * Quantas dessas conexões se anunciaram como role:'editor'.
   * COSMÉTICO: ver nota de "sem enforcement" na doc do hook abaixo.
   */
  editorCount: number
  /** Cria uma sala nova e já começa a escutá-la (como 'editor'). Retorna os tokens ou null em falha. */
  create: (clubSlug?: string, role?: MatchRole) => Promise<LiveMatchRoom | null>
  /** Aplica uma ação. O broadcast atualiza o state; também aplicamos o retorno de forma otimista. */
  applyAction: (
    editToken: string,
    matchId: string,
    action: LiveMatchAction,
  ) => Promise<LiveMatchState | null>
  /** Lê o estado inicial, entra no canal de broadcast e anuncia presença com o `role` dado. */
  subscribe: (viewToken: string, matchId: string, role?: MatchRole) => Promise<void>
}

/**
 * Hook de Realtime da partida ao vivo.
 *
 * "Peça" isolada: não conhece nenhuma tela. Todas as chamadas são assíncronas
 * e falham graciosamente — nada aqui bloqueia o resto do app se o Supabase
 * estiver indisponível.
 *
 * ⚠️ PRESENCE É COSMÉTICO (UX), NÃO É SEGURANÇA/ENFORCEMENT.
 * `presenceCount` / `editorCount` apenas *mostram* quantos clients estão no
 * canal agora ("X editando"). Eles NÃO impedem ninguém de editar: quem tem o
 * `edit_token` continua podendo aplicar ações via RPC independentemente da
 * contagem, e nada aqui bloqueia de verdade um 4º editor. O enforcement real
 * (bloqueio no servidor) é uma implementação futura, fora do escopo deste hook.
 */
export function useRealtimeMatch(options?: UseRealtimeMatchOptions): UseRealtimeMatch {
  const [status, setStatus] = useState<RealtimeStatus>('idle')
  const [state, setState] = useState<any>(null)
  const [remoteRules, setRemoteRules] = useState<any>(null)
  const [remoteFirstServer, setRemoteFirstServer] = useState<string | null>(null)
  const [remotePlayers, setRemotePlayers] = useState<any>(null)
  const [remoteTheme, setRemoteTheme] = useState<string | null>(null)
  const [remoteScoreType, setRemoteScoreType] = useState<string | null>(null)
  const [presenceCount, setPresenceCount] = useState(0)
  const [editorCount, setEditorCount] = useState(0)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const wakeLockRef = useRef<any>(null)
  const mountedRef = useRef(true)
  // ID único por sessão do navegador (gerado sob demanda, no client). Usado
  // como presence key para deduplicar conexões e como identificador no track().
  const sessionIdRef = useRef<string>('')

  // Aplica um novo state do remoto. Além de actions, repassa rules e firstServer
  // (que já vêm no payload completo de getLiveMatchState/broadcast).
  const applyState = useCallback((newState: any) => {
    if (!mountedRef.current) return
    setState(newState?.actions ?? null)
    if (newState?.rules !== undefined) setRemoteRules(newState.rules ?? null)
    if (newState?.firstServer !== undefined) setRemoteFirstServer(newState.firstServer ?? null)
    if (newState?.players !== undefined) setRemotePlayers(newState.players ?? null)
    if (newState?.theme !== undefined) setRemoteTheme(newState.theme ?? null)
    if (newState?.scoreType !== undefined) setRemoteScoreType(newState.scoreType ?? null)
  }, [])

  // Recalcula a contagem de presença a partir do presenceState() atual.
  // presenceState() => { [presenceKey]: Array<meta> }, uma entrada por key.
  const recomputePresence = useCallback(() => {
    const channel = channelRef.current
    if (!channel || !mountedRef.current) return
    const presenceState = channel.presenceState() as Record<
      string,
      Array<{ role?: string }>
    >
    const keys = Object.keys(presenceState)
    let editors = 0
    for (const key of keys) {
      const metas = presenceState[key]
      if (metas?.some((m) => m.role === 'editor')) editors++
    }
    setPresenceCount(keys.length)
    setEditorCount(editors)
  }, [])

  const teardownChannel = useCallback(() => {
    if (channelRef.current) {
      // Remove a própria presença antes de derrubar o canal.
      try {
        channelRef.current.untrack()
      } catch {
        // ignorar
      }
      // removeChannel também faz unsubscribe.
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    setPresenceCount(0)
    setEditorCount(0)
  }, [])

  const subscribe = useCallback(
    async (viewToken: string, matchId: string, role: MatchRole = 'viewer') => {
      try {
        setStatus('connecting')

        // Troca de sala: derruba o canal anterior, se houver.
        teardownChannel()

        // Limpa o estado remoto da sala ANTERIOR para não vazar config entre
        // salas (ex.: regras de squash sobrevivendo numa sala de tênis). Sem
        // isso, um patch obsoleto poderia ser aplicado antes da 1ª leitura da
        // nova sala. Consumidores tratam null com segurança (só ignoram).
        if (mountedRef.current) {
          setState(null)
          setRemoteRules(null)
          setRemoteFirstServer(null)
          setRemotePlayers(null)
          setRemoteTheme(null)
          setRemoteScoreType(null)
        }

        // Garante um sessionId estável para esta sessão do navegador.
        // generateSessionId tem fallback p/ contexto não seguro (HTTP puro),
        // onde crypto.randomUUID não existe.
        if (!sessionIdRef.current) sessionIdRef.current = generateSessionId()
        const sessionId = sessionIdRef.current

        // 1) Estado inicial (uma leitura) antes de escutar o broadcast.
        const initial = await getLiveMatchState(viewToken)
        if (!mountedRef.current) return
        if (initial) applyState(initial.state)

        // 2) Calcula o topic e se inscreve no MESMO canal (broadcast + presence).
        const topic = await getLiveMatchTopic(viewToken, matchId)
        if (!mountedRef.current) return

        const channel = supabase.channel(topic, {
          config: { presence: { key: sessionId } },
        })

        // Broadcast (fluxo já existente).
        channel.on('broadcast', { event: 'match_state' }, (message) => {
          const payload = (message as any)?.payload
          if (payload?.state !== undefined) applyState(payload.state)
        })

        // Presence: 'sync' basta para recontar; join/leave só chamam o mesmo recálculo.
        channel.on('presence', { event: 'sync' }, () => recomputePresence())
        channel.on('presence', { event: 'join' }, () => recomputePresence())
        channel.on('presence', { event: 'leave' }, () => recomputePresence())

        channel.subscribe(async (channelStatus) => {
          if (!mountedRef.current) return
          if (channelStatus === 'SUBSCRIBED') {
            setStatus('connected')
            // Anuncia a própria presença só depois de SUBSCRIBED (exigência da API).
            try {
              await channel.track({ role, sessionId, joinedAt: Date.now() })
            } catch {
              // Presence é cosmético: falhar aqui não quebra broadcast/estado.
            }
            recomputePresence()
          } else if (
            channelStatus === 'CHANNEL_ERROR' ||
            channelStatus === 'TIMED_OUT' ||
            channelStatus === 'CLOSED'
          ) {
            setStatus('error')
          }
        })

        channelRef.current = channel
      } catch (err) {
        console.error('useRealtimeMatch.subscribe failed:', err)
        if (mountedRef.current) setStatus('error')
      }
    },
    [applyState, teardownChannel, recomputePresence],
  )

  const create = useCallback(
    async (clubSlug?: string, role: MatchRole = 'editor'): Promise<LiveMatchRoom | null> => {
      try {
        setStatus('connecting')
        const room = await createLiveMatch(clubSlug)
        if (!mountedRef.current) return null
        // Já entra escutando a sala recém-criada (quem cria é editor por padrão).
        await subscribe(room.viewToken, room.id, role)
        return room
      } catch (err) {
        console.error('useRealtimeMatch.create failed:', err)
        if (mountedRef.current) setStatus('error')
        return null
      }
    },
    [subscribe],
  )

  const applyAction = useCallback(
    async (
      editToken: string,
      matchId: string,
      action: LiveMatchAction,
    ): Promise<LiveMatchState | null> => {
      const result = await applyLiveMatchAction(editToken, matchId, action)
      // O broadcast já vai atualizar o state; aplicamos o retorno de forma otimista.
      if (result && mountedRef.current) applyState(result.state)
      return result
    },
    [applyState],
  )

  // Assinatura automática se o hook já nasce com uma sala conhecida.
  useEffect(() => {
    if (options?.viewToken && options?.matchId) {
      subscribe(options.viewToken, options.matchId, options.role ?? 'viewer')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.viewToken, options?.matchId, options?.role])

  // Wake Lock: mantém a tela acesa enquanto conectado. Falha em silêncio
  // onde não há suporte (Safari/iOS antigos etc.).
  useEffect(() => {
    if (status !== 'connected') return

    let released = false

    const requestWakeLock = async () => {
      try {
        const wakeLock = await (navigator as any)?.wakeLock?.request('screen')
        if (!wakeLock) return
        if (released || !mountedRef.current) {
          wakeLock.release?.()
          return
        }
        wakeLockRef.current = wakeLock
      } catch {
        // Sem suporte / negado: ignorar sem quebrar nada.
      }
    }

    // Reaquisição quando a aba volta a ficar visível (o lock cai ao sair da aba).
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && status === 'connected') {
        requestWakeLock()
      }
    }

    requestWakeLock()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      try {
        wakeLockRef.current?.release?.()
      } catch {
        // ignorar
      }
      wakeLockRef.current = null
    }
  }, [status])

  // Cleanup geral no unmount.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      teardownChannel()
    }
  }, [teardownChannel])

  return {
    status,
    state,
    remoteRules,
    remoteFirstServer,
    remotePlayers,
    remoteTheme,
    remoteScoreType,
    presenceCount,
    editorCount,
    create,
    applyAction,
    subscribe,
  }
}
