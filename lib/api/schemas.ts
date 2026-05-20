// Centralised request schemas. Defining them once keeps the route
// handlers thin and makes it easy to share types between client + server.

import { z } from 'zod'
import { isHolderPaletteColor } from '@/lib/holders'

const AuthFlowSchema = z.enum(['redirect', 'bankid', 'credentials', 'apikey'])

// `holderId` references holders.id (uuid). Server validates the holder
// belongs to the requesting user before linking. Optional — connections
// can be created without a holder and assigned later from the UI.
export const StartAuthBodySchema = z.object({
  providerId: z.string().min(1, 'providerId required'),
  flow: AuthFlowSchema.optional(),
  holderId: z.string().min(1).optional(),
  input: z.record(z.string(), z.unknown()).optional(),
})
export type StartAuthBody = z.infer<typeof StartAuthBodySchema>

export const PollAuthQuerySchema = z.object({
  state: z.string().min(1, 'state required'),
})

// OAuth callback can land here as either success (state + code) or as an
// error from the bank. Both shapes share the `state` echo.
export const AuthCallbackQuerySchema = z.object({
  state: z.string().optional(),
  code: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
})

// Account patch — every field optional, but at least one must be present
// so a no-op PATCH returns a clear 400 instead of silently succeeding.
//
// `alias`: empty string clears the override (falls back to provider name);
// any other string up to 100 chars is stored as-is.
export const PatchAccountBodySchema = z
  .object({
    excludedFromTotal: z.boolean().optional(),
    alias: z.string().trim().max(100).optional(),
  })
  .refine((v) => v.excludedFromTotal !== undefined || v.alias !== undefined, {
    message: 'at least one field is required',
  })

export const PERIODS = ['1W', '1M', '3M', '1Y', 'ALL'] as const
export const PeriodQuerySchema = z.object({
  period: z.enum(PERIODS).default('1Y'),
})
export type Period = (typeof PERIODS)[number]

// Single fallback for any place that pulls a period out of an untrusted
// source (URL query string, search params). Returns '1Y' for anything
// that isn't one of the known values, so a hand-edited `?period=foo`
// never throws through React Query / the timeseries service.
export function parsePeriod(raw: string | string[] | null | undefined): Period {
  if (typeof raw !== 'string') return '1Y'
  return (PERIODS as readonly string[]).includes(raw) ? (raw as Period) : '1Y'
}

export const InstitutionsQuerySchema = z.object({
  country: z.string().regex(/^[A-Za-z]{2}$/, 'country must be a 2-letter code').default('SE'),
  provider: z.string().min(1).default('enable-banking'),
  fresh: z.enum(['0', '1']).optional(),
})

// Swedish personnummer: 10 or 12 digits, optional dash between
// YYMMDD and the last 4. We normalize to 12-digit no-dash on store
// (transform strips non-digits and prepends century if needed).
const personnummerSchema = z
  .string()
  .trim()
  .refine((s) => /^\d{6,8}-?\d{4}$/.test(s), 'personnummer must be 10 or 12 digits, optional dash')
  .transform((s) => {
    const digits = s.replace(/\D/g, '')
    // 10 digits → assume 1900s for older formats. The user-facing
    // settings UI accepts both; HB's BankID field expects 12 digits.
    if (digits.length === 10) return `19${digits}`
    return digits
  })

export const HolderBodySchema = z.object({
  label: z.string().trim().min(1, 'Label required').max(100),
  initials: z.string().trim().min(1).max(3).optional(),
  // Whitelist creation colors against the preset palette too (same rule
  // as PATCH), so the picker in the Add Member modal can't write an
  // arbitrary OKLCH string and skew the four derived tints.
  color: z
    .string()
    .refine(isHolderPaletteColor, 'color must be one of the preset palette values')
    .optional(),
  personnummer: personnummerSchema.optional(),
})

// PATCH only allows fields the user can edit from the UI. Color is
// whitelisted against the preset palette so a stray request can't store
// an arbitrary OKLCH string and break the four derived tints.
export const PatchHolderBodySchema = z.object({
  color: z
    .string()
    .refine(isHolderPaletteColor, 'color must be one of the preset palette values')
    .optional(),
  // Empty string clears the stored value; the route handler converts
  // it to null before writing.
  personnummer: z.union([personnummerSchema, z.literal('')]).optional(),
})

export const SyncQuerySchema = z.object({
  id: z.string().min(1).optional(),
  mode: z.enum(['auto', 'force-full', 'force-incremental']).default('auto'),
})

export const SyncProgressQuerySchema = z.object({
  id: z.string().min(1, 'id query param required'),
})
