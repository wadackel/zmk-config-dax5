import { useState } from 'hono/jsx'
import { CommittingTextInput } from '../../components/ui/field'
import { useEditor } from '../../lib/editor-state/context'
import { BindingPicker } from './binding-picker'
import type {
  BindingChain,
  MouseGestureBlock,
  MouseGesturePattern,
  MouseGesturePatternEntry,
} from '../../lib/keymap-dt/types'

const PATTERNS: MouseGesturePattern[] = ['UP', 'DOWN', 'LEFT', 'RIGHT']

const NUMBER_PROP_KEYS = ['stroke-size', 'idle-timeout-ms', 'gesture-cooldown-ms'] as const
const BOOLEAN_PROP_KEYS = ['enable-eager-mode', 'suppress-movement', 'always-active'] as const
const STRUCTURAL_PROP_KEYS = ['compatible', '#input-processor-cells'] as const

type NumberPropKey = (typeof NUMBER_PROP_KEYS)[number]
type BooleanPropKey = (typeof BOOLEAN_PROP_KEYS)[number]

const NUMBER_PROP_LABELS: Record<NumberPropKey, { label: string; unit: string; hint: string }> = {
  'stroke-size': { label: 'Stroke size', unit: 'px', hint: 'Movement threshold to register a stroke' },
  'idle-timeout-ms': { label: 'Idle timeout', unit: 'ms', hint: 'Idle time before a stroke ends' },
  'gesture-cooldown-ms': { label: 'Gesture cooldown', unit: 'ms', hint: 'Debounce between gestures' },
}

const BOOLEAN_PROP_LABELS: Record<BooleanPropKey, { label: string; hint: string }> = {
  'enable-eager-mode': { label: 'Eager mode', hint: 'Fire before the stroke completes' },
  'suppress-movement': { label: 'Suppress movement', hint: 'Swallow raw pointer motion during a stroke' },
  'always-active': { label: 'Always active', hint: 'Bypass the input-processor layer gating' },
}

const KNOWN_PROP_KEYS = new Set<string>([
  ...NUMBER_PROP_KEYS,
  ...BOOLEAN_PROP_KEYS,
  ...STRUCTURAL_PROP_KEYS,
])

const DIRECTION_META: Record<MouseGesturePattern, { icon: string; slotClass: string; defaultName: string }> = {
  UP: { icon: '↑', slotClass: 'col-start-2 row-start-1', defaultName: 'mg_up' },
  DOWN: { icon: '↓', slotClass: 'col-start-2 row-start-3', defaultName: 'mg_down' },
  LEFT: { icon: '←', slotClass: 'col-start-1 row-start-2', defaultName: 'mg_left' },
  RIGHT: { icon: '→', slotClass: 'col-start-3 row-start-2', defaultName: 'mg_right' },
}

const findProp = (block: MouseGestureBlock, name: string) =>
  block.props.find((p) => p.name === name)

const setPropValue = (block: MouseGestureBlock, name: string, value: string | null): MouseGestureBlock => {
  const idx = block.props.findIndex((p) => p.name === name)
  if (value === null) {
    if (idx === -1) return block
    return { ...block, props: block.props.filter((_, i) => i !== idx) }
  }
  if (idx === -1) {
    return { ...block, props: [...block.props, { name, value }] }
  }
  return {
    ...block,
    props: block.props.map((p, i) => (i === idx ? { ...p, value } : p)),
  }
}

const parseIntValue = (raw: string | undefined): string => {
  if (!raw) return ''
  const m = raw.match(/^<\s*(-?\d+)\s*>$/)
  return m ? m[1]! : raw.replace(/^<|>$/g, '')
}

const upsertEntry = (
  entries: MouseGesturePatternEntry[],
  pattern: MouseGesturePattern,
  entry: MouseGesturePatternEntry,
): MouseGesturePatternEntry[] => {
  const idx = entries.findIndex((e) => e.pattern === pattern)
  if (idx === -1) return [...entries, entry]
  return entries.map((e, i) => (i === idx ? entry : e))
}

