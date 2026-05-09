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
// shared section renders identical chrome.

import type { DashboardAccount, DashboardHolder } from '@/lib/api/dashboard'
import { fmtMoneyCompact } from '@/lib/format'
import { Sensitive } from '@/components/sensitive-data'
import { partitionAccounts } from '@/lib/accounts'
import { holderBg, holderBorder } from '@/lib/holders'
import { ChangePill } from './ChangePill'
import { HolderAvatar } from './HolderAvatar'
import { HolderCard } from './HolderCard'
import { PersonMenuPopover } from './PersonMenuPopover'
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
  const { canonicals, visible, hidden, allHidden } = partitionAccounts(holder.accounts)

  const header = (
    <div className="mb-3.5 flex items-center gap-2.5">
      <HolderAvatar color={holder.color}>
        {holder.initials ?? holder.label.slice(0, 2).toUpperCase()}
      </HolderAvatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-14 font-medium text-foreground">{holder.label}</div>
        <div className="mt-px text-11 text-text-faint">
          {visible.length}
          {hidden.length > 0 ? ` of ${canonicals.length}` : ''}{' '}
          {canonicals.length === 1 ? 'account' : 'accounts'}
        </div>
      </div>
      <div className="flex shrink-0 flex-col whitespace-nowrap text-right">
        <Sensitive>
          <span className="font-mono text-16 font-light tracking-display text-foreground tabular-nums">
            {fmtMoneyCompact(holder.total)}
          </span>
        </Sensitive>
        <ChangePill change={holder.change} variant="compact" className="mt-px" />
      </div>
      <PersonMenuPopover
        triggerLabel={`${holder.label} options`}
        accounts={canonicals}
        allHidden={allHidden}
        onToggleAll={onToggleAll}
        onToggleAccount={onToggleAccount}
      />
    </div>
  )

  return (
    <HolderCard
      bg={holderBg(holder.color)}
      border={holderBorder(holder.color)}
      color={holder.color}
      header={header}
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
