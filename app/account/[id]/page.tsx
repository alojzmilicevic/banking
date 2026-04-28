'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'

interface Tx {
  fingerprint: string
  date: string
  amount: number
  currency: string
  status: string | null
  description: string | null
  counterparty: string | null
}

interface Account {
  id: string
  name: string | null
  details: string | null
  product: string | null
  accountType: string | null
  currency: string | null
  iban: string | null
  bban: string | null
  bic: string | null
}

interface Connection {
  id: string
  providerId: string
  label: string | null
  validUntil: number | null
  lastSyncedAt: number | null
}

interface Balance {
  balanceType: string
  amount: number
  currency: string
  referenceDate: string | null
}

function describe(t: Tx) {
  return t.description || t.counterparty || '—'
}

function fmtAmount(amount: number, currency: string) {
  const cls = amount < 0 ? 'amount-neg' : amount > 0 ? 'amount-pos' : ''
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return (
    <span className={cls}>
      {formatted} {currency}
    </span>
  )
}

export default function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [account, setAccount] = useState<Account | null>(null)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [balances, setBalances] = useState<Balance[]>([])
  const [transactions, setTransactions] = useState<Tx[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)

    Promise.all([
      fetch(`/api/accounts/${id}`).then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || r.statusText)
        return d
      }),
      fetch(`/api/accounts/${id}/transactions`).then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || r.statusText)
        return d
      }),
    ])
      .then(([acc, tx]) => {
        if (!alive) return
        setAccount(acc.account)
        setConnection(acc.connection)
        setBalances(acc.balances || [])
        setTransactions(tx.transactions || [])
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => alive && setLoading(false))

    return () => {
      alive = false
    }
  }, [id])

  const title = account?.details || account?.product || account?.name || account?.iban || 'Account'

  return (
    <main>
      <p style={{ marginTop: 0 }}>
        <Link href="/">← back</Link>
      </p>
      <h1>{title}</h1>
      {error && <div className="error">{error}</div>}

      {account && (
        <div className="card">
          <h2>Details</h2>
          {connection?.label && (
            <p className="muted" style={{ margin: '0.25rem 0' }}>{connection.label}</p>
          )}
          {account.name && (
            <p className="muted" style={{ margin: '0.25rem 0' }}>Holder: {account.name}</p>
          )}
          {account.product && (
            <p className="muted" style={{ margin: '0.25rem 0' }}>Product: {account.product}</p>
          )}
          {account.iban && (
            <p className="muted" style={{ margin: '0.25rem 0' }}>IBAN: {account.iban}</p>
          )}
          {account.bban && (
            <p className="muted" style={{ margin: '0.25rem 0' }}>BBAN: {account.bban}</p>
          )}
          {account.bic && (
            <p className="muted" style={{ margin: '0.25rem 0' }}>BIC: {account.bic}</p>
          )}
          {account.currency && (
            <p className="muted" style={{ margin: '0.25rem 0' }}>Currency: {account.currency}</p>
          )}
          {account.accountType && (
            <p className="muted" style={{ margin: '0.25rem 0' }}>Type: {account.accountType}</p>
          )}
        </div>
      )}

      {balances.length > 0 && (
        <div className="card">
          <h2>Balances</h2>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Reference date</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b, i) => (
                <tr key={i}>
                  <td>{b.balanceType}</td>
                  <td className="muted">{b.referenceDate ?? '—'}</td>
                  <td className="num">{fmtAmount(b.amount, b.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>
          Transactions{' '}
          <span className="muted" style={{ fontWeight: 'normal' }}>({transactions.length})</span>
        </h2>
        {loading && <p className="muted">Loading…</p>}
        {!loading && transactions.length === 0 && (
          <p className="muted">No transactions stored yet — try Sync now.</p>
        )}
        {transactions.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr
                  key={t.fingerprint}
                  style={{ opacity: t.status && t.status !== 'BOOK' ? 0.6 : 1 }}
                >
                  <td>{t.date}</td>
                  <td>{describe(t)}</td>
                  <td className="muted">{t.status || ''}</td>
                  <td className="num">{fmtAmount(t.amount, t.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  )
}
