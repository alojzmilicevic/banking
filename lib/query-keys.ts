// Query-key factory. Lives outside `lib/queries.ts` (which is 'use client')
// so server components can reach for the same keys when prefetching into a
// dehydrated QueryClient — that's the contract that makes SSR hydration
// land in the client cache instead of triggering a duplicate fetch.

// Hierarchical: `.all` is the prefix used for bulk invalidation, `.byPeriod`
// is the precise key used for reads. Always invalidate via `.all` so a new
// period variant gets refreshed for free; never write `['dashboard']` inline
// (or this stops working when the prefix changes).
export const qk = {
  dashboard: {
    all: ['dashboard'] as const,
    byPeriod: (period: string) => ['dashboard', period] as const,
  },
  timeseries: {
    all: ['timeseries'] as const,
    byPeriod: (period: string) => ['timeseries', period] as const,
  },
  holders: ['holders'] as const,
  institutions: (country: string) => ['institutions', country] as const,
  syncProgress: (connectionId: string | null) =>
    ['sync-progress', connectionId] as const,
}
