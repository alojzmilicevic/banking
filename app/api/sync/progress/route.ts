// GET /api/sync/progress?id=<connectionId>
//
// Tiny in-memory state read for the link modal's progress bar. While
// /api/sync POSTs are in flight, the client polls this endpoint every
// ~500ms to surface "Loading 12 months of history (3 of 5)..." style
// sub-progress that a single mutation result can't expose.

import { NextResponse } from 'next/server'
import { getSyncProgress } from '@/lib/sync/progress'

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 })
  }
  return NextResponse.json(getSyncProgress(id))
}
