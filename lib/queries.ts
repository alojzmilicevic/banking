'use client'
// Client-side data hooks. Centralizes query keys + invalidation patterns
// so we don't forget to refresh dashboard + timeseries together when
// wealth-affecting mutations fire.

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query'
import type {
  DashboardResponse,
  HolderListItem,
  TimeseriesResponse,
} from '@/lib/api/dashboard'

export type { HolderListItem }

// ─── shared types ───────────────────────────────────────────────────────

export interface ASPSP {
  name: string
  country: string
  logo?: string
  beta?: boolean
  maximum_consent_validity?: number
  psu_types?: string[]
}

export interface AuthChallenge {
  kind: 'redirect' | 'polling' | 'pending' | 'complete' | 'error'
  url?: string
  state?: string
  message?: string
  connectionId?: string
}

// ─── fetch helper ───────────────────────────────────────────────────────

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & T
  if (!res.ok) throw new Error((data.error as string) || res.statusText)
  return data as T
}

// ─── query keys ─────────────────────────────────────────────────────────

export const qk = {
  dashboard: (period: string) => ['dashboard', period] as const,
  holders: ['holders'] as const,
  institutions: (country: string) => ['institutions', country] as const,
  timeseries: (period: string) => ['timeseries', period] as const,
}

// Anything that changes wealth (sync, disconnect, exclude toggle, new
// connection). Centralized so we don't forget one of the keys.
function invalidateWealth(qc: QueryClient) {
  // Prefix-match every cached period variant of dashboard / timeseries.
  qc.invalidateQueries({ queryKey: ['dashboard'] })
  qc.invalidateQueries({ queryKey: ['timeseries'] })
}

// ─── queries ────────────────────────────────────────────────────────────

export function useInstitutions(country: string) {
  return useQuery({
    queryKey: qk.institutions(country),
    queryFn: () => fetchJson<ASPSP[]>(`/api/institutions?country=${country}`),
    // Server caches these for 24h already; client cache should mirror.
    staleTime: 24 * 3600 * 1000,
  })
}

export function useDashboard(period: string) {
  return useQuery({
    queryKey: qk.dashboard(period),
    queryFn: () => fetchJson<DashboardResponse>(`/api/dashboard?period=${period}`),
    // Keep the previous period's data on screen while a new period fetches —
    // otherwise `data` flips to undefined and the whole layout falls back to
    // the skeleton, which resets the sidebar's resize state.
    placeholderData: keepPreviousData,
  })
}

export function useHolders() {
  return useQuery({
    queryKey: qk.holders,
    queryFn: () => fetchJson<HolderListItem[]>('/api/holders'),
    // Holders rarely change between renders — cache aggressively.
    staleTime: 5 * 60 * 1000,
  })
}

