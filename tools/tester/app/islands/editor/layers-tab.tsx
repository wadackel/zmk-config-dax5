import { useEffect, useRef, useState } from 'hono/jsx'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field, TextInput } from '../../components/ui/field'
import { KeyCap } from '../../components/ui/key-cap'
import type { KeyCapState } from '../../components/ui/key-cap'
import { useEditor } from '../../lib/editor-state/context'
import { countLayerRefs } from '../../lib/editor-state/reducer'
import { KEYS } from '../../lib/layout'
import { KeyboardGrid } from '../../components/keyboard-grid'
import type { BindingChain } from '../../lib/keymap-dt/types'
import { formatBindingForCell, mainLineSizeClass } from '../../lib/binding-display'
import { BindingPicker } from './binding-picker'

const DT_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

// Monotonic per-mount token. Each LayersTab instance grabs the next value on
// mount; window listeners installed by that instance compare against
// `currentLayersInstance` before running. When hono/jsx skips useEffect
// cleanup on conditional unmount (tab switch), the old listener stays in
// memory but its captured token no longer matches, so subsequent Cmd+C /
// Cmd+V events on a re-mounted Layers tab only reach the newest closure.
let layersInstanceCounter = 0
let currentLayersInstance = 0

type ContextMenuState = { x: number; y: number; keyIdx: number } | null
type EditMode = 'edit' | 'copy'
type LayerDialogState = { kind: 'add' } | { kind: 'remove'; idx: number } | null

