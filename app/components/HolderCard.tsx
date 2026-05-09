// Shared card shell for sidebar holder + shared sections. Owns:
//   - the card wrapper (rounded-14, holder-tinted bg + border)
//   - the visible-rows slot (caller-controlled, so each section keeps
//     its own empty-state copy)
//   - the "Hidden (N)" collapsible with chevron + AnimatePresence
//
// The header is also a slot so PersonSection (initials avatar, count,
// totals + ChangePill, options popover) and SharedSection (Users icon,
// same skeleton, different label) can compose their own. Both arrived
// at the same shell separately and were drifting (chevron class style,
// total/change rendering) — this stops that.

'use client'

import { useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import type { DashboardAccount } from '@/lib/api/dashboard'
import { cn } from '@/lib/utils'
import { SidebarAccountRow } from './SidebarAccountRow'

export function HolderCard({
  bg,
  border,
  color,
  header,
  hiddenAccounts,
  children,
}: {
  bg: string
  border: string
  // Stripe colour passed through to hidden-account rows.
  color: string
  header: ReactNode
  hiddenAccounts: DashboardAccount[]
  children: ReactNode
}) {
  const [showHidden, setShowHidden] = useState(false)

  return (
    <div
      style={{ '--card-bg': bg, '--card-border': border } as React.CSSProperties}
      className="mb-3 rounded-14 border border-(--card-border) bg-(--card-bg) px-4.5 py-4"
    >
      {header}

      <div className="flex flex-col gap-2">{children}</div>

      {hiddenAccounts.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            aria-expanded={showHidden}
            className="flex w-full cursor-pointer items-center gap-1.5 rounded-8 px-2.5 py-1.5 text-left text-11 text-text-faint transition-colors hover:bg-white/4 hover:text-muted-foreground"
          >
            <ChevronDown
              className={cn('size-3.5 transition-transform', !showHidden && '-rotate-90')}
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
                    <SidebarAccountRow key={a.id} account={a} color={color} />
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
