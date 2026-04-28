'use client'
import { useEffect, useRef, useState } from 'react'

type Challenge =
  | { kind: 'redirect'; url: string; state: string; expiresAt: number }
  | {
      kind: 'polling'
      state: string
      pollEveryMs: number
      expiresAt: number
      instructions: string
      hint?: Record<string, unknown>
    }
  | { kind: 'pending'; state: string; instructions: string; hint?: Record<string, unknown> }
  | { kind: 'complete'; connectionId: string }
  | { kind: 'error'; state?: string; message: string }

interface Props {
  onConnected: () => void
}

export default function AvanzaConnect({ onConnected }: Props) {
  const [personnummer, setPersonnummer] = useState('')
  const [phase, setPhase] = useState<'idle' | 'polling' | 'complete' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const pollAbort = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => pollAbort.current?.abort()
  }, [])

  async function start() {
    if (phase === 'polling') return
    setMessage(null)
    setPhase('polling')

    try {
      const res = await fetch('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'avanza',
          flow: 'bankid',
          input: { personnummer: personnummer.replace(/\s|-/g, '') },
        }),
      })
      const data: Challenge = await res.json()
      if (!res.ok || data.kind === 'error') {
        const msg = data.kind === 'error' ? data.message : 'Failed to start'
        setMessage(msg)
        setPhase('error')
        return
      }
      if (data.kind !== 'polling') {
        setMessage(`Unexpected challenge kind: ${data.kind}`)
        setPhase('error')
        return
      }
      setMessage(data.instructions)
      await pollUntilDone(data.state, data.pollEveryMs)
    } catch (e) {
      setMessage((e as Error).message)
      setPhase('error')
    }
  }

  async function pollUntilDone(state: string, intervalMs: number) {
    pollAbort.current?.abort()
    const ctrl = new AbortController()
    pollAbort.current = ctrl

    const deadline = Date.now() + 5 * 60 * 1000 // 5 min absolute cap

    while (!ctrl.signal.aborted && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, intervalMs))
      if (ctrl.signal.aborted) return
      const res = await fetch(`/api/auth/poll?state=${state}`, { signal: ctrl.signal })
      const data: Challenge = await res.json()
      if (data.kind === 'complete') {
        setMessage('Connected — running initial sync…')
        setPhase('complete')
        onConnected()
        return
      }
      if (data.kind === 'error') {
        setMessage(data.message)
        setPhase('error')
        return
      }
      if (data.kind === 'polling' || data.kind === 'pending') {
        setMessage(data.instructions)
      }
    }
    if (Date.now() >= deadline) {
      setMessage('BankID timed out — please try again')
      setPhase('error')
    }
  }

  function reset() {
    pollAbort.current?.abort()
    setPhase('idle')
    setMessage(null)
  }

  return (
    <div className="card">
      <h2>Connect Avanza</h2>
      {phase === 'idle' && (
        <>
          <div className="row" style={{ marginTop: '0.5rem' }}>
            <input
              type="tel"
              value={personnummer}
              onChange={(e) => setPersonnummer(e.target.value)}
              placeholder="Personnummer (YYYYMMDDXXXX)"
              style={{ flex: 1 }}
              inputMode="numeric"
            />
            <button onClick={start} disabled={!/^\d{8}-?\d{4}$/.test(personnummer.trim())}>
              Connect
            </button>
          </div>
          <p className="muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            You'll authorize on BankID on your phone. Session lasts ~60min — daily syncs need
            re-link until password+TOTP path is wired up.
          </p>
        </>
      )}

      {phase === 'polling' && (
        <>
          <p style={{ marginTop: '0.5rem' }}>
            <strong>Open BankID on your phone…</strong>
          </p>
          {message && <p className="muted">{message}</p>}
          <button onClick={reset} className="danger" style={{ marginTop: '0.5rem' }}>
            Cancel
          </button>
        </>
      )}

      {phase === 'complete' && (
        <>
          <p className="amount-pos" style={{ marginTop: '0.5rem' }}>
            <strong>Connected.</strong>
          </p>
          {message && <p className="muted">{message}</p>}
        </>
      )}

      {phase === 'error' && (
        <>
          <div className="error" style={{ marginTop: '0.5rem' }}>{message}</div>
          <button onClick={reset} style={{ marginTop: '0.5rem' }}>Try again</button>
        </>
      )}
    </div>
  )
}
