import { cookies } from 'next/headers'
import { dehydrate, HydrationBoundary } from '@tanstack/react-query'
import { HomeContent } from './HomeContent'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_COOKIE,
} from './components/sidebar-width'
import { getQueryClient } from '@/lib/get-query-client'
import { qk } from '@/lib/query-keys'
import { getDashboard, getEmptyDashboard } from '@/lib/services/dashboard'
import { getTimeseries, getEmptyTimeseries } from '@/lib/services/timeseries'
import * as holdersRepo from '@/lib/repositories/holders'
import * as usersRepo from '@/lib/repositories/users'
import { PERIODS, type Period } from '@/lib/api/schemas'

// Server component shell. Reads ?error= and the persisted sidebar width
// (cookie) on the server so the SSR'd HTML already carries the right
// values — no client-side patch-up needed. Also prefetches the dashboard,
// timeseries, and holders into a per-request QueryClient and hands the
// dehydrated cache to <HydrationBoundary> so the client hydrates with
// real data on first paint instead of flashing the skeleton.

function parsePeriod(raw: string | string[] | undefined): Period {
  if (typeof raw !== 'string') return '1Y'
  return (PERIODS as readonly string[]).includes(raw) ? (raw as Period) : '1Y'
}

export default async function Home(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await props.searchParams
  const initialError = typeof sp.error === 'string' ? sp.error : null
  const period = parsePeriod(sp.period)

  const cookieStore = await cookies()
  const stored = cookieStore.get(SIDEBAR_WIDTH_COOKIE)?.value
  let initialSidebarWidth = SIDEBAR_DEFAULT_WIDTH
  if (stored) {
    const n = Number(stored)
    if (Number.isFinite(n)) {
      initialSidebarWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, n))
    }
  }

  const queryClient = getQueryClient()
  const user = usersRepo.getDefault()
  // setQueryData (not prefetchQuery) because we already have the data
  // synchronously from the service layer — no need to round-trip through
  // a queryFn. The shape on the wire is plain JSON, which is exactly what
  // these services return, so the hydrated cache matches what `fetch`
  // would have produced.
  queryClient.setQueryData(
    qk.dashboard.byPeriod(period),
    user ? getDashboard(user.id, period) : getEmptyDashboard(),
  )
  queryClient.setQueryData(
    qk.timeseries.byPeriod(period),
    user ? getTimeseries(user.id, period) : getEmptyTimeseries(period),
  )
  queryClient.setQueryData(
    qk.holders,
    user ? holdersRepo.listForUser(user.id).map((h) => ({
      id: h.id,
      label: h.label,
      color: h.color,
      initials: h.initials,
      personnummer: h.personnummer,
      displayOrder: h.displayOrder,
    })) : [],
  )

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <HomeContent
        initialError={initialError}
        initialSidebarWidth={initialSidebarWidth}
        initialPeriod={period}
      />
    </HydrationBoundary>
  )
}
