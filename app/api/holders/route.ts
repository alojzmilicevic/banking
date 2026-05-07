// GET  /api/holders → the household member roster, ordered by displayOrder.
// POST /api/holders → add a new household member. Body: { label, initials?,
// color? }. Server fills in defaults when initials/color are omitted.

import { NextResponse } from 'next/server'
import * as holdersRepo from '@/lib/repositories/holders'
import * as usersRepo from '@/lib/repositories/users'
import type { HolderListItem } from '@/lib/api/dashboard'
import { deriveInitials, pickHolderColor } from '@/lib/holders'
import type { HolderRow } from '@/lib/db/schema'

function toListItem(h: HolderRow): HolderListItem {
  return {
    id: h.id,
    label: h.label,
    color: h.color,
    initials: h.initials,
    displayOrder: h.displayOrder,
  }
}

export async function GET() {
  const user = usersRepo.getDefault()
  if (!user) return NextResponse.json([])
  return NextResponse.json(holdersRepo.listForUser(user.id).map(toListItem))
}

export async function POST(req: Request) {
  const user = usersRepo.getDefault()
  if (!user) {
    return NextResponse.json({ error: 'No user' }, { status: 400 })
  }
  let body: { label?: unknown; initials?: unknown; color?: unknown }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const label = typeof body.label === 'string' ? body.label.trim() : ''
  if (!label) {
    return NextResponse.json({ error: 'Label required' }, { status: 400 })
  }
  const existing = holdersRepo.listForUser(user.id)
  const initials =
    typeof body.initials === 'string' && body.initials.trim()
      ? body.initials.trim().toUpperCase().slice(0, 3)
      : deriveInitials(label)
  const color =
    typeof body.color === 'string' && body.color.trim()
      ? body.color.trim()
      : pickHolderColor(existing.map((h) => h.color))
  const created = holdersRepo.create({
    userId: user.id,
    label,
    color,
    initials,
  })
  return NextResponse.json(toListItem(created))
}
