// Sidebar block for accounts whose IBAN appears under multiple holders'
// connections, or whose connection is explicitly linked to >1 holder.
// The API tags these with `bucket: { kind: 'shared' }` and surfaces them
// on `dashboard.shared` (with server-computed total + change) — this
// section renders that bucket directly instead of recomputing locally,
// so kr/% toggle, sanity guards, and rounding stay consistent with
// PersonSection.
//
// Different from PersonSection in two ways:
//   1. Header uses a Users icon (not initials avatar) since "Shared"
//      isn't a single person.
//   2. No "Add account" CTA — sharing is detected automatically when the
//      same IBAN appears under multiple holders, not added by hand.

import { Users } from 'lucide-react'
import type { DashboardAccount, DashboardSharedBucket } from '@/lib/api/dashboard'
import { fmtMoneyCompact } from '@/lib/format'
import { Sensitive } from '@/components/sensitive-data'
import { partitionAccounts } from '@/lib/accounts'
import { SHARED_META } from '@/lib/holders'
import { ChangePill } from './ChangePill'
import { HolderAvatar } from './HolderAvatar'
import { HolderCard } from './HolderCard'
import { PersonMenuPopover } from './PersonMenuPopover'
import { SidebarAccountRow } from './SidebarAccountRow'

export function SharedSection({
  bucket,
  onToggleAll,
  onToggleAccount,
}: {
  bucket: DashboardSharedBucket
  onToggleAll: () => void
  onToggleAccount: (a: DashboardAccount) => void
}) {
  const meta = SHARED_META
  const { canonicals, visible, hidden, allHidden } = partitionAccounts(bucket.accounts)

  if (canonicals.length === 0) return null

  const header = (
    <div className="mb-3.5 flex items-center gap-2.5">
      <HolderAvatar color={meta.color}>
        <Users className="size-3.75" />
      </HolderAvatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-14 font-medium text-foreground">{meta.label}</div>
        <div className="mt-px text-11 text-text-faint">
          {visible.length}
          {hidden.length > 0 ? ` of ${canonicals.length}` : ''}{' '}
          {canonicals.length === 1 ? 'account' : 'accounts'}
        </div>
      </div>
      <div className="flex shrink-0 flex-col whitespace-nowrap text-right">
        <Sensitive>
          <span className="font-mono text-16 font-light tracking-display text-foreground tabular-nums">
            {fmtMoneyCompact(bucket.total)}
          </span>
        </Sensitive>
        <ChangePill change={bucket.change} variant="compact" className="mt-px" />
      </div>
      <PersonMenuPopover
        triggerLabel="Shared accounts options"
        accounts={canonicals}
        allHidden={allHidden}
        onToggleAll={onToggleAll}
        onToggleAccount={onToggleAccount}
      />
    </div>
  )

  return (
    <HolderCard
      bg={meta.bg}
      border={meta.border}
      color={meta.color}
      header={header}
      hiddenAccounts={hidden}
    >
      {visible.map((a) => (
        <SidebarAccountRow key={a.id} account={a} color={meta.color} />
      ))}
      {visible.length === 0 && hidden.length > 0 && (
        <p className="px-1 py-2 text-12 text-text-faint">All shared accounts hidden.</p>
      )}
    </HolderCard>
  )
}
