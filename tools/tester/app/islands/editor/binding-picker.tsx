import { useEffect, useRef, useState } from 'hono/jsx'
import { getBehavior, pushRecentKeycode, KEYCODES } from '../../lib/picker'
import { useEditor } from '../../lib/editor-state/context'
import type { BindingChain } from '../../lib/keymap-dt/types'
import { ArgumentControl } from './picker/argument-control'
import { BehaviorCombobox } from './picker/behavior-combobox'
import { BtSpecialForm } from './picker/bt-special-form'

type Props = {
  initial: BindingChain
  onCancel: () => void
  onCommit: (chain: BindingChain) => void
}

const KEYCODE_TOKEN_SET = new Set(KEYCODES.map((k) => k.token))

export function BindingPicker({ initial, onCancel, onCommit }: Props) {
  const { state } = useEditor()

  // Empty / `&trans` bindings default to `&kp` so a fresh edit goes straight to
  // a keycode picker (codex-recommended 1-stroke quick path).
  const isEmpty = initial.tokens.length === 0 || initial.tokens[0] === '&trans'
  const initialBehaviorToken = isEmpty ? '&kp' : initial.tokens[0]!

  const [behaviorToken, setBehaviorToken] = useState(initialBehaviorToken)
  const [args, setArgs] = useState<string[]>(isEmpty ? [] : initial.tokens.slice(1))
  const [activeArgIdx, setActiveArgIdx] = useState(0)

  // Synchronous mirror of `args` / `behaviorToken`. `commit()` must read these
  // refs (not the render closure) because `setArgs` is async — clicking the
  // Commit button after blur, where the blur sync only queues a setArgs and
  // the click handler runs in the same task, would otherwise commit stale
  // values. The refs are updated synchronously by every state mutation site.
  const argsRef = useRef<string[]>(args)
  const behaviorRef = useRef<string>(behaviorToken)
  argsRef.current = args
  behaviorRef.current = behaviorToken


  const behavior = getBehavior(behaviorToken)
  const expectedArity = behavior?.arity?.[0] ?? 0
  const argTypes = behavior?.argTypes ?? []
  const argLabels = behavior?.argLabels

  const normalizedArgs = Array.from({ length: expectedArity }, (_, i) => args[i] ?? '')

  // Reset active slot whenever the behaviour changes.
  useEffect(() => {
    const first = argTypes.findIndex((t) => t === 'keycode')
    setActiveArgIdx(first === -1 ? 0 : first)
  }, [behaviorToken])

  const tokens = behaviorToken === '&bt'
    ? ['&bt', ...args].filter(Boolean)
    : [behaviorToken, ...normalizedArgs].filter(Boolean)

  const previewText = tokens.join(' ')

  // `overrideValue` carries the pending value for `activeArgIdx` from an arg
  // input that wants to commit synchronously without waiting for setArgs to
  // propagate (typed-but-uncommitted query in the keycode combobox).
  //
  // Reads from `argsRef`/`behaviorRef` rather than the render closure so
  // updates queued in the same task (e.g. blur sync → Commit-button click)
  // are visible without waiting for the next React render.
  const commit = (overrideValue?: string) => {
    // Defensive guard: if a non-string sneaks in (e.g. a MouseEvent from a
    // misuse like `onClick={commit}`), treat it as no override.
    if (typeof overrideValue !== 'string') overrideValue = undefined
    const currentBehavior = behaviorRef.current
    const currentBehaviorEntry = getBehavior(currentBehavior)
    const currentArity = currentBehaviorEntry?.arity?.[0] ?? 0
    const currentArgTypes = currentBehaviorEntry?.argTypes ?? []
    let effectiveArgs = argsRef.current
    if (overrideValue !== undefined && activeArgIdx >= 0) {
      effectiveArgs = [...argsRef.current]
      while (effectiveArgs.length <= activeArgIdx) effectiveArgs.push('')
      effectiveArgs[activeArgIdx] = overrideValue
    }
    const effectiveNormalized = Array.from(
      { length: currentArity },
      (_, i) => effectiveArgs[i] ?? '',
    )
    for (let i = 0; i < effectiveNormalized.length; i++) {
      if (currentArgTypes[i] === 'keycode' && effectiveNormalized[i]) {
        pushRecentKeycode(effectiveNormalized[i])
      }
    }
    const effectiveTokens = currentBehavior === '&bt'
      ? ['&bt', ...effectiveArgs].filter(Boolean)
      : [currentBehavior, ...effectiveNormalized].filter(Boolean)
    onCommit({ tokens: effectiveTokens })
  }

  // Modal-level keyboard shortcuts (Esc cancels, Cmd/Ctrl+Enter commits) are
  // wired via the modal root's onKeyDown below — NOT a window listener.
  // hono/jsx's useEffect does not run the cleanup function when a component
  // unmounts via a conditional render (`{cond && <X/>}`), so a window
  // listener installed by the picker survives modal close and fires again
  // when the next picker opens, committing the wrong cell. Routing the
  // shortcut through the modal's DOM keeps the handler scoped to the
  // currently-mounted picker instance.
  const handleModalKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (e.defaultPrevented) return
      e.preventDefault()
      onCancel()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (e.defaultPrevented) return
      e.preventDefault()
      commit()
    }
  }

  const updateArg = (i: number, v: string) => {
    // Build the new array from the ref (which always reflects the latest
    // state, even within a single React task) and update the ref
    // synchronously so subsequent commit() calls in the same task see it.
    const next = [...argsRef.current]
    while (next.length <= i) next.push('')
    next[i] = v
    argsRef.current = next
    setArgs(next)
  }

  // After the user picks a keycode in arg `i`, advance the highlight to the
  // next keycode-typed slot for a fast multi-arg flow (e.g. `&mt`).
  const advanceAfter = (i: number) => {
    for (let j = i + 1; j < argTypes.length; j++) {
      if (argTypes[j] === 'keycode') {
        setActiveArgIdx(j)
        return
      }
    }
  }

  return (
    <div
      class="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-4 pt-[10vh]"
      onClick={onCancel}
      onKeyDown={handleModalKeyDown}
    >
      <div
        class="bg-[#121212] border border-zinc-700 rounded-lg w-[min(96vw,1100px)] max-h-[92vh] overflow-auto p-6 text-sm font-mono"
        onClick={(e: Event) => e.stopPropagation()}
      >
        <div class="flex justify-between items-baseline mb-4">
          <h2 class="text-base text-white">Edit binding</h2>
          <span class="text-[10px] text-zinc-500">⌘↵ to commit · esc to cancel</span>
        </div>

        <label class="block mb-1 text-zinc-400 text-xs">Behaviour</label>
        <div class="mb-4">
          <BehaviorCombobox
            value={behaviorToken}
            onChange={(next) => {
              setBehaviorToken(next)
              behaviorRef.current = next
              const nextBehavior = getBehavior(next)
              const nextArity = nextBehavior?.arity?.[0] ?? 0
              const nextArgTypes = nextBehavior?.argTypes ?? []
              const prevArgTypes = behavior?.argTypes ?? []
              const sameShape =
                nextArgTypes.length === prevArgTypes.length &&
                nextArgTypes.every((t, i) => t === prevArgTypes[i])
              const newArgs = sameShape
                ? Array.from({ length: nextArity }, (_, i) => argsRef.current[i] ?? '')
                : Array.from({ length: nextArity }, () => '')
              argsRef.current = newArgs
              setArgs(newArgs)
            }}
          />
          {behavior?.description && (
            <div class="mt-1 text-[10px] text-zinc-500">{behavior.description}</div>
          )}
        </div>

        {behaviorToken === '&bt' ? (
          <BtSpecialForm
            tokens={['&bt', ...args]}
            onChange={(t) => {
              // Sync argsRef alongside state — otherwise commit() reads stale
              // [''] when BtSpecialForm's default-sync useEffect (which fires
              // after a &kp → &bt behaviour swap) lands and the user presses
              // Cmd+Enter before React re-renders.
              const nextArgs = t.slice(1)
              argsRef.current = nextArgs
              setArgs(nextArgs)
            }}
          />
        ) : (
          expectedArity > 0 && (
            <div class="mb-4">
              <label class="block mb-2 text-zinc-400 text-xs">
                Arguments ({expectedArity})
                {expectedArity > 1 && (
                  <span class="text-zinc-600 ml-2">— focus a slot to pick into it</span>
                )}
              </label>
              <div class="grid grid-cols-1 gap-3">
                {normalizedArgs.map((value, i) => {
                  const argType = argTypes[i]
                  const isActive = i === activeArgIdx
                  const label = argLabels?.[i] ?? argType ?? 'arg'
                  // `&mt` arg0 ("Hold modifier") wants modifier keycodes only.
                  const pinModifiers = behaviorToken === '&mt' && i === 0 && argType === 'keycode'
                  return (
                    <ArgumentControl
                      key={`${behaviorToken}-${i}`}
                      argType={argType}
                      value={value}
                      onChange={(v) => {
                        updateArg(i, v)
                        if (argType === 'keycode' && v && KEYCODE_TOKEN_SET.has(v.replace(/^[LR][CSGA]\((.+)\)$/, '$1'))) {
                          advanceAfter(i)
                        }
                      }}
                      onCommit={commit}
                      pinModifiers={pinModifiers}
                      layers={state.draft.layers}
                      isActive={isActive}
                      onFocus={() => setActiveArgIdx(i)}
                      label={label}
                      autoFocus={i === activeArgIdx}
                    />
                  )
                })}
              </div>
            </div>
          )
        )}

        <div class="flex justify-between items-center gap-2 mt-6">
          <div class="text-zinc-500">
            Preview: <span class="text-zinc-200">{previewText}</span>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              class="px-3 py-1 bg-zinc-700 text-white rounded hover:bg-zinc-600"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-500"
              // `onMouseDown` instead of `onClick`: mousedown fires BEFORE the
              // focus shift that would normally happen on click, so we can
              // synchronously flush any focused input's pending state via
              // `blur()` (which runs that input's onBlur → composeAndEmit →
              // argsRef sync) and then commit() with fresh `argsRef`. Using
              // onClick was unreliable because the listbox closing on blur
              // shifts the modal layout and the click would miss the button.
              onMouseDown={(e) => {
                e.preventDefault()
                if (document.activeElement instanceof HTMLElement) {
                  document.activeElement.blur()
                }
                commit()
              }}
            >
              Commit
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
