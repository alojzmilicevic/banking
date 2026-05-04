// Aloma growth chart. Renders a Combined area + one Line per holder +
// one Line for the Shared bucket. The series come from /api/timeseries
// which now keys by holderId, so the chart configuration is a loop —
// adding a household member doesn't require a code change here.

import { useEffect, useRef } from 'react'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Alert } from '@/components/ui/alert'
import { useTimeseries } from '@/lib/queries'
import { SHARED_META } from '@/lib/holders'
import type { DashboardHolder } from '@/lib/api/dashboard'
import { ChartShape } from './skeleton-shapes'
import type { Period } from './PeriodTabs'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const COMBINED_COLOR = 'oklch(65% 0.18 265)' // Indigo

function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return String(v)
}

// Snapshot of "current period" totals + change pill, by view key. Driven
// up to HomeContent so the topbar and SummaryCards can render without
// re-running the chart math.
export interface TimelineSnapshot {
  total: number | null
  shared: number | null
  // 'all' | <holderId> | 'shared' → amount for that view at the latest
  // datapoint. Mirrors the topbar's view-selector keys.
  byHolder: Record<string, number | null>
  changeByKey: Record<string, { absolute: number | null; pct: number | null } | null>
  currency: string | null
  changeAbsolute: number | null
  changePct: number | null
}

function deltaPct(now: number | null, then: number | null): number | null {
  if (now == null || then == null || then === 0 || !Number.isFinite((now - then) / then)) return null
  return Math.round(((now - then) / Math.abs(then)) * 10000) / 100
}

