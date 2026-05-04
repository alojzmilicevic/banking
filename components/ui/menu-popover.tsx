'use client'

import { useState } from 'react'
import * as Popover from '@radix-ui/react-popover'
import { motion } from 'motion/react'
import { MoreVertical } from 'lucide-react'

export function MenuPopover({
  triggerLabel,
  children,
}: {
  triggerLabel: string
  children: (api: { close: () => void }) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={triggerLabel}
          title={triggerLabel}
          className="ml-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-7 border border-border bg-[rgba(255,255,255,0.05)] text-muted-foreground transition-colors hover:bg-[rgba(255,255,255,0.09)] hover:text-foreground"
        >
          <MoreVertical className="size-3.75" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="right" align="start" sideOffset={8} collisionPadding={16} asChild>
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.14 }}
            className="z-50 w-85 overflow-hidden rounded-14 border border-border bg-popover shadow-aloma-lg outline-none"
          >
            {children({ close })}
          </motion.div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
