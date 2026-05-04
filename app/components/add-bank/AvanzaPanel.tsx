'use client'

import { Loader2 } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useAvanzaConnectFlow } from '@/hooks/use-avanza-connect-flow'
import { Field } from './Field'
import { PhaseIndicator } from './PhaseIndicator'

export function AvanzaPanel({
  holderId,
  onDone,
}: {
  holderId: string
  onDone: () => void
}) {
  const flow = useAvanzaConnectFlow(holderId, onDone)
  const { phase } = flow

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
        Stored in macOS Keychain. The TOTP seed is the base32 string under{' '}
        <em>Kopiera nyckeln</em> when you set up 2FA — same one your authenticator app holds.
        Syncs refresh themselves silently when the cookie session expires.
      </div>

      <PhaseIndicator phase={phase} progress={flow.progress} />

      <Field label="Username">
        <input
          type="text"
          autoComplete="username"
          value={flow.username}
          onChange={(e) => flow.setUsername(e.target.value)}
          disabled={!flow.editable}
          placeholder="alomi136"
          className="w-full rounded-md border border-input-border bg-input px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
        />
      </Field>

      <Field label="Password">
        <input
          type="password"
          autoComplete="current-password"
          value={flow.password}
          onChange={(e) => flow.setPassword(e.target.value)}
          disabled={!flow.editable}
          className="w-full rounded-md border border-input-border bg-input px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
        />
      </Field>

      <Field label="TOTP seed (base32)">
        <input
          type="password"
          autoComplete="off"
          value={flow.totpSeed}
          onChange={(e) => flow.setTotpSeed(e.target.value)}
          disabled={!flow.editable}
          placeholder="MXF42B22ORYSEEONOZDCWEMOXVZ24AUQ"
          className="w-full rounded-md border border-input-border bg-input px-2.5 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
        />
      </Field>

      {(phase.kind === 'auth-error' || phase.kind === 'sync-error') && (
        <Alert>
          {phase.kind === 'auth-error'
            ? phase.message
            : `Connected, but initial sync failed: ${phase.message}. Click Retry sync, or close — the connection will sync next time.`}
        </Alert>
      )}

      <div className="flex gap-2">
        <Button
          onClick={flow.submit}
          disabled={flow.busy || (phase.kind !== 'sync-error' && flow.formMissing)}
          className="flex-1"
        >
          {flow.busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {flow.buttonLabel}
        </Button>
        {phase.kind === 'sync-error' && (
          <Button variant="secondary" onClick={flow.closeAfterSyncError}>
            Close
          </Button>
        )}
      </div>
    </div>
  )
}
