'use client'
// One row inside a sidebar PersonSection — avatar (product short label),
// account name, current balance, 30d delta %.
//
// Clicking the row opens the AccountSettingsModal where Hide/Show and
// Disconnect live. Visibility maps to the existing `excludedFromTotal`
// state — hiding pulls the account out of the wealth chart and the
// topbar/summary totals.

import Link from 'next/link'
import type { DashboardAccount } from '@/lib/api/dashboard'
import { fmtMoney, shortProduct } from '@/lib/format'

function accountLabel(a: DashboardAccount): string {
  return a.details || a.product || a.name || a.iban || a.id
}

export default function SidebarAccountRow({
  account,
  color,
  onOpenSettings,
}: {
  account: DashboardAccount
  color: string
  onOpenSettings?: () => void
}) {
  const visible = !account.excludedFromTotal
  const pct = account.change30d?.pct
  const positive = (account.change30d?.absolute ?? 0) >= 0

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenSettings}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenSettings?.()
        }
      }}
      className="group flex items-center gap-1.5 rounded-[10px] border px-[14px] py-[10px] transition-all"
      style={{
        background: visible ? 'rgba(255,255,255,0.03)' : 'transparent',
        borderColor: visible ? 'var(--color-border-subtle)' : 'transparent',
        opacity: visible ? 1 : 0.4,
        cursor: 'pointer',
      }}
    >
      <div
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums"
        style={{
          background: `${color}22`,
          color,
          border: `1.5px solid ${color}55`,
          letterSpacing: '0.02em',
        }}
        aria-hidden
        title={account.product ?? account.accountType ?? account.kind ?? ''}
      >
        {/* Prefer the standardized accountType (CACC → BK, ISK → ISK) over
            the vendor's `product` string (which is often verbose like
            "SHB-Anst-kto"). Fall back to product, then a kind initial. */}
        {shortProduct(account.accountType) ??
          shortProduct(account.product) ??
          account.kind?.[0]?.toUpperCase() ??
          '·'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-foreground">
          <Link
            href={`/account/${account.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-foreground hover:underline"
          >
            {accountLabel(account)}
          </Link>
        </div>
      </div>
      <div className="ml-1.5 shrink-0 whitespace-nowrap text-right">
        <div className="font-mono text-[14px] font-normal text-foreground tabular-nums">
          {fmtMoney(account.balance, account.balanceCurrency)}
        </div>
        <div
          className="mt-0.5 text-[11px]"
          style={{ color: positive ? 'var(--color-pos)' : 'var(--color-neg)' }}
        >
          {pct != null
            ? `${positive ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`
            : '—'}
        </div>
      </div>
    </div>
  )
}
