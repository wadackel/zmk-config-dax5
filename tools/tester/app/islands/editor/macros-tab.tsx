import { useState } from 'hono/jsx'
import { Button } from '../../components/ui/button'
import { CommittingTextInput, Field } from '../../components/ui/field'
import { useEditor } from '../../lib/editor-state/context'
import type { BindingChain, MacroEntry } from '../../lib/keymap-dt/types'
import { getBehavior } from '../../lib/picker'
import { BindingPicker } from './binding-picker'

type EditingTarget = { macroIdx: number; chainIdx: number }

// A macro chain is "simple" — safely round-trippable through the BindingPicker
// — only when it references exactly one behaviour AND that behaviour's arity
// matches the current token count. Macros permit shorthand like
// `<&kp ESCAPE &kp LANG2>` (two behaviours in one angle-bracket group), and
// user-defined behaviours (`&my_thing ARG1 ARG2`) may not be in the picker
// catalog at all — in either case the Picker would normalise to a single
// behaviour + fixed arity and silently drop tokens on commit.
function isSimpleChain(chain: BindingChain): boolean {
  const behaviourCount = chain.tokens.filter((t) => t.startsWith('&')).length
  if (behaviourCount > 1) return false
  if (chain.tokens.length === 0) return true
  const head = chain.tokens[0]!
  if (!head.startsWith('&')) return false
  const behavior = getBehavior(head)
  if (!behavior) {
    // Unknown behaviour: safe only when it has no args (nothing to lose).
    return chain.tokens.length === 1
  }
  const maxArity = Math.max(0, ...behavior.arity)
  const argCount = chain.tokens.length - 1
  return argCount <= maxArity
}

