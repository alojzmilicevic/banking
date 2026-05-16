'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useConnectHandelsbanken, useSyncConnection } from '@/lib/queries'

// HB has no credentials to enter — clicking Connect creates the row,
// then the first sync opens Chrome and waits for BankID + the user to
// land on the funds page.
export function HandelsbankenPanel({
  holderId,
  onDone,
}: {
  holderId: string
  onDone: () => void
}) {
  const connect = useConnectHandelsbanken()
  const sync = useSyncConnection()
  const [phase, setPhase] = useState<'idle' | 'syncing' | 'sync-error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const busy = connect.isPending || sync.isPending || phase === 'syncing'

  const buttonLabel = (() => {
    if (phase === 'syncing') return 'Waiting for BankID + funds page…'
    if (phase === 'sync-error') return 'Retry'
    return 'Connect Handelsbanken'
  })()

  async function submit() {
    setError(null)
    try {
      const challenge = await connect.mutateAsync({ holderId })
      if (challenge.kind !== 'complete' || !challenge.connectionId) {
        throw new Error(
          challenge.message ?? `Unexpected challenge: ${challenge.kind}`,
        )
      }
      setPhase('syncing')
      await sync.mutateAsync(challenge.connectionId)
      onDone()
    } catch (e) {
      const msg = (e as Error).message
      if (phase === 'syncing') {
        setPhase('sync-error')
        setError(
          `Connected, but the first sync failed: ${msg}. Try Sync again from the connector row, or close.`,
        )
      } else {
        setError(msg)
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
        Handelsbanken has no API. Connect opens a Chrome window —{' '}
        <strong>log in with BankID</strong> and the rest is automatic: we navigate to your
        fund holdings, capture them, then close the window. No credentials are stored;
        every sync requires a fresh BankID.
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="flex gap-2">
        <Button onClick={submit} disabled={busy} className="flex-1">
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {buttonLabel}
        </Button>
        {phase === 'sync-error' && (
          <Button variant="secondary" onClick={onDone}>
            Close
          </Button>
        )}
      </div>
    </div>
  )
}
