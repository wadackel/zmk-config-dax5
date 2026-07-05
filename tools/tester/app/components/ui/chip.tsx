import type { Child } from 'hono/jsx'

export type ChipProps = {
  selected?: boolean
  disabled?: boolean
  onToggle?: () => void
  title?: string
  class?: string
  children: Child
}

/**
 * Toggleable pill used for multi-select controls (e.g. Combos layer selector).
 * Uses ARIA checkbox semantics — the caller renders many chips whose
 * selections are independent set members, which is what checkbox conveys.
 * `switch` was rejected because it implies a single on/off setting, not
 * membership in a group.
 */
export function Chip({
  selected = false,
  disabled = false,
  onToggle,
  title,
  class: className,
  children,
}: ChipProps) {
  return (
    <button
      type="button"
      role="checkbox"
      // hono/jsx renders `aria-checked={true}` as an empty string attribute
      // (`aria-checked=""`) instead of `aria-checked="true"`. Screen readers
      // fall back to "mixed"/undefined instead of "checked", so serialize
      // to the string form explicitly.
      aria-checked={selected ? 'true' : 'false'}
      disabled={disabled}
      title={title}
      onClick={onToggle}
      class={[
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors select-none disabled:opacity-40 disabled:cursor-not-allowed',
        selected
          ? 'bg-accent-soft text-accent border-accent hover:bg-accent/25'
          : 'bg-surface-3 text-fg-muted border-border hover:text-fg hover:bg-surface-4',
        className || '',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
