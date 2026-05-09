// One household member's section in the sidebar:
//   ┌──────────────────────────────────────────────┐
//   │ [AM]  Alojz                  571k    +13k    │
//   │       3 accounts                  [⋮]        │
//   ├──────────────────────────────────────────────┤
//   │ ● Visible row …                              │
//   │ ● Visible row …                              │
//   ├──────────────────────────────────────────────┤
//   │ ▸ Hidden (2)                                 │
//   └──────────────────────────────────────────────┘
//
// Bulk hide/show, per-account toggles, disconnect, and add-bank all
// live in the PersonMenuPopover hung off the ⋮ trigger.
//
// Card shell (wrapper + hidden collapsible) lives in HolderCard so the
// shared section renders identical chrome. Header markup lives in
// HolderCardHeader so the same applies to the avatar/label/total/popover row.

import type { DashboardAccount, DashboardHolder } from '@/lib/api/dashboard'
import { partitionAccounts } from '@/lib/accounts'
import { holderBg, holderBorder } from '@/lib/holders'
import { HolderCard } from './HolderCard'
import { HolderCardHeader } from './HolderCardHeader'
import { SidebarAccountRow } from './SidebarAccountRow'

export function PersonSection({
  holder,
  onToggleAll,
  onToggleAccount,
}: {
  holder: DashboardHolder
  onToggleAll: () => void
  onToggleAccount: (a: DashboardAccount) => void
}) {
  const partition = partitionAccounts(holder.accounts)
  const { visible, hidden } = partition

  return (
    <HolderCard
      bg={holderBg(holder.color)}
      border={holderBorder(holder.color)}
      color={holder.color}
      header={
        <HolderCardHeader
          avatar={holder.initials ?? holder.label.slice(0, 2).toUpperCase()}
          color={holder.color}
          label={holder.label}
          total={holder.total}
          change={holder.change}
          partition={partition}
          triggerLabel={`${holder.label} options`}
          onToggleAll={onToggleAll}
          onToggleAccount={onToggleAccount}
        />
      }
      hiddenAccounts={hidden}
    >
      {visible.map((a) => (
        <SidebarAccountRow key={a.id} account={a} color={holder.color} />
      ))}
      {holder.accounts.length === 0 && (
        <p className="px-1 py-2 text-12 text-text-faint">No accounts linked yet.</p>
      )}
      {visible.length === 0 && hidden.length > 0 && (
        <p className="px-1 py-2 text-12 text-text-faint">All accounts hidden.</p>
      )}
    </HolderCard>
  )
}
