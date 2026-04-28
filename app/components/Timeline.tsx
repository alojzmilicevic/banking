'use client'
import { useEffect, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

interface Point {
  date: string
  total: number
}

interface Series {
  series: Point[]
  currency: string | null
  accounts: number
  errors?: string[]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function Timeline() {
  const [data, setData] = useState<Series | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    setError(null)
    return fetch('/api/timeseries')
      .then(async (r) => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || r.statusText)
        return d as Series
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    const onSync = () => load()
    window.addEventListener('banking:synced', onSync)
    return () => window.removeEventListener('banking:synced', onSync)
  }, [])

  if (loading && !data) {
    return (
      <div className="card">
        <h2>Total balance — last 12 months</h2>
        <p className="muted">Loading…</p>
      </div>
    )
  }
  if (error) return <div className="card"><div className="error">{error}</div></div>
  if (!data || data.series.length === 0) return null

  return (
    <div className="card">
      <h2 style={{ margin: 0 }}>Total balance — last 12 months</h2>
      <div style={{ height: 280, marginTop: '0.75rem' }}>
        <ResponsiveContainer>
          <LineChart data={data.series} margin={{ top: 10, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f242a" />
            <XAxis
              dataKey="date"
              stroke="#666"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: string) => {
                const d = new Date(v)
                return `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`
              }}
              minTickGap={40}
            />
            <YAxis
              stroke="#666"
              tick={{ fontSize: 11 }}
              tickFormatter={(v: number) => v.toLocaleString()}
              width={70}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                background: '#14171c',
                border: '1px solid #2a2f36',
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: '#888' }}
              formatter={(v: number) => [`${v.toLocaleString()} ${data.currency ?? ''}`, 'Total']}
              labelFormatter={(l: string) => l}
            />
            <Line type="monotone" dataKey="total" stroke="#6ea8ff" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {data.errors?.length ? (
        <p className="muted" style={{ fontSize: '0.75rem', color: '#ff8b8b', marginTop: '0.5rem' }}>
          {data.errors.length} account(s) errored: {data.errors.join('; ')}
        </p>
      ) : null}
    </div>
  )
}
