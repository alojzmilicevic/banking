'use client'
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

type Challenge =
  | { kind: 'redirect'; url: string; state: string; expiresAt: number }
  | {
      kind: 'polling'
      state: string
      pollEveryMs: number
      expiresAt: number
      instructions: string
      hint?: { qrToken?: string; transactionId?: string; rfa?: string; hintCode?: string }
    }
  | { kind: 'complete'; connectionId: string }
  | { kind: 'error'; state?: string; message: string }

interface Props {
  onConnected: () => void
}

type Mode = 'bankid' | 'cookies'

export default function AvanzaConnect({ onConnected }: Props) {
  const [mode, setMode] = useState<Mode>('bankid')
  const [phase, setPhase] = useState<'idle' | 'polling' | 'complete' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [qrSvg, setQrSvg] = useState<string | null>(null)
  const [pastedCookies, setPastedCookies] = useState('')
  const pollAbort = useRef<AbortController | null>(null)

  useEffect(() => () => pollAbort.current?.abort(), [])

  async function renderQr(token: string) {
    try {
      const svg = await QRCode.toString(token, {
        type: 'svg',
        margin: 1,
        color: { dark: '#e6e8eb', light: '#0b0d10' },
        width: 240,
      })
      setQrSvg(svg)
    } catch (e) {
      console.error('QR render failed', e)
    }
  }

  async function startBankid() {
    if (phase === 'polling') return
    setMessage(null)
    setQrSvg(null)
    setPhase('polling')

    try {
      const res = await fetch('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId: 'avanza', flow: 'bankid', input: {} }),
      })
      const data = (await res.json()) as Challenge & { error?: string }
      if (!res.ok || data.kind === 'error') {
        setMessage(
          data.kind === 'error'
            ? data.message
            : data.error || `HTTP ${res.status}: failed to start`,
        )
        setPhase('error')
        return
      }
      if (data.kind !== 'polling') {
        setMessage(`Unexpected challenge kind: ${data.kind}`)
        setPhase('error')
        return
      }
      setMessage(data.instructions)
      if (data.hint?.qrToken) await renderQr(data.hint.qrToken)
      await pollUntilDone(data.state, data.pollEveryMs)
    } catch (e) {
      setMessage((e as Error).message)
      setPhase('error')
    }
  }

  async function startCookies() {
    setMessage(null)
    if (!pastedCookies.trim()) {
      setMessage('Paste your Cookie header first')
      return
    }
    setPhase('polling')
    try {
      const res = await fetch('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'avanza',
          flow: 'cookies',
          input: { cookies: pastedCookies.trim() },
        }),
      })
      const data = (await res.json()) as Challenge & { error?: string }
      if (!res.ok || data.kind === 'error' || data.kind !== 'complete') {
        setMessage(
          data.kind === 'error'
            ? data.message
            : data.error || `HTTP ${res.status}: failed`,
        )
        setPhase('error')
        return
      }
      setMessage('Connected — check sync status in Linked banks below')
      setPhase('complete')
      setPastedCookies('')
      setTimeout(() => onConnected(), 1500)
    } catch (e) {
      setMessage((e as Error).message)
      setPhase('error')
    }
  }

  async function pollUntilDone(state: string, intervalMs: number) {
    pollAbort.current?.abort()
    const ctrl = new AbortController()
    pollAbort.current = ctrl

    const deadline = Date.now() + 5 * 60 * 1000

    while (!ctrl.signal.aborted && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, intervalMs))
      if (ctrl.signal.aborted) return
      let data: Challenge
      try {
        const res = await fetch(`/api/auth/poll?state=${state}`, { signal: ctrl.signal })
        data = (await res.json()) as Challenge
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setMessage((e as Error).message)
        setPhase('error')
        return
      }
      if (data.kind === 'complete') {
        setMessage('Connected — check sync status in Linked banks below')
        setQrSvg(null)
        setPhase('complete')
        setTimeout(() => onConnected(), 1500)
        return
      }
      if (data.kind === 'error') {
        setMessage(data.message)
        setPhase('error')
        return
      }
      if (data.kind === 'polling') {
        setMessage(data.instructions)
        if (data.hint?.qrToken) await renderQr(data.hint.qrToken)
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
    setQrSvg(null)
  }

  return (
    <div className="card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>Connect Avanza</h2>
        {phase === 'idle' && (
          <div className="row" style={{ gap: '0.25rem' }}>
            <button
              onClick={() => setMode('bankid')}
              style={{
                background: mode === 'bankid' ? '#2d6cdf' : '#1f242a',
                fontSize: '0.8rem',
              }}
            >
              BankID
            </button>
            <button
              onClick={() => setMode('cookies')}
              style={{
                background: mode === 'cookies' ? '#2d6cdf' : '#1f242a',
                fontSize: '0.8rem',
              }}
            >
              Paste cookies
            </button>
          </div>
        )}
      </div>

      {phase === 'idle' && mode === 'bankid' && (
        <>
          <button onClick={startBankid} style={{ marginTop: '0.75rem' }}>
            Connect with BankID
          </button>
          <p className="muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
            Scan a QR with your BankID app. Session lasts ~60 min.
          </p>
        </>
      )}

      {phase === 'idle' && mode === 'cookies' && (
        <>
          <p className="muted" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
            On <code>avanza.se</code> while logged in: F12 → Network tab → click any{' '}
            <code>/_api/...</code> request → Headers → Request Headers → right-click the{' '}
            <code>Cookie</code> value → Copy value. Paste below.
          </p>
          <textarea
            value={pastedCookies}
            onChange={(e) => setPastedCookies(e.target.value)}
            placeholder="csid=...; cstoken=...; AZAHLI=...; AZACSRF=...; ..."
            style={{
              width: '100%',
              minHeight: '5rem',
              fontFamily: 'ui-monospace, monospace',
              fontSize: '0.75rem',
            }}
          />
          <button onClick={startCookies} disabled={!pastedCookies.trim()} style={{ marginTop: '0.5rem' }}>
            Use these cookies
          </button>
          {message && <div className="error" style={{ marginTop: '0.5rem' }}>{message}</div>}
        </>
      )}

      {phase === 'polling' && (
        <>
          <p style={{ marginTop: '0.5rem' }}>
            <strong>{message ?? 'Awaiting BankID…'}</strong>
          </p>
          {qrSvg && (
            <div
              style={{ width: 240, marginTop: '0.5rem' }}
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          )}
          <button onClick={reset} className="danger" style={{ marginTop: '0.75rem' }}>
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