export function useAddHolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { label: string; initials?: string; color?: string }) =>
      fetchJson<HolderListItem>('/api/holders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.holders })
      // Holders show up in dashboard buckets too, so refresh those.
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// Patch one holder. Today only color is mutable from the UI; expand the
// input shape if rename/initials land here later. The dashboard cache
// owns the rendered color, so we invalidate it (alongside qk.holders)
// to flip the four tinted elements (card bg/border, header avatar,
// per-account product badge).
export function useUpdateHolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; color?: string }) =>
      fetchJson<HolderListItem>(`/api/holders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.holders })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useTimeseries(period: string) {
  return useQuery({
    queryKey: qk.timeseries(period),
    queryFn: () => fetchJson<TimeseriesResponse>(`/api/timeseries?period=${period}`),
    // Keep the previous period's series on screen while the new one fetches —
    // otherwise the chart drops into its skeleton on every period click.
    placeholderData: keepPreviousData,
  })
}

// ─── mutations ──────────────────────────────────────────────────────────

export function useSyncAll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      // /api/sync returns 207 with per-connection error strings on
      // partial failure. fetchJson treats 207 as a 2xx and resolves, so
      // without inspecting the body the user would never see that one
      // bank failed while others succeeded. Promote any per-result
      // error into a thrown Error so it lands in syncAll.error and the
      // topbar alert.
      const r = await fetchJson<SyncOneResponse>('/api/sync', { method: 'POST' })
      const failed = r.results.filter((x) => x.error)
      if (failed.length > 0) {
        const summary =
          failed.length === 1
            ? `Sync failed: ${failed[0].error}`
            : `${failed.length}/${r.results.length} connections failed: ${failed
                .map((f) => f.error)
                .join('; ')}`
        throw new Error(summary)
      }
      return r
    },
    // Refresh the dashboard regardless of outcome — partial successes
    // updated some accounts and the user should see those.
    onSettled: () => invalidateWealth(qc),
  })
}

// Sync a single connection. The /api/sync route returns 207 with a
// per-result error field if the underlying syncConnection threw, so we
// promote that into a thrown Error to keep the mutation's error
// surface uniform.
interface SyncOneResponse {
  results: Array<{ connectionId: string; outcome?: unknown; error?: string }>
}
export function useSyncConnection() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (connectionId: string) => {
      const r = await fetchJson<SyncOneResponse>(
        `/api/sync?id=${encodeURIComponent(connectionId)}`,
        { method: 'POST' },
      )
      const failed = r.results.find((x) => x.error)
      if (failed) throw new Error(failed.error)
      return r
    },
    onSuccess: () => invalidateWealth(qc),
  })
}

// Poll the in-memory sync progress map while a sync is running for
// `connectionId`. Set `enabled` to false when the sync mutation is
// not in flight to stop polling. Mirror of the server-side
// SyncProgress union — keep these shapes in sync with
// lib/sync/progress.ts.
export type SyncProgressUpdate =
  | { stage: 'idle' }
  | { stage: 'reauth' }
  | { stage: 'fetching-accounts' }
  | { stage: 'fetching-history'; completed: number; total: number }
  | { stage: 'done' }
  | { stage: 'error'; message: string }

export function useSyncProgress(connectionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['sync-progress', connectionId],
    queryFn: () =>
      fetchJson<SyncProgressUpdate>(
        `/api/sync/progress?id=${encodeURIComponent(connectionId!)}`,
      ),
    enabled: enabled && !!connectionId,
    refetchInterval: 500,
    // Do not cache — every poll is a fresh read of in-memory state.
    staleTime: 0,
    gcTime: 0,
  })
}

export function useDisconnect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/connections/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateWealth(qc),
  })
}

export function useToggleExclude() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, exclude }: { id: string; exclude: boolean }) =>
      fetchJson(`/api/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludedFromTotal: exclude }),
      }),
    onSuccess: () => invalidateWealth(qc),
  })
}

// Bulk variant — fires all PATCHes in parallel and invalidates wealth
// queries ONCE at the end. Calling useToggleExclude in a loop would
// trigger N invalidations and N dashboard refetches racing each other,
// which is visibly slow with more than a couple of accounts.
export function useBulkToggleExclude() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (items: { id: string; exclude: boolean }[]) => {
      if (items.length === 0) return
      await Promise.all(
        items.map(({ id, exclude }) =>
          fetchJson(`/api/accounts/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ excludedFromTotal: exclude }),
          }),
        ),
      )
    },
    onSuccess: () => invalidateWealth(qc),
  })
}

export function useStartEbAuth() {
  return useMutation({
    mutationFn: (input: { aspspName: string; aspspCountry: string; holderId?: string }) =>
      fetchJson<AuthChallenge>('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'enable-banking',
          flow: 'redirect',
          holderId: input.holderId,
          input: { aspspName: input.aspspName, aspspCountry: input.aspspCountry },
        }),
      }),
  })
}

export function useConnectAvanza() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      username,
      password,
      totpSeed,
      holderId,
    }: {
      username: string
      password: string
      totpSeed: string
      holderId?: string
    }) =>
      fetchJson<AuthChallenge>('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'avanza',
          flow: 'credentials',
          holderId,
          input: { username, password, totpSeed },
        }),
      }),
    onSuccess: () => invalidateWealth(qc),
  })
}
