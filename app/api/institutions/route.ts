import { NextResponse } from 'next/server'
import { getProvider } from '@/lib/providers/registry'
import type { EBASPSP } from '@/lib/providers/enable-banking/api'

// In-memory cache for the (mostly static) institutions list. This data
// changes rarely and is the only thing we cache outside the DB.
const cache = new Map<string, { data: unknown; expiresAt: number }>()
const TTL_MS = 24 * 3600 * 1000

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const country = searchParams.get('country') || 'SE'
  const providerId = searchParams.get('provider') || 'enable-banking'
  const fresh = searchParams.get('fresh') === '1'
  const key = `${providerId}:${country}`

  const hit = cache.get(key)
  if (!fresh && hit && hit.expiresAt > Date.now()) {
    return NextResponse.json(hit.data)
  }

  try {
    const provider = getProvider(providerId)
    if (!provider.listInstitutions) {
      return NextResponse.json({ error: 'Provider does not support institution listing' }, { status: 400 })
    }
    const all = (await provider.listInstitutions(country)) as EBASPSP[]
    const personal = all.filter((a) => !a.psu_types || a.psu_types.includes('personal'))
    cache.set(key, { data: personal, expiresAt: Date.now() + TTL_MS })
    return NextResponse.json(personal)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
