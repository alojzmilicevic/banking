'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Timeline from './components/Timeline'

interface ASPSP {
  name: string
  country: string
  logo?: string
  beta?: boolean
  maximum_consent_validity?: number
  psu_types?: string[]
}

interface AccountSummary {
  id: string
  name?: string | null
  details?: string | null
  product?: string | null
  currency?: string | null
  iban?: string | null
}

interface ConnectionView {
  id: string
  providerId: string
  label: string | null
  status: string
  validUntil: number | null
  lastSyncedAt: number | null
  initialSyncedAt: number | null
  accounts: AccountSummary[]
}

function key(a: ASPSP) {
  return `${a.name}||${a.country}`
}

function daysFromNow(ms: number | null) {
  if (!ms) return null
  return Math.max(0, Math.round((ms - Date.now()) / 86400_000))
}

function timeAgo(ms: number | null) {
  if (!ms) return 'never'
  const sec = Math.floor((Date.now() - ms) / 1000)
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`
  return `${Math.floor(sec / 86400)}d ago`
}

function accountLabel(a: AccountSummary) {
  return a.details || a.product || a.name || a.iban || a.id
}

export default function Home() {
  const [aspsps, setAspsps] = useState<ASPSP[]>([])
  const [country, setCountry] = useState('SE')
  const [selected, setSelected] = useState('')
  const [connectionsList, setConnectionsList] = useState<ConnectionView[]>([])
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadAspsps(c: string) {
    setError(null)
    try {
      const res = await fetch(`/api/institutions?country=${c}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      setAspsps(data)
    } catch (e) {
      setError((e as Error).message)
      setAspsps([])
    }
  }

  async function loadConnections() {
    try {
      const res = await fetch('/api/accounts')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      setConnectionsList(data)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    loadAspsps(country)
  }, [country])

  useEffect(() => {
    loadConnections()
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err) setError(err)
  }, [])

  async function connect() {
    if (!selected) return
    setConnecting(true)
    setError(null)
    try {
      const aspsp = aspsps.find((a) => key(a) === selected)
      if (!aspsp) throw new Error('aspsp not found')
      const res = await fetch('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'enable-banking',
          extra: { aspspName: aspsp.name, aspspCountry: aspsp.country },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      window.location.href = data.url
    } catch (e) {
      setError((e as Error).message)
      setConnecting(false)
    }
  }

  async function syncAll() {
    setSyncing(true)
    setError(null)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || res.statusText)
      await loadConnections()
      // Force the timeline to refetch
      window.dispatchEvent(new CustomEvent('banking:synced'))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  return (
    <main>
      <h1>Banking</h1>
      {error && <div className="error">{error}</div>}

      <Timeline />

      <div className="card">
        <h2>Connect a bank</h2>
        <div className="row">
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="SE">Sweden</option>
            <option value="NO">Norway</option>
            <option value="DK">Denmark</option>
            <option value="FI">Finland</option>
            <option value="DE">Germany</option>
            <option value="GB">UK</option>
          </select>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ flex: 1 }}>
            <option value="">Select an institution…</option>
            {aspsps.map((a) => {
              const days = a.maximum_consent_validity
                ? Math.floor(a.maximum_consent_validity / 86400)
                : null
              return (
                <option key={key(a)} value={key(a)}>
                  {a.name}
                  {days ? ` — ${days}d max consent` : ''}
                  {a.beta ? ' (beta)' : ''}
                </option>
              )
            })}
          </select>
          <button onClick={connect} disabled={!selected || connecting}>
            {connecting ? 'Redirecting…' : 'Connect'}
          </button>
        </div>
        <p className="muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          You'll be redirected to the bank for BankID auth. Re-auth needed when consent expires.
        </p>
      </div>

      <div className="card">
        <div className="row between">
          <h2 style={{ margin: 0 }}>Linked banks</h2>
          <button onClick={syncAll} style={{ background: '#1f242a' }} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
        {connectionsList.length === 0 && (
          <p className="muted" style={{ marginTop: '0.75rem' }}>No banks connected yet.</p>
        )}
        {connectionsList.map((c) => {
          const days = daysFromNow(c.validUntil)
          return (
            <div
              key={c.id}
              style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #1f242a' }}
            >
              <div className="row between">
                <strong>{c.label ?? c.providerId}</strong>
                <span className="muted">
                  {c.lastSyncedAt ? `synced ${timeAgo(c.lastSyncedAt)}` : 'never synced'} ·{' '}
                  <span className={days !== null && days < 7 ? 'amount-neg' : ''}>
                    {days !== null
                      ? days > 0
                        ? `consent ${days}d`
                        : 'consent expired'
                      : c.status}
                  </span>
                </span>
              </div>
              {c.accounts.length > 0 ? (
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem' }}>
                  {c.accounts.map((a) => (
                    <li key={a.id}>
                      <Link href={`/account/${a.id}`}>{accountLabel(a)}</Link>
                      {a.product && a.details ? <span className="muted"> · {a.product}</span> : null}
                      {a.currency ? <span className="muted"> · {a.currency}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted" style={{ marginTop: '0.25rem' }}>No accounts on this connection.</p>
              )}
            </div>
          )
        })}
      </div>
    </main>
  )
}
