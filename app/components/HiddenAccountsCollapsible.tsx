'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import type { DashboardAccount } from '@/lib/api/dashboard'
import { SidebarAccountRow } from './SidebarAccountRow'

export function HiddenAccountsCollapsible({
  accounts,
  color,
  onOpenAccountSettings,
}: {
  accounts: DashboardAccount[]
  color: string
  onOpenAccountSettings?: (a: DashboardAccount) => void
}) {
  const [open, setOpen] = useState(false)

  if (accounts.length === 0) return null

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-8 px-2.5 py-1.5 text-left text-11 text-text-faint transition-colors hover:bg-white/4 hover:text-muted-foreground"
      >
        <ChevronDown
          className={`size-3.5 transition-transform ${open ? '' : '-rotate-90'}`}
        />
        Hidden ({accounts.length})
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="hidden-rows"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-1 flex flex-col">
              {accounts.map((a) => (
                <SidebarAccountRow
                  key={a.id}
                  account={a}
                  color={color}
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
  )
}
