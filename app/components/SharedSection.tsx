// Sidebar block for accounts whose IBAN appears under multiple holders'
// connections, or whose connection is explicitly linked to >1 holder.
// The API tags these with `bucket: { kind: 'shared' }` and surfaces them
// on `dashboard.shared.accounts` — this section renders that array
// instead of bucketing client-side, so each shared account shows once.
//
// Different from PersonSection in two ways:
//   1. Header uses a Users icon (not initials avatar) since "Shared"
//      isn't a single person.
//   2. No "Add account" CTA — sharing is detected automatically when the
//      same IBAN appears under multiple holders, not added by hand.

import { Users } from 'lucide-react'
import type { DashboardAccount } from '@/lib/api/dashboard'
import { SHARED_META } from '@/lib/holders'
import { BucketCard } from './BucketCard'
import { HiddenAccountsCollapsible } from './HiddenAccountsCollapsible'
import { SidebarAccountRow } from './SidebarAccountRow'

export function SharedSection({
  accounts,
  onToggleAll,
  onOpenAccountSettings,
}: {
  accounts: DashboardAccount[]
  onToggleAll: () => void
  onOpenAccountSettings?: (a: DashboardAccount) => void
}) {
  const meta = SHARED_META
  // Server bucket includes the dupe copies of joint accounts (so the
  // FE has the option to show them); filter them out for rendering so
  // each shared account appears once.
  const canonicals = accounts.filter((a) => !a.possibleDuplicateOf)
  const visibleAccounts = canonicals.filter((a) => !a.excludedFromTotal)
  const hiddenAccounts = canonicals.filter((a) => a.excludedFromTotal)
  const total = visibleAccounts.reduce((s, a) => s + (a.balance ?? 0), 0)
  const delta30 = visibleAccounts.reduce((s, a) => s + (a.change30d?.absolute ?? 0), 0)
  const allHidden = canonicals.length > 0 && visibleAccounts.length === 0

  if (canonicals.length === 0) return null

  const avatar = (
    <div
      style={
        {
          '--avatar-bg': `${meta.color}22`,
          '--avatar-color': meta.color,
          '--avatar-border': `${meta.color}55`,
        } as React.CSSProperties
      }
      className="flex size-8.5 shrink-0 items-center justify-center rounded-full border-thin border-(--avatar-border) bg-(--avatar-bg) text-(--avatar-color)"
    >
      <Users className="size-3.75" />
    </div>
  )

  return (
    <BucketCard
      bg={meta.bg}
      border={meta.border}
      avatar={avatar}
      label={meta.label}
      visibleCount={visibleAccounts.length}
      totalCount={canonicals.length}
      total={total}
      deltaAbsolute={delta30}
      allHidden={allHidden}
      onToggleAll={onToggleAll}
      toggleAriaLabel={{
        hide: 'Hide all shared accounts',
        show: 'Show all shared accounts',
      }}
    >
      {/* Visible account rows */}
      <div className="flex flex-col gap-1">
        {visibleAccounts.map((a) => (
          <SidebarAccountRow
            key={a.id}
            account={a}
            color={meta.color}
            onOpenSettings={onOpenAccountSettings ? () => onOpenAccountSettings(a) : undefined}
          />
        ))}
        {visibleAccounts.length === 0 && hiddenAccounts.length > 0 && (
          <p className="px-1 py-2 text-12 text-text-faint">All shared accounts hidden.</p>
        )}
      </div>

      <HiddenAccountsCollapsible
        accounts={hiddenAccounts}
        color={meta.color}
        onOpenAccountSettings={onOpenAccountSettings}
      />
    </BucketCard>
  )
}
