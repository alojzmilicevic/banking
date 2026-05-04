'use client'

import { useMemo, useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { motion } from 'motion/react'
import { Eye, EyeOff, Link2Off, Loader2, MoreVertical, Plus, RefreshCw } from 'lucide-react'
import type { DashboardAccount, DashboardAccountConnection } from '@/lib/api/dashboard'
import { fmtMoney } from '@/lib/format'
import { Sensitive } from '@/components/sensitive-data'
import { cn } from '@/lib/utils'
import { BankIcon } from './BankIcon'

function accountLabel(a: DashboardAccount): string {
  return a.details || a.product || a.name || a.iban || a.id
}

interface ConnectionGroup {
  connection: DashboardAccountConnection
  accounts: DashboardAccount[]
}

function groupByConnection(accounts: DashboardAccount[]): ConnectionGroup[] {
  const map = new Map<string, ConnectionGroup>()
  for (const a of accounts) {
    const id = a.connection.id
    let group = map.get(id)
    if (!group) {
      group = { connection: a.connection, accounts: [] }
      map.set(id, group)
    }
    group.accounts.push(a)
  }
  return Array.from(map.values())
}

export function PersonMenuPopover({
  triggerLabel,
  accounts,
  allHidden,
  onAddAccount,
  onToggleAll,
  onToggleAccount,
  onDisconnectConnection,
  onSyncConnection,
  syncingConnectionIds,
}: {
  triggerLabel: string
  accounts: DashboardAccount[]
  allHidden: boolean
  onAddAccount?: () => void
  onToggleAll: () => void
  onToggleAccount: (a: DashboardAccount) => void
  onDisconnectConnection: (connectionId: string, label: string) => void
  onSyncConnection: (connectionId: string) => void
  syncingConnectionIds: ReadonlySet<string>
}) {
  const [open, setOpen] = useState(false)
  const groups = useMemo(() => groupByConnection(accounts), [accounts])
  const hasAccounts = accounts.length > 0

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={triggerLabel}
          title={triggerLabel}
          className="ml-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-7 border border-border bg-[rgba(255,255,255,0.05)] text-muted-foreground transition-colors hover:bg-[rgba(255,255,255,0.09)] hover:text-foreground"
        >
          <MoreVertical className="size-3.75" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={16}
          asChild
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.14 }}
            className="z-50 w-85 overflow-hidden rounded-14 border border-border bg-popover shadow-aloma-lg outline-none"
          >
                {/* Connection list — one row per linked bank with explicit
                    Sync and Disconnect buttons. The "+" row at the end
                    opens AddBankModal. */}
                <div className="flex flex-col border-b border-border-subtle p-1.5">
                  {groups.map((g) => {
                    const connected = g.connection.status !== 'expired' && !g.connection.lastSyncError
                    const label = g.connection.label ?? g.connection.providerId
                    const syncing = syncingConnectionIds.has(g.connection.id)
                    return (
                      <div
                        key={g.connection.id}
                        className="flex items-center gap-2.5 rounded-md px-2 py-1.5"
                      >
                        <BankIcon
                          providerId={g.connection.providerId}
                          label={g.connection.label}
                          size="md"
                          connected={connected}
                        />
                        <div className="min-w-0 flex-1 truncate text-13 font-medium text-foreground">
                          {label}
                        </div>
                        <button
                          type="button"
                          onClick={() => onSyncConnection(g.connection.id)}
                          disabled={syncing}
                          title={`Sync ${label}`}
                          aria-label={`Sync ${label}`}
                          className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-faint transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                        >
                          {syncing ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false)
                            onDisconnectConnection(g.connection.id, label)
                          }}
                          title={`Disconnect ${label}`}
                          aria-label={`Disconnect ${label}`}
                          className="flex size-7 shrink-0 items-center justify-center rounded-md text-text-faint transition-colors hover:bg-neg/10 hover:text-neg"
                        >
                          <Link2Off className="size-3.5" />
                        </button>
                      </div>
                    )
                  })}
                  {onAddAccount && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false)
                        onAddAccount()
                      }}
                      aria-label="Add bank"
                      title="Add bank"
                      className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-text-faint transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-dashed border-white/18">
                        <Plus className="size-3.5" />
                      </span>
                      <span className="text-13 font-medium">Add bank</span>
                    </button>
                  )}
                </div>

                {/* Bulk hide/show */}
                {hasAccounts && (
                  <div className="border-b border-border-subtle p-2.5">
                    <button
                      type="button"
                      onClick={onToggleAll}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {allHidden ? (
                        <Eye className="size-3.5" />
                      ) : (
                        <EyeOff className="size-3.5" />
                      )}
                      {allHidden ? 'Show all in totals' : 'Hide all from totals'}
                    </button>
                  </div>
                )}

                {/* Per-account list */}
                {hasAccounts && (
                  <div className="max-h-55 overflow-y-auto p-2">
                    {accounts.map((a) => {
                      const visible = !a.excludedFromTotal
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => onToggleAccount(a)}
                          className={cn(
                            'group flex w-full items-center gap-2 rounded-md px-2 py-1.75 text-left transition-colors hover:bg-muted',
                            !visible && 'opacity-60',
                          )}
                          title={visible ? 'Hide from totals' : 'Show in totals'}
                        >
                          <BankIcon
                            providerId={a.connection.providerId}
                            label={a.connection.label}
                            size="sm"
                            connected={visible}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[13px] font-medium text-foreground">
                              {accountLabel(a)}
                            </div>
                          </div>
                          <Sensitive className="shrink-0 whitespace-nowrap font-mono text-12 text-text-faint tabular-nums">
                            {fmtMoney(a.balance, a.balanceCurrency)}
                          </Sensitive>
                          <span className="ml-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-text-faint transition-colors group-hover:text-foreground">
                            {visible ? (
                              <Eye className="size-3.5" />
                            ) : (
                              <EyeOff className="size-3.5" />
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}

          </motion.div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
