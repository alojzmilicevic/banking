'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  children: ReactNode
  className?: string
  // When true, registers a global Escape shortcut that fires the same
  // navigation/callback. Skips when an editable element is focused so it
  // doesn't hijack form-clearing.
  escapeKey?: boolean
} & (
  | { href: string; onClick?: never }
  | { onClick: () => void; href?: never }
)

const baseClasses =
  'inline-flex w-fit items-center gap-1.5 text-11 text-text-faint transition-colors hover:text-foreground'

export function BackLink(props: Props) {
  const { children, className, escapeKey } = props
  const href = 'href' in props ? props.href : undefined
  const onClick = 'onClick' in props ? props.onClick : undefined
  const router = useRouter()

  useEffect(() => {
    if (!escapeKey) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        return
      }
      e.preventDefault()
      if (href) router.push(href)
      else onClick?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [escapeKey, href, onClick, router])

  const content = (
    <>
      <ArrowLeft className="size-3" />
      {children}
    </>
  )

  if (href) {
    return (
      <Link href={href} className={cn(baseClasses, className)}>
        {content}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cn(baseClasses, className)}>
      {content}
    </button>
  )
}
