import { useEffect, useRef, useState } from 'hono/jsx'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
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
    ? ['&bt', ...(args ?? [])].filter(Boolean)
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
    const currentBehavior = behaviorRef.current ?? behaviorToken
    const currentBehaviorEntry = getBehavior(currentBehavior)
    const currentArity = currentBehaviorEntry?.arity?.[0] ?? 0
    const currentArgTypes = currentBehaviorEntry?.argTypes ?? []
    let effectiveArgs = argsRef.current ?? args
    if (overrideValue !== undefined && activeArgIdx >= 0) {
      effectiveArgs = [...effectiveArgs]
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

  const updateArg = (i: number, v: string) => {
    // Build the new array from the ref (which always reflects the latest
    // state, even within a single React task) and update the ref
    // synchronously so subsequent commit() calls in the same task see it.
    const next = [...(argsRef.current ?? args)]
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
    <Dialog
      open
      onClose={onCancel}
      size="xl"
      title="Edit binding"
      hint={<span>⌘↵ to commit · esc to cancel</span>}
      footer={({ close, runTeardown }) => (
        <>
          <div class="flex-1 text-xs text-fg-subtle truncate">
            Preview: <span class="text-fg font-mono">{previewText || '—'}</span>
          </div>
          <Button variant="subtle" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            // `onMouseDown` instead of `onClick`: mousedown fires BEFORE the
            // focus shift that would normally happen on click, so we can
            // synchronously flush any focused input's pending state via
            // `blur()` (which runs that input's onBlur → composeAndEmit →
            // argsRef sync) and then commit() with fresh `argsRef`. Using
            // onClick was unreliable because the listbox closing on blur
            // shifts the modal layout and the click would miss the button.
            onMouseDown={(e: MouseEvent) => {
              e.preventDefault()
              if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur()
              }
              // Teardown before commit() → parent's onCommit typically sets
              // pickerKeyIdx=null which conditionally unmounts this Dialog;
              // hono/jsx skips useEffect cleanup on that path, so ModalStack
              // pop and body scroll unlock have to fire synchronously here.
              runTeardown()
              commit()
            }}
          >
            Commit
          </Button>
        </>
      )}
    >
      {({ runTeardown }) => {
        // Every commit path — Commit button, Cmd/Ctrl+Enter modal shortcut,
        // and combobox-driven inline commit (Cmd+Enter inside KeycodeCombobox
        // reaches ArgumentControl's onCommit) — must flush Dialog teardown
        // before triggering parent onCommit, which conditionally unmounts us.
        const commitWithTeardown = (overrideValue?: string) => {
          runTeardown()
          commit(overrideValue)
        }
        // Dialog owns Escape (→ onCancel). We still need to intercept
        // Cmd/Ctrl+Enter as a modal-level commit shortcut; a wrapper
        // <div onKeyDown> catches it via bubbling from whatever input is
        // focused.
        const handleContentKeyDown = (e: KeyboardEvent) => {
          if (e.defaultPrevented) return
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault()
            commitWithTeardown()
          }
        }
        return (
          <div class="flex flex-col gap-4" onKeyDown={handleContentKeyDown}>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-fg-muted">Behaviour</label>
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
                  const currentArgs = argsRef.current ?? args
                  const newArgs = sameShape
                    ? Array.from({ length: nextArity }, (_, i) => currentArgs[i] ?? '')
                    : Array.from({ length: nextArity }, () => '')
                  argsRef.current = newArgs
                  setArgs(newArgs)
                }}
              />
              {behavior?.description && (
                <div class="text-[10px] text-fg-subtle mt-0.5">{behavior.description}</div>
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
                <div class="flex flex-col gap-2">
                  <label class="text-xs font-medium text-fg-muted">
                    Arguments ({expectedArity})
                    {expectedArity > 1 && (
                      <span class="text-fg-subtle ml-2">— focus a slot to pick into it</span>
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
                          onCommit={commitWithTeardown}
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
          </div>
        )
      }}
    </Dialog>
  )
}
