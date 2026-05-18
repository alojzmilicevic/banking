'use client'

// Minimal accessible confirm dialog. Uses the native <dialog> element so
// the browser handles focus-trapping, Escape-to-close, and the
// inert-background contract for us. We just style the backdrop via
// ::backdrop and the dialog itself via Tailwind.

import { useEffect, useRef } from 'react'
import { Button } from './button'
import { cn } from '@/lib/utils'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  // Marks the confirm button as destructive (red). Defaults to true since
  // this dialog is primarily used for delete/disconnect flows.
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  // showModal()/close() are the only way to toggle a <dialog> as a modal —
  // setting `open` as a prop opens it non-modally (no backdrop, no
  // focus-trap). useEffect mirrors React's `open` state into the imperative
  // API.
  useEffect(() => {
    const dlg = ref.current
    if (!dlg) return
    if (open && !dlg.open) dlg.showModal()
    else if (!open && dlg.open) dlg.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onCancel}
      onCancel={onCancel}
      className={cn(
        // `m-auto` restores the UA stylesheet's centering — Tailwind's
        // Preflight resets `margin: 0` on every element, which strips the
        // browser default that horizontally + vertically centers a modal
        // <dialog>. Without it the dialog snaps to the top-left corner.
        'rounded-14 border border-border bg-popover p-0 text-foreground shadow-aloma-lg backdrop:bg-black/60',
        'open:m-auto open:flex open:flex-col open:gap-4 open:p-5 open:w-[min(28rem,calc(100vw-2rem))]',
      )}
    >
      <div>
        <h2 className="text-16 font-semibold">{title}</h2>
        {description && (
          <div className="mt-1.5 text-13 text-text-faint">{description}</div>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={destructive ? 'destructive' : 'default'}
          onClick={onConfirm}
          disabled={busy}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  )
}
