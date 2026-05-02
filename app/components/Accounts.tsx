'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'motion/react'
import {
  ChevronDown,
  Eye,
  EyeOff,
  Link2Off,
  Plus,
  RefreshCw,
  Users,
} from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import {
  useAvanzaPing,
  useConnections,
  useDisconnect,
  useSyncAll,
  useToggleExclude,
  type AccountSummary,
  type ConnectionView,
  type Holder,
} from '@/lib/queries'
import { fmtMoney } from '@/lib/format'
import { HOLDER_LABEL, HOUSEHOLD, type LinkerHolder } from '@/lib/holders'
import AccountTile from './AccountTile'

interface AccountWithConn extends AccountSummary {
  _conn: ConnectionView
}

function timeAgo(ms: number | null | undefined): string {
  if (!ms) return 'never synced'
  const sec = Math.floor((Date.now() - ms) / 1000)
  if (sec < 60) return `synced ${sec}s ago`
  if (sec < 3600) return `synced ${Math.floor(sec / 60)}m ago`
  if (sec < 86400) return `synced ${Math.floor(sec / 3600)}h ago`
  return `synced ${Math.floor(sec / 86400)}d ago`
}

function consentExpired(ms: number | null | undefined): boolean {
  return !!ms && ms <= Date.now()
}

