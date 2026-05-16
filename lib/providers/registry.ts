import type { Provider } from './types'
import { avanzaProvider } from './avanza'
import { enableBankingProvider } from './enable-banking'
import { handelsbankenProvider } from './handelsbanken'

const defaultProviders: Record<string, Provider> = {
  [enableBankingProvider.id]: enableBankingProvider,
  [avanzaProvider.id]: avanzaProvider,
  [handelsbankenProvider.id]: handelsbankenProvider,
  // Future: klarna, lunar, ...
}

let providers: Record<string, Provider> = defaultProviders

export function getProvider(id: string): Provider {
  const p = providers[id]
  if (!p) throw new Error(`Unknown provider: ${id}`)
  return p
}

// Test-only seam: substitute the registry so the orchestrator and routes
// can run against fake providers without `vi.mock`. Returns the previous
// registry so the caller can restore it in `afterEach`.
export function __setProviderRegistryForTests(
  next: Record<string, Provider>,
): Record<string, Provider> {
  const prev = providers
  providers = next
  return prev
}

export function __resetProviderRegistryForTests(): void {
  providers = defaultProviders
}
