import { NextResponse } from 'next/server'

// Cheap liveness probe. Returns 200 as soon as the Next.js server is
// accepting requests — used by the CI deploy workflow to confirm the
// container came back up after `docker compose up -d --build`.
//
// Intentionally does not touch the DB: a slow / failing DB shouldn't make
// the container appear "down" to the deploy script. Anything richer
// belongs in a separate /api/ready or per-dependency probe.
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ status: 'ok' })
}
