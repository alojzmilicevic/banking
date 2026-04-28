import { eb } from './api'
import type {
  CompleteAuthInput,
  CompleteAuthResult,
  StartAuthInput,
  StartAuthResult,
} from '../types'

export interface EBStartExtra {
  aspspName: string
  aspspCountry: string
  authMethod?: string
}

export async function ebStartAuth(input: StartAuthInput): Promise<StartAuthResult> {
  const extra = input.extra as unknown as EBStartExtra
  const aspsps = await eb.listASPSPs(extra.aspspCountry)
  const aspsp = aspsps.find((a) => a.name === extra.aspspName)
  if (!aspsp) throw new Error(`Unknown ASPSP ${extra.aspspName}/${extra.aspspCountry}`)

  const validitySeconds = Math.min(aspsp.maximum_consent_validity ?? 90 * 86400, 180 * 86400)
  const validUntil = new Date(Date.now() + validitySeconds * 1000).toISOString()

  const authMethod =
    extra.authMethod ??
    aspsp.auth_methods?.find((m) => m.psu_type === 'personal' || !m.psu_type)?.name

  const auth = await eb.startAuth({
    aspspName: extra.aspspName,
    aspspCountry: extra.aspspCountry,
    redirectUrl: input.redirectUrl,
    state: input.state,
    validUntil,
    psuType: 'personal',
    authMethod,
  })

  return { url: auth.url, authorizationId: auth.authorization_id }
}

export async function ebCompleteAuth(input: CompleteAuthInput): Promise<CompleteAuthResult> {
  const session = await eb.exchangeCode(input.code)
  return {
    externalId: session.session_id,
    validUntil: new Date(session.access.valid_until).getTime(),
    label: `${session.aspsp.name} (${session.aspsp.country})`,
    raw: { aspsp: session.aspsp },
  }
}
