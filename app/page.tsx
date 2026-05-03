import { cookies } from 'next/headers'
import HomeContent from './HomeContent'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_COOKIE,
} from './components/sidebar-width'

// Server component shell. Reads ?error= and the persisted sidebar width
// (cookie) on the server so the SSR'd HTML already carries the right
// values — no client-side patch-up needed.

export default async function Home(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await props.searchParams
  const initialError = typeof sp.error === 'string' ? sp.error : null

  const cookieStore = await cookies()
  const stored = cookieStore.get(SIDEBAR_WIDTH_COOKIE)?.value
  let initialSidebarWidth = SIDEBAR_DEFAULT_WIDTH
  if (stored) {
    const n = Number(stored)
    if (Number.isFinite(n)) {
      initialSidebarWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, n))
    }
  }

  return <HomeContent initialError={initialError} initialSidebarWidth={initialSidebarWidth} />
}
