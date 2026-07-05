import { useEffect, useState } from 'hono/jsx'
import { useEditor } from '../../lib/editor-state/context'
import { countLayerRefs } from '../../lib/editor-state/reducer'
import { KEYS } from '../../lib/layout'
import { KeyboardGrid } from '../../components/keyboard-grid'
import type { BindingChain } from '../../lib/keymap-dt/types'
import { formatBindingForCell, mainLineSizeClass } from '../../lib/binding-display'
import { BindingPicker } from './binding-picker'

const DT_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/

type ContextMenuState = { x: number; y: number; keyIdx: number } | null
type EditMode = 'edit' | 'copy'

export function LayersTab() {
  const { state, dispatch } = useEditor()
  const [pickerKeyIdx, setPickerKeyIdx] = useState<number | null>(null)
  const [hoveredKeyIdx, setHoveredKeyIdx] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null)
  const [mode, setMode] = useState<EditMode>('edit')
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
    const onKey = (e: KeyboardEvent) => {
      // Esc routing: 1st priority = drop a non-empty selection; 2nd = exit Copy
      // mode. Modals / context menus own Esc when they're up.
      if (e.key === 'Escape' && pickerKeyIdx === null && contextMenu === null) {
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
      if (pickerKeyIdx !== null || contextMenu !== null) return
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
    // doCopy / doPaste / pasteToSelection close over state.clipboard +
    // activeLayerIdx + selectedKeyIdxs; depend on them so the listener
    // always reads the latest values.
  }, [
    hoveredKeyIdx,
    pickerKeyIdx,
    contextMenu,
    state.clipboard,
    state.activeLayerIdx,
    mode,
    selectedKeyIdxs,
  ])

  // Close the floating context menu on any outside click / Esc / scroll.
  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    const onKey = (e: KeyboardEvent) => {
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
    return <div class="text-zinc-500 text-sm font-mono">No layers loaded.</div>
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

  const onAddLayer = () => {
    const defaultName = `Layer${state.draft.layers.length}`
    const raw = window.prompt('New layer name', defaultName)
    if (raw === null) return
    const name = raw.trim()
    if (!DT_IDENT.test(name)) {
      window.alert(
        `Invalid layer name "${raw}". DT identifiers must start with a letter or underscore and contain only letters, digits, and underscores.`,
      )
      return
    }
    if (state.draft.layers.some((l) => l.name === name)) {
      window.alert(`A layer named "${name}" already exists.`)
      return
    }
    dispatch({ type: 'ADD_LAYER', name })
  }

  const onRemoveLayer = (idx: number) => {
    const layer = state.draft.layers[idx]
    const refCount = countLayerRefs(state.draft, idx)
    const msg =
      `Remove layer "${layer.name}" (idx ${idx})?\n\n` +
      `${refCount} binding(s) / combo layer reference(s) currently point to this layer; ` +
      `they will be replaced with &trans / dropped.\n` +
      `Layer indices > ${idx} will shift down by 1.`
    if (!window.confirm(msg)) return
    dispatch({ type: 'REMOVE_LAYER', idx })
  }

  const clipboardPreview = state.clipboard?.tokens.join(' ') ?? ''

  return (
    <div class="relative flex-1 min-h-0">
      <div class="absolute top-0 inset-x-0 z-10 flex gap-2 flex-wrap items-center">
        {state.draft.layers.map((l, i) => (
          <div key={l.name} class="flex items-stretch">
            <button
              type="button"
              class={`px-3 py-1 rounded-l text-xs font-mono ${
                state.activeLayerIdx === i
                  ? 'bg-blue-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              } ${i === 0 ? 'rounded-r' : ''}`}
              onClick={() => dispatch({ type: 'SET_ACTIVE_LAYER', layerIdx: i })}
            >
              {i}: {l.name}
            </button>
            {i !== 0 && (
              <button
                type="button"
                title={`Remove layer ${l.name}`}
                aria-label={`Remove layer ${l.name}`}
                class="px-2 rounded-r text-xs font-mono bg-zinc-800 text-zinc-500 hover:bg-red-700 hover:text-white border-l border-zinc-900"
                onClick={() => onRemoveLayer(i)}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          class="px-3 py-1 rounded text-xs font-mono bg-zinc-900 border border-dashed border-zinc-600 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          onClick={onAddLayer}
        >
          + Add layer
        </button>
      </div>

      <div class="absolute inset-0 flex items-center justify-center pb-[160px]">
      <KeyboardGrid
        keys={KEYS}
        renderCell={(k) => {
          const binding = activeLayer.bindings[k.index]
          const display = binding
            ? formatBindingForCell(binding)
            : { topLine: '', mainLine: '', faint: true }
          const isHovered = hoveredKeyIdx === k.index
          const isSelected = selectedKeyIdxs.has(k.index)
          const hoverBorder =
            mode === 'copy'
              ? state.clipboard
                ? 'hover:border-emerald-500'
                : 'hover:border-amber-500'
              : 'hover:border-blue-500'
          let activeBorder = 'border-[#2a2a2a]'
          let activeBg = 'bg-[#1a1a1a]'
          if (isSelected) {
            activeBorder = 'border-emerald-400 ring-1 ring-emerald-400/60'
            activeBg = 'bg-emerald-900/30'
          } else if (isHovered) {
            activeBorder =
              mode === 'copy'
                ? state.clipboard
                  ? 'border-emerald-500'
                  : 'border-amber-500'
                : 'border-blue-500'
          }
          const mainColor = display.faint ? 'text-zinc-600' : 'text-zinc-100'
          return (
            <button
              type="button"
              title={binding ? binding.tokens.join(' ') : ''}
              class={`relative w-[64px] h-[64px] flex flex-col items-center justify-center rounded-md border font-mono hover:bg-zinc-800 px-1 leading-tight text-center break-words ${activeBg} ${hoverBorder} ${activeBorder}`}
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
                <span class="absolute top-0.5 inset-x-1 text-[8px] text-zinc-500 leading-none truncate text-left">
                  {display.topLine}
                </span>
              )}
              <span class={`${mainLineSizeClass(display.mainLine)} ${mainColor}`}>
                {display.mainLine}
              </span>
              {display.subLine && (
                <span class="absolute bottom-0.5 inset-x-1 text-[8px] text-zinc-500 leading-none truncate">
                  {display.subLine}
                </span>
              )}
            </button>
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
            class="pointer-events-auto inline-flex items-center gap-2 px-2 py-1 rounded text-[10px] font-mono bg-zinc-900/95 border border-emerald-700/60 text-emerald-300 shadow-lg backdrop-blur"
            title="Editor clipboard (Cmd/Ctrl+C on a cell to copy, Cmd/Ctrl+V to paste)"
          >
            <span class="text-emerald-500 uppercase tracking-wide">Clipboard</span>
            <span class="text-zinc-200">{clipboardPreview}</span>
            <button
              type="button"
              class="text-zinc-500 hover:text-zinc-200"
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
          class={`pointer-events-auto px-3 py-2 rounded-md text-xs font-mono shadow-lg backdrop-blur ${
            mode === 'copy'
              ? 'bg-emerald-700/95 text-white hover:bg-emerald-600'
              : 'bg-zinc-900/95 border border-zinc-700 text-zinc-300 hover:bg-zinc-800'
          }`}
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
    </div>
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
      class="fixed z-40 min-w-[240px] bg-[#1a1a1a] border border-zinc-700 rounded-md shadow-xl py-1 text-xs font-mono"
      style={`top: ${y}px; left: ${x}px;`}
      onMouseDown={stop}
      onClick={stop}
      role="menu"
    >
      <MenuItem onSelect={onEdit}>Edit binding…</MenuItem>
      <div class="border-t border-zinc-800 my-1" />
      <MenuItem onSelect={onCopy} shortcut="⌘C">Copy binding</MenuItem>
      <MenuItem onSelect={onPaste} shortcut="⌘V" disabled={!canPaste}>
        {canPaste ? `Paste — ${clipboardPreview}` : 'Paste (empty)'}
      </MenuItem>
      <div class="border-t border-zinc-800 my-1" />
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
      class={`w-full flex items-center justify-between gap-4 px-3 py-1.5 text-left ${
        disabled
          ? 'text-zinc-600 cursor-not-allowed'
          : 'text-zinc-200 hover:bg-zinc-800 cursor-pointer'
      }`}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onSelect()
      }}
    >
      <span>{children}</span>
      {shortcut && <span class="text-zinc-500 text-[10px]">{shortcut}</span>}
    </button>
  )
}
