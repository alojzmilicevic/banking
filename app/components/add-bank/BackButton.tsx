import { ArrowRight } from 'lucide-react'

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-1 mb-3 inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <ArrowRight className="size-3 rotate-180" />
      Pick a different provider
    </button>
  )
}
