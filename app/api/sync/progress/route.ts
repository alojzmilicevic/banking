// GET /api/sync/progress?id=<connectionId>
//
// Tiny in-memory state read for the link modal's progress bar. While
// /api/sync POSTs are in flight, the client polls this endpoint every
// ~500ms to surface "Loading 12 months of history (3 of 5)..." style
// sub-progress that a single mutation result can't expose.

import { NextResponse } from 'next/server'
import { getSyncProgress } from '@/lib/sync/progress'
import { SyncProgressQuerySchema } from '@/lib/api/schemas'
import { validateQuery } from '@/lib/api/validate'

export async function GET(req: Request) {
  const parsed = validateQuery(new URL(req.url), SyncProgressQuerySchema)
  if (!parsed.ok) return parsed.response
  return NextResponse.json(getSyncProgress(parsed.data.id))
}
