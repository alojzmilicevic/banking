import type { Provider } from '../types'
import { avanzaPollAuth, avanzaStartAuth } from './auth'
import { avanzaSync } from './sync'

export const avanzaProvider: Provider = {
  id: 'avanza',
  name: 'Avanza',
  capabilities: { cash: true, investments: true, pensions: true },
  authFlows: ['bankid'], // 'credentials' added once password + TOTP are configured

  authFormSchema: (flow) => {
    if (flow === 'bankid') {
      return [
        {
          name: 'personnummer',
          label: 'Personnummer (YYYYMMDDXXXX)',
          type: 'tel',
          placeholder: '198001012345',
          required: true,
          pattern: '^\\d{8}-?\\d{4}$',
        },
      ]
    }
    if (flow === 'credentials') {
      return [
        { name: 'username', label: 'Username', type: 'text', required: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'totpSecret', label: 'TOTP secret', type: 'text', required: true },
      ]
    }
    return []
  },

  startAuth: avanzaStartAuth,
  pollAuth: avanzaPollAuth,
  sync: avanzaSync,
}
