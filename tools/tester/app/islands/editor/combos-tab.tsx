import { useEffect, useRef, useState } from 'hono/jsx'
import { useEditor } from '../../lib/editor-state/context'
import { BindingPicker } from './binding-picker'
import { KeyPositionSelector } from './key-position-selector'

export function CombosTab() {
  const { state, dispatch } = useEditor()
  const combos = state.draft.combos
  const layerCount = state.draft.layers.length
  const [editingComboIdx, setEditingComboIdx] = useState<number | null>(null)

  const prevCountRef = useRef<number>(combos.length)
  const lastItemRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (combos.length > prevCountRef.current) {
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
        <h2 class="text-base font-mono">Combos ({combos.length})</h2>
        <button
          type="button"
          class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-500"
          onClick={() => dispatch({ type: 'ADD_COMBO' })}
        >
          + Add combo
        </button>
      </div>
      {combos.length === 0 && (
        <div class="text-zinc-500 text-sm font-mono">No combos defined.</div>
      )}
      {combos.map((combo, idx) => (
        <div
          key={idx}
          ref={idx === combos.length - 1 ? lastItemRef : undefined}
          class="border border-zinc-800 rounded p-3 flex flex-col gap-3"
        >
          <div class="flex justify-between items-center">
            <input
              type="text"
              class="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1 text-white text-sm font-mono"
              value={combo.name}
              onInput={(e: Event) =>
                dispatch({
                  type: 'UPDATE_COMBO',
                  index: idx,
                  combo: { ...combo, name: (e.target as HTMLInputElement).value },
                })
              }
            />
            <button
              type="button"
              class="text-red-400 text-xs hover:text-red-300 font-mono"
              onClick={() => dispatch({ type: 'REMOVE_COMBO', index: idx })}
            >
              Remove
            </button>
          </div>
          <div class="text-xs text-zinc-400 font-mono">
            Binding
            <button
              type="button"
              class="block w-full mt-1 text-left bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1 text-sm font-mono text-zinc-200 hover:border-blue-500 hover:bg-zinc-800"
              onClick={() => setEditingComboIdx(idx)}
              title="Edit binding"
            >
              {combo.bindings.tokens.join(' ') || '&none'}
            </button>
          </div>
          <label class="text-xs text-zinc-400 font-mono">
            Layers (comma-separated indices)
            <input
              type="text"
              class="block w-full mt-1 bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1 text-white text-sm"
              value={combo.layers.join(',')}
              onInput={(e: Event) => {
                const layers = (e.target as HTMLInputElement).value
                  .split(',')
                  .map((s) => Number(s.trim()))
                  .filter((n) => Number.isInteger(n) && n >= 0 && n < layerCount)
                dispatch({
                  type: 'UPDATE_COMBO',
                  index: idx,
                  combo: { ...combo, layers },
                })
              }}
            />
          </label>
          <div>
            <div class="text-xs text-zinc-400 font-mono mb-1">
              Key positions (click to toggle)
            </div>
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
          </div>
        </div>
      ))}

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
