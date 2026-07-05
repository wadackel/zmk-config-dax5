import { KEYS } from '../../lib/layout'
import { KeyboardGrid } from '../../components/keyboard-grid'

type Props = {
  selected: number[]
  onChange: (positions: number[]) => void
}

export function KeyPositionSelector({ selected, onChange }: Props) {
  const toggle = (idx: number) => {
    if (selected.includes(idx)) {
      onChange(selected.filter((p) => p !== idx))
    } else {
      onChange([...selected, idx].sort((a, b) => a - b))
    }
  }

  return (
    <KeyboardGrid
      keys={KEYS}
      renderCell={(k) => {
        const isSelected = selected.includes(k.index)
        return (
          <button
            type="button"
            class={`w-[64px] h-[64px] flex items-center justify-center rounded border text-[12px] font-mono ${
              isSelected
                ? 'bg-blue-600 border-blue-400 text-fg'
                : 'bg-surface-3 border-border text-fg-subtle hover:border-accent'
            }`}
            onClick={() => toggle(k.index)}
          >
            {k.index}
          </button>
        )
      }}
    />
  )
}
