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
// Sums + delta come straight from the API (server already filtered by
// holder, deduped joints, and computed change30d). Hidden accounts
// collapse under an expandable so the user can unhide without leaving
// the sidebar.

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import type { DashboardAccount, DashboardHolder } from '@/lib/api/dashboard'
import { fmtMoneyCompact } from '@/lib/format'
import { Sensitive } from '@/components/sensitive-data'
import { holderBg, holderBorder } from '@/lib/holders'
import { cn } from '@/lib/utils'
import { PersonMenuPopover } from './PersonMenuPopover'
import { SidebarAccountRow } from './SidebarAccountRow'

export function PersonSection({
  holder,
  onToggleAll,
  onAddAccount,
  onToggleAccount,
  onDisconnectConnection,
  onSyncConnection,
  syncingConnectionId,
}: {
  holder: DashboardHolder
  onToggleAll: () => void
  onAddAccount: () => void
  onToggleAccount: (a: DashboardAccount) => void
  onDisconnectConnection: (connectionId: string, label: string) => void
  onSyncConnection: (connectionId: string) => void
  syncingConnectionId: string | null
}) {
  // Server has already deduped joint accounts (each appears in exactly
  // one bucket), but we still hide possibleDuplicateOf rows in case the
  // server ever returns them in a holder bucket — defence in depth.
  const visibleAccounts = holder.accounts.filter((a) => !a.excludedFromTotal && !a.possibleDuplicateOf)
  const hiddenAccounts = holder.accounts.filter((a) => a.excludedFromTotal && !a.possibleDuplicateOf)
  const allHidden = holder.accounts.length > 0 && visibleAccounts.length === 0

  const [showHidden, setShowHidden] = useState(false)

  const bg = holderBg(holder.color)
  const border = holderBorder(holder.color)

  return (
    <div
      style={{ '--hldr-bg': bg, '--hldr-border': border } as React.CSSProperties}
      className="mb-3 rounded-14 border border-(--hldr-border) bg-(--hldr-bg) px-4.5 py-4"
    >
      {/* Header */}
      <div className="mb-3.5 flex items-center gap-2.5">
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
        <div className="min-w-0 flex-1">
          <div className="truncate text-14 font-medium text-foreground">{holder.label}</div>
          <div className="mt-px text-11 text-text-faint">
            {visibleAccounts.length}
            {hiddenAccounts.length > 0 ? ` of ${visibleAccounts.length + hiddenAccounts.length}` : ''}{' '}
            {visibleAccounts.length + hiddenAccounts.length === 1 ? 'account' : 'accounts'}
          </div>
        </div>
        <Sensitive className="flex shrink-0 flex-col whitespace-nowrap text-right">
          <span className="font-mono text-16 font-light tracking-display text-foreground tabular-nums">
            {fmtMoneyCompact(holder.total)}
          </span>
          {holder.change30d && (
            <span
              className={cn(
                'mt-px text-11',
                holder.change30d.absolute >= 0 ? 'text-pos' : 'text-neg',
              )}
            >
              {holder.change30d.absolute >= 0 ? '+' : ''}
              {fmtMoneyCompact(Math.abs(holder.change30d.absolute))}
            </span>
          )}
        </Sensitive>
        <PersonMenuPopover
          triggerLabel={`${holder.label} options`}
          accounts={holder.accounts.filter((a) => !a.possibleDuplicateOf)}
          allHidden={allHidden}
          onAddAccount={onAddAccount}
          onToggleAll={onToggleAll}
          onToggleAccount={onToggleAccount}
          onDisconnectConnection={onDisconnectConnection}
          onSyncConnection={onSyncConnection}
          syncingConnectionId={syncingConnectionId}
        />
      </div>

      {/* Visible account rows */}
      <div className="flex flex-col gap-2">
        {visibleAccounts.map((a) => (
          <SidebarAccountRow key={a.id} account={a} color={holder.color} />
        ))}
        {holder.accounts.length === 0 && (
          <p className="px-1 py-2 text-12 text-text-faint">No accounts linked yet.</p>
        )}
        {visibleAccounts.length === 0 && hiddenAccounts.length > 0 && (
          <p className="px-1 py-2 text-12 text-text-faint">All accounts hidden.</p>
        )}
      </div>

      {/* Hidden accounts — collapsible */}
      {hiddenAccounts.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            aria-expanded={showHidden}
            className="flex w-full items-center gap-1.5 rounded-8 px-2.5 py-1.5 text-left text-11 text-text-faint transition-colors hover:bg-white/4 hover:text-muted-foreground"
          >
            <ChevronDown
              className={cn('size-3.5 transition-transform', showHidden ? '' : '-rotate-90')}
            />
            Hidden ({hiddenAccounts.length})
          </button>
          <AnimatePresence initial={false}>
            {showHidden && (
              <motion.div
                key="hidden-rows"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-1 flex flex-col">
                  {hiddenAccounts.map((a) => (
                    <SidebarAccountRow key={a.id} account={a} color={holder.color} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