export function Timeline({
  period,
  holders,
  showCombined,
  visibleHolderIds,
  showShared,
  onSnapshotChange,
}: {
  period: Period
  holders: DashboardHolder[]
  showCombined: boolean
  visibleHolderIds: string[]
  showShared: boolean
  onSnapshotChange?: (snap: TimelineSnapshot) => void
}) {
  const { data, error, isLoading } = useTimeseries(period)

  const series = data?.series ?? []
  const last = series.length > 0 ? series[series.length - 1] : null
  const first = series.length > 0 ? series[0] : null

  const total = last?.total ?? null
  const startTotal = first?.total ?? null
  const shared = last?.shared ?? null
  const startShared = first?.shared ?? null
  const currency = data?.currency ?? null

  const changeAbsolute =
    total != null && startTotal != null ? Math.round((total - startTotal) * 100) / 100 : null
  const changePct = deltaPct(total, startTotal)

  // Per-holder current + change pills, keyed by holderId. 'shared' and
  // 'all' get folded into changeByKey so MobileLayout / Topbar can index
  // by ViewSelection directly.
  const byHolder: Record<string, number | null> = {}
  const changeByKey: Record<string, { absolute: number | null; pct: number | null } | null> = {
    all: { absolute: changeAbsolute, pct: changePct },
    shared:
      shared != null && startShared != null
        ? {
            absolute: Math.round((shared - startShared) * 100) / 100,
            pct: deltaPct(shared, startShared),
          }
        : null,
  }
  for (const h of holders) {
    const now = last?.byHolder[h.id] ?? null
    const then = first?.byHolder[h.id] ?? null
    byHolder[h.id] = now
    changeByKey[h.id] =
      now != null && then != null
        ? { absolute: Math.round((now - then) * 100) / 100, pct: deltaPct(now, then) }
        : null
  }

  // Push the snapshot upward whenever the relevant inputs change. The
  // dynamic-key maps are rebuilt every render (new refs), so we dep on
  // their JSON signatures and rehydrate inside the effect — keeps the
  // effect body free of references that exhaustive-deps would flag, and
  // avoids ref-mutation-during-render that the React Compiler skips.
  const onSnapshotChangeRef = useRef(onSnapshotChange)
  useEffect(() => {
    onSnapshotChangeRef.current = onSnapshotChange
  }, [onSnapshotChange])
  const byHolderKey = JSON.stringify(byHolder)
  const changeByKeyKey = JSON.stringify(changeByKey)
  useEffect(() => {
    onSnapshotChangeRef.current?.({
      total,
      shared,
      byHolder: JSON.parse(byHolderKey) as Record<string, number | null>,
      changeByKey: JSON.parse(changeByKeyKey) as Record<
        string,
        { absolute: number | null; pct: number | null } | null
      >,
      currency,
      changeAbsolute,
      changePct,
    })
  }, [total, shared, currency, changeAbsolute, changePct, byHolderKey, changeByKeyKey])

  if (error) {
    return (
      <div className="rounded-16 border border-border-subtle bg-card/40 p-5">
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

  // Recharts wants flat-keyed data; flatten the byHolder map into top-level
  // keys (one per holder id) so dataKey={holderId} works.
  const chartData = series.map((p) => ({
    date: p.date,
    total: p.total,
    cash: p.cash,
    investment: p.investment,
    shared: p.shared,
    unassigned: p.unassigned,
    ...p.byHolder,
  }))

  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-16 border border-border-subtle bg-white/2 px-4 py-3.5 lg:px-6 lg:py-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 lg:mb-4">
        <span className="text-11 font-medium uppercase tracking-eyebrow text-text-faint">
          Growth · {period === 'ALL' ? 'All' : period}
        </span>
        <div className="flex flex-wrap gap-x-3 gap-y-1 lg:gap-4">
          {showCombined && <LegendDot color={COMBINED_COLOR} label="Combined" />}
          {holders
            .filter((h) => visibleHolderIds.includes(h.id))
            .map((h) => (
              <LegendDot key={h.id} color={h.color} label={h.label} />
            ))}
          {showShared && <LegendDot color={SHARED_META.color} label={SHARED_META.label} />}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {isLoading && series.length === 0 ? (
          <ChartShape />
        ) : series.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No history yet — connect a bank to see the chart.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="combined-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COMBINED_COLOR} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={COMBINED_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="rgba(255,255,255,0.3)"
                tick={{ fontSize: 11 }}
                tickFormatter={tickFormatter}
                minTickGap={40}
                tickLine={false}
                axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              />
              <YAxis
                stroke="rgba(255,255,255,0.3)"
                tick={{ fontSize: 11 }}
                tickFormatter={fmtCompact}
                width={50}
                domain={['auto', 'auto']}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1 }}
                contentStyle={{
                  background: 'var(--color-elevated)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 10,
                  fontSize: 12,
                  padding: '8px 12px',
                }}
                labelStyle={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                formatter={(v: number, name: string) => [
                  `${v.toLocaleString('sv-SE')} ${currency ?? ''}`,
                  name,
                ]}
                labelFormatter={(l: string) => l}
              />

              {showCombined && (
                <Area
                  type="monotone"
                  dataKey="total"
                  name="Combined"
                  stroke={COMBINED_COLOR}
                  strokeWidth={2}
                  fill="url(#combined-fill)"
                  activeDot={{ r: 4, fill: COMBINED_COLOR, strokeWidth: 0 }}
                  isAnimationActive
                  animationDuration={600}
                />
              )}
              {holders
                .filter((h) => visibleHolderIds.includes(h.id))
                .map((h) => (
                  <Line
                    key={h.id}
                    type="monotone"
                    dataKey={h.id}
                    name={h.label}
                    stroke={h.color}
                    strokeWidth={1.5}
                    dot={false}
                    activeDot={{ r: 3, fill: h.color, strokeWidth: 0 }}
                    isAnimationActive
                    animationDuration={600}
                  />
                ))}
              {showShared && (
                <Line
                  type="monotone"
                  dataKey="shared"
                  name={SHARED_META.label}
                  stroke={SHARED_META.color}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3, fill: SHARED_META.color, strokeWidth: 0 }}
                  isAnimationActive
                  animationDuration={600}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {data?.errors?.length ? (
        <p className="mt-2 text-xs text-neg">
          {data.errors.length} account(s) errored: {data.errors.join('; ')}
        </p>
      ) : null}
    </div>
  )
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        style={{ '--dot': color } as React.CSSProperties}
        className="h-0.5 w-4.5 rounded-1 bg-(--dot)"
        aria-hidden
      />
      <span className="text-12 text-text-faint">{label}</span>
    </div>
  )
}
