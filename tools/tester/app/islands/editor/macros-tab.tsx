import { useEditor } from '../../lib/editor-state/context'
import type { BindingChain } from '../../lib/keymap-dt/types'

export function MacrosTab() {
  const { state, dispatch } = useEditor()
  const macros = state.draft.macros

  return (
    <div class="flex flex-col gap-4">
      <div class="flex justify-between items-center">
        <h2 class="text-base font-mono">Macros ({macros.length})</h2>
        <button
          type="button"
          class="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-500"
          onClick={() => dispatch({ type: 'ADD_MACRO' })}
        >
          + Add macro
        </button>
      </div>
      {macros.length === 0 && (
        <div class="text-zinc-500 text-sm font-mono">No macros defined.</div>
      )}
      {macros.map((macro, idx) => {
        const updateMacro = (next: typeof macro) =>
          dispatch({ type: 'UPDATE_MACRO', index: idx, macro: next })
        const updateChain = (chainIdx: number, chain: BindingChain) =>
          updateMacro({
            ...macro,
            bindingsList: macro.bindingsList.map((c, i) => (i === chainIdx ? chain : c)),
          })
        return (
          <div key={idx} class="border border-zinc-800 rounded p-3 flex flex-col gap-3">
            <div class="flex justify-between items-center">
              <input
                type="text"
                class="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1 text-white text-sm font-mono"
                value={macro.name}
                onInput={(e: Event) =>
                  updateMacro({ ...macro, name: (e.target as HTMLInputElement).value })
                }
              />
              <button
                type="button"
                class="text-red-400 text-xs hover:text-red-300 font-mono"
                onClick={() => dispatch({ type: 'REMOVE_MACRO', index: idx })}
              >
                Remove
              </button>
            </div>
            <div>
              <div class="text-xs text-zinc-400 font-mono mb-1">Bindings sequence</div>
              {macro.bindingsList.map((chain, ci) => (
                <div key={ci} class="flex gap-2 mb-1">
                  <input
                    type="text"
                    class="flex-1 bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1 text-white text-sm"
                    value={chain.tokens.join(' ')}
                    onInput={(e: Event) =>
                      updateChain(ci, {
                        tokens: (e.target as HTMLInputElement).value
                          .split(/\s+/)
                          .filter(Boolean),
                      })
                    }
                  />
                  <button
                    type="button"
                    class="text-red-400 text-xs font-mono"
                    onClick={() =>
                      updateMacro({
                        ...macro,
                        bindingsList: macro.bindingsList.filter((_, i) => i !== ci),
                      })
                    }
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                class="text-xs text-blue-400 font-mono mt-1"
                onClick={() =>
                  updateMacro({
                    ...macro,
                    bindingsList: [...macro.bindingsList, { tokens: ['&kp', 'A'] }],
                  })
                }
              >
                + chain
              </button>
            </div>
            <div>
              <div class="text-xs text-zinc-400 font-mono mb-1">Properties</div>
              {macro.props.map((p, pi) => (
                <div key={pi} class="flex gap-2 mb-1 text-xs">
                  <input
                    type="text"
                    class="flex-1 bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1 text-white font-mono"
                    value={p.name}
                    onInput={(e: Event) =>
                      updateMacro({
                        ...macro,
                        props: macro.props.map((q, i) =>
                          i === pi ? { ...q, name: (e.target as HTMLInputElement).value } : q,
                        ),
                      })
                    }
                  />
                  <input
                    type="text"
                    class="flex-1 bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1 text-white font-mono"
                    value={p.value}
                    onInput={(e: Event) =>
                      updateMacro({
                        ...macro,
                        props: macro.props.map((q, i) =>
                          i === pi ? { ...q, value: (e.target as HTMLInputElement).value } : q,
                        ),
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