export function MacrosTab() {
  const { state, dispatch } = useEditor()
  const macros = state.draft.macros
  const [editing, setEditing] = useState<EditingTarget | null>(null)

  const editingMacro = editing !== null ? macros[editing.macroIdx] : null
  const editingChain =
    editingMacro && editing !== null ? editingMacro.bindingsList[editing.chainIdx] : null

  return (
    <div class="flex flex-col gap-4">
      <div class="flex justify-between items-center">
        <h2 class="text-base font-semibold m-0">Macros ({macros.length})</h2>
        <Button size="sm" variant="primary" onClick={() => dispatch({ type: 'ADD_MACRO' })}>
          + Add macro
        </Button>
      </div>
      {macros.length === 0 && <div class="text-fg-subtle text-sm">No macros defined.</div>}
      {macros.map((macro, idx) => {
        const updateMacro = (next: MacroEntry) =>
          dispatch({ type: 'UPDATE_MACRO', index: idx, macro: next })
        const updateChain = (chainIdx: number, chain: BindingChain) =>
          updateMacro({
            ...macro,
            bindingsList: macro.bindingsList.map((c, i) => (i === chainIdx ? chain : c)),
          })
        return (
          <div
            key={idx}
            class="border border-border rounded-md bg-surface-2 p-4 flex flex-col gap-3"
          >
            <div class="flex justify-between items-center gap-2">
              <CommittingTextInput
                aria-label="Macro name"
                class="font-mono"
                value={macro.name}
                onCommit={(name) => updateMacro({ ...macro, name })}
              />
              <Button
                size="xs"
                variant="plain"
                onClick={() => dispatch({ type: 'REMOVE_MACRO', index: idx })}
              >
                <span class="text-danger">Remove</span>
              </Button>
            </div>

            <Field
              label={`Bindings sequence (${macro.bindingsList.length})`}
              hint="Each chain is one DT angle-bracket group. Simple chains open the picker; chains with multiple behaviours stay raw."
            >
              <div class="flex flex-col gap-1.5">
                {macro.bindingsList.map((chain, ci) => (
                  <ChainRow
                    key={ci}
                    chain={chain}
                    index={ci}
                    onEditWithPicker={() => setEditing({ macroIdx: idx, chainIdx: ci })}
                    onChangeRaw={(next) => updateChain(ci, next)}
                    onRemove={() =>
                      updateMacro({
                        ...macro,
                        bindingsList: macro.bindingsList.filter((_, i) => i !== ci),
                      })
                    }
                  />
                ))}
                <div class="pl-7">
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      updateMacro({
                        ...macro,
                        bindingsList: [...macro.bindingsList, { tokens: ['&kp', 'A'] }],
                      })
                    }
                  >
                    + chain
                  </Button>
                </div>
              </div>
            </Field>

            <MacroPropsAdvanced macro={macro} onChange={updateMacro} />
          </div>
        )
      })}

      {editing !== null && editingChain && isSimpleChain(editingChain) && (
        <BindingPicker
          initial={editingChain}
          onCancel={() => setEditing(null)}
          onCommit={(chain) => {
            const target = macros[editing.macroIdx]
            if (target) {
              dispatch({
                type: 'UPDATE_MACRO',
                index: editing.macroIdx,
                macro: {
                  ...target,
                  bindingsList: target.bindingsList.map((c, i) =>
                    i === editing.chainIdx ? chain : c,
                  ),
                },
              })
            }
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function ChainRow({
  chain,
  index,
  onEditWithPicker,
  onChangeRaw,
  onRemove,
}: {
  chain: BindingChain
  index: number
  onEditWithPicker: () => void
  onChangeRaw: (next: BindingChain) => void
  onRemove: () => void
}) {
  const simple = isSimpleChain(chain)
  const preview = chain.tokens.join(' ')
  return (
    <div class="flex gap-2 items-center">
      <span class="text-[10px] text-fg-subtle font-mono w-5 text-right shrink-0">{index}</span>
      {simple ? (
        <button
          type="button"
          class="flex-1 text-left bg-surface-3 border border-border rounded-md px-2 py-1 text-sm font-mono text-fg hover:border-accent hover:bg-surface-4 transition-colors"
          onClick={onEditWithPicker}
          title="Edit binding"
        >
          {preview || <span class="text-fg-subtle">&amp;none</span>}
        </button>
      ) : (
        <div class="flex-1 flex flex-col gap-0.5">
          <CommittingTextInput
            class="w-full font-mono"
            aria-label="Multi-behaviour chain (raw tokens)"
            value={preview}
            onCommit={(v) =>
              onChangeRaw({ tokens: v.split(/\s+/).filter(Boolean) })
            }
          />
          <span class="text-[10px] text-warning font-mono">
            multi-behaviour chain — raw edit only
          </span>
        </div>
      )}
      <Button size="xs" variant="plain" aria-label="Remove chain" onClick={onRemove}>
        <span class="text-danger">×</span>
      </Button>
    </div>
  )
}

/**
 * DT properties on a macro entry (compatible, #binding-cells, wait-ms,
 * tap-ms, bindings-order, etc.). Kept behind a <details> disclosure so the
 * common editing flow (name + bindings) is not visually crowded by DT
 * internals.
 */
function MacroPropsAdvanced({
  macro,
  onChange,
}: {
  macro: MacroEntry
  onChange: (next: MacroEntry) => void
}) {
  const hasProps = macro.props.length > 0
  return (
    <details class="text-sm">
      <summary class="cursor-pointer text-xs text-fg-muted hover:text-fg select-none">
        Advanced DT properties {hasProps && `(${macro.props.length})`}
      </summary>
      <div class="mt-2 flex flex-col gap-1.5">
        {macro.props.map((p, pi) => (
          <div key={pi} class="flex gap-2">
            <CommittingTextInput
              class="flex-1 font-mono"
              aria-label="Property name"
              value={p.name}
              onCommit={(name) =>
                onChange({
                  ...macro,
                  props: macro.props.map((q, i) => (i === pi ? { ...q, name } : q)),
                })
              }
            />
            <CommittingTextInput
              class="flex-1 font-mono"
              aria-label="Property value"
              value={p.value}
              onCommit={(value) =>
                onChange({
                  ...macro,
                  props: macro.props.map((q, i) => (i === pi ? { ...q, value } : q)),
                })
              }
            />
          </div>
        ))}
      </div>
    </details>
  )
}
