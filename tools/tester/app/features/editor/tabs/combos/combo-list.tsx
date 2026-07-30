import { useEffect, useRef, useState } from 'hono/jsx'
import { CommittingTextInput } from '../../../../ui/field'
import { useEditor } from '../../../../core/editor-state/context'
import type { ComboEntry } from '../../../../core/keymap-dt/types'

export type ComboListProps = {
  combos: ComboEntry[]
  activeIdx: number | null
  onSelect: (idx: number) => void
  onAdd: () => void
}

/**
 * Left column of the Combos tab. Each row shows the combo name plus a
 * one-line summary (`&kp ESC · pos 13,14`) so the user can identify a
 * combo without opening the inspector.
 *
 * Inline rename mirrors the LayerList contract: double-click / F2 swaps
 * the name into a CommittingTextInput; commit-on-blur / Enter dispatches
 * RENAME_COMBO, Escape reverts. The row is `<div role="button">` rather
 * than `<button>` because a native button cannot legally nest an input.
 */
export function ComboList({ combos, activeIdx, onSelect, onAdd }: ComboListProps) {
  const { dispatch } = useEditor()
  const [renaming, setRenaming] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({})

  // The `autofocus` attribute is inert here: hono/jsx passes it through with
  // setAttribute, and the HTML spec ignores autofocus candidates inserted once
  // the document already moved focus off <body> — which is always the case for
  // a row the user just clicked or tabbed to. Without an explicit focus() the
  // row keeps focus while tabIndex is -1 and onKeyDown early-returns, so Enter
  // and Escape would both dead-end.
  useEffect(() => {
    if (renaming !== null) inputRef.current?.focus()
  }, [renaming])

  const startRename = (idx: number) => setRenaming(idx)
  const commitRename = (idx: number, name: string) => {
    if (name.trim() !== combos[idx].name) {
      dispatch({ type: 'RENAME_COMBO', index: idx, name })
    }
  }
  // Every exit path funnels through blur: CommittingTextInput calls blur() itself
  // on Enter and Escape, so this is the one place that has to close the editor.
  const endRename = (idx: number, e: FocusEvent) => {
    setRenaming(null)
    // Enter/Escape leave focus on <body>, so restore the row and keep tab order
    // local. A blur from clicking another control names it in relatedTarget —
    // pulling focus back would fight the click the user just made.
    if (e.relatedTarget) return
    rowRefs.current?.[idx]?.focus()
  }

  return (
    <aside
      aria-label="Combos"
      class="w-[190px] flex-none border-r border-border-subtle p-4 flex flex-col gap-1 overflow-auto"
    >
      <div class="flex items-center justify-between px-1.5 pb-2">
        <span class="text-[10.5px] font-mono font-semibold tracking-wider text-fg-subtle">
          COMBOS
        </span>
        <button
          type="button"
          onClick={onAdd}
          class="text-[15px] font-semibold text-fg-muted hover:text-fg leading-none"
          aria-label="Add combo"
          title="Add combo"
        >
          +
        </button>
      </div>
      {combos.length === 0 && (
        <span class="text-[11px] text-fg-subtle px-1.5 py-1">
          No combos defined.
        </span>
      )}
      {combos.map((combo, idx) => {
        const isActive = idx === activeIdx
        const isRenaming = renaming === idx
        const summary = `${combo.bindings.tokens.join(' ')} · pos ${combo.keyPositions.join(',')}`
        return (
          <div
            key={idx}
            ref={(el: HTMLDivElement | null) => {
              if (rowRefs.current) rowRefs.current[idx] = el
            }}
            // `button` has Children Presentational: True, so keeping the role
            // while the input is mounted would strip the textbox from the
            // accessibility tree (axe `nested-interactive`). Dropping role and
            // aria-label during rename hands naming back to the input itself.
            role={isRenaming ? undefined : 'button'}
            tabIndex={isRenaming ? -1 : 0}
            aria-current={isActive ? 'true' : undefined}
            aria-label={
              isRenaming
                ? undefined
                : `Combo ${combo.name}, ${summary}. Enter to select, F2 to rename`
            }
            onClick={() => {
              if (!isRenaming) onSelect(idx)
            }}
            onDblClick={() => startRename(idx)}
            onKeyDown={(e: KeyboardEvent) => {
              if (isRenaming) return
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelect(idx)
                return
              }
              if (e.key === 'F2') {
                e.preventDefault()
                startRename(idx)
              }
            }}
            class={[
              'flex flex-col gap-1 px-2.5 py-2.5 rounded-lg cursor-pointer transition-colors text-left',
              isActive ? 'bg-ink text-ink-fg' : 'hover:bg-surface-3 border border-border-subtle',
            ].join(' ')}
          >
            {isRenaming ? (
              <CommittingTextInput
                ref={inputRef}
                value={combo.name}
                onCommit={(name) => commitRename(idx, name)}
                onBlur={(e: FocusEvent) => endRename(idx, e)}
                class="!px-1.5 !py-0.5 !text-[13px] font-semibold"
                aria-label={`Rename combo ${combo.name}`}
              />
            ) : (
              <span
                class={[
                  'text-[13px] font-semibold truncate',
                  isActive ? '' : 'text-fg',
                ].join(' ')}
              >
                {combo.name}
              </span>
            )}
            <span
              class={[
                'text-[11px] font-mono truncate',
                isActive ? 'text-[color:var(--color-ink-fg)]/60' : 'text-fg-subtle',
              ].join(' ')}
            >
              {summary}
            </span>
          </div>
        )
      })}
    </aside>
  )
}