export function LayersTab() {
  const { state, dispatch } = useEditor()
  // Claim the next instance token. Every render re-runs this line, but the
  // ref keeps the same value for the lifetime of THIS mount; on remount a
  // fresh ref grabs a new token, superseding any listener still bound to
  // the previous mount's token.
  const instanceTokenRef = useRef<{ v: number } | null>(null)
  if (instanceTokenRef.current === null) {
    layersInstanceCounter++
    currentLayersInstance = layersInstanceCounter
    instanceTokenRef.current = { v: layersInstanceCounter }
  } else {
    // On re-render (not remount), reassert this instance as current in case
    // an earlier instance's listener ran and clobbered the value.
    currentLayersInstance = instanceTokenRef.current.v
  }
  const [pickerKeyIdx, setPickerKeyIdx] = useState<number | null>(null)
  const [hoveredKeyIdx, setHoveredKeyIdx] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [mode, setMode] = useState<EditMode>('edit')
  const [layerDialog, setLayerDialog] = useState<LayerDialogState>(null)
  // Paste-target selection used in Copy mode: click toggles membership, then
  // Cmd/Ctrl+V commits a single bulk paste to every selected cell.
  const [selectedKeyIdxs, setSelectedKeyIdxs] = useState<Set<number>>(new Set())

  const clearSelection = () => setSelectedKeyIdxs(new Set())
  const toggleSelected = (idx: number) =>
    setSelectedKeyIdxs((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })

  // Reset selection when leaving Copy mode or switching layers — those changes
  // invalidate the previous selection context.
  useEffect(() => {
    if (mode === 'edit') clearSelection()
  }, [mode])
  useEffect(() => {
    clearSelection()
  }, [state.activeLayerIdx])

  const activeLayer = state.draft.layers[state.activeLayerIdx]

  const doCopy = (keyIdx: number) => {
    if (!activeLayer) return
    const src = activeLayer.bindings[keyIdx]
    if (!src) return
    dispatch({ type: 'SET_CLIPBOARD', chain: { tokens: [...src.tokens] } })
  }

  const doPaste = (keyIdx: number) => {
    if (!state.clipboard) return
    dispatch({
      type: 'UPDATE_BINDING',
      layerIdx: state.activeLayerIdx,
      keyIdx,
      chain: { tokens: [...state.clipboard.tokens] },
    })
  }

  const doReset = (keyIdx: number, tokens: string[]) => {
    dispatch({
      type: 'UPDATE_BINDING',
      layerIdx: state.activeLayerIdx,
      keyIdx,
      chain: { tokens: [...tokens] },
    })
  }

  const pasteToSelection = () => {
    if (!state.clipboard || selectedKeyIdxs.size === 0) return
    const chain: BindingChain = { tokens: [...state.clipboard.tokens] }
    dispatch({
      type: 'UPDATE_BINDINGS_BULK',
      layerIdx: state.activeLayerIdx,
      edits: Array.from(selectedKeyIdxs).map((keyIdx) => ({ keyIdx, chain })),
    })
    clearSelection()
  }

  // Global keyboard shortcuts: Cmd/Ctrl+C / Cmd/Ctrl+V on the hovered cell.
  // Suppressed when a modal / context menu is open or any text input has focus —
  // those cases belong to native browser copy/paste.
  useEffect(() => {
    const myToken = instanceTokenRef.current?.v ?? -1
    const onKey = (e: KeyboardEvent) => {
      // Two-layer stale-listener defence, both needed because hono/jsx skips
      // useEffect cleanup on conditional unmount (tab switch):
      //   1. Bail when Layers is not the current active tab.
      //   2. Bail when this listener belongs to an older LayersTab mount
      //      (Layers → Combos → Layers spawns a new instance; the previous
      //      listener would otherwise race the new one on the same event).
      if (myToken !== currentLayersInstance) return
      const layersActive = document
        .querySelector<HTMLElement>('[role="tab"][data-editor-tab="layers"]')
        ?.getAttribute('aria-selected') === 'true'
      if (!layersActive) return
      // Esc routing: 1st priority = drop a non-empty selection; 2nd = exit Copy
      // mode. Modals / context menus own Esc when they're up.
      if (
        e.key === 'Escape' &&
        pickerKeyIdx === null &&
        contextMenu === null &&
        layerDialog === null
      ) {
        if (selectedKeyIdxs.size > 0) {
          e.preventDefault()
          clearSelection()
          return
        }
        if (mode === 'copy') {
          e.preventDefault()
          setMode('edit')
          return
        }
      }
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key !== 'c' && e.key !== 'v') return
      if (pickerKeyIdx !== null || contextMenu !== null || layerDialog !== null) return
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) {
        return
      }
      if (e.key === 'v') {
        // Selection wins over hover: deliberate multi-target paste.
        if (state.clipboard && selectedKeyIdxs.size > 0) {
          e.preventDefault()
          pasteToSelection()
          return
        }
        if (hoveredKeyIdx === null) return
        e.preventDefault()
        doPaste(hoveredKeyIdx)
      } else {
        if (hoveredKeyIdx === null) return
        e.preventDefault()
        doCopy(hoveredKeyIdx)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    hoveredKeyIdx,
    pickerKeyIdx,
    contextMenu,
    layerDialog,
    state.clipboard,
    state.activeLayerIdx,
    mode,
    selectedKeyIdxs,
  ])

  // Close the floating context menu on any outside click / Esc / scroll.
  useEffect(() => {
    if (!contextMenu) return
    const myToken = instanceTokenRef.current?.v ?? -1
    const close = () => setContextMenu(null)
    const onKey = (e: KeyboardEvent) => {
      // Same stale-listener guards as the copy/paste hotkey block above.
      if (myToken !== currentLayersInstance) return
      const layersActive = document
        .querySelector<HTMLElement>('[role="tab"][data-editor-tab="layers"]')
        ?.getAttribute('aria-selected') === 'true'
      if (!layersActive) return
      if (e.key === 'Escape') close()
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  if (state.draft.layers.length === 0) {
    return <div class="text-fg-subtle text-sm">No layers loaded.</div>
  }

  const onPickerCommit = (chain: BindingChain) => {
    if (pickerKeyIdx === null) return
    dispatch({
      type: 'UPDATE_BINDING',
      layerIdx: state.activeLayerIdx,
      keyIdx: pickerKeyIdx,
      chain,
    })
    setPickerKeyIdx(null)
  }

  const clipboardPreview = state.clipboard?.tokens.join(' ') ?? ''

  return (
    <div class="grid grid-rows-[auto_1fr] gap-4 h-full min-h-0">
      <div class="flex gap-1.5 flex-wrap items-center">
        {state.draft.layers.map((l, i) => (
          <div key={l.name} class="flex items-stretch">
            <button
              type="button"
              class={[
                'px-3 py-1 rounded-l-md text-xs transition-colors',
                state.activeLayerIdx === i
                  ? 'bg-accent text-accent-fg'
                  : 'bg-surface-3 text-fg-muted hover:bg-surface-4 hover:text-fg',
                i === 0 ? 'rounded-r-md' : '',
              ].join(' ')}
              onClick={() => dispatch({ type: 'SET_ACTIVE_LAYER', layerIdx: i })}
            >
              <span class="text-fg-subtle mr-1">{i}</span>
              <span class="font-mono">{l.name}</span>
            </button>
            {i !== 0 && (
              <button
                type="button"
                title={`Remove layer ${l.name}`}
                aria-label={`Remove layer ${l.name}`}
                class="px-2 rounded-r-md text-xs bg-surface-3 text-fg-subtle hover:bg-danger hover:text-danger-fg border-l border-surface-0 transition-colors"
                onClick={() => setLayerDialog({ kind: 'remove', idx: i })}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <Button
          size="xs"
          variant="ghost"
          class="border-dashed"
          onClick={() => setLayerDialog({ kind: 'add' })}
        >
          + Add layer
        </Button>
      </div>

      <div class="flex items-start justify-center overflow-auto min-h-0 min-w-0 pt-8">
        <KeyboardGrid
          keys={KEYS}
          renderCell={(k) => {
            const binding = activeLayer.bindings[k.index]
            const display = binding
              ? formatBindingForCell(binding)
              : { topLine: '', mainLine: '', faint: true }
            const isHovered = hoveredKeyIdx === k.index
            const isSelected = selectedKeyIdxs.has(k.index)
            const capState: KeyCapState = isSelected
              ? 'selected'
              : isHovered
                ? mode === 'copy'
                  ? state.clipboard
                    ? 'clip-target'
                    : 'clip-source'
                  : 'hover'
                : 'idle'
            const mainColor = display.faint ? 'text-fg-subtle' : 'text-fg'
            return (
              <KeyCap
                state={capState}
                asButton
                hoverable
                interactive
                class="relative"
                title={binding ? binding.tokens.join(' ') : ''}
                onClick={() => {
                  if (mode === 'copy') {
                    if (state.clipboard === null) doCopy(k.index)
                    else toggleSelected(k.index)
                  } else {
                    setPickerKeyIdx(k.index)
                  }
                }}
                onMouseEnter={() => setHoveredKeyIdx(k.index)}
                onMouseLeave={() => setHoveredKeyIdx((cur) => (cur === k.index ? null : cur))}
                onContextMenu={(e: MouseEvent) => {
                  e.preventDefault()
                  setContextMenu({ x: e.clientX, y: e.clientY, keyIdx: k.index })
                }}
              >
                {display.topLine && (
                  <span class="absolute top-0.5 inset-x-1 text-[8px] text-fg-subtle leading-none truncate text-left">
                    {display.topLine}
                  </span>
                )}
                <span class={`${mainLineSizeClass(display.mainLine)} ${mainColor}`}>
                  {display.mainLine}
                </span>
                {display.subLine && (
                  <span class="absolute bottom-0.5 inset-x-1 text-[8px] text-fg-subtle leading-none truncate">
                    {display.subLine}
                  </span>
                )}
              </KeyCap>
            )
          }}
        />
      </div>

      {pickerKeyIdx !== null && (
        <BindingPicker
          initial={activeLayer.bindings[pickerKeyIdx]}
          onCancel={() => setPickerKeyIdx(null)}
          onCommit={onPickerCommit}
        />
      )}

      <div class="fixed bottom-4 right-4 z-30 flex flex-col items-end gap-2 pointer-events-none">
        {state.clipboard && (
          <div
            class="pointer-events-auto inline-flex items-center gap-2 px-2 py-1 rounded-md text-[10px] font-mono bg-surface-3/95 border border-success/60 text-success shadow-panel backdrop-blur"
            title="Editor clipboard (Cmd/Ctrl+C on a cell to copy, Cmd/Ctrl+V to paste)"
          >
            <span class="uppercase tracking-wide">Clipboard</span>
            <span class="text-fg">{clipboardPreview}</span>
            <button
              type="button"
              class="text-fg-subtle hover:text-fg"
              onClick={() => dispatch({ type: 'SET_CLIPBOARD', chain: null })}
              aria-label="Clear clipboard"
              title="Clear clipboard"
            >
              ×
            </button>
          </div>
        )}
        <button
          type="button"
          class={[
            'pointer-events-auto px-3 py-2 rounded-md text-xs shadow-panel backdrop-blur transition-colors',
            mode === 'copy'
              ? 'bg-success/90 text-fg-inverse hover:bg-success'
              : 'bg-surface-3/95 border border-border text-fg-muted hover:bg-surface-4 hover:text-fg',
          ].join(' ')}
          onClick={() => setMode((m) => (m === 'copy' ? 'edit' : 'copy'))}
          title={
            mode === 'copy'
              ? 'Click to exit copy mode (Esc)'
              : 'Click cells to copy/paste instead of opening the picker'
          }
        >
          {mode === 'copy'
            ? state.clipboard
              ? selectedKeyIdxs.size > 0
                ? `● Copy mode — ⌘V to paste into ${selectedKeyIdxs.size}`
                : '● Copy mode — click cells to select targets'
              : '● Copy mode — pick source'
            : '○ Copy mode'}
        </button>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          clipboardPreview={clipboardPreview}
          canPaste={state.clipboard !== null}
          onEdit={() => {
            setPickerKeyIdx(contextMenu.keyIdx)
            setContextMenu(null)
          }}
          onCopy={() => {
            doCopy(contextMenu.keyIdx)
            setContextMenu(null)
          }}
          onPaste={() => {
            doPaste(contextMenu.keyIdx)
            setContextMenu(null)
          }}
          onResetTrans={() => {
            doReset(contextMenu.keyIdx, ['&trans'])
            setContextMenu(null)
          }}
          onResetNone={() => {
            doReset(contextMenu.keyIdx, ['&none'])
            setContextMenu(null)
          }}
        />
      )}

      {layerDialog?.kind === 'add' && (
        <AddLayerDialog
          existingNames={state.draft.layers.map((l) => l.name)}
          defaultName={`Layer${state.draft.layers.length}`}
          onCancel={() => setLayerDialog(null)}
          onConfirm={(name) => {
            dispatch({ type: 'ADD_LAYER', name })
            setLayerDialog(null)
          }}
        />
      )}
      {layerDialog?.kind === 'remove' && state.draft.layers[layerDialog.idx] && (
        <RemoveLayerDialog
          idx={layerDialog.idx}
          layerName={state.draft.layers[layerDialog.idx]!.name}
          refCount={countLayerRefs(state.draft, layerDialog.idx)}
          onCancel={() => setLayerDialog(null)}
          onConfirm={() => {
            dispatch({ type: 'REMOVE_LAYER', idx: layerDialog.idx })
            setLayerDialog(null)
          }}
        />
      )}
    </div>
  )
}

function AddLayerDialog({
  existingNames,
  defaultName,
  onCancel,
  onConfirm,
}: {
  existingNames: string[]
  defaultName: string
  onCancel: () => void
  onConfirm: (name: string) => void
}) {
  const [name, setName] = useState(defaultName)
  const trimmed = name.trim()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const invalidIdent = !DT_IDENT.test(trimmed)
  const duplicate = existingNames.includes(trimmed)
  const error = !trimmed
    ? 'Name required.'
    : invalidIdent
      ? 'DT identifiers must start with a letter/underscore and contain only letters, digits, underscores.'
      : duplicate
        ? `A layer named "${trimmed}" already exists.`
        : undefined
  const canSubmit = !error

  useEffect(() => {
    queueMicrotask(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.select()
    })
  }, [])

  return (
    <Dialog
      open
      onClose={onCancel}
      size="sm"
      title="Add layer"
      description="DT identifier used as the layer node name."
      footer={({ close, runTeardown }) => (
        <>
          <Button variant="subtle" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return
              runTeardown()
              onConfirm(trimmed)
            }}
          >
            Add layer
          </Button>
        </>
      )}
    >
      {({ runTeardown }) => (
        <Field htmlFor="add-layer-name" label="Name" error={error}>
          <TextInput
            id="add-layer-name"
            ref={inputRef as any}
            class="font-mono"
            invalid={!!error && trimmed !== ''}
            value={name}
            onInput={(e: Event) => setName((e.target as HTMLInputElement).value)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (!canSubmit) return
                // Same reasoning as the Add button — parent's onConfirm sets
                // layerDialog=null which conditionally unmounts this Dialog;
                // teardown has to fire synchronously first.
                runTeardown()
                onConfirm(trimmed)
              }
            }}
          />
        </Field>
      )}
    </Dialog>
  )
}

function RemoveLayerDialog({
  idx,
  layerName,
  refCount,
  onCancel,
  onConfirm,
}: {
  idx: number
  layerName: string
  refCount: number
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog
      open
      onClose={onCancel}
      size="sm"
      title={`Remove layer "${layerName}"`}
      hint="esc to cancel"
      footer={({ close, runTeardown }) => (
        <>
          <Button variant="subtle" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              runTeardown()
              onConfirm()
            }}
          >
            Remove
          </Button>
        </>
      )}
    >
      <div class="flex flex-col gap-2 text-sm">
        <p class="m-0">
          <span class="text-fg-subtle">Index </span>
          <span class="font-mono text-fg">{idx}</span>
          <span class="text-fg-subtle"> · </span>
          <span class="text-warning">{refCount} reference{refCount === 1 ? '' : 's'}</span>
          {refCount > 0 && (
            <span class="text-fg-subtle"> will be replaced with &amp;trans / dropped.</span>
          )}
        </p>
        <p class="text-xs text-fg-subtle m-0">
          Layer indices &gt; {idx} will shift down by 1.
        </p>
      </div>
    </Dialog>
  )
}

