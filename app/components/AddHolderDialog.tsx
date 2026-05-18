'use client'

// Modal for creating a new household member. Collects name + personnummer
// + color in a single step so the user lands on the dashboard with a
// usable holder row (BankID autofill for Handelsbanken depends on
// personnummer being set up front).
//
// Mirrors components/ui/confirm-dialog.tsx — native <dialog> for free
// focus-trap + Escape + inert background.

import { useEffect, useRef, useState } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAddHolder, useHolders } from '@/lib/queries'
import { HOLDER_PALETTE, pickHolderColor } from '@/lib/holders'
import { cn } from '@/lib/utils'

export function AddHolderDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const holders = useHolders()
  const addHolder = useAddHolder()

  const [label, setLabel] = useState('')
  const [personnummer, setPersonnummer] = useState('')
  const [color, setColor] = useState<string>(() =>
    pickHolderColor(holders.data?.map((h) => h.color) ?? []),
  )
  const [error, setError] = useState<string | null>(null)

  // Reset state every time the dialog opens — without this, cancelling
  // and reopening would show the previous draft + a stale color suggestion.
  useEffect(() => {
    if (!open) return
    setLabel('')
    setPersonnummer('')
    setError(null)
    setColor(pickHolderColor(holders.data?.map((h) => h.color) ?? []))
    // holders.data is the only dependency that matters at open time; eslint
    // would push us to depend on `open` only, which is already the gate.
  }, [open, holders.data])

  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (open && !dlg.open) dlg.showModal()
    else if (!open && dlg.open) dlg.close()
  }, [open])

  const takenColors = new Set(holders.data?.map((h) => h.color) ?? [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = label.trim()
    if (!trimmed) return
    setError(null)
    try {
      await addHolder.mutateAsync({
        label: trimmed,
        color,
        personnummer: personnummer.trim() || undefined,
      })
      onClose()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  function cancel() {
    if (addHolder.isPending) return
    onClose()
  }

  return (
    <dialog
      ref={ref}
      onClose={cancel}
      onCancel={cancel}
      className={cn(
        // `m-auto` restores the UA stylesheet's centering — Tailwind's
        // Preflight resets `margin: 0` on every element, which strips the
        // browser default that horizontally + vertically centers a modal
        // <dialog>. Without it the dialog snaps to the top-left corner.
        'rounded-14 border border-border bg-popover p-0 text-foreground shadow-aloma-lg backdrop:bg-black/60',
        'open:m-auto open:w-[min(28rem,calc(100vw-2rem))] open:p-5',
      )}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <h2 className="text-16 font-semibold">Add household member</h2>
          <p className="mt-1 text-13 text-text-faint">
            Personnummer lets us autofill BankID when syncing this person&apos;s banks.
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-12 font-medium text-text-faint">Name</span>
          <Input
            autoFocus
            type="text"
            placeholder="e.g. Alma"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={addHolder.isPending}
            maxLength={100}
            className="px-3 text-14"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-12 font-medium text-text-faint">
            Personnummer <span className="text-text-disabled">(optional)</span>
          </span>
          <Input
            type="text"
            inputMode="numeric"
            placeholder="YYYYMMDD-XXXX"
            value={personnummer}
            onChange={(e) => setPersonnummer(e.target.value)}
            disabled={addHolder.isPending}
            maxLength={14}
            className="px-3 text-14 tabular-nums"
            autoComplete="off"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-12 font-medium text-text-faint">Color</span>
          <div
            className="flex flex-wrap gap-1.5"
            role="radiogroup"
            aria-label="Member color"
          >
            {HOLDER_PALETTE.map((c) => {
              const selected = c === color
              const taken = takenColors.has(c) && !selected
              const title = taken ? 'Already used by another member' : c
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={title}
                  aria-disabled={taken}
                  title={title}
                  onClick={() => {
                    if (taken) return
                    setColor(c)
                  }}
                  disabled={taken || addHolder.isPending}
                  style={{ '--swatch': c } as React.CSSProperties}
                  className={cn(
                    'flex size-7 cursor-pointer items-center justify-center rounded-full bg-(--swatch) ring-1 ring-white/10 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90',
                    selected && 'ring-2 ring-white/80',
                    taken && 'cursor-not-allowed opacity-40 hover:scale-100',
                  )}
                >
                  {selected && <Check className="size-4 text-black/80" strokeWidth={3} />}
                </button>
              )
            })}
          </div>
        </div>

        {error && <Alert>{error}</Alert>}

        <div className="mt-1 flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={cancel}
            disabled={addHolder.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={!label.trim() || addHolder.isPending}
          >
            {addHolder.isPending && <Loader2 className="size-3.5 animate-spin" />}
            Add member
          </Button>
        </div>
      </form>
    </dialog>
  )
}
