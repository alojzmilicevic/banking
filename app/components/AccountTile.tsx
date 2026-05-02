'use client'
// Portfolio-style account card. Sparkline + balance + 30d change pill.
// Hover lift and sparkline gradient give it some depth without going full
// fintech-cliché.

import Link from 'next/link'
import { motion } from 'motion/react'
import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, MoreHorizontal, Users } from 'lucide-react'
import type { AccountSummary, Holder } from '@/lib/queries'
import { fmtMoney } from '@/lib/format'
import { HOLDER_LABEL } from '@/lib/holders'

function accountLabel(a: AccountSummary): string {
  return a.details || a.product || a.name || a.iban || a.id
}

export default function AccountTile({
  account,
  holder,
  onSettings,
  muted,
  bankLabel,
  index = 0,
}: {
  account: AccountSummary
  holder?: Holder | null
  onSettings: () => void
  muted?: boolean
  bankLabel?: string
  index?: number
}) {
  const positive = (account.change30d?.absolute ?? 0) >= 0
  const stroke = positive ? '#6ee7a7' : '#ff8b8b'
  const isInvestment = account.kind === 'investment' || account.kind === 'pension'
  const dupe = !!account.possibleDuplicateOf
  // Prefer the IBAN-derived holder over what was set on the connection —
  // joint accounts (linked under multiple holders) come back with
  // derivedHolder='joint' regardless of which side we're rendering.
  const effectiveHolder = account.derivedHolder ?? holder ?? null
  const holderInfo = effectiveHolder ? HOLDER_LABEL[effectiveHolder] : null

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{
        duration: 0.35,
        delay: Math.min(index * 0.04, 0.3),
        ease: [0.16, 1, 0.3, 1],
      }}
      whileHover={{ y: -2 }}
      className={`group relative overflow-hidden rounded-xl border bg-card transition-colors ${
        dupe
          ? 'border-warn/40 hover:border-warn/70'
          : 'border-border hover:border-input-border'
      } ${muted ? 'opacity-60' : ''}`}
    >
      <Link
        href={`/account/${account.id}`}
        className="block p-4 text-foreground hover:no-underline"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{accountLabel(account)}</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-[0.7rem] text-muted-foreground">
              {bankLabel ? <span>{bankLabel} ·</span> : null}
              <span aria-hidden>{isInvestment ? '📈' : '💵'}</span>
              <span>{account.product ?? account.kind ?? ''}</span>
              {holderInfo && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-secondary/70 px-1.5 py-0.5 text-[0.62rem] font-medium text-foreground">
                  {effectiveHolder === 'joint' ? (
                    <Users className="h-2.5 w-2.5" />
                  ) : (
                    <span aria-hidden>{holderInfo.emoji}</span>
                  )}
                  {holderInfo.label}
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onSettings()
            }}
            aria-label="Account settings"
            className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>

        {dupe && (
          <div className="mt-2 flex items-center gap-1.5 rounded-md bg-warn-bg px-2 py-1 text-[0.65rem] text-warn">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            <span>
              Looks like a duplicate of another linked account.
              {!account.excludedFromTotal ? ' Counts toward your total.' : ''}
            </span>
          </div>
        )}

        <div className="mt-3 flex items-end justify-between gap-2">
          <div>
            <p className="text-lg font-semibold tabular-nums leading-none">
              {fmtMoney(account.balance, account.balanceCurrency)}
            </p>
            {account.change30d ? (
              <span
                className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold ${
                  positive ? 'bg-pos-bg text-pos' : 'bg-error-bg text-neg'
                }`}
              >
                {positive ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {/* Show % only on investment accounts (capital gains).
                    Cash accounts: just show absolute since transfers in/out
                    swamp the % signal. */}
                {account.change30d.pct != null
                  ? `${positive ? '+' : '−'}${Math.abs(account.change30d.pct).toFixed(1)}%`
                  : `${positive ? '+' : '−'}${Math.abs(account.change30d.absolute).toLocaleString('sv-SE', { maximumFractionDigits: 0 })}`}
                <span className="text-muted-foreground/80">· 30d</span>
              </span>
            ) : (
              <span className="mt-1.5 inline-block text-[0.65rem] text-muted-foreground">
                — 30d
              </span>
            )}
          </div>

          {account.sparkline && account.sparkline.length > 1 && (
            <div className="h-10 w-24 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={account.sparkline} margin={{ top: 1, right: 0, bottom: 1, left: 0 }}>
                  <defs>
                    <linearGradient id={`spark-${account.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={stroke} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={stroke}
                    strokeWidth={1.5}
                    fill={`url(#spark-${account.id})`}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  )
}
