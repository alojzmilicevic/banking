import { NextResponse } from 'next/server'
import { getProvider } from '@/lib/providers/registry'
import { InstitutionsQuerySchema } from '@/lib/api/schemas'
import { validateQuery } from '@/lib/api/validate'
import { internalServerError } from '@/lib/api/route-helpers'

// In-memory cache for the (mostly static) institutions list. This data
// changes rarely and is the only thing we cache outside the DB.
const cache = new Map<string, { data: unknown; expiresAt: number }>()
const TTL_MS = 24 * 3600 * 1000

// Minimal subset of fields the route filters on. Provider-specific extras
// pass through unchanged in the response payload.
interface Institution {
  psu_types?: ('personal' | 'business')[]
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = validateQuery(url, InstitutionsQuerySchema)
  if (!parsed.ok) return parsed.response
  const { country, provider: providerId, fresh: freshParam } = parsed.data
  const fresh = freshParam === '1'
  const key = `${providerId}:${country.toUpperCase()}`

  const hit = cache.get(key)
  if (!fresh && hit && hit.expiresAt > Date.now()) {
    return NextResponse.json(hit.data)
  }

  try {
    const provider = getProvider(providerId)
    if (!provider.listInstitutions) {
      return NextResponse.json({ error: 'Provider does not support institution listing' }, { status: 400 })
    }
    const all = (await provider.listInstitutions(country.toUpperCase())) as Institution[]
    const personal = all.filter((a) => !a.psu_types || a.psu_types.includes('personal'))
    cache.set(key, { data: personal, expiresAt: Date.now() + TTL_MS })
    return NextResponse.json(personal)
  } catch (e) {
    return internalServerError(e)
  }
}
