import { useEffect, useRef, useState } from 'hono/jsx'
import { Button } from '../../components/ui/button'
import { Chip } from '../../components/ui/chip'
import { CommittingTextInput, Field } from '../../components/ui/field'
import { useEditor } from '../../lib/editor-state/context'
import { BindingPicker } from './binding-picker'
import { KeyPositionSelector } from './key-position-selector'

export function CombosTab() {
  const { state, dispatch } = useEditor()
  const combos = state.draft.combos
  const layers = state.draft.layers
  const [editingComboIdx, setEditingComboIdx] = useState<number | null>(null)

  const prevCountRef = useRef<number>(combos.length)
  const lastItemRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const prev = prevCountRef.current ?? combos.length
    if (combos.length > prev) {
      const el = lastItemRef.current
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    }
    prevCountRef.current = combos.length
  }, [combos.length])

  return (
    <div class="flex flex-col gap-4">
      <div class="flex justify-between items-center">
        <h2 class="text-base font-semibold m-0">Combos ({combos.length})</h2>
        <Button size="sm" variant="primary" onClick={() => dispatch({ type: 'ADD_COMBO' })}>
          + Add combo
        </Button>
      </div>
      {combos.length === 0 && (
        <div class="text-fg-subtle text-sm">No combos defined.</div>
      )}
      {combos.map((combo, idx) => {
        const activeLayerIndices = new Set(combo.layers)
        return (
          <div
            key={idx}
            ref={idx === combos.length - 1 ? lastItemRef : undefined}
            class="border border-border rounded-md bg-surface-2 p-4 flex flex-col gap-3"
          >
            <div class="flex justify-between items-center gap-2">
              <CommittingTextInput
                value={combo.name}
                aria-label="Combo name"
                class="font-mono"
                onCommit={(name) =>
                  dispatch({
                    type: 'UPDATE_COMBO',
                    index: idx,
                    combo: { ...combo, name },
                  })
                }
              />
              <Button size="xs" variant="plain" onClick={() => dispatch({ type: 'REMOVE_COMBO', index: idx })}>
                <span class="text-danger">Remove</span>
              </Button>
            </div>
            <Field label="Binding">
              <button
                type="button"
                class="w-full text-left bg-surface-3 border border-border rounded-md px-2 py-1.5 text-sm font-mono text-fg hover:border-accent hover:bg-surface-4 transition-colors"
                onClick={() => setEditingComboIdx(idx)}
                title="Edit binding"
              >
                {combo.bindings.tokens.join(' ') || <span class="text-fg-subtle">&amp;none</span>}
              </button>
            </Field>
            <Field
              label="Layers"
              group
              hint={
                activeLayerIndices.size === 0
                  ? 'Empty = combo is active on every layer.'
                  : `Active on ${activeLayerIndices.size} of ${layers.length} layer${layers.length === 1 ? '' : 's'}.`
              }
            >
              <div class="flex flex-wrap gap-1.5">
                {layers.length === 0 ? (
                  <span class="text-fg-subtle text-xs">No layers defined.</span>
                ) : (
                  layers.map((layer, layerIdx) => {
                    const selected = activeLayerIndices.has(layerIdx)
                    return (
                      <Chip
                        key={layerIdx}
                        selected={selected}
                        title={layer.name}
                        onToggle={() => {
                          const next = new Set(activeLayerIndices)
                          if (selected) next.delete(layerIdx)
                          else next.add(layerIdx)
                          dispatch({
                            type: 'UPDATE_COMBO',
                            index: idx,
                            combo: { ...combo, layers: Array.from(next).sort((a, b) => a - b) },
                          })
                        }}
                      >
                        <span class="text-[10px] text-fg-subtle mr-1">{layerIdx}</span>
                        <span>{layer.name}</span>
                      </Chip>
                    )
                  })
                )}
              </div>
            </Field>
            <Field label="Key positions" hint="Click to toggle each position.">
              <KeyPositionSelector
                selected={combo.keyPositions}
                onChange={(positions) =>
                  dispatch({
                    type: 'UPDATE_COMBO',
                    index: idx,
                    combo: { ...combo, keyPositions: positions },
                  })
                }
              />
            </Field>
          </div>
        )
      })}

      {editingComboIdx !== null && combos[editingComboIdx] && (
        <BindingPicker
          initial={combos[editingComboIdx].bindings}
          onCancel={() => setEditingComboIdx(null)}
          onCommit={(chain) => {
            const target = combos[editingComboIdx]
            if (!target) {
              setEditingComboIdx(null)
              return
            }
            dispatch({
              type: 'UPDATE_COMBO',
              index: editingComboIdx,
              combo: { ...target, bindings: chain },
            })
            setEditingComboIdx(null)
          }}
        />
      )}
    </div>
  )
}
