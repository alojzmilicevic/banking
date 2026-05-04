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

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown, Users } from 'lucide-react'
import type { DashboardAccount } from '@/lib/api/dashboard'
import { fmtMoneyCompact } from '@/lib/format'
import { Sensitive } from '@/components/sensitive-data'
import { SHARED_META } from '@/lib/holders'
import { cn } from '@/lib/utils'
import { PersonMenuPopover } from './PersonMenuPopover'
import { SidebarAccountRow } from './SidebarAccountRow'

export function SharedSection({
  accounts,
  onToggleAll,
  onToggleAccount,
  onDisconnectConnection,
  onSyncConnection,
  syncingConnectionId,
}: {
  accounts: DashboardAccount[]
  onToggleAll: () => void
  onToggleAccount: (a: DashboardAccount) => void
  onDisconnectConnection: (connectionId: string, label: string) => void
  onSyncConnection: (connectionId: string) => void
  syncingConnectionId: string | null
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

  const [showHidden, setShowHidden] = useState(false)

  if (canonicals.length === 0) return null

  return (
    <div
      style={{ '--shr-bg': meta.bg, '--shr-border': meta.border } as React.CSSProperties}
      className="mb-3 rounded-14 border border-(--shr-border) bg-(--shr-bg) px-4.5 py-4"
    >
      {/* Header */}
      <div className="mb-3.5 flex items-center gap-2.5">
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
        <div className="min-w-0 flex-1">
          <div className="truncate text-14 font-medium text-foreground">{meta.label}</div>
          <div className="mt-px text-11 text-text-faint">
            {visibleAccounts.length}
            {hiddenAccounts.length > 0 ? ` of ${canonicals.length}` : ''}{' '}
            {canonicals.length === 1 ? 'account' : 'accounts'}
          </div>
        </div>
        <div className="shrink-0 whitespace-nowrap text-right">
          <div className="font-mono text-16 font-light tracking-display text-foreground tabular-nums">
            <Sensitive>{fmtMoneyCompact(total)}</Sensitive>
          </div>
          <div className={cn('mt-px text-11', delta30 >= 0 ? 'text-pos' : 'text-neg')}>
            <Sensitive>
              {delta30 >= 0 ? '+' : ''}
              {fmtMoneyCompact(Math.abs(delta30))}
            </Sensitive>
          </div>
        </div>
        <PersonMenuPopover
          triggerLabel="Shared accounts options"
          accounts={canonicals}
          allHidden={allHidden}
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
          <SidebarAccountRow key={a.id} account={a} color={meta.color} />
        ))}
        {visibleAccounts.length === 0 && hiddenAccounts.length > 0 && (
          <p className="px-1 py-2 text-12 text-text-faint">All shared accounts hidden.</p>
        )}
      </div>

      {/* Hidden — collapsible */}
      {hiddenAccounts.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            aria-expanded={showHidden}
            className="flex w-full items-center gap-1.5 rounded-8 px-2.5 py-1.5 text-left text-11 text-text-faint transition-colors hover:bg-white/4 hover:text-muted-foreground"
          >
            <ChevronDown
              className={`size-3.5 transition-transform ${showHidden ? '' : '-rotate-90'}`}
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
                    <SidebarAccountRow key={a.id} account={a} color={meta.color} />
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
