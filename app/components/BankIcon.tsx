'use client'

import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

function slugifyLabel(providerId: string, label: string | null): string {
  if (providerId === 'avanza') return 'avanza'
  if (!label) return ''
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

// Asset extension per slug — we accept whatever the bank's brand page
// gives us (PNG, JPEG, SVG) rather than re-encoding. Add a slug here
// when committing a new logo to public/banks/.
const BANK_ASSET: Record<string, string> = {
  avanza: '/banks/avanza.png',
  handelsbanken: '/banks/handelsbanken.jpeg',
}

const SIZE_CLASSES = {
  sm: 'h-5 w-5',
  md: 'h-7 w-7',
  lg: 'h-9 w-9',
} as const

export type BankIconSize = keyof typeof SIZE_CLASSES

export function BankIcon({
  providerId,
  label,
  size = 'md',
  connected = true,
  className,
}: {
  providerId: string
  label: string | null
  size?: BankIconSize
  connected?: boolean
  className?: string
}) {
  const slug = slugifyLabel(providerId, label)
  const src = BANK_ASSET[slug]
  const [errored, setErrored] = useState(false)
  const showFallback = errored || !src

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm transition-opacity',
        SIZE_CLASSES[size],
        !connected && 'opacity-30 grayscale',
        className,
      )}
      title={label ?? providerId}
>
      {showFallback ? (
        <Building2 className="size-[60%] text-text-faint" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          onError={() => setErrored(true)}
          className="block size-full object-contain"
        />
      )}
    </span>
  )
}
