import { NextResponse } from 'next/server'
import { setAccountAlias, setAccountExcluded } from '@/lib/services/wealth'
import { PatchAccountBodySchema } from '@/lib/api/schemas'
import { validateJson } from '@/lib/api/validate'
import { requireUser } from '@/lib/api/route-helpers'

// PATCH /api/accounts/:id  body { excludedFromTotal?: boolean; alias?: string }
//   excludedFromTotal — toggles whether the account contributes to totals
//   alias              — user-supplied display name; "" clears it
// Both fields are independent so the FE can update them in isolation; the
// response echoes whichever changed (plus the unchanged values).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = requireUser()
  if (auth.response) return auth.response

  const parsed = await validateJson(req, PatchAccountBodySchema)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  let excludedResult: ReturnType<typeof setAccountExcluded> = null
  let aliasResult: ReturnType<typeof setAccountAlias> = null

  if (body.excludedFromTotal !== undefined) {
    excludedResult = setAccountExcluded(id, body.excludedFromTotal, auth.user.id)
    if (!excludedResult) return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  if (body.alias !== undefined) {
    aliasResult = setAccountAlias(id, body.alias, auth.user.id)
    if (!aliasResult) return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  return NextResponse.json({
    id,
    ...(excludedResult && { excludedFromTotal: excludedResult.excludedFromTotal }),
    ...(aliasResult && { alias: aliasResult.alias }),
  })
}
