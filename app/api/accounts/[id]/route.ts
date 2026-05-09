import { NextResponse } from 'next/server'
import { setAccountExcluded } from '@/lib/services/wealth'
import { PatchAccountBodySchema } from '@/lib/api/schemas'
import { validateJson } from '@/lib/api/validate'
import { requireUser } from '@/lib/api/route-helpers'

// PATCH /api/accounts/:id  body { excludedFromTotal: boolean }
// Toggles whether an account contributes to the user's wealth total.
// The wealth service handles the snapshot rebuild so the chart updates
// in step.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = requireUser()
  if (auth.response) return auth.response

  const parsed = await validateJson(req, PatchAccountBodySchema)
  if (!parsed.ok) return parsed.response

  const result = setAccountExcluded(id, parsed.data.excludedFromTotal, auth.user.id)
  if (!result) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(result)
}
