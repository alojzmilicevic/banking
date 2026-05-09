// Sidebar block for accounts whose IBAN appears under multiple holders'
// connections, or whose connection is explicitly linked to >1 holder.
// The API tags these with `bucket: { kind: 'shared' }` and surfaces them
// on `dashboard.shared` (with server-computed total + change) — this
// section renders that bucket directly instead of recomputing locally,
// so kr/% toggle, sanity guards, and rounding stay consistent with
// PersonSection.
//
// Different from PersonSection in two ways:
//   1. Header avatar uses a Users icon (not initials) since "Shared"
//      isn't a single person.
//   2. No "Add account" CTA — sharing is detected automatically when the
//      same IBAN appears under multiple holders, not added by hand.

import { Users } from 'lucide-react'
import type { DashboardAccount, DashboardSharedBucket } from '@/lib/api/dashboard'
import { partitionAccounts } from '@/lib/accounts'
import { SHARED_META } from '@/lib/holders'
import { HolderCard } from './HolderCard'
import { HolderCardHeader } from './HolderCardHeader'
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
  const partition = partitionAccounts(bucket.accounts)
  const { canonicals, visible, hidden } = partition

  if (canonicals.length === 0) return null

  return (
    <HolderCard
      bg={meta.bg}
      border={meta.border}
      color={meta.color}
      header={
        <HolderCardHeader
          avatar={<Users className="size-3.75" />}
          color={meta.color}
          label={meta.label}
          total={bucket.total}
          change={bucket.change}
          partition={partition}
          triggerLabel="Shared accounts options"
          onToggleAll={onToggleAll}
          onToggleAccount={onToggleAccount}
        />
      }
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
