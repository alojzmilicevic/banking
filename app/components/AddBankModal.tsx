'use client'
// Visual add-bank flow. Provider tiles instead of tabs, holder picked
// once at the top as small avatar buttons, the right body slides in for
// the selected provider.

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  ArrowRight,
  Building2,
  Check,
  Cookie,
  Globe,
  Loader2,
  TrendingUp,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  useConnectAvanza,
  useConnections,
  useExtractAvanzaCookies,
  useInstitutions,
  useStartEbAuth,
  type ASPSP,
  type ConnectionView,
  type Holder,
} from '@/lib/queries'

type LinkerHolder = Exclude<Holder, 'joint'>
type Provider = 'avanza' | 'eb'

function key(a: ASPSP) {
  return `${a.name}||${a.country}`
}

const HOLDERS: { id: LinkerHolder; label: string; emoji: string; tint: string }[] = [
  { id: 'alma', label: 'Alma', emoji: '🌷', tint: 'from-pink-500/20' },
  { id: 'alojz', label: 'Alojz', emoji: '🦊', tint: 'from-amber-500/20' },
]

export default function AddBankModal({
  open,
  onClose,
  onConnected,
  initialHolder,
}: {
  open: boolean
  onClose: () => void
  onConnected?: () => void
  initialHolder?: LinkerHolder
}) {
  const [holder, setHolder] = useState<LinkerHolder>(initialHolder ?? 'alojz')
  const [provider, setProvider] = useState<Provider | null>(null)

  const connections = useConnections()

  // Re-sync holder when the caller pre-selects one (e.g., clicking an
  // empty-state CTA for a specific household member).
  useEffect(() => {
    if (open && initialHolder) setHolder(initialHolder)
  }, [open, initialHolder])

  // Per-holder map of which providers already have a connection. Used to
  // dim already-linked provider tiles and warn that picking them will
  // re-link (refresh credentials) rather than add a new bank.
  const linkedByHolder = useMemo(() => {
    const map = new Map<LinkerHolder, { avanza: ConnectionView | null; eb: ConnectionView[] }>([
      ['alma', { avanza: null, eb: [] }],
      ['alojz', { avanza: null, eb: [] }],
    ])
    for (const c of connections.data ?? []) {
      if (c.holder !== 'alma' && c.holder !== 'alojz') continue
      const slot = map.get(c.holder)!
      if (c.providerId === 'avanza') slot.avanza = c
      else if (c.providerId === 'enable-banking') slot.eb.push(c)
    }
    return map
  }, [connections.data])

  const linkedHere = linkedByHolder.get(holder)!
  const avanzaLinked = !!linkedHere.avanza
  const ebLinked = linkedHere.eb.length > 0
  const ebLabels = linkedHere.eb.map((c) => c.label ?? 'a bank').join(', ')

  return (
    <Modal
      open={open}
      onClose={() => {
        setProvider(null)
        onClose()
      }}
      className="max-w-xl"
      title={
        <div>
          <h2 className="text-base font-semibold">Link a bank</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Joint accounts get auto-detected when both link the same one.
          </p>
        </div>
      }
    >
      {/* Holder — avatar segment */}
      <div className="mb-5">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Linked by
          </p>
          <motion.p
            key={holder}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="text-xs font-medium text-foreground"
          >
            {HOLDERS.find((h) => h.id === holder)?.label}
          </motion.p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {HOLDERS.map((h) => {
            const active = holder === h.id
            return (
              <motion.button
                key={h.id}
                type="button"
                onClick={() => setHolder(h.id)}
                whileTap={{ scale: 0.97 }}
                aria-pressed={active}
                className={`group relative flex items-center gap-3 overflow-hidden rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                  active
                    ? 'border-primary bg-card shadow-md ring-2 ring-primary/20'
                    : 'border-border bg-card/30 opacity-60 hover:border-input-border hover:opacity-100'
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="holder-bg"
                    className={`absolute inset-0 -z-10 bg-gradient-to-br ${h.tint} to-transparent`}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl transition-all ${
                    active
                      ? 'bg-card ring-2 ring-primary/40'
                      : 'bg-secondary/60 grayscale'
                  }`}
                >
                  {h.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-semibold transition-colors ${
                      active ? 'text-foreground' : 'text-muted-foreground'
                    }`}
                  >
                    {h.label}
                  </p>
                  <p
                    className={`text-[0.7rem] transition-colors ${
                      active ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {(() => {
                      const slot = linkedByHolder.get(h.id)!
                      const count = (slot.avanza ? 1 : 0) + slot.eb.length
                      if (count === 0) return active ? 'Selected · nothing linked' : 'Nothing linked'
                      const parts: string[] = []
                      if (slot.avanza) parts.push('Avanza')
                      if (slot.eb.length > 0)
                        parts.push(slot.eb.length === 1 ? '1 bank' : `${slot.eb.length} banks`)
                      return `${active ? 'Selected · ' : ''}${parts.join(' + ')}`
                    })()}
                  </p>
                </div>
                {active && (
                  <motion.span
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    aria-hidden
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </motion.span>
                )}
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* Provider grid */}
      {!provider && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
        >
          <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Where from
          </p>
          <div className="grid grid-cols-2 gap-2">
            <ProviderTile
              icon={<TrendingUp className="h-5 w-5" />}
              tone="bg-gradient-to-br from-emerald-500/15 to-transparent"
              title="Avanza"
              subtitle="Stocks, funds, ISK & pension"
              hint={avanzaLinked ? 'Re-link to refresh cookies' : 'via Chrome cookies'}
              linked={avanzaLinked}
              onClick={() => setProvider('avanza')}
            />
            <ProviderTile
              icon={<Building2 className="h-5 w-5" />}
              tone="bg-gradient-to-br from-blue-500/15 to-transparent"
              title="A bank"
              subtitle={ebLinked ? `${ebLabels} linked` : 'Handelsbanken, Swedbank, SEB…'}
              hint={ebLinked ? 'Add another or re-link' : 'via BankID (PSD2)'}
              linked={ebLinked}
              onClick={() => setProvider('eb')}
            />
          </div>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {provider === 'avanza' && (
          <motion.div
            key="avanza-panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <BackButton onClick={() => setProvider(null)} />
            <AvanzaPanel
              holder={holder}
              onDone={() => {
                onConnected?.()
                onClose()
                setProvider(null)
              }}
            />
          </motion.div>
        )}
        {provider === 'eb' && (
          <motion.div
            key="eb-panel"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <BackButton onClick={() => setProvider(null)} />
            <BankPanel holder={holder} />
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  )
}

function ProviderTile({
  icon,
  tone,
  title,
  subtitle,
  hint,
  linked,
  onClick,
}: {
  icon: React.ReactNode
  tone: string
  title: string
  subtitle: string
  hint: string
  linked?: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: linked ? 0 : -2 }}
      whileTap={{ scale: 0.98 }}
      className={`group relative flex flex-col items-start gap-2 overflow-hidden rounded-xl border bg-card p-4 text-left transition-colors ${
        linked
          ? 'border-pos/30 opacity-70 hover:opacity-100'
          : 'border-border hover:border-input-border'
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-0 ${tone} ${
          linked ? 'opacity-30' : 'opacity-70'
        }`}
        aria-hidden
      />
      {linked && (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-pos-bg/80 px-1.5 py-0.5 text-[0.6rem] font-medium text-pos">
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
          Linked
        </span>
      )}
      <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/80 text-foreground">
        {icon}
      </div>
      <div className="relative">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-[0.72rem] text-muted-foreground">{subtitle}</p>
      </div>
      <div className="relative mt-auto flex items-center gap-1 text-[0.65rem] text-muted-foreground">
        {hint}
        <ArrowRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </motion.button>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-1 mb-3 inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <ArrowRight className="h-3 w-3 rotate-180" />
      Pick a different provider
    </button>
  )
}

function AvanzaPanel({ holder, onDone }: { holder: LinkerHolder; onDone: () => void }) {
  const [cookies, setCookies] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const extract = useExtractAvanzaCookies()
  const connect = useConnectAvanza()

  async function readFromChrome() {
    setLocalError(null)
    try {
      const data = await extract.mutateAsync()
      setCookies(data.cookieHeader)
    } catch {
      // surfaced via extract.error
    }
  }

  async function doConnect() {
    if (!cookies.trim()) {
      setLocalError('No cookies to connect with')
      return
    }
    setLocalError(null)
    try {
      const challenge = await connect.mutateAsync({ cookies: cookies.trim(), holder })
      if (challenge.kind !== 'complete') {
        throw new Error(challenge.message ?? `Unexpected: ${challenge.kind}`)
      }
      setCookies('')
      extract.reset()
      onDone()
    } catch {
      // surfaced via connect.error
    }
  }

  const busy = extract.isPending || connect.isPending
  const error = localError ?? extract.error?.message ?? connect.error?.message ?? null

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
        Log in to <code className="rounded bg-card px-1 py-0.5 text-[0.7rem]">avanza.se</code> in
        Chrome, then click <strong className="text-foreground">Read from Chrome</strong>. macOS
        Keychain may prompt the first time.
      </div>

      <Button onClick={readFromChrome} disabled={busy} variant="secondary">
        {extract.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cookie className="h-4 w-4" />}
        {extract.isPending ? 'Reading Chrome…' : 'Read from Chrome'}
      </Button>

      {extract.data && (
        <div className="rounded-md border border-pos/20 bg-pos-bg/40 px-3 py-2 text-xs text-pos">
          ✓ {extract.data.count} cookies extracted{' '}
          {extract.data.names.includes('csid') ? '· auth ✓' : '· auth ✗'}
        </div>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Or paste a Cookie header manually
        </summary>
        <Textarea
          value={cookies}
          onChange={(e) => setCookies(e.target.value)}
          placeholder="csid=...; cstoken=...; AZACSRF=...; ..."
          className="mt-2"
        />
      </details>

      {error && <Alert>{error}</Alert>}

      <Button onClick={doConnect} disabled={busy || !cookies.trim()}>
        {connect.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {connect.isPending ? 'Connecting…' : 'Connect Avanza'}
      </Button>
    </div>
  )
}

function BankPanel({ holder }: { holder: LinkerHolder }) {
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
        holder,
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

  // Pin Sweden's most-common banks at the top as quick-pick tiles. They're
  // still in the dropdown too — the tiles are just there to skip 1-2 clicks
  // for the 95% case.
  const POPULAR_SE = ['Handelsbanken', 'Swedbank', 'SEB', 'Nordea']
  const popular =
    country === 'SE' && aspsps.data
      ? aspsps.data.filter((a) => POPULAR_SE.includes(a.name))
      : []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-xs">
        <Globe className="h-3.5 w-3.5 text-muted-foreground" />
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
          <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
            Popular
          </p>
          <div className="grid grid-cols-2 gap-2">
            {popular.map((a) => (
              <button
                key={key(a)}
                type="button"
                onClick={() => setSelected(key(a))}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  selected === key(a)
                    ? 'border-primary/60 bg-primary/10'
                    : 'border-border bg-card hover:border-input-border'
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
          All banks
        </p>
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
      </div>

      {error && <Alert>{error}</Alert>}

      <Button onClick={connect} disabled={!selected || startEb.isPending}>
        {startEb.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {startEb.isPending ? 'Redirecting…' : 'Continue to BankID'}
      </Button>
    </div>
  )
}
