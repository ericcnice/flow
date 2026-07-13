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

export interface UseRealtimeMatchOptions {
  viewToken?: string
  matchId?: string
}

export interface UseRealtimeMatch {
  status: RealtimeStatus
  /** state.actions mais recente (via broadcast ou leitura inicial); null se ainda não há. */
  state: any
  /** Cria uma sala nova e já começa a escutá-la. Retorna os tokens ou null em falha. */
  create: (clubSlug?: string) => Promise<LiveMatchRoom | null>
  /** Aplica uma ação. O broadcast atualiza o state; também aplicamos o retorno de forma otimista. */
  applyAction: (
    editToken: string,
    matchId: string,
    action: LiveMatchAction,
  ) => Promise<LiveMatchState | null>
  /** Lê o estado inicial e passa a escutar o canal de broadcast da sala. */
  subscribe: (viewToken: string, matchId: string) => Promise<void>
}

/**
 * Hook de Realtime da partida ao vivo.
 *
 * "Peça" isolada: não conhece nenhuma tela. Todas as chamadas são assíncronas
 * e falham graciosamente — nada aqui bloqueia o resto do app se o Supabase
 * estiver indisponível.
 */
export function useRealtimeMatch(options?: UseRealtimeMatchOptions): UseRealtimeMatch {
  const [status, setStatus] = useState<RealtimeStatus>('idle')
  const [state, setState] = useState<any>(null)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const wakeLockRef = useRef<any>(null)
  const mountedRef = useRef(true)

  // Aplica um novo state, expondo apenas state.actions (conforme contrato do hook).
  const applyState = useCallback((newState: any) => {
    if (!mountedRef.current) return
    setState(newState?.actions ?? null)
  }, [])

  const teardownChannel = useCallback(() => {
    if (channelRef.current) {
      // removeChannel também faz unsubscribe.
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
  }, [])

  const subscribe = useCallback(
    async (viewToken: string, matchId: string) => {
      try {
        setStatus('connecting')

        // Troca de sala: derruba o canal anterior, se houver.
        teardownChannel()

        // 1) Estado inicial (uma leitura) antes de escutar o broadcast.
        const initial = await getLiveMatchState(viewToken)
        if (!mountedRef.current) return
        if (initial) applyState(initial.state)

        // 2) Calcula o topic e se inscreve no canal de broadcast.
        const topic = await getLiveMatchTopic(viewToken, matchId)
        if (!mountedRef.current) return

        const channel = supabase.channel(topic)
        channel.on('broadcast', { event: 'match_state' }, (message) => {
          const payload = (message as any)?.payload
          if (payload?.state !== undefined) applyState(payload.state)
        })
        channel.subscribe((channelStatus) => {
          if (!mountedRef.current) return
          if (channelStatus === 'SUBSCRIBED') {
            setStatus('connected')
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
    [applyState, teardownChannel],
  )

  const create = useCallback(
    async (clubSlug?: string): Promise<LiveMatchRoom | null> => {
      try {
        setStatus('connecting')
        const room = await createLiveMatch(clubSlug)
        if (!mountedRef.current) return null
        // Já entra escutando a sala recém-criada.
        await subscribe(room.viewToken, room.id)
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
      subscribe(options.viewToken, options.matchId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.viewToken, options?.matchId])

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

  return { status, state, create, applyAction, subscribe }
}
