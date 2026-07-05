import { useEffect, useState } from 'hono/jsx'
import { Button } from '../components/ui/button'
import { ToastProvider } from '../components/ui/toast'
import { EditorProvider, useEditor } from '../lib/editor-state/context'
import { fetchKeymap } from '../lib/editor-state/io'
import { ModalStackProvider, useModalStack } from '../lib/editor-state/modal-stack'
import { parseKeymap } from '../lib/keymap-dt/parse'
import type { EditorTab } from '../lib/editor-state/types'
import { BehaviorsTab } from './editor/behaviors-tab'
import { CombosTab } from './editor/combos-tab'
import { LayersTab } from './editor/layers-tab'
import { MacrosTab } from './editor/macros-tab'
import { MouseGesturesTab } from './editor/mouse-gestures-tab'
import { SaveDialog } from './editor/save-dialog'
import { SensorsTab } from './editor/sensors-tab'

const TABS: { id: EditorTab; label: string }[] = [
  { id: 'layers', label: 'Layers' },
  { id: 'combos', label: 'Combos' },
  { id: 'macros', label: 'Macros' },
  { id: 'behaviors', label: 'Behaviors' },
  { id: 'sensors', label: 'Sensors' },
  { id: 'mouse-gestures', label: 'Mouse Gestures' },
]

function EditorShell() {
  const { state, dispatch } = useEditor()
  const modalStack = useModalStack()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchKeymap()
      .then((r) => {
        if (cancelled) return
        try {
          const parsed = parseKeymap(r.text)
          dispatch({
            type: 'LOAD',
            source: r.text,
            mtimeMs: r.mtimeMs,
            draft: {
              layers: parsed.layers,
              combos: parsed.combos,
              macros: parsed.macros,
              behaviors: parsed.behaviors,
              mouseGestures: parsed.mouseGestures,
              rootBehaviors: parsed.rootBehaviors,
            },
          })
          setLoading(false)
        } catch (err) {
          setLoadError(`Failed to parse keymap: ${(err as Error).message}`)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(`Failed to load keymap: ${(err as Error).message}`)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [dispatch])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Modal open → hand shortcut to the modal (it owns the focus context).
      if (modalStack.count > 0) return
      // Text inputs handle their own text-editing shortcut semantics.
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      // Redo: Cmd/Ctrl+Shift+Z OR Ctrl+Y
      if ((e.shiftKey && (e.key === 'z' || e.key === 'Z')) || (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault()
        dispatch({ type: 'REDO' })
        return
      }
      // Undo: Cmd/Ctrl+Z
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault()
        dispatch({ type: 'UNDO' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch, modalStack.count])

  // Warn on tab-close when there are unsaved edits.
  useEffect(() => {
    if (state.past.length === 0) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Modern browsers ignore returnValue but still show a generic prompt
      // whenever the beforeunload handler calls preventDefault.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [state.past.length])

  if (loading) {
    return (
      <div class="flex items-center justify-center min-h-screen text-fg-muted">
        Loading keymap…
      </div>
    )
  }
  if (loadError) {
    return (
      <div class="flex items-center justify-center min-h-screen text-danger p-8">
        {loadError}
      </div>
    )
  }

  const dirty = state.past.length > 0

  return (
    <div class="flex-1 min-h-0 flex flex-col bg-surface-0 text-fg">
      <header class="border-b border-border-subtle px-4 py-3 flex items-center justify-between gap-4">
        <div class="flex items-center gap-4 min-w-0">
          <a
            href="/tester"
            class="text-fg-subtle hover:text-fg text-sm transition-colors"
          >
            ← Tester
          </a>
          <h1 class="text-base font-semibold m-0 tracking-tight">Keymap Editor</h1>
          <span class="text-[10px] uppercase tracking-wider text-fg-subtle border border-border rounded-full px-1.5 py-0.5">
            dev
          </span>
          {dirty && (
            <span
              class="inline-flex items-center gap-1.5 text-xs text-warning"
              aria-live="polite"
              title="You have unsaved edits"
            >
              <span class="inline-block w-1.5 h-1.5 rounded-full bg-warning" />
              Unsaved changes
            </span>
          )}
        </div>
        <div class="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            disabled={state.past.length === 0}
            onClick={() => dispatch({ type: 'UNDO' })}
            title="Undo (⌘Z / Ctrl+Z)"
          >
            ↶ Undo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={state.future.length === 0}
            onClick={() => dispatch({ type: 'REDO' })}
            title="Redo (⌘⇧Z / Ctrl+Y)"
          >
            ↷ Redo
          </Button>
          <Button size="sm" variant="primary" onClick={() => setSaveDialogOpen(true)}>
            Save…
          </Button>
        </div>
      </header>
      <nav
        class="flex border-b border-border-subtle px-1"
        role="tablist"
        aria-label="Editor sections"
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') {
            return
          }
          e.preventDefault()
          const currentIdx = TABS.findIndex((t) => t.id === state.activeTab)
          const last = TABS.length - 1
          let nextIdx = currentIdx
          if (e.key === 'ArrowLeft') nextIdx = currentIdx <= 0 ? last : currentIdx - 1
          else if (e.key === 'ArrowRight') nextIdx = currentIdx >= last ? 0 : currentIdx + 1
          else if (e.key === 'Home') nextIdx = 0
          else if (e.key === 'End') nextIdx = last
          const target = TABS[nextIdx]
          if (!target) return
          dispatch({ type: 'SET_ACTIVE_TAB', tab: target.id })
          // Focus the newly-active tab so subsequent Arrow keys keep working.
          queueMicrotask(() => {
            const el = document.querySelector<HTMLButtonElement>(
              `[data-editor-tab="${target.id}"]`,
            )
            el?.focus()
          })
        }}
      >
        {TABS.map((t) => {
          const active = state.activeTab === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              data-editor-tab={t.id}
              // Serialize to string — hono/jsx renders boolean aria attributes
              // as empty-string values, which screen readers do not treat as
              // the truthful state ("true"/"false" is what APG expects).
              aria-selected={active ? 'true' : 'false'}
              aria-controls={`tabpanel-${t.id}`}
              tabIndex={active ? 0 : -1}
              class={[
                'px-3.5 py-2 text-sm transition-colors relative',
                active
                  ? 'text-fg after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-t after:bg-accent'
                  : 'text-fg-muted hover:text-fg',
              ].join(' ')}
              onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', tab: t.id })}
            >
              {t.label}
            </button>
          )
        })}
      </nav>
      <main
        class="flex-1 flex flex-col min-h-0 p-4 overflow-auto"
        role="tabpanel"
        id={`tabpanel-${state.activeTab}`}
        aria-labelledby={`tab-${state.activeTab}`}
      >
        {state.activeTab === 'layers' && <LayersTab />}
        {state.activeTab === 'combos' && <CombosTab />}
        {state.activeTab === 'macros' && <MacrosTab />}
        {state.activeTab === 'behaviors' && <BehaviorsTab />}
        {state.activeTab === 'sensors' && <SensorsTab />}
        {state.activeTab === 'mouse-gestures' && <MouseGesturesTab />}
      </main>
      {saveDialogOpen && <SaveDialog onClose={() => setSaveDialogOpen(false)} />}
    </div>
  )
}

export default function KeymapEditor() {
  return (
    <EditorProvider>
      <ModalStackProvider>
        <ToastProvider>
          <EditorShell />
        </ToastProvider>
      </ModalStackProvider>
    </EditorProvider>
  )
}
