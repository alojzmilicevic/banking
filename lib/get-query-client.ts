// Server-only QueryClient factory. One fresh client per request so prefetched
// data never leaks across users (React's RSC contract — never share state via
// module scope on the server). Mirror the client defaults from app/providers
// so a query prefetched here behaves identically once it hydrates on the
// client (e.g. doesn't immediately refetch because staleTime is 0).

import 'server-only'
import { QueryClient } from '@tanstack/react-query'

export function getQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: false,
      },
    },
  })
}
