import { NextResponse } from 'next/server'
import { readAvanzaCookiesFromChrome } from '@/lib/providers/avanza/extract-cookies'

// GET /api/avanza/extract-cookies
// Reads avanza.se cookies from the local Chrome profile and returns a
// ready-to-use Cookie header string. macOS will prompt for Keychain
// access on first call (Chrome cookie values are encrypted with the
// user's keychain).

export async function GET() {
  try {
    const result = await readAvanzaCookiesFromChrome()
    if (result.count === 0) {
      return NextResponse.json(
        { error: 'No avanza.se cookies found in Chrome — make sure you are logged in to avanza.se in Chrome' },
        { status: 404 },
      )
    }
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
