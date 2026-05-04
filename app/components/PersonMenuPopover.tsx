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
  syncingConnectionId,
}: {
  triggerLabel: string
  accounts: DashboardAccount[]
  allHidden: boolean
  onAddAccount?: () => void
  onToggleAll: () => void
  onToggleAccount: (a: DashboardAccount) => void
  onDisconnectConnection: (connectionId: string, label: string) => void
  onSyncConnection: (connectionId: string) => void
  syncingConnectionId: string | null
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
          className="ml-1 flex size-[28px]  shrink-0 items-center justify-center rounded-7 border border-border bg-[rgba(255,255,255,0.05)] text-muted-foreground transition-colors hover:bg-[rgba(255,255,255,0.09)] hover:text-foreground"
        >
          <MoreVertical className="size-[15px] " />
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
            className="z-50 w-[340px] overflow-hidden rounded-14 border border-border bg-popover shadow-aloma-lg outline-none"
          >
                {/* Bank icons row — each connection is a tile (click to
                    disconnect) plus a small sync button. The dashed + tile
                    opens AddBankModal. */}
                <div className="flex flex-wrap items-center gap-2.5 border-b border-border-subtle p-[14px]">
                  {groups.map((g) => {
                    const connected = g.connection.status !== 'expired' && !g.connection.lastSyncError
                    const label = g.connection.label ?? g.connection.providerId
                    const syncing = syncingConnectionId === g.connection.id
                    return (
                      <div key={g.connection.id} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setOpen(false)
                            onDisconnectConnection(g.connection.id, label)
                          }}
                          title={`Disconnect ${label}`}
                          aria-label={`Disconnect ${label}`}
                          className="group/bank relative flex shrink-0"
                        >
                          <BankIcon
                            providerId={g.connection.providerId}
                            label={g.connection.label}
                            size="lg"
                            connected={connected}
                            className="transition-opacity group-hover/bank:opacity-30"
                          />
                          <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover/bank:opacity-100">
                            <Link2Off className="size-4 text-neg" />
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onSyncConnection(g.connection.id)}
                          disabled={syncing}
                          title={`Sync ${label}`}
                          aria-label={`Sync ${label}`}
                          className="flex size-5 shrink-0 items-center justify-center rounded-full text-text-faint transition-colors hover:bg-white/6 hover:text-foreground disabled:opacity-50"
                        >
                          {syncing ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <RefreshCw className="size-3" />
                          )}
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
                      className="flex size-9  shrink-0 items-center justify-center rounded-sm border border-dashed border-[rgba(255,255,255,0.18)] text-text-faint transition-colors hover:border-input-border hover:text-foreground"
                      aria-label="Add bank"
                      title="Add bank"
                    >
                      <Plus className="size-[14px] " />
                    </button>
                  )}
                </div>

                {/* Bulk hide/show */}
                {hasAccounts && (
                  <div className="border-b border-border-subtle p-[10px]">
                    <button
                      type="button"
                      onClick={onToggleAll}
                      className="flex w-full items-center gap-2 rounded-md px-[10px] py-[8px] text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      {allHidden ? (
                        <Eye className="size-[14px] " />
                      ) : (
                        <EyeOff className="size-[14px] " />
                      )}
                      {allHidden ? 'Show all in totals' : 'Hide all from totals'}
                    </button>
                  </div>
                )}

                {/* Per-account list */}
                {hasAccounts && (
                  <div className="max-h-[220px] overflow-y-auto p-[8px]">
                    {accounts.map((a) => {
                      const visible = !a.excludedFromTotal
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => onToggleAccount(a)}
                          className={cn(
                            'group flex w-full items-center gap-2 rounded-md px-[8px] py-[7px] text-left transition-colors hover:bg-muted',
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
                          <span className="ml-1 flex size-[24px]  shrink-0 items-center justify-center rounded-sm text-text-faint transition-colors group-hover:text-foreground">
                            {visible ? (
                              <Eye className="size-[14px] " />
                            ) : (
                              <EyeOff className="size-[14px] " />
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
