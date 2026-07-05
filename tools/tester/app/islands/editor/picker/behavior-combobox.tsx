import { useEffect, useMemo, useRef, useState } from 'hono/jsx'
import { BEHAVIORS, getBehavior, type BehaviorEntry, type BehaviorGroup } from '../../../lib/picker'

type Props = {
  value: string
  onChange: (next: string) => void
}

const GROUP_LABEL: Record<BehaviorGroup, string> = {
  basic: 'Basic',
  'mod-tap': 'Mod-tap',
  layer: 'Layer',
  mouse: 'Mouse',
  system: 'System',
  bluetooth: 'Bluetooth',
  macro: 'Macro',
  custom: 'Custom',
}

const GROUP_ORDER: BehaviorGroup[] = [
  'basic',
  'mod-tap',
  'layer',
  'mouse',
  'system',
  'bluetooth',
  'macro',
  'custom',
]

type Row =
  | { kind: 'header'; group: BehaviorGroup }
  | { kind: 'item'; entry: BehaviorEntry }

function filterBehaviors(query: string): BehaviorEntry[] {
  const q = query.toLowerCase().trim()
  if (!q) return BEHAVIORS
  return BEHAVIORS.filter((b) => {
    if (b.token.toLowerCase().includes(q)) return true
    if (b.label.toLowerCase().includes(q)) return true
    if (b.description?.toLowerCase().includes(q)) return true
    return false
  })
}

function buildRows(query: string): Row[] {
  const items = filterBehaviors(query)
  const byGroup: Record<BehaviorGroup, BehaviorEntry[]> = {} as Record<BehaviorGroup, BehaviorEntry[]>
  for (const g of GROUP_ORDER) byGroup[g] = []
  for (const b of items) byGroup[b.group].push(b)
  const rows: Row[] = []
  for (const g of GROUP_ORDER) {
    if (byGroup[g].length === 0) continue
    rows.push({ kind: 'header', group: g })
    for (const e of byGroup[g]) rows.push({ kind: 'item', entry: e })
  }
  return rows
}

export function BehaviorCombobox({ value, onChange }: Props) {
  const current = getBehavior(value)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const rows = useMemo(() => buildRows(query), [query])
  const selectableIndexes = useMemo(() => {
    const out: number[] = []
    rows.forEach((r, i) => {
      if (r.kind === 'item') out.push(i)
    })
    return out
  }, [rows])

  useEffect(() => {
    if (selectableIndexes.length === 0) return
    if (!selectableIndexes.includes(activeIdx)) {
      setActiveIdx(selectableIndexes[0])
    }
  }, [selectableIndexes, activeIdx])

  useEffect(() => {
    if (!open) return
    const el = listRef.current?.querySelector<HTMLElement>(`[data-row="${activeIdx}"]`)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIdx, open])

  const commitRow = (rowIdx: number) => {
    const row = rows[rowIdx]
    if (!row || row.kind !== 'item') return
    onChange(row.entry.token)
    setQuery('')
    setOpen(false)
  }

  const moveActive = (dir: 1 | -1) => {
    const idx = selectableIndexes.indexOf(activeIdx)
    if (idx === -1) {
      setActiveIdx(selectableIndexes[0] ?? 0)
      return
    }
    const nextIdx = idx + dir
    if (nextIdx < 0 || nextIdx >= selectableIndexes.length) return
    setActiveIdx(selectableIndexes[nextIdx])
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    // Cmd/Ctrl+Enter is the modal-level commit shortcut — never intercept it
    // here. Without this gate, Enter's preventDefault below sets
    // defaultPrevented and BindingPicker's window listener bails out, leaving
    // the modal stuck open while the highlighted row gets re-selected.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') return
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      moveActive(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      moveActive(-1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commitRow(activeIdx)
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
      }
    }
  }

  return (
    <div class="relative">
      <input
        ref={inputRef}
        type="text"
        class="w-full bg-surface-3 border border-border-strong rounded px-2 py-1 text-fg font-mono"
        value={open ? query : current ? `${current.token} — ${current.label}` : value}
        placeholder="search behaviour (e.g. tap, layer, mod)"
        onFocus={(e: Event) => {
          ;(e.target as HTMLInputElement).select()
          setQuery('')
          setOpen(true)
        }}
        onInput={(e: Event) => {
          setQuery((e.target as HTMLInputElement).value)
          setOpen(true)
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 120)
        }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <div
          ref={listRef}
          role="listbox"
          class="mt-1 max-h-[24rem] overflow-auto bg-surface-1 border border-border-strong rounded shadow-lg"
        >
          {rows.length === 0 && (
            <div class="px-3 py-2 text-fg-subtle text-xs italic">No matching behaviour</div>
          )}
          {rows.map((row, i) => {
            if (row.kind === 'header') {
              return (
                <div
                  key={`h-${row.group}`}
                  data-row={i}
                  class="px-3 py-1 text-[10px] uppercase text-fg-subtle bg-surface-2 border-b border-border"
                >
                  {GROUP_LABEL[row.group]}
                </div>
              )
            }
            const isActive = i === activeIdx
            return (
              <button
                key={`i-${row.entry.token}`}
                type="button"
                role="option"
                aria-selected={isActive ? 'true' : 'false'}
                data-row={i}
                data-token={row.entry.token}
                class={`flex items-center justify-between w-full text-left px-3 py-1 text-sm font-mono ${
                  isActive ? 'bg-blue-700 text-fg' : 'text-fg hover:bg-surface-4'
                }`}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={(e: Event) => e.preventDefault()}
                onClick={() => commitRow(i)}
              >
                <span>{row.entry.token}</span>
                <span class="text-fg-subtle text-xs">{row.entry.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
