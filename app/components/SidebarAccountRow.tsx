// One row inside a sidebar PersonSection — avatar (product short label),
// account name, current balance, 30d delta %.
//
// Visibility maps to the existing `excludedFromTotal` state — hiding pulls
// the account out of the wealth chart and the topbar/summary totals. The
// row itself isn't clickable; per-account hide/show + disconnect live in
// the parent's PersonMenuPopover.

import Link from 'next/link'
import { tracksPerformance } from '@/lib/account-types'
import type { DashboardAccount } from '@/lib/api/dashboard'
import { fmtMoney, shortProduct } from '@/lib/format'
import { Sensitive } from '@/components/sensitive-data'
import { cn } from '@/lib/utils'

function accountLabel(a: DashboardAccount): string {
  return a.details || a.product || a.name || a.iban || a.id
}

export function SidebarAccountRow({
  account,
  color,
}: {
  account: DashboardAccount
  color: string
}) {
  const visible = !account.excludedFromTotal
  const pct = account.change30d?.pct
  const positive = (account.change30d?.absolute ?? 0) >= 0
  const showPct = tracksPerformance(account.accountType) && pct != null

  return (
    <div
      className={cn(
        'group flex min-h-10 items-center rounded-10 border transition-all',
        visible
          ? 'gap-1.5 border-border-subtle bg-white/3 px-3 py-1.5'
          : 'gap-1 border-transparent bg-transparent px-2.5 py-1 opacity-40',
      )}
    >
      <div
        style={
          {
            '--avatar-bg': `${color}22`,
            '--avatar-color': color,
            '--avatar-border': `${color}55`,
          } as React.CSSProperties
        }
        className="flex size-6.5 shrink-0 items-center justify-center rounded-full border-thin border-(--avatar-border) bg-(--avatar-bg) text-11 font-semibold tracking-2 text-(--avatar-color) tabular-nums"
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
        <div className="truncate text-14 font-medium text-foreground">
          <Link href={`/account/${account.id}`} className="text-foreground hover:underline">
            {accountLabel(account)}
          </Link>
        </div>
      </div>
      <Sensitive className="ml-1.5 flex shrink-0 flex-col justify-center whitespace-nowrap text-right">
        <span className="font-mono text-14 font-normal leading-none text-foreground tabular-nums">
          {fmtMoney(account.balance, account.balanceCurrency)}
        </span>
        {showPct && (
          <span className={cn('mt-0.5 text-11 leading-none', positive ? 'text-pos' : 'text-neg')}>
            {`${positive ? '+' : '−'}${Math.abs(pct).toFixed(1)}%`}
          </span>
        )}
      </Sensitive>
    </div>
  )
}
