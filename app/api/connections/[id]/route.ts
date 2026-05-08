import { NextResponse } from 'next/server'
import { disconnectConnection } from '@/lib/services/wealth'
import * as usersRepo from '@/lib/repositories/users'

// DELETE /api/connections/:id — remove a bank link and recompute totals.
// All the work (cascade delete + snapshot rebuild) lives in the wealth
// service, which guarantees the chart and totals refresh with the
// mutation.
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = usersRepo.getDefault()
  if (!user) return NextResponse.json({ error: 'No user' }, { status: 401 })
  const result = disconnectConnection(id, user.id)
  if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(result)
}
