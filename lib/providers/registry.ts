import type { Provider } from './types'
import { enableBankingProvider } from './enable-banking'

const providers: Record<string, Provider> = {
  [enableBankingProvider.id]: enableBankingProvider,
  // Future: avanza, klarna, lunar, ...
}

export function getProvider(id: string): Provider {
  const p = providers[id]
  if (!p) throw new Error(`Unknown provider: ${id}`)
  return p
}

export function listProviders(): Provider[] {
  return Object.values(providers)
}
