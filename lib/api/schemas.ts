// Centralised request schemas. Defining them once keeps the route
// handlers thin and makes it easy to share types between client + server.

import { z } from 'zod'

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

export const PatchAccountBodySchema = z.object({
  excludedFromTotal: z.boolean(),
})

export const PERIODS = ['1W', '1M', '3M', '1Y', 'ALL'] as const
export const PeriodQuerySchema = z.object({
  period: z.enum(PERIODS).default('1Y'),
})
export type Period = (typeof PERIODS)[number]

export const InstitutionsQuerySchema = z.object({
  country: z.string().regex(/^[A-Za-z]{2}$/, 'country must be a 2-letter code').default('SE'),
  provider: z.string().min(1).default('enable-banking'),
  fresh: z.enum(['0', '1']).optional(),
})

export const HolderBodySchema = z.object({
  label: z.string().trim().min(1, 'Label required').max(100),
  initials: z.string().trim().min(1).max(3).optional(),
  color: z.string().trim().min(1).max(32).optional(),
})

export const SyncQuerySchema = z.object({
  id: z.string().min(1).optional(),
  mode: z.enum(['auto', 'force-full', 'force-incremental']).default('auto'),
})

export const SyncProgressQuerySchema = z.object({
  id: z.string().min(1, 'id query param required'),
})
