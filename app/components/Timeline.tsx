'use client'
// Aloma growth chart. Up to three lines:
//   • Combined (filled area, indigo) — toggleable from the sidebar
//   • Alojz total (teal, line only)
//   • Alma total (violet, line only)
//
// The series come from /api/timeseries which carries `total`, `alma`,
// `alojz` per day (from the snapshot rebuild's per-holder breakdown).

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
import type { Period } from './PeriodTabs'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const PERSON_A_COLOR = 'oklch(70% 0.13 195)' // Alojz — teal
const PERSON_B_COLOR = 'oklch(70% 0.16 300)' // Alma — violet
const COMBINED_COLOR = 'oklch(65% 0.18 265)' // Indigo
const SHARED_COLOR = 'oklch(72% 0.15 350)' // Shared — rose/pink

function fmtCompact(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return String(v)
}

export interface TimelineSnapshot {
  total: number | null
  alma: number | null
  alojz: number | null
  joint: number | null
  currency: string | null
  changeAbsolute: number | null
  changePct: number | null
  // Per-holder period delta + pct so SummaryCards can render their pill.
  almaChangeAbsolute: number | null
  almaChangePct: number | null
  alojzChangeAbsolute: number | null
  alojzChangePct: number | null
  jointChangeAbsolute: number | null
  jointChangePct: number | null
}

function deltaPct(a: number | null, b: number | null): number | null {
  if (a == null || b == null || b === 0 || !Number.isFinite((a - b) / b)) return null
  return Math.round(((a - b) / Math.abs(b)) * 10000) / 100
}

export default function Timeline({
  period,
  showCombined,
  showAlojz,
  showAlma,
  showShared,
  onSnapshotChange,
}: {
  period: Period
  showCombined: boolean
  showAlojz: boolean
  showAlma: boolean
  showShared: boolean
  onSnapshotChange?: (snap: TimelineSnapshot) => void
}) {
  const { data, error, isLoading } = useTimeseries(period)

  const series = data?.series ?? []
  const last = series.length > 0 ? series[series.length - 1] : null
  const first = series.length > 0 ? series[0] : null

  const total = last?.total ?? null
  const alma = last?.alma ?? null
  const alojz = last?.alojz ?? null
  const joint = last?.joint ?? null
  const startTotal = first?.total ?? null
  const startAlma = first?.alma ?? null
  const startAlojz = first?.alojz ?? null
  const startJoint = first?.joint ?? null

  const changeAbsolute =
    total != null && startTotal != null ? Math.round((total - startTotal) * 100) / 100 : null
  const changePct = deltaPct(total, startTotal)
  const almaChangeAbsolute =
    alma != null && startAlma != null ? Math.round((alma - startAlma) * 100) / 100 : null
  const almaChangePct = deltaPct(alma, startAlma)
  const alojzChangeAbsolute =
    alojz != null && startAlojz != null ? Math.round((alojz - startAlojz) * 100) / 100 : null
  const alojzChangePct = deltaPct(alojz, startAlojz)
  const jointChangeAbsolute =
    joint != null && startJoint != null ? Math.round((joint - startJoint) * 100) / 100 : null
  const jointChangePct = deltaPct(joint, startJoint)

  const currency = data?.currency ?? null

  const cbRef = useRef(onSnapshotChange)
  cbRef.current = onSnapshotChange
  useEffect(() => {
    cbRef.current?.({
      total,
      alma,
      alojz,
      joint,
      currency,
      changeAbsolute,
      changePct,
      almaChangeAbsolute,
      almaChangePct,
      alojzChangeAbsolute,
      alojzChangePct,
      jointChangeAbsolute,
      jointChangePct,
    })
  }, [
    total,
    alma,
    alojz,
    joint,
    currency,
    changeAbsolute,
    changePct,
    almaChangeAbsolute,
    almaChangePct,
    alojzChangeAbsolute,
    alojzChangePct,
    jointChangeAbsolute,
    jointChangePct,
  ])

  if (error) {
    return (
      <div className="rounded-[16px] border border-border-subtle bg-card/40 p-5">
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

  return (
    <div
      className="flex min-w-0 flex-1 flex-col rounded-[16px] border p-[14px_16px] lg:p-[20px_24px]"
      style={{
        background: 'rgba(255,255,255,0.02)',
        borderColor: 'var(--color-border-subtle)',
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 lg:mb-4">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-faint">
          Growth · {period === 'ALL' ? 'All' : period}
        </span>
        <div className="flex flex-wrap gap-x-3 gap-y-1 lg:gap-4">
          {showCombined && <LegendDot color={COMBINED_COLOR} label="Combined" />}
          {showAlojz && <LegendDot color={PERSON_A_COLOR} label="Alojz" />}
          {showAlma && <LegendDot color={PERSON_B_COLOR} label="Alma" />}
          {showShared && <LegendDot color={SHARED_COLOR} label="Shared" />}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {isLoading && series.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : series.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No history yet — connect a bank to see the chart.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
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
              {showAlojz && (
                <Line
                  type="monotone"
                  dataKey="alojz"
                  name="Alojz"
                  stroke={PERSON_A_COLOR}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3, fill: PERSON_A_COLOR, strokeWidth: 0 }}
                  isAnimationActive
                  animationDuration={600}
                />
              )}
              {showAlma && (
                <Line
                  type="monotone"
                  dataKey="alma"
                  name="Alma"
                  stroke={PERSON_B_COLOR}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3, fill: PERSON_B_COLOR, strokeWidth: 0 }}
                  isAnimationActive
                  animationDuration={600}
                />
              )}
              {showShared && (
                <Line
                  type="monotone"
                  dataKey="joint"
                  name="Shared"
                  stroke={SHARED_COLOR}
                  strokeWidth={1.5}
                  dot={false}
                  activeDot={{ r: 3, fill: SHARED_COLOR, strokeWidth: 0 }}
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
    <div className="flex items-center gap-[6px]">
      <span
        className="h-[2px] w-[18px] rounded-[1px]"
        style={{ background: color }}
        aria-hidden
      />
      <span className="text-[12px] text-text-faint">{label}</span>
    </div>
  )
}
