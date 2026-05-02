// Tiny adapter around Zod for route handlers. Keeps each route's parsing
// uniform: parse → 400 on failure, parsed value on success.

import { NextResponse } from 'next/server'
import type { z } from 'zod'

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse }

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('; ')
}

export async function validateJson<T>(
  req: Request,
  schema: z.ZodType<T>,
): Promise<ValidationResult<T>> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }),
    }
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Invalid request: ${formatIssues(parsed.error)}` },
        { status: 400 },
      ),
    }
  }
  return { ok: true, data: parsed.data }
}

export function validateQuery<T>(
  url: URL,
  schema: z.ZodType<T>,
): ValidationResult<T> {
  const params: Record<string, string> = {}
  for (const [k, v] of url.searchParams.entries()) params[k] = v
  const parsed = schema.safeParse(params)
  if (!parsed.success) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Invalid query: ${formatIssues(parsed.error)}` },
        { status: 400 },
      ),
    }
  }
  return { ok: true, data: parsed.data }
}
