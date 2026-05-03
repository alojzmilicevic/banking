// In-memory sync progress tracker. The orchestrator + provider syncs
// write coarse stage updates here; the /api/sync/progress endpoint
// reads them so the client can poll for sub-progress while a single
// /api/sync POST is in flight.
//
// Why in-memory: this is a single-process desktop-personal app
// (Next.js dev server is one Node instance). A DB column would
// survive restarts but a restart kills the in-flight sync anyway, so
// there's nothing meaningful to recover. Map clears on process exit
// — same lifetime as the syncs it tracks.

export type SyncProgress =
  | { stage: 'idle' }
  | { stage: 'reauth' }
  | { stage: 'fetching-accounts' }
  | { stage: 'fetching-history'; completed: number; total: number }
  | { stage: 'done' }
  | { stage: 'error'; message: string }

const progress = new Map<string, SyncProgress>()

export function setSyncProgress(connectionId: string, p: SyncProgress): void {
  progress.set(connectionId, p)
}

export function getSyncProgress(connectionId: string): SyncProgress {
  return progress.get(connectionId) ?? { stage: 'idle' }
}

export function clearSyncProgress(connectionId: string): void {
  progress.delete(connectionId)
}
