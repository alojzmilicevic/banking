// Visual add-bank flow. Holder chips at the top come from the API now,
// so adding a household member doesn't require code changes here.

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Building2, TrendingUp } from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { useDashboard, useHolders } from '@/lib/queries'
import type { DashboardResponse } from '@/lib/api/dashboard'
import { AvanzaPanel } from './add-bank/AvanzaPanel'
import { BackButton } from './add-bank/BackButton'
import { BankPanel } from './add-bank/BankPanel'
import { HolderChip } from './add-bank/HolderChip'
import { ProviderTile } from './add-bank/ProviderTile'

type Provider = 'avanza' | 'eb'

function buildLinkedByHolder(data: DashboardResponse | undefined) {
  return new Map(
    (data?.holders ?? []).map((h) => [
      h.id,
      {
        avanza: h.accounts.some((a) => a.connection.providerId === 'avanza'),
        eb: h.accounts
          .filter((a) => a.connection.providerId === 'enable-banking')
          .map((a) => a.connection.label ?? 'a bank'),
      },
    ]),
  )
}

function summarize(slot: { avanza: boolean; eb: string[] } | undefined): string | null {
  if (!slot) return null
  const count = (slot.avanza ? 1 : 0) + slot.eb.length
  if (count === 0) return null
  const parts: string[] = []
  if (slot.avanza) parts.push('Avanza')
  if (slot.eb.length > 0) parts.push(slot.eb.length === 1 ? '1 bank' : `${slot.eb.length} banks`)
  return parts.join(' + ')
}

export function AddBankModal({
  open,
  onClose,
  onConnected,
  initialHolderId,
}: {
  open: boolean
  onClose: () => void
  onConnected?: () => void
  initialHolderId?: string
}) {
  const holdersQ = useHolders()
  const holders = useMemo(() => holdersQ.data ?? [], [holdersQ.data])
  const dashboard = useDashboard()

  const [holderId, setHolderId] = useState<string | undefined>(initialHolderId)
  const [provider, setProvider] = useState<Provider | null>(null)

  // Default to the first holder once the list loads (or to the prop if
  // the caller pre-picked one).
  useEffect(() => {
    if (initialHolderId) {
      setHolderId(initialHolderId)
      return
    }
    if (!holderId && holders.length > 0) setHolderId(holders[0].id)
  }, [initialHolderId, holderId, holders])

  // Re-sync when the modal re-opens with a different initialHolderId.
  useEffect(() => {
    if (open && initialHolderId) setHolderId(initialHolderId)
  }, [open, initialHolderId])

  // Per-holder map of which providers already have a connection. Used to
  // dim already-linked provider tiles and warn that picking them will
  // re-link (refresh credentials) rather than add a new bank.
  const linkedByHolder = buildLinkedByHolder(dashboard.data)

  const linkedHere = holderId ? linkedByHolder.get(holderId) : undefined
  const avanzaLinked = !!linkedHere?.avanza
  const ebLinked = (linkedHere?.eb.length ?? 0) > 0
  const ebLabels = (linkedHere?.eb ?? []).join(', ')

  return (
    <Modal
      open={open}
      onClose={() => {
        setProvider(null)
        onClose()
      }}
      className="max-w-xl"
      title={
        <div>
          <h2 className="text-base font-semibold">Link a bank</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Joint accounts get auto-detected when more than one holder links the same one.
          </p>
        </div>
      }
    >
      {/* Holder picker */}
      <div className="mb-5">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-11 font-semibold uppercase tracking-caps text-muted-foreground">
            Linked by
          </p>
          {holderId && (
            <motion.p
              key={holderId}
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15 }}
              className="text-xs font-medium text-foreground"
            >
              {holders.find((h) => h.id === holderId)?.label}
            </motion.p>
          )}
        </div>
        {holders.length === 0 ? (
          <p className="rounded-md border border-border-subtle bg-card/40 px-3 py-2 text-xs text-muted-foreground">
            No household members yet — add one in settings.
          </p>
        ) : (
          <div
            style={{ '--cols': Math.min(holders.length, 3) } as React.CSSProperties}
            className="grid grid-cols-[repeat(var(--cols),minmax(0,1fr))] gap-2"
          >
            {holders.map((h) => (
              <HolderChip
                key={h.id}
                holder={h}
                active={holderId === h.id}
                onPick={() => setHolderId(h.id)}
                linkedSummary={summarize(linkedByHolder.get(h.id))}
              />
            ))}
          </div>
        )}
      </div>

      {/* Provider grid */}
      {!provider && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <p className="mb-2 text-11 font-semibold uppercase tracking-caps text-muted-foreground">
            Where from
          </p>
          <div className="grid grid-cols-2 gap-2">
            <ProviderTile
              icon={<TrendingUp className="size-5" />}
              tone="bg-gradient-to-br from-emerald-500/15 to-transparent"
              title="Avanza"
              subtitle="Stocks, funds, ISK & pension"
              hint={avanzaLinked ? 'Re-link to update credentials' : 'via password + TOTP'}
              linked={avanzaLinked}
              disabled={!holderId}
              onClick={() => setProvider('avanza')}
            />
            <ProviderTile
              icon={<Building2 className="size-5" />}
              tone="bg-gradient-to-br from-blue-500/15 to-transparent"
              title="A bank"
              subtitle={ebLinked ? `${ebLabels} linked` : 'Handelsbanken, Swedbank, SEB…'}
              hint={ebLinked ? 'Add another or re-link' : 'via BankID (PSD2)'}
              linked={ebLinked}
              disabled={!holderId}
              onClick={() => setProvider('eb')}
            />
          </div>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {provider === 'avanza' && holderId && (
          <motion.div
            key="avanza-panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <BackButton onClick={() => setProvider(null)} />
            <AvanzaPanel
              holderId={holderId}
              onDone={() => {
                onConnected?.()
                onClose()
                setProvider(null)
              }}
            />
          </motion.div>
        )}
        {provider === 'eb' && holderId && (
          <motion.div
            key="eb-panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <BackButton onClick={() => setProvider(null)} />
            <BankPanel holderId={holderId} />
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  )
}
