'use client'
// The dashboard's primary chart. Period state is lifted up — the parent
// owns it so the WealthHero change pill stays in sync with the chart.

import { useEffect, useRef } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { motion } from 'motion/react'
import { Alert } from '@/components/ui/alert'
import { useTimeseries } from '@/lib/queries'
import PeriodTabs, { type Period } from './PeriodTabs'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return String(v)
}

export interface TimelineSnapshot {
  total: number | null
  currency: string | null
  changeAbsolute: number | null
  changePct: number | null
}

export default function Timeline({
  period,
  onPeriodChange,
  onSnapshotChange,
}: {
  period: Period
  onPeriodChange: (p: Period) => void
  onSnapshotChange?: (snap: TimelineSnapshot) => void
}) {
  const { data, error, isLoading } = useTimeseries(period)

  const series = data?.series ?? []
  const last = series.length > 0 ? series[series.length - 1] : null
  const first = series.length > 0 ? series[0] : null
  const total = last?.total ?? null
  const startTotal = first?.total ?? null
  const changeAbsolute =
    total != null && startTotal != null ? Math.round((total - startTotal) * 100) / 100 : null
  const changePct =
    total != null && startTotal != null && startTotal !== 0
      ? Math.round(((total - startTotal) / Math.abs(startTotal)) * 10000) / 100
      : null
  const currency = data?.currency ?? null

  const cbRef = useRef(onSnapshotChange)
  cbRef.current = onSnapshotChange
  useEffect(() => {
    cbRef.current?.({ total, currency, changeAbsolute, changePct })
  }, [total, currency, changeAbsolute, changePct])

  if (error) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <Alert>{error.message}</Alert>
      </div>
    )
  }

  const tickFormatter = (v: string) => {
    const d = new Date(v)
    if (period === '1W' || period === '1M' || period === '3M') {
      return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
    }
    return `${MONTHS[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`
  }

  const positive = series.length < 2 ? true : series[series.length - 1].total >= series[0].total
  const stroke = positive ? '#6ee7a7' : '#ff8b8b'

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Wealth over time
        </p>
        <PeriodTabs value={period} onChange={onPeriodChange} />
      </div>
      <div className="h-[280px] w-full px-1 pb-3">
        {isLoading && series.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : series.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No history yet — connect a bank to see your wealth chart.
          </div>
        ) : (
          <ResponsiveContainer>
            <AreaChart data={series} margin={{ top: 10, right: 16, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="wealth-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#1f242a" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="#666"
                tick={{ fontSize: 11 }}
                tickFormatter={tickFormatter}
                minTickGap={40}
                tickLine={false}
                axisLine={{ stroke: '#1f242a' }}
              />
              <YAxis
                stroke="#666"
                tick={{ fontSize: 11 }}
                tickFormatter={fmtCompact}
                width={50}
                domain={['auto', 'auto']}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ stroke: '#2a2f36', strokeWidth: 1 }}
                contentStyle={{
                  background: '#14171c',
                  border: '1px solid #2a2f36',
                  borderRadius: 8,
                  fontSize: 12,
                  padding: '8px 12px',
                }}
                labelStyle={{ color: '#888', fontSize: 11 }}
                formatter={(v: number) => [
                  `${v.toLocaleString('sv-SE')} ${data?.currency ?? ''}`,
                  'Total',
                ]}
                labelFormatter={(l: string) => l}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke={stroke}
                strokeWidth={2}
                fill="url(#wealth-fill)"
                activeDot={{ r: 4, fill: stroke, strokeWidth: 0 }}
                isAnimationActive
                animationDuration={600}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {data?.errors?.length ? (
        <p className="px-5 pb-3 text-xs text-neg">
          {data.errors.length} account(s) errored: {data.errors.join('; ')}
        </p>
      ) : null}
    </motion.div>
  )
}
