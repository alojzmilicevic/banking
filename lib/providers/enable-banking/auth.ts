import { eb } from './api'
import type {
  AuthChallenge,
  CompleteAuthInput,
  ConnectionMaterial,
  StartAuthInput,
} from '../types'

export interface EBStartExtra {
  aspspName: string
  aspspCountry: string
  authMethod?: string
}

export async function ebStartAuth(input: StartAuthInput): Promise<AuthChallenge> {
  if (input.flow !== 'redirect') {
    return { kind: 'error', message: `Enable Banking only supports 'redirect' flow` }
  }
  const extra = input.input as unknown as EBStartExtra
  const aspsps = await eb.listASPSPs(extra.aspspCountry)
  const aspsp = aspsps.find((a) => a.name === extra.aspspName)
  if (!aspsp) {
    return { kind: 'error', message: `Unknown ASPSP ${extra.aspspName}/${extra.aspspCountry}` }
  }

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

  return {
    kind: 'redirect',
    url: auth.url,
    state: input.state,
    expiresAt: Date.now() + 30 * 60 * 1000, // 30 min
  }
}

export async function ebCompleteAuth(input: CompleteAuthInput): Promise<ConnectionMaterial> {
  if (!input.code) throw new Error('EB completeAuth: missing code')
  const session = await eb.exchangeCode(input.code)
  if (!session.session_id) throw new Error('EB completeAuth: response missing session_id')
  return {
    externalId: session.session_id,
    validUntil: new Date(session.access.valid_until).getTime(),
    label: `${session.aspsp.name} (${session.aspsp.country})`,
    raw: { aspsp: session.aspsp },
  }
}
