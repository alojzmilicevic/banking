// One row in the mobile account list. The desktop sidebar has its own
// SidebarAccountRow with a different layout (avatar tile + product code,
// inline 30d delta). This row optimises for the narrower phone width:
// vertical color stripe instead of an avatar, connection label as the
// secondary line, eye toggle on the right.

import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import type { DashboardAccount } from '@/lib/api/dashboard'
import { accountLabel } from '@/lib/accounts'
import { shortProduct } from '@/lib/format'
import { Money, Sensitive } from '@/components/sensitive-data'
import { cn } from '@/lib/utils'

export function MobileAccountRow({
  account,
  connectionLabel,
  color,
  onToggleVisibility,
}: {
  account: DashboardAccount
  connectionLabel: string
  color: string
  onToggleVisibility: () => void
}) {
  const visible = !account.excludedFromTotal
  const Icon = visible ? Eye : EyeOff

  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b border-border-subtle px-5 py-3.25 transition-opacity',
        !visible && 'opacity-40',
      )}
    >
      <div
        style={{ '--stripe': color } as React.CSSProperties}
        className={cn('h-8 w-0.75 shrink-0 rounded-2 bg-(--stripe)', !visible && 'opacity-40')}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-14 font-medium leading-[1.2] text-foreground">
          <Link href={`/account/${account.id}`} className="text-foreground hover:underline">
            {accountLabel(account)}
          </Link>
        </div>
        <div className="mt-0.5 truncate text-12 text-text-faint">
          {[shortProduct(account.accountType) ?? shortProduct(account.product), connectionLabel]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      <Sensitive className="shrink-0 whitespace-nowrap text-right font-mono text-14 font-normal tracking-tight text-foreground tabular-nums">
        <Money amount={account.balance} currency={account.balanceCurrency} />
      </Sensitive>
      <button
        type="button"
        onClick={onToggleVisibility}
        aria-label={visible ? 'Hide account' : 'Show account'}
        className="flex size-7 shrink-0 items-center justify-center rounded-6 text-text-faint"
      >
        <Icon className="size-3.75" />
      </button>
    </div>
  )
}
