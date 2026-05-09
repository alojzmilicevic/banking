// GET  /api/holders → the household member roster, ordered by displayOrder.
// POST /api/holders → add a new household member. Body: { label, initials?,
// color? }. Server fills in defaults when initials/color are omitted.

import { NextResponse } from 'next/server'
import * as holdersRepo from '@/lib/repositories/holders'
import * as usersRepo from '@/lib/repositories/users'
import type { HolderListItem } from '@/lib/api/dashboard'
import { deriveInitials, pickHolderColor } from '@/lib/holders'
import type { HolderRow } from '@/lib/db/schema'
import { HolderBodySchema } from '@/lib/api/schemas'
import { validateJson } from '@/lib/api/validate'
import { requireUser } from '@/lib/api/route-helpers'

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
  const auth = requireUser()
  if (auth.response) return auth.response
  const parsed = await validateJson(req, HolderBodySchema)
  if (!parsed.ok) return parsed.response
  const { label, initials: initialsInput, color: colorInput } = parsed.data
  const existing = holdersRepo.listForUser(auth.user.id)
  const initials = initialsInput
    ? initialsInput.toUpperCase().slice(0, 3)
    : deriveInitials(label)
  const color = colorInput ?? pickHolderColor(existing.map((h) => h.color))
  const created = holdersRepo.create({
    userId: auth.user.id,
    label,
    color,
    initials,
  })
  return NextResponse.json(toListItem(created))
}
