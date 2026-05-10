// GET /api/sync/progress?id=<connectionId>
//
// Tiny in-memory state read for the link modal's progress bar. While
// /api/sync POSTs are in flight, the client polls this endpoint every
// ~500ms to surface "Loading 12 months of history (3 of 5)..." style
// sub-progress that a single mutation result can't expose.

import { NextResponse } from 'next/server'
import * as connectionsRepo from '@/lib/repositories/connections'
import { getSyncProgress } from '@/lib/sync/progress'
import { SyncProgressQuerySchema } from '@/lib/api/schemas'
import { validateQuery } from '@/lib/api/validate'
import { requireUser } from '@/lib/api/route-helpers'

export async function GET(req: Request) {
  const parsed = validateQuery(new URL(req.url), SyncProgressQuerySchema)
  if (!parsed.ok) return parsed.response

  const auth = requireUser()
  if (auth.response) return auth.response

  const conn = connectionsRepo.getById(parsed.data.id)
  if (!conn || conn.userId !== auth.user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  return NextResponse.json(getSyncProgress(parsed.data.id))
}
