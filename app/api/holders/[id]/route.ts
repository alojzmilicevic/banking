// PATCH /api/holders/:id  body { color?: string }
// Per-holder edits surfaced from the sidebar (color picker today;
// rename/initials may follow). Color is whitelisted against the preset
// palette in the schema so the four derived tints stay balanced.

import { NextResponse } from 'next/server'
import * as holdersRepo from '@/lib/repositories/holders'
import type { HolderListItem } from '@/lib/api/dashboard'
import type { HolderRow } from '@/lib/db/schema'
import { PatchHolderBodySchema } from '@/lib/api/schemas'
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

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = requireUser()
  if (auth.response) return auth.response

  const parsed = await validateJson(req, PatchHolderBodySchema)
  if (!parsed.ok) return parsed.response

  const updated = holdersRepo.update(id, auth.user.id, parsed.data)
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(toListItem(updated))
}
