import { useEffect, useState } from 'hono/jsx'
import { EditorProvider, useEditor } from '../lib/editor-state/context'
import { fetchKeymap } from '../lib/editor-state/io'
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
      if (e.metaKey && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        dispatch({ type: 'REDO' })
      } else if (e.metaKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        dispatch({ type: 'UNDO' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dispatch])

  if (loading) {
    return (
      <div class="flex items-center justify-center min-h-screen text-zinc-400 font-mono">
        Loading keymap…
      </div>
    )
  }
  if (loadError) {
    return (
      <div class="flex items-center justify-center min-h-screen text-red-400 font-mono p-8">
        {loadError}
      </div>
    )
  }

  return (
    <div class="flex-1 min-h-0 flex flex-col bg-[#0a0a0a] text-white">
      <header class="border-b border-[#1a1a1a] px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-4">
          <a href="/" class="text-zinc-500 hover:text-zinc-300 text-sm font-mono">
            ← Tester
          </a>
          <h1 class="text-base font-mono">Keymap Editor</h1>
          <span class="text-xs text-zinc-500 font-mono">dev only</span>
        </div>
        <div class="flex items-center gap-3 text-xs font-mono text-zinc-500">
          <button
            type="button"
            class="px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800 disabled:opacity-30"
            disabled={state.past.length === 0}
            onClick={() => dispatch({ type: 'UNDO' })}
          >
            ↶ Undo
          </button>
          <button
            type="button"
            class="px-2 py-1 rounded border border-zinc-700 hover:bg-zinc-800 disabled:opacity-30"
            disabled={state.future.length === 0}
            onClick={() => dispatch({ type: 'REDO' })}
          >
            ↷ Redo
          </button>
          <button
            type="button"
            class="px-3 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white"
            onClick={() => setSaveDialogOpen(true)}
          >
            Save…
          </button>
        </div>
      </header>
      <nav class="flex border-b border-[#1a1a1a]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            class={`px-4 py-2 text-sm font-mono ${
              state.activeTab === t.id
                ? 'text-white border-b-2 border-blue-500'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
            onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', tab: t.id })}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main class="flex-1 flex flex-col min-h-0 p-4 overflow-auto">
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
      <EditorShell />
    </EditorProvider>
  )
}
