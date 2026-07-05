import { useEffect, useState } from 'hono/jsx'
import { useEditor } from '../../lib/editor-state/context'
import { fetchPreview, saveKeymap } from '../../lib/editor-state/io'
import type { LintResult } from '../../lib/keymap-dt/lint'
import { applyEdits, type Edit } from '../../lib/keymap-dt/patch'
import { parseKeymap } from '../../lib/keymap-dt/parse'
import {
  detectLineIndent,
  serializeBehavior,
  serializeCombo,
  serializeLayer,
  serializeMacro,
  serializeMouseGestureBlock,
  serializeRootBehavior,
} from '../../lib/keymap-dt/serialize'

export function SaveDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useEditor()
  const [preview, setPreview] = useState<{ diff: string; lint: LintResult } | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)

  const candidateText = buildCandidateText(state.baselineSource, state.draft)

  useEffect(() => {
    let cancelled = false
    fetchPreview(candidateText)
      .then((r) => {
        if (cancelled) return
        setPreview({ diff: r.diff, lint: r.lint })
      })
      .catch((err) => {
        if (cancelled) return
        setPreviewError(String(err))
      })
    return () => {
      cancelled = true
    }
  }, [candidateText])

  const onConfirm = async () => {
    setSaving(true)
    try {
      const res = await saveKeymap(candidateText, state.baselineMtimeMs)
      if (res.ok) {
        const parsed = parseKeymap(candidateText)
        dispatch({
          type: 'SAVE_COMMIT',
          source: candidateText,
          mtimeMs: res.mtimeMs,
          draft: {
            layers: parsed.layers,
            combos: parsed.combos,
            macros: parsed.macros,
            behaviors: parsed.behaviors,
            mouseGestures: parsed.mouseGestures,
            rootBehaviors: parsed.rootBehaviors,
          },
        })
        onClose()
      } else {
        setConflictMessage(
          'Remote file changed since you started editing. Click "Reload" to discard local edits and fetch the latest, or "Cancel" to keep editing.',
        )
      }
    } finally {
      setSaving(false)
    }
  }

  const canSave = preview?.lint.ok === true && !saving && !conflictMessage

  return (
    <div class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={onClose}>
      <div
        class="bg-[#121212] border border-zinc-700 rounded-lg w-[90vw] max-w-5xl max-h-[85vh] overflow-auto p-6 font-mono"
        onClick={(e: Event) => e.stopPropagation()}
      >
        <h2 class="text-base text-white mb-4">Save keymap</h2>

        {previewError && (
          <div class="text-red-400 mb-3 text-sm">Preview error: {previewError}</div>
        )}

        {preview && (
          <>
            <div class="mb-4">
              <div class="text-xs text-zinc-400 mb-1">Lint</div>
              {preview.lint.errors.length === 0 ? (
                <div class="text-emerald-400 text-sm">No errors.</div>
              ) : (
                <ul class="text-red-400 text-sm">
                  {preview.lint.errors.map((e, i) => (
                    <li key={i}>{e.message}</li>
                  ))}
                </ul>
              )}
              {preview.lint.warnings.length > 0 && (
                <ul class="text-amber-400 text-xs mt-1">
                  {preview.lint.warnings.map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div class="text-xs text-zinc-400 mb-1">Diff preview</div>
              <pre class="bg-[#0a0a0a] border border-zinc-800 p-3 text-xs overflow-auto max-h-[40vh] whitespace-pre">
                {preview.diff}
              </pre>
            </div>
          </>
        )}

        {conflictMessage && (
          <div class="text-amber-400 text-sm mt-3 border border-amber-700 rounded p-2">
            {conflictMessage}
          </div>
        )}

        <div class="flex justify-end gap-2 mt-6">
          <button
            type="button"
            class="px-4 py-1 bg-zinc-700 text-white rounded hover:bg-zinc-600"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            class="px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-500 disabled:opacity-40"
            disabled={!canSave}
            onClick={onConfirm}
          >
            {saving ? 'Saving…' : 'Confirm save'}
          </button>
        </div>
      </div>
    </div>
  )
}

function buildCandidateText(baseSource: string, draft: ReturnType<typeof useEditor>['state']['draft']): string {
  const parsed = parseKeymap(baseSource)
  const edits: Edit[] = []

  // Keymap / combos / macros / behaviors: always rewrite the entire container
  // body from the draft. This handles add / remove / rename in one path AND
  // preserves both the container-level `compatible` property and each entry's
  // user-given name. The body is wrapped between the container's `{` and `}`
  // already, so we replace `bodyRange` only.
  patchKeymapContainer(parsed, edits, draft.layers)
  patchCombosContainer(parsed, edits, draft.combos)
  patchMacrosContainer(parsed, edits, draft.macros)
  patchBehaviorsContainer(parsed, edits, draft.behaviors)

  // Mouse gesture blocks: patch each section body individually (entry names
  // are edited inside the body via the named pattern entries; the block
  // header is byte-preserving). Indent is derived from the header's leading
  // whitespace so nested blocks (e.g. `zip_mouse_gesture_mac` under `/ {}`)
  // keep their original 8-space body indent on save.
  let mgIdx = 0
  for (const section of parsed.sections) {
    if (section.kind === 'mouse-gesture-root' || section.kind === 'mouse-gesture-named') {
      const block = draft.mouseGestures[mgIdx++]
      if (block) {
        const bodyIndent = detectLineIndent(baseSource, section.headerRange[0]) + 4
        edits.push({
          range: section.bodyRange,
          replacement: serializeMouseGestureBlock(block, bodyIndent),
        })
      }
    }
  }

  // Root behaviours (&mt / &lt). Same dynamic indent rule.
  let rbIdx = 0
  for (const section of parsed.sections) {
    if (section.kind === 'root-mt' || section.kind === 'root-lt') {
      const cfg = draft.rootBehaviors[rbIdx++]
      if (cfg) {
        const bodyIndent = detectLineIndent(baseSource, section.headerRange[0]) + 4
        edits.push({
          range: section.bodyRange,
          replacement: serializeRootBehavior(cfg, bodyIndent),
        })
      }
    }
  }

  return applyEdits(baseSource, edits)
}

const INDENT_PROP = '        ' // 8 spaces — body-level indentation for container properties
const INDENT_ENTRY = '        ' // 8 spaces — also entry indentation

function patchKeymapContainer(
  parsed: ReturnType<typeof parseKeymap>,
  edits: Edit[],
  layers: ReturnType<typeof useEditor>['state']['draft']['layers'],
): void {
  const container = parsed.sections.find((s) => s.kind === 'keymap-root')
  if (!container) return
  const lines: string[] = []
  lines.push('')
  lines.push(`${INDENT_PROP}compatible = "zmk,keymap";`)
  for (const layer of layers) {
    lines.push('')
    lines.push(`${INDENT_ENTRY}${layer.name} {${serializeLayer(layer)}};`)
  }
  lines.push('    ')
  edits.push({ range: container.bodyRange, replacement: lines.join('\n') })
}

function patchCombosContainer(
  parsed: ReturnType<typeof parseKeymap>,
  edits: Edit[],
  combos: ReturnType<typeof useEditor>['state']['draft']['combos'],
): void {
  const container = parsed.sections.find((s) => s.kind === 'combos-container')
  if (!container) return
  const lines: string[] = []
  lines.push('')
  lines.push(`${INDENT_PROP}compatible = "zmk,combos";`)
  for (const combo of combos) {
    lines.push('')
    lines.push(`${INDENT_ENTRY}${combo.name} {${serializeCombo(combo)}};`)
  }
  lines.push('    ')
  edits.push({ range: container.bodyRange, replacement: lines.join('\n') })
}

function patchMacrosContainer(
  parsed: ReturnType<typeof parseKeymap>,
  edits: Edit[],
  macros: ReturnType<typeof useEditor>['state']['draft']['macros'],
): void {
  const container = parsed.sections.find((s) => s.kind === 'macros-container')
  if (!container) return
  const lines: string[] = []
  lines.push('')
  for (let i = 0; i < macros.length; i++) {
    const macro = macros[i]
    // ZMK macros use the `label: nodeName { ... };` form so the label can be
    // referenced from bindings (e.g. `&esc_lang2`). nodeName falls back to
    // label so newly created entries (UI input → no nodeName) emit `label: label`.
    const nodeName = macro.nodeName ?? macro.name
    lines.push(`${INDENT_ENTRY}${macro.name}: ${nodeName} {${serializeMacro(macro)}};`)
    if (i < macros.length - 1) lines.push('')
  }
  lines.push('    ')
  edits.push({ range: container.bodyRange, replacement: lines.join('\n') })
}

function patchBehaviorsContainer(
  parsed: ReturnType<typeof parseKeymap>,
  edits: Edit[],
  behaviors: ReturnType<typeof useEditor>['state']['draft']['behaviors'],
): void {
  const container = parsed.sections.find((s) => s.kind === 'behaviors-container')
  if (!container) return
  const lines: string[] = []
  lines.push('')
  for (let i = 0; i < behaviors.length; i++) {
    const behavior = behaviors[i]
    const nodeName = behavior.nodeName ?? behavior.name
    lines.push(`${INDENT_ENTRY}${behavior.name}: ${nodeName} {${serializeBehavior(behavior)}};`)
    if (i < behaviors.length - 1) lines.push('')
  }
  lines.push('    ')
  edits.push({ range: container.bodyRange, replacement: lines.join('\n') })
}
