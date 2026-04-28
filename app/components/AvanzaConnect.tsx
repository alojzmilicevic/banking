'use client'
import { useState } from 'react'

interface Props {
  onConnected: () => void
}

interface ExtractedCookies {
  cookieHeader: string
  names: string[]
  count: number
}

export default function AvanzaConnect({ onConnected }: Props) {
  const [phase, setPhase] = useState<'idle' | 'extracting' | 'connecting' | 'complete' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [cookies, setCookies] = useState('')
  const [extracted, setExtracted] = useState<ExtractedCookies | null>(null)
  const [copied, setCopied] = useState(false)

  async function readFromChrome() {
    setPhase('extracting')
    setMessage(null)
    setExtracted(null)
    try {
      const res = await fetch('/api/avanza/extract-cookies')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setExtracted(data as ExtractedCookies)
      setCookies((data as ExtractedCookies).cookieHeader)
      setPhase('idle')
    } catch (e) {
      setMessage((e as Error).message)
      setPhase('error')
    }
  }

  async function copyToClipboard() {
    if (!cookies) return
    try {
      await navigator.clipboard.writeText(cookies)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch (e) {
      setMessage(`Copy failed: ${(e as Error).message}`)
    }
  }

  async function connect() {
    if (!cookies.trim()) {
      setMessage('No cookies to connect with')
      return
    }
    setPhase('connecting')
    setMessage(null)
    try {
      const res = await fetch('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'avanza',
          flow: 'cookies',
          input: { cookies: cookies.trim() },
        }),
      })
      const data = await res.json()
      if (!res.ok || data.kind === 'error' || data.kind !== 'complete') {
        throw new Error(data.message ?? data.error ?? `HTTP ${res.status}`)
      }
      setMessage('Connected — running initial sync…')
      setPhase('complete')
      setCookies('')
      setExtracted(null)
      setTimeout(() => onConnected(), 1500)
    } catch (e) {
      setMessage((e as Error).message)
      setPhase('error')
    }
  }

  function reset() {
    setPhase('idle')
    setMessage(null)
  }

  const busy = phase === 'extracting' || phase === 'connecting'

  return (
    <div className="card">
      <h2 style={{ margin: 0 }}>Connect Avanza</h2>

      {phase !== 'complete' && phase !== 'error' && (
        <>
          <p className="muted" style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
            Log in to <code>avanza.se</code> in Chrome, then click below. We'll read your
            session cookies straight from the local Chrome profile (macOS Keychain may
            prompt the first time).
          </p>

          <div className="row" style={{ gap: '0.5rem' }}>
            <button onClick={readFromChrome} disabled={busy}>
              {phase === 'extracting' ? 'Reading…' : 'Read from Chrome'}
            </button>
            <button
              onClick={connect}
              disabled={busy || !cookies.trim()}
              style={{ background: cookies.trim() ? '#2d6cdf' : '#1f242a' }}
            >
              {phase === 'connecting' ? 'Connecting…' : 'Use these cookies'}
            </button>
          </div>

          {extracted && (
            <div
              className="muted"
              style={{
                marginTop: '0.75rem',
                fontSize: '0.8rem',
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center',
              }}
            >
              <span>
                ✓ {extracted.count} cookies extracted ({extracted.names.includes('csid') ? 'auth ✓' : 'auth ✗'})
              </span>
              <button
                onClick={copyToClipboard}
                style={{
                  background: '#1f242a',
                  fontSize: '0.7rem',
                  padding: '0.2rem 0.5rem',
                }}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}

          <textarea
            value={cookies}
            onChange={(e) => setCookies(e.target.value)}
            placeholder="…or paste a Cookie header here manually (csid=...; cstoken=...; AZACSRF=...; ...)"
            style={{
              width: '100%',
              minHeight: '4.5rem',
              fontFamily: 'ui-monospace, monospace',
              fontSize: '0.7rem',
              marginTop: '0.5rem',
            }}
          />

          {message && (
            <div className="error" style={{ marginTop: '0.5rem' }}>{message}</div>
          )}
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
