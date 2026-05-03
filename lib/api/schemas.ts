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
