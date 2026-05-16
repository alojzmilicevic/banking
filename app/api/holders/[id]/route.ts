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
    personnummer: h.personnummer,
    displayOrder: h.displayOrder,
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = requireUser()
  if (auth.response) return auth.response

  const parsed = await validateJson(req, PatchHolderBodySchema)
  if (!parsed.ok) return parsed.response

  // Empty-string personnummer means "clear it" — translate to null
  // for the repo so the column is set to SQL NULL rather than ''.
  const patch: { color?: string; personnummer?: string | null } = { ...parsed.data }
  if (patch.personnummer === '') patch.personnummer = null

  const updated = holdersRepo.update(id, auth.user.id, patch)
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(toListItem(updated))
}
