'use client'
// Hero stat for the dashboard. Big animated number for current wealth +
// period change pill. The number tweens between values so syncs and
// period switches feel alive instead of snapping.

import { motion, AnimatePresence } from 'motion/react'
import { ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react'
import { useAnimatedNumber } from '@/lib/animation/use-animated-number'
import { fmtMoney } from '@/lib/format'
import type { Period } from './PeriodTabs'

const PERIOD_LABEL: Record<Period, string> = {
  '1W': 'this week',
  '1M': 'this month',
  '3M': '3 months',
  '6M': '6 months',
  YTD: 'year to date',
  '1Y': '1 year',
  ALL: 'all time',
}

export default function WealthHero({
  total,
  currency,
  changeAbsolute,
  changePct,
  period,
  syncing,
  onSync,
  isLoading,
}: {
  total: number | null
  currency: string | null
  changeAbsolute: number | null
  changePct: number | null
  period: Period
  syncing: boolean
  onSync: () => void
  isLoading: boolean
}) {
  const animated = useAnimatedNumber(total ?? 0)
  const positive = (changeAbsolute ?? 0) >= 0
  const hasChange = changeAbsolute != null
  // Wealth-level % is mostly transfers (deposits, paychecks) at the
  // household scale, not capital growth — and from a tiny base it gets
  // absurd (millions of percent). Show % only when it's bounded.
  const showPct =
    changePct != null && Number.isFinite(changePct) && Math.abs(changePct) <= 500

  return (
    <section className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-card to-card/40 px-6 pt-6 pb-7 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
      {/* subtle gradient orb in the corner */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/8 blur-3xl"
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Net worth
          </p>
          <div className="mt-2 flex items-end gap-3">
            <h1 className="text-[2.4rem] font-semibold tabular-nums leading-none">
              {isLoading && total == null ? (
                <span className="inline-block h-10 w-48 animate-pulse rounded bg-secondary/60" />
              ) : (
                fmtMoney(animated, currency)
              )}
            </h1>
          </div>
          <AnimatePresence mode="popLayout">
            {hasChange && (
              <motion.div
                key={`${period}-${changeAbsolute}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="mt-3 flex items-center gap-2"
              >
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    positive
                      ? 'bg-pos-bg text-pos'
                      : 'bg-error-bg text-neg'
                  }`}
                >
                  {positive ? (
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5" />
                  )}
                  {fmtMoney(Math.abs(changeAbsolute!), currency)}
                  {showPct
                    ? ` (${positive ? '+' : '−'}${Math.abs(changePct!).toFixed(2)}%)`
                    : ''}
                </span>
                <span className="text-xs text-muted-foreground">{PERIOD_LABEL[period]}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={onSync}
          disabled={syncing}
          className="group flex h-10 w-10 items-center justify-center rounded-full bg-secondary/60 text-muted-foreground transition-all hover:bg-secondary hover:text-foreground hover:scale-105 active:scale-95 disabled:opacity-50"
          aria-label="Sync now"
          title="Sync all banks"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
        </button>
      </div>
    </section>
  )
}
