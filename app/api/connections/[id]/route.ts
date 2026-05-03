import { NextResponse } from 'next/server'
import { disconnectConnection } from '@/lib/services/wealth'

// DELETE /api/connections/:id — remove a bank link and recompute totals.
// All the work (cascade delete + snapshot rebuild) lives in the wealth
// service, which guarantees the chart and totals refresh with the
// mutation.
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = disconnectConnection(id)
  if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(result)
}
