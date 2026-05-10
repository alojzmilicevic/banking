// One row inside a sidebar PersonSection — avatar (product short label),
// account name, current balance, 30d delta %.
//
// Visibility maps to the existing `excludedFromTotal` state — hiding pulls
// the account out of the wealth chart and the topbar/summary totals. The
// row itself isn't clickable; per-account hide/show + disconnect live in
// the parent's PersonMenuPopover.

import Link from 'next/link'
import type { DashboardAccount } from '@/lib/api/dashboard'
import { accountLabel } from '@/lib/accounts'
import { shortProduct } from '@/lib/format'
import { Money, Sensitive } from '@/components/sensitive-data'
import { holderAvatarBg } from '@/lib/holders'
import { cn } from '@/lib/utils'

export function SidebarAccountRow({
  account,
  color,
}: {
  account: DashboardAccount
  color: string
}) {
  const visible = !account.excludedFromTotal

  return (
    <div
      className={cn(
        'group flex h-10.5 items-center rounded-10 border transition-all',
        visible
          ? 'gap-1.5 border-border-subtle bg-white/3 px-3 hover:border-border hover:bg-white/6'
          : 'gap-1 border-transparent bg-transparent px-2.5 opacity-40 hover:opacity-70',
      )}
    >
      <div
        style={
          {
            '--avatar-bg': holderAvatarBg(color),
            '--avatar-color': color,
          } as React.CSSProperties
        }
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-(--avatar-bg) text-9 font-semibold uppercase tracking-4 text-(--avatar-color) tabular-nums"
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
      <Sensitive className="ml-1.5 shrink-0 whitespace-nowrap text-right font-mono text-14 font-normal text-foreground tabular-nums">
        <Money amount={account.balance} currency={account.balanceCurrency} />
      </Sensitive>
    </div>
  )
}
