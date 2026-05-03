// GET /api/holders → the household member roster, ordered by displayOrder.
// Used by the link-bank flow to render holder picker chips. Empty array
// when the DB has no users yet (first-boot before any connection).

import { NextResponse } from 'next/server'
import * as holdersRepo from '@/lib/repositories/holders'
import * as usersRepo from '@/lib/repositories/users'
import type { HolderListItem } from '@/lib/api/dashboard'

export async function GET() {
  const user = usersRepo.getDefault()
  if (!user) return NextResponse.json([])
  const rows = holdersRepo.listForUser(user.id).map<HolderListItem>((h) => ({
    id: h.id,
    label: h.label,
    color: h.color,
    initials: h.initials,
    displayOrder: h.displayOrder,
  }))
  return NextResponse.json(rows)
}