const removeEntry = (
  entries: MouseGesturePatternEntry[],
  pattern: MouseGesturePattern,
): MouseGesturePatternEntry[] => entries.filter((e) => e.pattern !== pattern)

type EditingTarget = { blockIdx: number; pattern: MouseGesturePattern }

export function MouseGesturesTab() {
  const { state, dispatch } = useEditor()
  const blocks = state.draft.mouseGestures
  const [editing, setEditing] = useState<EditingTarget | null>(null)

  const editingBlock = editing ? blocks[editing.blockIdx] : undefined
  const editingEntry = editingBlock?.entries.find((e) => e.pattern === editing?.pattern)

  return (
    <div class="flex flex-col gap-6">
      {blocks.length === 0 && (
        <div class="text-fg-subtle text-sm font-mono">No mouse gesture blocks defined.</div>
      )}
      {blocks.map((block, idx) => (
        <BlockEditor
          key={`${block.kind}-${block.name ?? 'root'}-${idx}`}
          block={block}
          onChange={(next) =>
            dispatch({ type: 'UPDATE_MOUSE_GESTURE', index: idx, block: next })
          }
          onEditBinding={(pattern) => setEditing({ blockIdx: idx, pattern })}
        />
      ))}

      {editing && editingBlock && (
        <BindingPicker
          initial={editingEntry?.bindings ?? { tokens: ['&kp', 'A'] }}
          onCancel={() => setEditing(null)}
          onCommit={(chain) => {
            const target = blocks[editing.blockIdx]
            if (!target) {
              setEditing(null)
              return
            }
            const existing = target.entries.find((e) => e.pattern === editing.pattern)
            const nextEntry: MouseGesturePatternEntry = {
              name: existing?.name ?? DIRECTION_META[editing.pattern].defaultName,
              pattern: editing.pattern,
              bindings: chain,
            }
            dispatch({
              type: 'UPDATE_MOUSE_GESTURE',
              index: editing.blockIdx,
              block: { ...target, entries: upsertEntry(target.entries, editing.pattern, nextEntry) },
            })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function BlockEditor({
  block,
  onChange,
  onEditBinding,
}: {
  block: MouseGestureBlock
  onChange: (b: MouseGestureBlock) => void
  onEditBinding: (pattern: MouseGesturePattern) => void
}) {
  const title = block.kind === 'root' ? '&zip_mouse_gesture' : `${block.name ?? '(unnamed)'}`
  const kindBadge = block.kind === 'root' ? 'root override' : 'named input-processor'

  return (
    <section class="border border-border rounded p-4 flex flex-col gap-4">
      <header class="flex items-baseline justify-between gap-3">
        <h2 class="text-base font-mono text-fg">{title}</h2>
        <span class="text-[10px] uppercase tracking-wider text-fg-subtle font-mono">{kindBadge}</span>
      </header>

      <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
        <CrossPad block={block} onChange={onChange} onEditBinding={onEditBinding} />
        <PropsPanel block={block} onChange={onChange} />
      </div>
    </section>
  )
}

function CrossPad({
  block,
  onChange,
  onEditBinding,
}: {
  block: MouseGestureBlock
  onChange: (b: MouseGestureBlock) => void
  onEditBinding: (pattern: MouseGesturePattern) => void
}) {
  return (
    <div class="flex flex-col gap-2">
      <div class="text-xs text-fg-muted font-mono">Directions</div>
      <div class="grid grid-cols-3 grid-rows-3 gap-2 min-h-[280px]">
        {PATTERNS.map((pattern) => {
          const entry = block.entries.find((e) => e.pattern === pattern)
          return (
            <DirectionSlot
              key={pattern}
              pattern={pattern}
              entry={entry}
              onEditBinding={() => onEditBinding(pattern)}
              onNameChange={(name) => {
                if (!entry) return
                onChange({
                  ...block,
                  entries: upsertEntry(block.entries, pattern, { ...entry, name }),
                })
              }}
              onCreate={() => {
                onChange({
                  ...block,
                  entries: upsertEntry(block.entries, pattern, {
                    name: DIRECTION_META[pattern].defaultName,
                    pattern,
                    bindings: { tokens: ['&none'] },
                  }),
                })
              }}
              onRemove={() => {
                onChange({ ...block, entries: removeEntry(block.entries, pattern) })
              }}
            />
          )
        })}
        <div class="col-start-2 row-start-2 flex items-center justify-center text-fg-subtle text-xs font-mono select-none pointer-events-none">
          <div class="flex flex-col items-center gap-1">
            <span class="text-2xl leading-none">◎</span>
            <span>gesture</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function DirectionSlot({
  pattern,
  entry,
  onEditBinding,
  onNameChange,
  onCreate,
  onRemove,
}: {
  pattern: MouseGesturePattern
  entry: MouseGesturePatternEntry | undefined
  onEditBinding: () => void
  onNameChange: (name: string) => void
  onCreate: () => void
  onRemove: () => void
}) {
  const meta = DIRECTION_META[pattern]
  if (!entry) {
    return (
      <button
        type="button"
        class={`${meta.slotClass} border border-dashed border-border-strong rounded flex flex-col items-center justify-center gap-1 text-fg-subtle hover:border-accent hover:text-accent transition`}
        onClick={onCreate}
      >
        <span class="text-xl leading-none">{meta.icon}</span>
        <span class="text-[10px] font-mono">+ Set {pattern.toLowerCase()}</span>
      </button>
    )
  }

  return (
    <div
      class={`${meta.slotClass} border border-border rounded p-2 flex flex-col gap-1 bg-surface-2`}
    >
      <div class="flex items-center justify-between gap-1">
        <span class="text-sm font-mono text-fg-muted flex items-center gap-1">
          <span class="text-accent">{meta.icon}</span>
          <span class="text-[10px] uppercase tracking-wider text-fg-subtle">{pattern}</span>
        </span>
        <button
          type="button"
          class="text-danger hover:text-red-300 text-xs font-mono leading-none"
          onClick={onRemove}
          title="Remove this direction"
        >
          ×
        </button>
      </div>
      <CommittingTextInput
        class="w-full text-xs font-mono"
        invalid={entry.name.trim() === ''}
        value={entry.name}
        onCommit={(v) => onNameChange(v)}
        placeholder="entry name (required)"
        title={entry.name.trim() === '' ? 'Entry name is required — an empty name produces invalid DTS.' : undefined}
      />
      <button
        type="button"
        class="w-full text-left bg-surface-3 border border-border-strong rounded px-2 py-1 text-xs font-mono text-fg hover:border-accent hover:bg-surface-4"
        onClick={onEditBinding}
        title="Edit binding"
      >
        {entry.bindings.tokens.join(' ') || '&none'}
      </button>
    </div>
  )
}

function PropsPanel({
  block,
  onChange,
}: {
  block: MouseGestureBlock
  onChange: (b: MouseGestureBlock) => void
}) {
  const advancedProps = block.props
    .map((p, i) => ({ prop: p, index: i }))
    .filter((entry) => !KNOWN_PROP_KEYS.has(entry.prop.name))

  return (
    <div class="flex flex-col gap-3">
      <div class="text-xs text-fg-muted font-mono">Properties</div>

      <div class="flex flex-col gap-2">
        {NUMBER_PROP_KEYS.map((key) => {
          const meta = NUMBER_PROP_LABELS[key]
          const raw = findProp(block, key)?.value
          const current = parseIntValue(raw)
          return (
            <label key={key} class="flex flex-col gap-1 text-xs font-mono text-fg-muted">
              <span class="flex justify-between">
                <span>{meta.label}</span>
                <span class="text-fg-subtle">{meta.unit}</span>
              </span>
              <CommittingTextInput
                type="number"
                value={current === '' ? '' : String(current)}
                placeholder="(default)"
                min={0}
                onCommit={(raw) => {
                  const val = raw.trim()
                  if (val === '') onChange(setPropValue(block, key, null))
                  else onChange(setPropValue(block, key, `<${val}>`))
                }}
              />
              <span class="text-[10px] text-fg-subtle leading-tight">{meta.hint}</span>
            </label>
          )
        })}
      </div>

      <div class="flex flex-col gap-2 border-t border-border pt-3">
        {BOOLEAN_PROP_KEYS.map((key) => {
          const meta = BOOLEAN_PROP_LABELS[key]
          const on = findProp(block, key) !== undefined
          return (
            <label key={key} class="flex items-start gap-2 text-xs font-mono text-fg-muted cursor-pointer">
              <input
                type="checkbox"
                class="mt-[2px]"
                checked={on}
                onChange={(e: Event) => {
                  const checked = (e.target as HTMLInputElement).checked
                  onChange(setPropValue(block, key, checked ? '' : null))
                }}
              />
              <span class="flex flex-col leading-tight">
                <span>{meta.label}</span>
                <span class="text-[10px] text-fg-subtle">{meta.hint}</span>
              </span>
            </label>
          )
        })}
      </div>

      <StructuralProps block={block} />

      <AdvancedProps
        block={block}
        advancedProps={advancedProps}
        onChange={onChange}
      />
    </div>
  )
}

function StructuralProps({ block }: { block: MouseGestureBlock }) {
  const shown = STRUCTURAL_PROP_KEYS
    .map((key) => ({ key, prop: findProp(block, key) }))
    .filter((x): x is { key: (typeof STRUCTURAL_PROP_KEYS)[number]; prop: { name: string; value: string } } => x.prop !== undefined)

  if (shown.length === 0) return null

  return (
    <div class="border-t border-border pt-3">
      <div class="text-[10px] text-fg-subtle font-mono mb-1 uppercase tracking-wider">Structural</div>
      <div class="flex flex-col gap-1">
        {shown.map(({ key, prop }) => (
          <div key={key} class="flex justify-between items-center gap-2 text-xs font-mono">
            <span class="text-fg-subtle">{key}</span>
            <span class="text-fg-muted truncate" title={prop.value}>
              {prop.value || '(flag)'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AdvancedProps({
  block,
  advancedProps,
  onChange,
}: {
  block: MouseGestureBlock
  advancedProps: { prop: { name: string; value: string }; index: number }[]
  onChange: (b: MouseGestureBlock) => void
}) {
  const [expanded, setExpanded] = useState(advancedProps.length > 0)

  return (
    <div class="border-t border-border pt-3">
      <button
        type="button"
        class="flex items-center gap-2 text-xs text-fg-muted hover:text-fg font-mono"
        onClick={() => setExpanded((v) => !v)}
      >
        <span>{expanded ? '▾' : '▸'}</span>
        <span>Advanced properties</span>
        {advancedProps.length > 0 && (
          <span class="text-[10px] text-fg-subtle">({advancedProps.length})</span>
        )}
      </button>

      {expanded && (
        <div class="flex flex-col gap-2 mt-2">
          {advancedProps.length === 0 && (
            <div class="text-[10px] text-fg-subtle font-mono">
              No custom properties. Use this for less-common DT properties.
            </div>
          )}
          {advancedProps.map(({ prop, index }) => (
            <div key={index} class="flex gap-2 text-xs">
              <CommittingTextInput
                class="flex-1 font-mono"
                value={prop.name}
                placeholder="name"
                onCommit={(name) =>
                  onChange({
                    ...block,
                    props: block.props.map((q, i) => (i === index ? { ...q, name } : q)),
                  })
                }
              />
              <CommittingTextInput
                class="flex-1 font-mono"
                value={prop.value}
                placeholder="value (bare = flag)"
                onCommit={(value) =>
                  onChange({
                    ...block,
                    props: block.props.map((q, i) => (i === index ? { ...q, value } : q)),
                  })
                }
              />
              <button
                type="button"
                class="text-danger hover:text-red-300 text-xs font-mono px-1"
                onClick={() =>
                  onChange({
                    ...block,
                    props: block.props.filter((_, i) => i !== index),
                  })
                }
                title="Remove property"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            class="self-start text-xs text-accent hover:text-blue-300 font-mono"
            onClick={() =>
              onChange({
                ...block,
                props: [...block.props, { name: '', value: '' }],
              })
            }
          >
            + Add property
          </button>
        </div>
      )}
    </div>
  )
}
