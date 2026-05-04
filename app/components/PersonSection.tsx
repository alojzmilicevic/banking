// One household member's section in the sidebar:
//   ┌──────────────────────────────────────────────┐
//   │ [AM]  Alojz                  571k    +13k    │
//   │       3 accounts                  [Hide]     │
//   ├──────────────────────────────────────────────┤
//   │ ● Visible row …                              │
//   │ ● Visible row …                              │
//   ├──────────────────────────────────────────────┤
//   │ ▸ Hidden (2)                                 │
//   ├──────────────────────────────────────────────┤
//   │ + Add account                                │
//   └──────────────────────────────────────────────┘
//
// Sums + delta come straight from the API (server already filtered by
// holder, deduped joints, and computed change30d). Hidden accounts
// collapse under an expandable so the user can unhide without leaving
// the sidebar.

import { Plus } from 'lucide-react'
import type { DashboardAccount, DashboardHolder } from '@/lib/api/dashboard'
import { holderBg, holderBorder } from '@/lib/holders'
import { BucketCard } from './BucketCard'
import { HiddenAccountsCollapsible } from './HiddenAccountsCollapsible'
import { SidebarAccountRow } from './SidebarAccountRow'

export function PersonSection({
  holder,
  onToggleAll,
  onAddAccount,
  onOpenAccountSettings,
}: {
  holder: DashboardHolder
  onToggleAll: () => void
  onAddAccount: () => void
  onOpenAccountSettings?: (a: DashboardAccount) => void
}) {
  // Server has already deduped joint accounts (each appears in exactly
  // one bucket), but we still hide possibleDuplicateOf rows in case the
  // server ever returns them in a holder bucket — defence in depth.
  const visibleAccounts = holder.accounts.filter(
    (a) => !a.excludedFromTotal && !a.possibleDuplicateOf,
  )
  const hiddenAccounts = holder.accounts.filter(
    (a) => a.excludedFromTotal && !a.possibleDuplicateOf,
  )
  const allHidden = holder.accounts.length > 0 && visibleAccounts.length === 0

  const avatar = (
    <div
      style={
        {
          '--avatar-bg': `${holder.color}22`,
          '--avatar-color': holder.color,
          '--avatar-border': `${holder.color}55`,
        } as React.CSSProperties
      }
      className="flex size-8.5 shrink-0 items-center justify-center rounded-full border-thin border-(--avatar-border) bg-(--avatar-bg) text-14 font-semibold text-(--avatar-color)"
    >
      {holder.initials ?? holder.label.slice(0, 2).toUpperCase()}
    </div>
  )

  return (
    <BucketCard
      bg={holderBg(holder.color)}
      border={holderBorder(holder.color)}
      avatar={avatar}
      label={holder.label}
      visibleCount={visibleAccounts.length}
      totalCount={visibleAccounts.length + hiddenAccounts.length}
      total={holder.total}
      deltaAbsolute={holder.change30d?.absolute ?? null}
      allHidden={allHidden}
      onToggleAll={onToggleAll}
      toggleAriaLabel={{
        hide: 'Hide all accounts',
        show: 'Show all accounts',
      }}
    >
      {/* Visible account rows */}
      <div className="flex flex-col gap-1">
        {visibleAccounts.map((a) => (
          <SidebarAccountRow
            key={a.id}
            account={a}
            color={holder.color}
            onOpenSettings={onOpenAccountSettings ? () => onOpenAccountSettings(a) : undefined}
          />
        ))}
        {holder.accounts.length === 0 && (
          <p className="px-1 py-2 text-12 text-text-faint">No accounts linked yet.</p>
        )}
        {visibleAccounts.length === 0 && hiddenAccounts.length > 0 && (
          <p className="px-1 py-2 text-12 text-text-faint">All accounts hidden.</p>
        )}
      </div>

      <HiddenAccountsCollapsible
        accounts={hiddenAccounts}
        color={holder.color}
        onOpenAccountSettings={onOpenAccountSettings}
      />

      {/* Add account */}
      <button
        type="button"
        onClick={onAddAccount}
        className="mt-2.5 flex w-full items-center gap-2 rounded-10 border border-dashed border-white/12 px-3.5 py-2.25 text-14 text-text-faint transition-colors hover:border-input-border hover:text-foreground"
      >
        <Plus className="size-3.5" />
        Add account
      </button>
    </BucketCard>
  )
}
