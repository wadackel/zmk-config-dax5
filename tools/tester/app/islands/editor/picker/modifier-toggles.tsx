import { useState } from 'hono/jsx'
import type { ModifierWrap } from '../../../lib/picker'

const LEFT_MODS: { wrap: ModifierWrap; label: string }[] = [
  { wrap: 'LC', label: 'Ctrl' },
  { wrap: 'LS', label: 'Shift' },
  { wrap: 'LA', label: 'Alt' },
  { wrap: 'LG', label: 'GUI' },
]

const RIGHT_MODS: { wrap: ModifierWrap; label: string }[] = [
  { wrap: 'RC', label: 'R-Ctrl' },
  { wrap: 'RS', label: 'R-Shift' },
  { wrap: 'RA', label: 'R-Alt' },
  { wrap: 'RG', label: 'R-GUI' },
]

type Props = {
  active: Set<ModifierWrap>
  onChange: (next: Set<ModifierWrap>) => void
}

export function ModifierToggles({ active, onChange }: Props) {
  const [showRight, setShowRight] = useState(
    RIGHT_MODS.some((m) => active.has(m.wrap)),
  )

  const toggle = (wrap: ModifierWrap) => {
    const next = new Set(active)
    if (next.has(wrap)) next.delete(wrap)
    else next.add(wrap)
    onChange(next)
  }

  return (
    <div class="mb-2">
      <div class="flex items-center gap-1 mb-1">
        <span class="text-[10px] text-fg-subtle mr-1">Modifier</span>
        {LEFT_MODS.map((m) => (
          <ModButton
            key={m.wrap}
            wrap={m.wrap}
            label={m.label}
            active={active.has(m.wrap)}
            onToggle={() => toggle(m.wrap)}
          />
        ))}
        <button
          type="button"
          class="ml-2 text-[10px] text-fg-subtle hover:text-fg-muted"
          onClick={() => setShowRight((v) => !v)}
        >
          {showRight ? '− R-side' : '+ R-side'}
        </button>
      </div>
      {showRight && (
        <div class="flex items-center gap-1">
          <span class="text-[10px] text-transparent mr-1">Modifier</span>
          {RIGHT_MODS.map((m) => (
            <ModButton
              key={m.wrap}
              wrap={m.wrap}
              label={m.label}
              active={active.has(m.wrap)}
              onToggle={() => toggle(m.wrap)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ModButton({
  wrap,
  label,
  active,
  onToggle,
}: {
  wrap: ModifierWrap
  label: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active ? 'true' : 'false'}
      data-modwrap={wrap}
      class={`px-2 py-0.5 rounded text-[11px] border font-mono ${
        active
          ? 'bg-blue-600 text-fg border-blue-400'
          : 'bg-surface-3 text-fg-muted border-border-strong hover:border-zinc-500'
      }`}
      onClick={onToggle}
    >
      {label}
    </button>
  )
}
