import type { Provider } from '../types'
import { avanzaStartAuth } from './auth'
import { avanzaSync } from './sync'

export const avanzaProvider: Provider = {
  id: 'avanza',
  name: 'Avanza',
  capabilities: { cash: true, investments: true, pensions: true },
  authFlows: ['credentials'],

  authFormSchema: (flow) => {
    if (flow !== 'credentials') return []
    return [
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
      {
        name: 'totpSeed',
        label: 'TOTP seed (base32)',
        type: 'password',
        placeholder: 'MXF42B22ORYSEEONOZDCWEMOXVZ24AUQ',
        required: true,
      },
    ]
  },

  startAuth: avanzaStartAuth,
  sync: avanzaSync,
}
