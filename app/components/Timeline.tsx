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

type Period = '1W' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL'

const PERIODS: { id: Period; label: string }[] = [
  { id: '1W', label: '1W' },
  { id: '1M', label: '1M' },
  { id: '3M', label: '3M' },
  { id: '6M', label: '6M' },
  { id: 'YTD', label: 'YTD' },
  { id: '1Y', label: '1Y' },
  { id: 'ALL', label: 'All' },
]

interface Point {
  date: string
  total: number
  cash?: number
  investments?: number
}

interface Series {
  series: Point[]
  currency: string | null
  accounts: number
  period: Period
  errors?: string[]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function Timeline() {
  const [period, setPeriod] = useState<Period>('1Y')
  const [data, setData] = useState<Series | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  function load(p: Period) {
    setLoading(true)
    setError(null)
    return fetch(`/api/timeseries?period=${p}`)
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
    load(period)
    const onSync = () => load(period)
    window.addEventListener('banking:synced', onSync)
    return () => window.removeEventListener('banking:synced', onSync)
  }, [period])

  if (loading && !data) {
    return (
      <div className="card">
        <h2>Total balance</h2>
        <p className="muted">Loading…</p>
      </div>
    )
  }
  if (error) return <div className="card"><div className="error">{error}</div></div>
  if (!data || data.series.length === 0) return null

  const tickFormatter = (v: string) => {
    const d = new Date(v)
    if (period === '1W' || period === '1M' || period === '3M') {
      // Day-month for short ranges
      return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
    }
    return `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`
  }

  return (
    <div className="card">
      <div className="row between" style={{ alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Total balance</h2>
        <div className="row" style={{ gap: '0.25rem' }}>
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              style={{
                background: period === p.id ? '#2d6cdf' : '#1f242a',
                fontSize: '0.75rem',
                padding: '0.25rem 0.6rem',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height: 280, marginTop: '0.75rem' }}>
        <ResponsiveContainer>
          <LineChart data={data.series} margin={{ top: 10, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f242a" />
            <XAxis
              dataKey="date"
              stroke="#666"
              tick={{ fontSize: 11 }}
              tickFormatter={tickFormatter}
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
            <Line
              type="linear"
              dataKey="total"
              stroke="#6ea8ff"
              strokeWidth={2}
              // Show daily dots only on short ranges so the user can see
              // each real data point. Long ranges have too many points
              // for dots to be useful.
              dot={
                period === '1W' || period === '1M'
                  ? { r: 2.5, fill: '#6ea8ff', strokeWidth: 0 }
                  : false
              }
              activeDot={{ r: 4, fill: '#6ea8ff' }}
            />
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
