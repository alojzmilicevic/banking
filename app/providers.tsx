'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState, type ReactNode } from 'react'
import { SensitiveDataProvider } from '@/lib/sensitive-data'

export function Providers({ children }: { children: ReactNode }) {
  // useState so the client survives across renders but isn't shared across
  // requests (React's RSC contract — never share state via module scope).
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // No retries by default — sync errors are usually structural
            // (auth expired, provider regression) and burn through the
            // rate limiter when retried.
            retry: false,
          },
        },
      }),
  )
  return (
    <QueryClientProvider client={client}>
      <SensitiveDataProvider>{children}</SensitiveDataProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
