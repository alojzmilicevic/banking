'use client'
// Client-side data hooks. Centralizes query keys + invalidation patterns
// so we don't forget to refresh dashboard + timeseries together when
// wealth-affecting mutations fire.

import {
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

export interface AccountDetail {
  account: {
    id: string
    name: string | null
    details: string | null
    product: string | null
    accountType: string | null
    currency: string | null
    iban: string | null
    bban: string | null
    bic: string | null
  }
  connection: {
    id: string
    providerId: string
    label: string | null
    validUntil: number | null
    lastSyncedAt: number | null
  } | null
  balances: {
    balanceType: string
    amount: number
    currency: string
    referenceDate: string | null
  }[]
}

export interface AccountTransactionsResponse {
  transactions: {
    fingerprint: string
    date: string
    amount: number
    currency: string
    status: string | null
    description: string | null
    counterparty: string | null
  }[]
}

export interface ExtractedCookies {
  cookieHeader: string
  names: string[]
  count: number
  profile: string
}

export interface ChromeProfile {
  id: string
  name: string
  email: string | null
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
  dashboard: ['dashboard'] as const,
  holders: ['holders'] as const,
  institutions: (country: string) => ['institutions', country] as const,
  timeseries: (period: string) => ['timeseries', period] as const,
  account: (id: string) => ['account', id] as const,
  accountTransactions: (id: string) => ['account', id, 'transactions'] as const,
}

// Anything that changes wealth (sync, disconnect, exclude toggle, new
// connection). Centralized so we don't forget one of the keys.
function invalidateWealth(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: qk.dashboard })
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

export function useDashboard() {
  return useQuery({
    queryKey: qk.dashboard,
    queryFn: () => fetchJson<DashboardResponse>('/api/dashboard'),
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

export function useTimeseries(period: string) {
  return useQuery({
    queryKey: qk.timeseries(period),
    queryFn: () => fetchJson<TimeseriesResponse>(`/api/timeseries?period=${period}`),
  })
}

export function useAccount(id: string) {
  return useQuery({
    queryKey: qk.account(id),
    queryFn: () => fetchJson<AccountDetail>(`/api/accounts/${id}`),
  })
}

export function useAccountTransactions(id: string) {
  return useQuery({
    queryKey: qk.accountTransactions(id),
    queryFn: () =>
      fetchJson<AccountTransactionsResponse>(`/api/accounts/${id}/transactions`),
  })
}

// ─── mutations ──────────────────────────────────────────────────────────

export function useSyncAll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => fetchJson('/api/sync', { method: 'POST' }),
    onSuccess: () => invalidateWealth(qc),
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

export function useExtractAvanzaCookies() {
  return useMutation({
    mutationFn: (profile?: string) =>
      fetchJson<ExtractedCookies>(
        `/api/avanza/extract-cookies${profile ? `?profile=${encodeURIComponent(profile)}` : ''}`,
      ),
  })
}

export function useChromeProfiles() {
  return useQuery({
    queryKey: ['chrome-profiles'],
    queryFn: () =>
      fetchJson<{ profiles: ChromeProfile[] }>('/api/avanza/extract-cookies?list=1').then(
        (r) => r.profiles,
      ),
    // Profiles rarely change mid-session — cache for the page lifetime.
    staleTime: Infinity,
  })
}

export interface AvanzaPingResult {
  alive: boolean
  validUntil?: number
  reason?: 'no-user' | 'not-linked' | 'no-cookies' | 'auth-expired' | 'error'
  message?: string
}

// Background keepalive for Avanza's cookie session (~60min idle timeout).
// Polls every 25min (well under the timeout) and on window focus, so a user
// who keeps the dashboard open never silently loses their session. On
// success the connection's validUntil is bumped server-side and the chip
// stays green; on auth failure the chip turns red and the re-link prompt
// surfaces via useDashboard.
export function useAvanzaPing(enabled: boolean) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['avanza-ping'],
    queryFn: async () => {
      const r = await fetchJson<AvanzaPingResult>('/api/avanza/ping', { method: 'POST' })
      // Bank header chip reads validUntil from useDashboard — refresh it
      // so the "consent expires in N min" pill stays accurate.
      qc.invalidateQueries({ queryKey: qk.dashboard })
      return r
    },
    enabled,
    refetchInterval: 25 * 60 * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    retry: false,
    staleTime: 0,
  })
}

export function useConnectAvanza() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ cookies, holderId }: { cookies: string; holderId?: string }) =>
      fetchJson<AuthChallenge>('/api/auth/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: 'avanza',
          flow: 'cookies',
          holderId,
          input: { cookies },
        }),
      }),
    onSuccess: () => invalidateWealth(qc),
  })
}
