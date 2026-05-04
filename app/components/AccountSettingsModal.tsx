// Per-account settings popped from clicking a sidebar row. Two actions:
//
//   1. Hide / show in totals  — toggles excludedFromTotal.
//   2. Disconnect bank        — destructive: deletes the underlying
//      connection (cascades to accounts/balances/history). The user
//      then re-links via Add bank under the right holder.
//
// Holder reassignment is intentionally NOT here — a connection's holder
// set is decided once at link time.

import Link from 'next/link'
import { Eye, EyeOff, Link2Off, Loader2 } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { fmtMoney } from '@/lib/format'
import { Sensitive } from '@/components/sensitive-data'
import type { DashboardAccount } from '@/lib/api/dashboard'

function accountLabel(a: DashboardAccount): string {
  return a.details || a.product || a.name || a.iban || a.id
}

export function AccountSettingsModal({
  account,
  onClose,
  onToggleHide,
  onDisconnect,
  toggling,
  disconnecting,
}: {
  account: DashboardAccount | null
  onClose: () => void
  onToggleHide: () => void
  onDisconnect: () => void
  toggling: boolean
  disconnecting: boolean
}) {
  const connection = account?.connection ?? null
  const open = !!account && !!connection

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        account && connection ? (
          <div>
            <div className="text-base font-semibold">{accountLabel(account)}</div>
            <div className="text-xs text-muted-foreground">
              {connection.label ?? connection.providerId}
              {account.product ? ` · ${account.product}` : ''}
              {account.balanceCurrency ? ` · ${account.balanceCurrency}` : ''}
            </div>
          </div>
        ) : null
      }
    >
      {account && connection && (
        <div className="flex flex-col gap-3">
          <div className="rounded-12 border border-border-subtle bg-white/3 p-3">
            <div className="text-11 uppercase tracking-wider text-text-faint">Current balance</div>
            <div className="mt-1 font-mono text-20 font-light tabular-nums">
              <Sensitive>{fmtMoney(account.balance, account.balanceCurrency)}</Sensitive>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button variant="secondary" onClick={onToggleHide} disabled={toggling}>
              {account.excludedFromTotal ? (
                <Eye className="size-4" />
              ) : (
                <EyeOff className="size-4" />
              )}
              {account.excludedFromTotal ? 'Show in totals' : 'Hide from totals'}
            </Button>

            <Button asChild variant="ghost">
              <Link href={`/account/${account.id}`} onClick={onClose}>
                Open account details →
              </Link>
            </Button>
          </div>

          {/* Destructive zone */}
          <div className="mt-2 flex flex-col gap-2 rounded-12 border border-error-border bg-[rgba(255,140,140,0.04)] p-3">
            <p className="text-11 uppercase tracking-wider text-text-faint">Disconnect bank</p>
            <p className="text-12 text-muted-foreground">
              Removes <strong>{connection.label ?? connection.providerId}</strong> and all of its
              accounts (transactions and history included). Re-link any time under <em>Add bank</em>{' '}
              to start fresh — useful if the wrong holder was picked.
            </p>
            <Button variant="destructive" onClick={onDisconnect} disabled={disconnecting}>
              {disconnecting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Link2Off className="size-4" />
              )}
              {disconnecting
                ? 'Disconnecting…'
                : `Disconnect ${connection.label ?? connection.providerId}`}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
