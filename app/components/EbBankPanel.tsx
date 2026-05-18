'use client'

import { useState } from 'react'
import { Globe, Loader2 } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { useInstitutions, useStartEbAuth, type ASPSP } from '@/lib/queries'
import { cn } from '@/lib/utils'

function key(a: ASPSP) {
  return `${a.name}||${a.country}`
}

// Pinned to the top as quick-pick tiles. Still in the dropdown too —
// the tiles just skip 1-2 clicks for the 95% case.
const POPULAR_SE = ['Handelsbanken', 'Swedbank', 'SEB', 'Nordea']

export function EbBankPanel({ holderId }: { holderId: string }) {
  const [country, setCountry] = useState('SE')
  const [selected, setSelected] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const aspsps = useInstitutions(country)
  const startEb = useStartEbAuth()

  async function connect() {
    if (!selected) return
    const aspsp = aspsps.data?.find((a) => key(a) === selected)
    if (!aspsp) return setLocalError('Bank not found')
    setLocalError(null)
    try {
      const challenge = await startEb.mutateAsync({
        aspspName: aspsp.name,
        aspspCountry: aspsp.country,
        holderId,
      })
      if (challenge.kind === 'error') throw new Error(challenge.message)
      if (challenge.kind !== 'redirect' || !challenge.url) {
        throw new Error(`Unexpected challenge: ${challenge.kind}`)
      }
      window.location.href = challenge.url
    } catch (e) {
      setLocalError((e as Error).message)
    }
  }

  const error = localError ?? aspsps.error?.message ?? startEb.error?.message ?? null

  const popular =
    country === 'SE' && aspsps.data
      ? aspsps.data.filter((a) => POPULAR_SE.includes(a.name))
      : []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs">
        <Globe className="size-3.5 text-muted-foreground" />
        <Select value={country} onChange={(e) => setCountry(e.target.value)} className="flex-1">
          <option value="SE">Sweden</option>
          <option value="NO">Norway</option>
          <option value="DK">Denmark</option>
          <option value="FI">Finland</option>
          <option value="DE">Germany</option>
          <option value="GB">UK</option>
        </Select>
      </div>

      {popular.length > 0 && (
        <div>
          <p className="mb-1.5 text-11 font-semibold uppercase tracking-eyebrow text-muted-foreground">
            Popular
          </p>
          <div className="grid grid-cols-2 gap-2">
            {popular.map((a) => (
              <button
                key={key(a)}
                type="button"
                onClick={() => setSelected(key(a))}
                className={cn(
                  'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                  selected === key(a)
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-border bg-card hover:border-input-border',
                )}
              >
                {a.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-11 font-semibold uppercase tracking-eyebrow text-muted-foreground">
          All banks
        </p>
        {!aspsps.isLoading && (aspsps.data?.length ?? 0) === 0 ? (
          <p className="rounded-10 border border-dashed border-border-subtle px-3 py-2.5 text-12 text-text-faint">
            No banks available for {country}. Try a different country.
          </p>
        ) : (
          <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">{aspsps.isLoading ? 'Loading banks…' : 'Search and select…'}</option>
            {aspsps.data?.map((a) => {
              const days = a.maximum_consent_validity
                ? Math.floor(a.maximum_consent_validity / 86400)
                : null
              return (
                <option key={key(a)} value={key(a)}>
                  {a.name}
                  {days ? ` — ${days}d max consent` : ''}
                  {a.beta ? ' (beta)' : ''}
                </option>
              )
            })}
          </Select>
        )}
      </div>

      {error && <Alert>{error}</Alert>}

      <Button onClick={connect} disabled={!selected || startEb.isPending}>
        {startEb.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
        {startEb.isPending ? 'Redirecting…' : 'Continue to BankID'}
      </Button>
    </div>
  )
}