type ContextMenuProps = {
  x: number
  y: number
  clipboardPreview: string
  canPaste: boolean
  onEdit: () => void
  onCopy: () => void
  onPaste: () => void
  onResetTrans: () => void
  onResetNone: () => void
}

function ContextMenu({
  x,
  y,
  clipboardPreview,
  canPaste,
  onEdit,
  onCopy,
  onPaste,
  onResetTrans,
  onResetNone,
}: ContextMenuProps) {
  const stop = (e: Event) => e.stopPropagation()
  return (
    <div
      class="fixed z-40 min-w-[240px] bg-surface-3 border border-border rounded-md shadow-popover py-1 text-xs"
      style={`top: ${y}px; left: ${x}px;`}
      onMouseDown={stop}
      onClick={stop}
      role="menu"
    >
      <MenuItem onSelect={onEdit}>Edit binding…</MenuItem>
      <div class="border-t border-border-subtle my-1" />
      <MenuItem onSelect={onCopy} shortcut="⌘C">Copy binding</MenuItem>
      <MenuItem onSelect={onPaste} shortcut="⌘V" disabled={!canPaste}>
        {canPaste ? `Paste — ${clipboardPreview}` : 'Paste (empty)'}
      </MenuItem>
      <div class="border-t border-border-subtle my-1" />
      <MenuItem onSelect={onResetTrans}>Reset to &amp;trans</MenuItem>
      <MenuItem onSelect={onResetNone}>Reset to &amp;none</MenuItem>
    </div>
  )
}

function MenuItem({
  onSelect,
  disabled,
  shortcut,
  children,
}: {
  onSelect: () => void
  disabled?: boolean
  shortcut?: string
  children: unknown
}) {
  return (
    <button
      type="button"
      role="menuitem"
      class={[
        'w-full flex items-center justify-between gap-4 px-3 py-1.5 text-left',
        disabled
          ? 'text-fg-subtle cursor-not-allowed'
          : 'text-fg hover:bg-surface-4 cursor-pointer',
      ].join(' ')}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onSelect()
      }}
    >
      <span>{children}</span>
      {shortcut && <span class="text-fg-subtle text-[10px]">{shortcut}</span>}
    </button>
  )
}
