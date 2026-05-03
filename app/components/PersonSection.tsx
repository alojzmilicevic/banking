'use client'
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
// Sums + delta are derived from the visible (non-excluded) accounts only,
// so toggling visibility updates the header instantly without round-trip.
// Hidden accounts collapse under an expandable so the user can unhide
// without leaving the sidebar.

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown, Plus } from 'lucide-react'
import type { AccountSummary, Holder } from '@/lib/queries'
import { fmtMoneyCompact } from '@/lib/format'
import { HOLDER_LABEL } from '@/lib/holders'
import SidebarAccountRow from './SidebarAccountRow'

export default function PersonSection({
  holder,
  accounts,
  onToggleAll,
  onAddAccount,
  onOpenAccountSettings,
}: {
  holder: Exclude<Holder, 'joint'>
  accounts: AccountSummary[]
  onToggleAll: () => void
  onAddAccount: () => void
  onOpenAccountSettings?: (a: AccountSummary) => void
}) {
  const meta = HOLDER_LABEL[holder]
  // possibleDuplicateOf: this row is the secondary copy of a joint account
  // that's also linked under the other holder. We hide secondaries so the
  // joint account appears exactly once across the household, in whichever
  // section was linked first. Without this, both sidebar sections (and
  // their totals) would contain the same physical account twice.
  const dedupedAccounts = accounts.filter((a) => !a.possibleDuplicateOf)
  const visibleAccounts = dedupedAccounts.filter((a) => !a.excludedFromTotal)
  const hiddenAccounts = dedupedAccounts.filter((a) => a.excludedFromTotal)
  const total = visibleAccounts.reduce((s, a) => s + (a.balance ?? 0), 0)
  // 30-day delta = sum of each visible account's 30d absolute, when present.
  const delta30 = visibleAccounts.reduce((s, a) => s + (a.change30d?.absolute ?? 0), 0)
  const allHidden = dedupedAccounts.length > 0 && visibleAccounts.length === 0

  const [showHidden, setShowHidden] = useState(false)

  return (
    <div
      className="mb-3 rounded-[14px] border p-[16px_18px]"
      style={{ background: meta.bg, borderColor: meta.border }}
    >
      {/* Header */}
      <div className="mb-[14px] flex items-center gap-[10px]">
        <div
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
          style={{
            background: `${meta.color}22`,
            color: meta.color,
            border: `1.5px solid ${meta.color}55`,
          }}
        >
          {meta.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium text-foreground">{meta.label}</div>
          <div className="mt-px text-[11px] text-text-faint">
            {visibleAccounts.length}
            {hiddenAccounts.length > 0 ? ` of ${dedupedAccounts.length}` : ''}{' '}
            {dedupedAccounts.length === 1 ? 'account' : 'accounts'}
          </div>
        </div>
        <div className="shrink-0 whitespace-nowrap text-right">
          <div
            className="font-mono text-[16px] font-light text-foreground tabular-nums"
            style={{ letterSpacing: '-0.02em' }}
          >
            {fmtMoneyCompact(total)}
          </div>
          <div
            className="mt-px text-[11px]"
            style={{ color: delta30 >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}
          >
            {delta30 >= 0 ? '+' : ''}
            {fmtMoneyCompact(Math.abs(delta30))}
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleAll}
          aria-label={allHidden ? 'Show all accounts' : 'Hide all accounts'}
          title={allHidden ? 'Show all' : 'Hide all'}
          className="ml-1 shrink-0 rounded-[7px] border px-[8px] py-[5px] text-[11px] transition-colors"
          style={{
            background: 'rgba(255,255,255,0.05)',
            borderColor: 'var(--color-border)',
            color: allHidden ? 'var(--color-text-faint)' : 'var(--color-muted-foreground)',
          }}
        >
          {allHidden ? 'Show' : 'Hide'}
        </button>
      </div>

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
        {dedupedAccounts.length === 0 && (
          <p className="px-1 py-2 text-[12px] text-text-faint">No accounts linked yet.</p>
        )}
        {visibleAccounts.length === 0 && hiddenAccounts.length > 0 && (
          <p className="px-1 py-2 text-[12px] text-text-faint">All accounts hidden.</p>
        )}
      </div>

      {/* Hidden accounts — collapsible */}
      {hiddenAccounts.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            aria-expanded={showHidden}
            className="flex w-full items-center gap-1.5 rounded-[8px] px-[10px] py-[6px] text-left text-[11px] text-text-faint transition-colors hover:bg-[rgba(255,255,255,0.04)] hover:text-muted-foreground"
          >
            <ChevronDown
              className={`h-[14px] w-[14px] transition-transform ${showHidden ? '' : '-rotate-90'}`}
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
                <div className="mt-1 flex flex-col gap-1">
                  {hiddenAccounts.map((a) => (
                    <SidebarAccountRow
                      key={a.id}
                      account={a}
                      color={meta.color}
                      onOpenSettings={
                        onOpenAccountSettings ? () => onOpenAccountSettings(a) : undefined
                      }
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Add account */}
      <button
        type="button"
        onClick={onAddAccount}
        className="mt-[10px] flex w-full items-center gap-2 rounded-[10px] border border-dashed px-[14px] py-[9px] text-[13px] text-text-faint transition-colors hover:border-input-border hover:text-foreground"
        style={{ borderColor: 'rgba(255,255,255,0.12)' }}
      >
        <Plus className="h-[14px] w-[14px]" />
        Add account
      </button>
    </div>
  )
}
