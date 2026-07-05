import { useEffect, useState } from 'hono/jsx'
import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { useToast } from '../../components/ui/toast'
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

type Conflict = {
  currentText: string
  currentMtimeMs: number
}

export function SaveDialog({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useEditor()
  const toast = useToast()
  const [preview, setPreview] = useState<{ diff: string; lint: LintResult } | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState<Conflict | null>(null)

  const candidateText = buildCandidateText(state.baselineSource, state.draft)

  useEffect(() => {
    let cancelled = false
    setPreview(null)
    setPreviewError(null)
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

  const doSave = async (runTeardown: () => void) => {
    setSaving(true)
    try {
      const res = await saveKeymap(candidateText, state.baselineMtimeMs)
      if (res.ok) {
        const parsed = parseKeymap(candidateText)
        // Run Dialog teardown BEFORE the dispatch that unmounts us — otherwise
        // ModalStack / scroll lock leak (hono/jsx does not fire useEffect
        // cleanup on conditional unmount).
        runTeardown()
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
        toast.push({ tone: 'success', message: 'Keymap saved.' })
        onClose()
      } else {
        setConflict({ currentText: res.currentText, currentMtimeMs: res.currentMtimeMs })
      }
    } catch (err) {
      toast.push({
        tone: 'danger',
        message: 'Save failed',
        detail: (err as Error).message,
        durationMs: 8000,
      })
    } finally {
      setSaving(false)
    }
  }

  const doReloadFromConflict = (runTeardown: () => void) => {
    if (!conflict) return
    try {
      const parsed = parseKeymap(conflict.currentText)
      runTeardown()
      dispatch({
        type: 'LOAD',
        source: conflict.currentText,
        mtimeMs: conflict.currentMtimeMs,
        draft: {
          layers: parsed.layers,
          combos: parsed.combos,
          macros: parsed.macros,
          behaviors: parsed.behaviors,
          mouseGestures: parsed.mouseGestures,
          rootBehaviors: parsed.rootBehaviors,
        },
      })
      toast.push({
        tone: 'warning',
        message: 'Reloaded from disk.',
        detail: 'Local edits were discarded to match the latest file.',
      })
      onClose()
    } catch (err) {
      toast.push({
        tone: 'danger',
        message: 'Reload failed',
        detail: (err as Error).message,
        durationMs: 8000,
      })
    }
  }

  const canSave = preview?.lint.ok === true && !saving && !conflict

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title="Save keymap"
      description="Review the diff, then confirm to atomically write the file."
      footer={({ close, runTeardown }) => (
        <>
          <Button variant="subtle" onClick={close}>
            Cancel
          </Button>
          {conflict ? (
            <Button variant="primary" onClick={() => doReloadFromConflict(runTeardown)}>
              Reload from disk
            </Button>
          ) : (
            <Button variant="primary" disabled={!canSave} onClick={() => doSave(runTeardown)}>
              {saving ? 'Saving…' : 'Confirm save'}
            </Button>
          )}
        </>
      )}
    >
      {previewError && (
        <div class="text-sm text-danger border border-danger/40 bg-danger-soft rounded-md px-3 py-2">
          Preview error: {previewError}
        </div>
      )}

      {preview && (
        <>
          <section class="flex flex-col gap-1.5">
            <div class="text-xs uppercase tracking-wide text-fg-subtle">Lint</div>
            {preview.lint.errors.length === 0 ? (
              <div class="text-sm text-success">No errors.</div>
            ) : (
              <ul class="text-sm text-danger list-disc pl-5">
                {preview.lint.errors.map((e, i) => (
                  <li key={i}>{e.message}</li>
                ))}
              </ul>
            )}
            {preview.lint.warnings.length > 0 && (
              <ul class="text-xs text-warning list-disc pl-5">
                {preview.lint.warnings.map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
              </ul>
            )}
          </section>

          <section class="flex flex-col gap-1.5">
            <div class="text-xs uppercase tracking-wide text-fg-subtle">Diff preview</div>
            <pre class="bg-surface-0 border border-border-subtle rounded-md p-3 text-xs font-mono overflow-auto max-h-[46vh] whitespace-pre m-0">
              {preview.diff || '(no textual changes)'}
            </pre>
          </section>
        </>
      )}

      {conflict && (
        <div
          class="border border-warning/40 bg-warning-soft rounded-md px-3 py-2 text-sm"
          role="alert"
        >
          <div class="font-medium">Remote file changed</div>
          <p class="text-xs text-fg-muted mt-0.5">
            The keymap on disk was modified since you started editing. Click{' '}
            <span class="text-warning font-medium">Reload from disk</span> to discard local edits and
            fetch the latest, or Cancel to keep editing (you can copy your work aside first).
          </p>
        </div>
      )}
    </Dialog>
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
