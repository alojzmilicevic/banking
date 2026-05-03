import { NextResponse } from 'next/server'
import {
  listChromeProfiles,
  readAvanzaCookiesFromChrome,
} from '@/lib/providers/avanza/extract-cookies'

// GET /api/avanza/extract-cookies?profile=<id>
//   Reads avanza.se cookies from the named Chrome profile and returns a
//   ready-to-use Cookie header string. macOS prompts for Keychain access
//   on first call. Defaults to "Default" profile if not specified.
//
// GET /api/avanza/extract-cookies?list=1
//   Returns the list of available Chrome profiles so the UI can offer a
//   picker — needed for households where each person uses their own
//   profile (Chrome multi-profile).

export async function GET(req: Request) {
  const url = new URL(req.url)
  if (url.searchParams.get('list') === '1') {
    try {
      const profiles = await listChromeProfiles()
      return NextResponse.json({ profiles })
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 })
    }
  }

  const profile = url.searchParams.get('profile') ?? 'Default'
  try {
    const result = await readAvanzaCookiesFromChrome(profile)
    if (result.count === 0) {
      return NextResponse.json(
        {
          error: `No avanza.se cookies found in Chrome profile "${profile}" — make sure you're logged in to avanza.se under that profile`,
        },
        { status: 404 },
      )
    }
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
