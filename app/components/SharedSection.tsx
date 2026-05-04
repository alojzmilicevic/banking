'use client'
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
import { Sensitive } from '@/lib/sensitive-data'
import { SHARED_META } from '@/lib/holders'
import SidebarAccountRow from './SidebarAccountRow'

export default function SharedSection({
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

  const [showHidden, setShowHidden] = useState(false)

  if (canonicals.length === 0) return null

  return (
    <div
      className="mb-3 rounded-[14px] border p-[16px_18px]"
      style={{ background: meta.bg, borderColor: meta.border }}
    >
      {/* Header */}
      <div className="mb-[14px] flex items-center gap-[10px]">
        <div
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full"
          style={{
            background: `${meta.color}22`,
            color: meta.color,
            border: `1.5px solid ${meta.color}55`,
          }}
        >
          <Users className="h-[15px] w-[15px]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-medium text-foreground">{meta.label}</div>
          <div className="mt-px text-[11px] text-text-faint">
            {visibleAccounts.length}
            {hiddenAccounts.length > 0 ? ` of ${canonicals.length}` : ''}{' '}
            {canonicals.length === 1 ? 'account' : 'accounts'}
          </div>
        </div>
        <div className="shrink-0 whitespace-nowrap text-right">
          <div
            className="font-mono text-[16px] font-light text-foreground tabular-nums"
            style={{ letterSpacing: '-0.02em' }}
          >
            <Sensitive>{fmtMoneyCompact(total)}</Sensitive>
          </div>
          <div
            className="mt-px text-[11px]"
            style={{ color: delta30 >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }}
          >
            <Sensitive>
              {delta30 >= 0 ? '+' : ''}
              {fmtMoneyCompact(Math.abs(delta30))}
            </Sensitive>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggleAll}
          aria-label={allHidden ? 'Show all shared accounts' : 'Hide all shared accounts'}
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
        {visibleAccounts.length === 0 && hiddenAccounts.length > 0 && (
          <p className="px-1 py-2 text-[12px] text-text-faint">All shared accounts hidden.</p>
        )}
      </div>

      {/* Hidden — collapsible */}
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
    </div>
  )
}
