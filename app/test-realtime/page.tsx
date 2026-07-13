'use client'

// Página TEMPORÁRIA de teste do hook useRealtimeMatch.
// Serve apenas para validar create / applyAction / subscribe e o broadcast
// em tempo real entre abas/dispositivos. Pode ser removida depois.

import { useState } from 'react'
import { useRealtimeMatch } from '@/lib/hooks/use-realtime-match'
import type { LiveMatchRoom } from '@/lib/supabase/live-match'

export default function TestRealtimePage() {
  const rt = useRealtimeMatch()

  const [room, setRoom] = useState<LiveMatchRoom | null>(null)
  const [watchViewToken, setWatchViewToken] = useState('')
  const [watchMatchId, setWatchMatchId] = useState('')

  const handleCreate = async () => {
    const created = await rt.create('teste-flow')
    if (created) setRoom(created)
  }

  const handlePointA = async () => {
    if (!room) return
    await rt.applyAction(room.editToken, room.id, { kind: 'point', side: 'A' })
  }

  const handlePointB = async () => {
    if (!room) return
    await rt.applyAction(room.editToken, room.id, { kind: 'point', side: 'B' })
  }

  const handleUndo = async () => {
    if (!room) return
    await rt.applyAction(room.editToken, room.id, { kind: 'undo' })
  }

  const handleWatch = async () => {
    if (!watchViewToken.trim() || !watchMatchId.trim()) return
    await rt.subscribe(watchViewToken.trim(), watchMatchId.trim())
  }

  return (
    <div style={{ padding: 24, fontFamily: 'monospace', maxWidth: 760, margin: '0 auto' }}>
      <h1>Teste Realtime — useRealtimeMatch</h1>
      <p style={{ color: '#888' }}>Página temporária de validação. Remover depois.</p>

      {/* Status + state ao vivo */}
      <section style={{ margin: '16px 0', padding: 12, border: '1px solid #ccc', borderRadius: 8 }}>
        <div>
          <strong>status:</strong>{' '}
          <span
            style={{
              padding: '2px 8px',
              borderRadius: 4,
              background:
                rt.status === 'connected'
                  ? '#c8f7c5'
                  : rt.status === 'error'
                    ? '#f7c5c5'
                    : '#eee',
            }}
          >
            {rt.status}
          </span>
        </div>
        <div style={{ marginTop: 8 }}>
          <strong>state (state.actions ao vivo):</strong>
          <pre
            style={{
              background: '#111',
              color: '#0f0',
              padding: 12,
              borderRadius: 6,
              overflow: 'auto',
              maxHeight: 260,
            }}
          >
            {rt.state == null ? '(null — sem estado ainda)' : JSON.stringify(rt.state, null, 2)}
          </pre>
        </div>
      </section>

      {/* Aba 1 — operador */}
      <section style={{ margin: '16px 0', padding: 12, border: '1px solid #ccc', borderRadius: 8 }}>
        <h2>Aba 1 — Operador (cria e marca)</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleCreate}>Criar sala</button>
          <button onClick={handlePointA} disabled={!room}>
            Marcar ponto A
          </button>
          <button onClick={handlePointB} disabled={!room}>
            Marcar ponto B
          </button>
          <button onClick={handleUndo} disabled={!room}>
            Undo
          </button>
        </div>

        {room && (
          <div style={{ marginTop: 12 }}>
            <div>
              <strong>id (matchId):</strong> <code>{room.id}</code>
            </div>
            <div>
              <strong>viewToken:</strong> <code>{room.viewToken}</code>
            </div>
            <div>
              <strong>editToken:</strong> <code>{room.editToken}</code>
            </div>
            <p style={{ color: '#888', marginTop: 8 }}>
              Copie o <strong>viewToken</strong> e o <strong>id</strong> para a Aba 2 (espectador).
            </p>
          </div>
        )}
      </section>

      {/* Aba 2 — espectador */}
      <section style={{ margin: '16px 0', padding: 12, border: '1px solid #ccc', borderRadius: 8 }}>
        <h2>Aba 2 — Espectador (só assiste)</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            placeholder="viewToken"
            value={watchViewToken}
            onChange={(e) => setWatchViewToken(e.target.value)}
            style={{ padding: 8 }}
          />
          <input
            placeholder="matchId (id)"
            value={watchMatchId}
            onChange={(e) => setWatchMatchId(e.target.value)}
            style={{ padding: 8 }}
          />
          <button onClick={handleWatch}>Assistir</button>
        </div>
        <p style={{ color: '#888', marginTop: 8 }}>
          Depois de "Assistir", o <strong>state</strong> acima deve mudar sozinho quando a Aba 1
          marcar pontos — sem recarregar.
        </p>
      </section>
    </div>
  )
}
