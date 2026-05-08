// Tiny adapter around Zod for route handlers. Keeps each route's parsing
// uniform: parse → 400 on failure, parsed value on success.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { PeriodQuerySchema, type Period } from './schemas'

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; response: NextResponse }

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
    .join('; ')
}

export async function validateJson<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<ValidationResult<z.infer<S>>> {
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

export function validateQuery<S extends z.ZodTypeAny>(
  url: URL,
  schema: S,
): ValidationResult<z.infer<S>> {
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

// Shared helper for routes that read `?period=`. Falls back to '1Y' when
// the param is absent or unrecognised so the FE doesn't have to special-case
// the very first request.
export function getPeriodFromUrl(url: URL): Period {
  const parsed = PeriodQuerySchema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  )
  return parsed.success ? parsed.data.period : '1Y'
}
