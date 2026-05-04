'use client'

import { useState } from 'react'
import { useConnectAvanza, useSyncConnection } from '@/lib/queries'
import { useSyncProgressLabel } from './use-sync-progress-label'

// The link flow has two visible phases on purpose: authentication (the
// /usercredentials → /totp dance + Keychain save, ~1-2s) and sync
// (categorizedAccounts + 12 months of chart data, ~5-30s). Each gets a
// distinct label so the user isn't staring at a single "Logging in…"
// spinner during what's mostly historical-data backfill. Sync errors
// keep the connection alive — it's already created — and the user can
// retry without re-typing creds.
export type AvanzaPhase =
  | { kind: 'idle' }
  | { kind: 'authenticating' }
  | { kind: 'syncing'; connectionId: string }
  | { kind: 'auth-error'; message: string }
  | { kind: 'sync-error'; connectionId: string; message: string }

export interface AvanzaCredentials {
  username: string
  password: string
  totpSeed: string
}

export interface AvanzaConnectFlow {
  username: string
  password: string
  totpSeed: string
  setUsername: (v: string) => void
  setPassword: (v: string) => void
  setTotpSeed: (v: string) => void
  phase: AvanzaPhase
  progress: ReturnType<typeof useSyncProgressLabel>['progress']
  buttonLabel: string
  formMissing: boolean
  editable: boolean
  busy: boolean
  submit: () => void
  closeAfterSyncError: () => void
}

export function useAvanzaConnectFlow(
  holderId: string,
  onDone: () => void,
): AvanzaConnectFlow {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [totpSeed, setTotpSeed] = useState('')
  const [phase, setPhase] = useState<AvanzaPhase>({ kind: 'idle' })

  const connect = useConnectAvanza()
  const sync = useSyncConnection()

  const syncingId = phase.kind === 'syncing' ? phase.connectionId : null
  const { progress, label: syncLabel } = useSyncProgressLabel(
    syncingId,
    phase.kind === 'syncing',
  )

  const formMissing = !username.trim() || !password || !totpSeed.trim()
  const editable = phase.kind === 'idle' || phase.kind === 'auth-error'
  const busy = phase.kind === 'authenticating' || phase.kind === 'syncing'

  function clearForm() {
    setUsername('')
    setPassword('')
    setTotpSeed('')
  }

  async function runSync(connectionId: string) {
    setPhase({ kind: 'syncing', connectionId })
    try {
      await sync.mutateAsync(connectionId)
      clearForm()
      setPhase({ kind: 'idle' })
      onDone()
    } catch (e) {
      setPhase({
        kind: 'sync-error',
        connectionId,
        message: (e as Error).message,
      })
    }
  }

  async function doConnect() {
    if (formMissing) {
      setPhase({
        kind: 'auth-error',
        message: 'Username, password, and TOTP seed are all required',
      })
      return
    }
    setPhase({ kind: 'authenticating' })
    let connectionId: string
    try {
      const challenge = await connect.mutateAsync({
        username: username.trim(),
        password,
        totpSeed: totpSeed.trim(),
        holderId,
      })
      if (challenge.kind !== 'complete' || !challenge.connectionId) {
        throw new Error(challenge.message ?? `Unexpected challenge: ${challenge.kind}`)
      }
      connectionId = challenge.connectionId
    } catch (e) {
      setPhase({ kind: 'auth-error', message: (e as Error).message })
      return
    }
    await runSync(connectionId)
  }

  function submit() {
    if (phase.kind === 'sync-error') {
      void runSync(phase.connectionId)
      return
    }
    void doConnect()
  }

  function closeAfterSyncError() {
    setPhase({ kind: 'idle' })
    clearForm()
    onDone()
  }

  const buttonLabel = (() => {
    switch (phase.kind) {
      case 'authenticating':
        return 'Authenticating with Avanza…'
      case 'syncing':
        return syncLabel
      case 'sync-error':
        return 'Retry sync'
      default:
        return 'Connect Avanza'
    }
  })()

  return {
    username,
    password,
    totpSeed,
    setUsername,
    setPassword,
    setTotpSeed,
    phase,
    progress,
    buttonLabel,
    formMissing,
    editable,
    busy,
    submit,
    closeAfterSyncError,
  }
}
