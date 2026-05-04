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
// Sums + delta come straight from the API (server already filtered by
// holder, deduped joints, and computed change30d). Hidden accounts
// collapse under an expandable so the user can unhide without leaving
// the sidebar.

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown, Plus } from 'lucide-react'
import type { DashboardAccount, DashboardHolder } from '@/lib/api/dashboard'
import { fmtMoneyCompact } from '@/lib/format'
import { Sensitive } from '@/lib/sensitive-data'
import { holderBg, holderBorder } from '@/lib/holders'
import SidebarAccountRow from './SidebarAccountRow'

export default function PersonSection({
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
  const visibleAccounts = holder.accounts.filter((a) => !a.excludedFromTotal && !a.possibleDuplicateOf)
  const hiddenAccounts = holder.accounts.filter((a) => a.excludedFromTotal && !a.possibleDuplicateOf)
  const allHidden = holder.accounts.length > 0 && visibleAccounts.length === 0

  const [showHidden, setShowHidden] = useState(false)

  const bg = holderBg(holder.color)
  const border = holderBorder(holder.color)

  return (
    <div
      className="mb-3 rounded-[14px] border p-[16px_18px]"
      style={{ background: bg, borderColor: border }}
    >
      {/* Header */}
      <div className="mb-[14px] flex items-center gap-[10px]">
        <div
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
          style={{
            background: `${holder.color}22`,
            color: holder.color,
            border: `1.5px solid ${holder.color}55`,
          }}
        >
          {holder.initials ?? holder.label.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium text-foreground">{holder.label}</div>
          <div className="mt-px text-[11px] text-text-faint">
            {visibleAccounts.length}
            {hiddenAccounts.length > 0 ? ` of ${visibleAccounts.length + hiddenAccounts.length}` : ''}{' '}
            {visibleAccounts.length + hiddenAccounts.length === 1 ? 'account' : 'accounts'}
          </div>
        </div>
        <div className="shrink-0 whitespace-nowrap text-right">
          <div
            className="font-mono text-[16px] font-light text-foreground tabular-nums"
            style={{ letterSpacing: '-0.02em' }}
          >
            <Sensitive>{fmtMoneyCompact(holder.total)}</Sensitive>
          </div>
          {holder.change30d && (
            <div
              className="mt-px text-[11px]"
              style={{ color: holder.change30d.absolute >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}
            >
              <Sensitive>
                {holder.change30d.absolute >= 0 ? '+' : ''}
                {fmtMoneyCompact(Math.abs(holder.change30d.absolute))}
              </Sensitive>
            </div>
          )}
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
            color={holder.color}
            onOpenSettings={onOpenAccountSettings ? () => onOpenAccountSettings(a) : undefined}
          />
        ))}
        {holder.accounts.length === 0 && (
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
                      color={holder.color}
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