export default function Accounts({
  onAddBank,
}: {
  onAddBank: (holder?: LinkerHolder) => void
}) {
  const connections = useConnections()
  const syncAll = useSyncAll()
  const disconnect = useDisconnect()
  const toggleExclude = useToggleExclude()

  const [activeAccount, setActiveAccount] = useState<AccountWithConn | null>(null)
  const [showHidden, setShowHidden] = useState(false)

  const error =
    connections.error?.message ??
    syncAll.error?.message ??
    disconnect.error?.message ??
    toggleExclude.error?.message ??
    null

  const conns = useMemo(() => connections.data ?? [], [connections.data])
  const hasAvanza = useMemo(() => conns.some((c) => c.providerId === 'avanza'), [conns])
  // Background keepalive — only runs when an Avanza connection exists.
  // Side effect only; no need to read the result.
  useAvanzaPing(hasAvanza)

  const hiddenCount = useMemo(
    () =>
      conns.reduce(
        (sum, c) => sum + c.accounts.filter((a) => a.excludedFromTotal).length,
        0,
      ),
    [conns],
  )
  // Household members who haven't linked anything yet — surfaced as CTA
  // tiles so it's visible at a glance who's missing from the picture.
  const missingHolders = useMemo<LinkerHolder[]>(() => {
    const present = new Set(conns.map((c) => c.holder).filter(Boolean) as Holder[])
    return HOUSEHOLD.filter((h) => !present.has(h))
  }, [conns])

  if (connections.isLoading) {
    return (
      <section>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-border bg-card/40"
            />
          ))}
        </div>
      </section>
    )
  }

  if (conns.length === 0) {
    return (
      <section>
        <button
          type="button"
          onClick={() => onAddBank()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/30 px-5 py-12 text-center text-sm text-muted-foreground transition-colors hover:border-input-border hover:bg-card/60 hover:text-foreground"
        >
          <span className="text-3xl">🏦</span>
          <p className="font-medium">No banks connected yet</p>
          <p className="text-xs">Click to link Avanza or your bank.</p>
        </button>
      </section>
    )
  }

  function onToggleHide(a: AccountWithConn) {
    toggleExclude.mutate({ id: a.id, exclude: !a.excludedFromTotal })
    setActiveAccount(null)
  }

  function onDisconnect(c: ConnectionView) {
    if (
      !confirm(
        `Disconnect ${c.label ?? c.providerId}? This deletes its accounts, transactions and history.`,
      )
    )
      return
    disconnect.mutate(c.id)
    setActiveAccount(null)
  }

  return (
    <section>
      {error && <Alert className="mb-3">{error}</Alert>}

      {conns.map((c, ci) => {
        const visible = c.accounts.filter((a) => !a.excludedFromTotal)
        const expired = consentExpired(c.validUntil)
        const sumVisible = visible.reduce((s, a) => s + (a.balance ?? 0), 0)
        const currency = visible.find((a) => a.balanceCurrency)?.balanceCurrency ?? 'SEK'

        return (
          <div key={c.id} className="mb-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <motion.span
                  className={`h-1.5 w-1.5 rounded-full ${
                    c.lastSyncError || expired
                      ? 'bg-neg'
                      : c.lastSyncedAt
                        ? 'bg-pos'
                        : 'bg-muted-foreground'
                  }`}
                  animate={
                    !c.lastSyncError && !expired && c.lastSyncedAt
                      ? { boxShadow: ['0 0 0 0px rgba(110,231,167,0.5)', '0 0 0 6px rgba(110,231,167,0)'] }
                      : undefined
                  }
                  transition={{ duration: 1.6, repeat: Infinity }}
                  aria-hidden
                />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {c.label ?? c.providerId}
                </h3>
                {c.holder && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-secondary/70 px-1.5 py-0.5 text-[0.62rem] font-medium text-foreground">
                    {c.holder === 'joint' ? (
                      <Users className="h-2.5 w-2.5" />
                    ) : (
                      <span aria-hidden>{HOLDER_LABEL[c.holder].emoji}</span>
                    )}
                    {HOLDER_LABEL[c.holder].label}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  · {timeAgo(c.lastSyncedAt)}
                  {expired ? ' · consent expired' : ''}
                </span>
              </div>
              <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                {fmtMoney(sumVisible, currency)}
              </span>
            </div>

            {c.lastSyncError && (
              <Alert className="mb-3 text-[0.78rem]">{c.lastSyncError}</Alert>
            )}

            {visible.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {c.accounts.length === 0
                  ? 'No accounts on this connection.'
                  : 'All accounts hidden.'}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <AnimatePresence>
                  {visible.map((a, ai) => (
                    <AccountTile
                      key={a.id}
                      account={a}
                      holder={c.holder}
                      index={ci * 3 + ai}
                      onSettings={() => setActiveAccount({ ...a, _conn: c })}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>
        )
      })}

      {missingHolders.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {missingHolders.map((h) => (
            <motion.button
              key={h}
              type="button"
              onClick={() => onAddBank(h)}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.98 }}
              className="group flex items-center gap-3 rounded-xl border border-dashed border-border bg-card/30 px-4 py-3 text-left transition-colors hover:border-primary/60 hover:bg-card/60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary/60 text-xl grayscale transition-all group-hover:grayscale-0">
                {HOLDER_LABEL[h].emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">
                  {HOLDER_LABEL[h].label}&apos;s accounts haven&apos;t been added
                </p>
                <p className="text-[0.7rem] text-muted-foreground">
                  Link a bank or Avanza for {HOLDER_LABEL[h].label}
                </p>
              </div>
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Plus className="h-3.5 w-3.5" />
              </span>
            </motion.button>
          ))}
        </div>
      )}

      {hiddenCount > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${showHidden ? '' : '-rotate-90'}`}
            />
            Hidden accounts ({hiddenCount})
          </button>
          <AnimatePresence>
            {showHidden && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {conns.flatMap((c) =>
                    c.accounts
                      .filter((a) => a.excludedFromTotal)
                      .map((a, i) => (
                        <AccountTile
                          key={a.id}
                          account={a}
                          holder={c.holder}
                          muted
                          bankLabel={c.label ?? c.providerId}
                          onSettings={() => setActiveAccount({ ...a, _conn: c })}
                          index={i}
                        />
                      )),
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <AccountSettingsModal
        account={activeAccount}
        onClose={() => setActiveAccount(null)}
        onToggleHide={() => activeAccount && onToggleHide(activeAccount)}
        onSync={() => {
          syncAll.mutate()
          setActiveAccount(null)
        }}
        onDisconnect={() => activeAccount && onDisconnect(activeAccount._conn)}
        toggling={toggleExclude.isPending}
        syncing={syncAll.isPending}
        disconnecting={disconnect.isPending}
      />
    </section>
  )
}

function AccountSettingsModal({
  account,
  onClose,
  onToggleHide,
  onSync,
  onDisconnect,
  toggling,
  syncing,
  disconnecting,
}: {
  account: AccountWithConn | null
  onClose: () => void
  onToggleHide: () => void
  onSync: () => void
  onDisconnect: () => void
  toggling: boolean
  syncing: boolean
  disconnecting: boolean
}) {
  const conn = account?._conn

  return (
    <Modal
      open={!!account}
      onClose={onClose}
      title={
        account ? (
          <div>
            <div className="text-base font-semibold">
              {account.details || account.product || account.name || account.iban || account.id}
            </div>
            <div className="text-xs text-muted-foreground">
              {account._conn.label ?? account._conn.providerId}
              {account.product ? ` · ${account.product}` : ''}
              {account.balanceCurrency ? ` · ${account.balanceCurrency}` : ''}
            </div>
          </div>
        ) : null
      }
    >
      {account && conn && (
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-border bg-background/60 p-3">
            <div className="text-[0.7rem] uppercase tracking-wider text-muted-foreground">
              Current balance
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {fmtMoney(account.balance, account.balanceCurrency)}
            </div>
          </div>

          {account.possibleDuplicateOf && !account.excludedFromTotal && (
            <div className="rounded-lg border border-warn/40 bg-warn-bg/60 p-3 text-xs">
              <p className="font-medium text-warn">Possible duplicate</p>
              <p className="mt-0.5 text-muted-foreground">
                This account shares an IBAN/BBAN with another linked one. Excluding it from totals
                is usually what you want.
              </p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={onToggleHide}
                disabled={toggling}
              >
                <EyeOff className="h-3.5 w-3.5" />
                Exclude this duplicate
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button variant="secondary" onClick={onToggleHide} disabled={toggling}>
              {account.excludedFromTotal ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              {account.excludedFromTotal ? 'Show in totals' : 'Hide from totals'}
            </Button>

            <Button variant="secondary" onClick={onSync} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              Sync this bank
            </Button>

            <Button asChild variant="ghost">
              <Link href={`/account/${account.id}`} onClick={onClose}>
                Open account details →
              </Link>
            </Button>
          </div>

          <hr className="border-border" />

          <Button variant="destructive" onClick={onDisconnect} disabled={disconnecting}>
            <Link2Off className="h-4 w-4" />
            Disconnect bank
          </Button>
          <p className="px-1 text-[0.7rem] text-muted-foreground">
            Disconnecting deletes the bank&apos;s accounts, transactions and history.
          </p>
        </div>
      )}
    </Modal>
  )
}
