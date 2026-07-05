// Dispatches each ZMK behaviour argument slot to the most appropriate input
// control for its `argType` (keycode → combobox, layer → native select, etc.).

import { useEffect } from 'hono/jsx'
import type { BehaviorArgType } from '../../../lib/picker'
import type { LayerData } from '../../../lib/keymap-dt/types'
import { KeycodeCombobox } from './keycode-combobox'

type Props = {
  argType: BehaviorArgType | undefined
  value: string
  onChange: (next: string) => void
  /** Optional `overrideValue` propagates a synchronous arg value (e.g. the
   *  pending listbox selection in the keycode combobox). The parent uses it
   *  to commit immediately without waiting for the async setArgs round-trip. */
  onCommit?: (overrideValue?: string) => void
  /** When true (e.g. `&mt` arg0), pin modifiers in the keycode combobox. */
  pinModifiers?: boolean
  layers: LayerData[]
  isActive: boolean
  onFocus: () => void
  label: string
  autoFocus?: boolean
}

const MSC_OPTIONS = ['SCRL_UP', 'SCRL_DOWN', 'SCRL_LEFT', 'SCRL_RIGHT']
const OUTPUT_OPTIONS = ['OUT_USB', 'OUT_BLE', 'OUT_TOG']
const GESTURE_OPTIONS = ['UP', 'DOWN', 'LEFT', 'RIGHT']

export function ArgumentControl({
  argType,
  value,
  onChange,
  onCommit,
  pinModifiers,
  layers,
  isActive,
  onFocus,
  label,
  autoFocus,
}: Props) {
  const wrapperClass = `flex flex-col gap-1 p-2 rounded border ${
    isActive ? 'border-blue-500' : 'border-border'
  }`

  return (
    <div class={wrapperClass} onFocusin={onFocus}>
      <span class="text-[10px] text-fg-subtle">{label}</span>
      <ArgumentInput
        argType={argType}
        value={value}
        onChange={onChange}
        onCommit={onCommit}
        pinModifiers={pinModifiers}
        layers={layers}
        autoFocus={autoFocus}
      />
    </div>
  )
}

function ArgumentInput({
  argType,
  value,
  onChange,
  onCommit,
  pinModifiers,
  layers,
  autoFocus,
}: Pick<Props, 'argType' | 'value' | 'onChange' | 'onCommit' | 'pinModifiers' | 'layers' | 'autoFocus'>) {
  switch (argType) {
    case 'keycode':
      return (
        <KeycodeCombobox
          value={value}
          onChange={onChange}
          onCommit={onCommit}
          pinModifiers={pinModifiers}
          autoFocus={autoFocus}
        />
      )
    case 'layer':
      return <LayerSelect value={value} onChange={onChange} layers={layers} autoFocus={autoFocus} />
    case 'msc-action':
      return (
        <NativeSelect
          value={value}
          options={MSC_OPTIONS}
          onChange={onChange}
          autoFocus={autoFocus}
          fallback="SCRL_UP"
        />
      )
    case 'output':
      return (
        <NativeSelect
          value={value}
          options={OUTPUT_OPTIONS}
          onChange={onChange}
          autoFocus={autoFocus}
          fallback="OUT_USB"
        />
      )
    case 'gesture':
      return (
        <NativeSelect
          value={value}
          options={GESTURE_OPTIONS}
          onChange={onChange}
          autoFocus={autoFocus}
          fallback="UP"
        />
      )
    case 'profile':
    case 'free':
    default:
      return (
        <input
          type="text"
          class="w-full bg-surface-3 border border-border-strong rounded px-2 py-1 text-fg font-mono"
          value={value}
          autoFocus={autoFocus}
          onInput={(e: Event) => onChange((e.target as HTMLInputElement).value)}
          onKeyDown={(e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              onCommit?.()
            }
          }}
        />
      )
  }
}

function LayerSelect({
  value,
  onChange,
  layers,
  autoFocus,
}: {
  value: string
  onChange: (next: string) => void
  layers: LayerData[]
  autoFocus?: boolean
}) {
  // Sync the displayed fallback ("0") back to the parent so commit() never
  // records an empty layer index. Triggered on mount or after a behaviour
  // swap reseeds args with empty strings.
  const validIndices = new Set(layers.map((_, i) => String(i)))
  useEffect(() => {
    if (!validIndices.has(value)) onChange('0')
  }, [value, layers.length])

  // hono/jsx/dom sets `select.value` before <option> children are appended, so
  // `<select value=X>` falls back to selectedIndex 0. Mark the intended option
  // as `selected` instead — that path runs per-option at DOM creation time and
  // survives the append order.
  const current = value || '0'

  return (
    <select
      class="w-full bg-surface-3 border border-border-strong rounded px-2 py-1 text-fg font-mono"
      autoFocus={autoFocus}
      onChange={(e: Event) => onChange((e.target as HTMLSelectElement).value)}
    >
      {layers.map((l, i) => (
        <option key={i} value={String(i)} selected={String(i) === current}>
          {i} - {l.name || `Layer ${i}`}
        </option>
      ))}
    </select>
  )
}

function NativeSelect({
  value,
  options,
  onChange,
  autoFocus,
  fallback,
}: {
  value: string
  options: readonly string[]
  onChange: (next: string) => void
  autoFocus?: boolean
  fallback: string
}) {
  const current = options.includes(value) ? value : fallback
  // Sync the displayed fallback back to the parent so commit() never records
  // an empty / out-of-options value. Without this, behaviour-swap reseeded
  // args = [''] reaches commit and emits `&msc` / `&out` / `&mouse_gesture`
  // with no action argument.
  useEffect(() => {
    if (value !== current) onChange(current)
  }, [value, current])

  // See LayerSelect: `<select value=X>` loses X because hono/jsx applies it
  // before children mount. Mark the target <option> as `selected` instead.
  return (
    <select
      class="w-full bg-surface-3 border border-border-strong rounded px-2 py-1 text-fg font-mono"
      autoFocus={autoFocus}
      onChange={(e: Event) => onChange((e.target as HTMLSelectElement).value)}
    >
      {options.map((o) => (
        <option key={o} value={o} selected={o === current}>
          {o}
        </option>
      ))}
    </select>
  )
}
