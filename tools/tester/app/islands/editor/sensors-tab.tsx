import { useEffect, useRef, useState } from 'hono/jsx'
import { useEditor } from '../../lib/editor-state/context'
import type { BindingChain, LayerData } from '../../lib/keymap-dt/types'
import {
  checkScrlVal,
  checkTapMs,
  checkTriggersPerRotation,
  describeEncoderRotation,
  extractScrlVal,
  getEncScrollTapMs,
  SHIELD_STEPS,
  SHIELD_TRIGGERS_PER_ROTATION,
  type HintResult,
} from '../../lib/sensor-hints'
import { BindingPicker } from './binding-picker'

const ENCODER_LABELS = ['Encoder 0 (left)', 'Encoder 1 (right)']

export function SensorsTab() {
  const { state, dispatch } = useEditor()
  const layers = state.draft.layers
  const behaviors = state.draft.behaviors
  const scrlVal = extractScrlVal(state.baselineSource)
  const tapMs = getEncScrollTapMs(behaviors)

  const [editing, setEditing] = useState<{ layerIdx: number; encoderIdx: number } | null>(null)
  const [applyAllSource, setApplyAllSource] = useState<number | null>(null)

  const editingChain =
    editing !== null
      ? layers[editing.layerIdx]?.sensorBindings?.perEncoder[editing.encoderIdx]
      : null

  const changeTapMs = (nextMs: number) => {
    const idx = behaviors.findIndex((b) => b.name === 'enc_scroll')
    if (idx < 0) return
    const target = behaviors[idx]
    const nextProps = target.props.map((p) =>
      p.name === 'tap-ms' ? { ...p, value: `<${nextMs}>` } : p,
    )
    dispatch({ type: 'UPDATE_BEHAVIOR', index: idx, behavior: { ...target, props: nextProps } })
  }

  return (
    <div class="flex flex-col gap-6">
      <TuningSummaryCard
        scrlVal={scrlVal}
        tapMs={tapMs}
        encScrollDefined={behaviors.some((b) => b.name === 'enc_scroll')}
        onTapMsChange={changeTapMs}
      />

      <EncoderGrid
        layers={layers}
        onEditBinding={(layerIdx, encoderIdx) => setEditing({ layerIdx, encoderIdx })}
        onSwap={(layerIdx, encoderIdx) =>
          dispatch({ type: 'SWAP_SENSOR_BINDING_ARGS', layerIdx, encoderIdx })
        }
        onInsert={(layerIdx) => dispatch({ type: 'INSERT_SENSOR_BINDING', layerIdx })}
        onRemove={(layerIdx) => dispatch({ type: 'REMOVE_SENSOR_BINDING', layerIdx })}
        onCopyFrom={(fromLayerIdx, toLayerIdx) =>
          dispatch({ type: 'COPY_SENSOR_BINDINGS', fromLayerIdx, toLayerIdx })
        }
        onApplyToAll={(fromLayerIdx) => setApplyAllSource(fromLayerIdx)}
      />

      <RotationPreview layers={layers} />

      {editing !== null && editingChain && (
        <BindingPicker
          initial={editingChain}
          onCancel={() => setEditing(null)}
          onCommit={(chain) => {
            dispatch({
              type: 'UPDATE_SENSOR_BINDING',
              layerIdx: editing.layerIdx,
              encoderIdx: editing.encoderIdx,
              chain,
            })
            setEditing(null)
          }}
        />
      )}

      {applyAllSource !== null && layers[applyAllSource] && (
        <ConfirmDialog
          title="Apply to all layers?"
          message={`Copy "${layers[applyAllSource].name}" sensor-bindings to every layer. This overwrites all existing per-layer sensor-bindings.`}
          onConfirm={() => {
            dispatch({ type: 'APPLY_SENSOR_BINDINGS_TO_ALL', fromLayerIdx: applyAllSource })
            setApplyAllSource(null)
          }}
          onCancel={() => setApplyAllSource(null)}
        />
      )}
    </div>
  )
}

type TuningSummaryCardProps = {
  scrlVal: number | null
  tapMs: number | null
  encScrollDefined: boolean
  onTapMsChange: (next: number) => void
}

function TuningSummaryCard({
  scrlVal,
  tapMs,
  encScrollDefined,
  onTapMsChange,
}: TuningSummaryCardProps) {
  const tapMsHint = checkTapMs(tapMs)
  const scrlValHint = checkScrlVal(scrlVal)
  const tprHint = checkTriggersPerRotation(SHIELD_TRIGGERS_PER_ROTATION, SHIELD_STEPS)
  const eventsPerRotation = SHIELD_TRIGGERS_PER_ROTATION * (scrlVal ?? 0)

  return (
    <section class="border border-zinc-800 rounded p-4 flex flex-col gap-4">
      <div class="flex items-baseline justify-between">
        <h2 class="text-base font-mono">Tuning summary</h2>
        <span class="text-[10px] text-zinc-500 font-mono">
          Values shown here match constraints from CLAUDE.md.
        </span>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
        <TuningField
          label="enc_scroll.tap-ms"
          labelFor="sensors-tap-ms"
          hint={tapMsHint}
          hintId="sensors-tap-ms-hint"
          hintLive="interactive"
          footer="msc event period is 16 ms"
        >
          {encScrollDefined ? (
            <input
              id="sensors-tap-ms"
              type="number"
              min={0}
              value={tapMs ?? ''}
              class="bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1 text-white w-24"
              onInput={(e: Event) => {
                const v = Number((e.target as HTMLInputElement).value)
                if (Number.isFinite(v) && v >= 0) onTapMsChange(v)
              }}
              aria-describedby={tapMsHint.level === 'ok' ? undefined : 'sensors-tap-ms-hint'}
              aria-invalid={tapMsHint.level === 'error'}
            />
          ) : (
            <span class="text-zinc-500 italic">enc_scroll behavior not defined</span>
          )}
        </TuningField>

        <TuningField
          label="ZMK_POINTING_DEFAULT_SCRL_VAL"
          hint={scrlValHint}
          hintId="sensors-scrl-val-hint"
          footer="read-only; edit the #define at the top of the keymap"
        >
          <span class="text-white text-sm">{scrlVal ?? '—'}</span>
        </TuningField>

        <TuningField
          label="triggers-per-rotation"
          hint={tprHint}
          hintId="sensors-tpr-hint"
          footer={`defined in boards/shields/dax5/dax5.dtsi (steps=${SHIELD_STEPS})`}
        >
          <span class="text-white text-sm">{SHIELD_TRIGGERS_PER_ROTATION}</span>
        </TuningField>
      </div>

      {scrlVal !== null && (
        <div class="text-[11px] text-zinc-400 font-mono border-t border-zinc-800 pt-3">
          1 full rotation ≈ {SHIELD_TRIGGERS_PER_ROTATION} events × {scrlVal} value ={' '}
          <span class="text-zinc-200">{eventsPerRotation}</span> total scroll units
        </div>
      )}
    </section>
  )
}

type TuningFieldProps = {
  label: string
  labelFor?: string
  hint: HintResult
  hintId: string
  /**
   * "interactive" = user can edit this field, so an `error` hint should
   * announce assertively (`role="alert"`). "readonly" = the value cannot be
   * edited here, so an alert every render becomes SR noise; keep hints as
   * passive `role="status"` regardless of level.
   */
  hintLive?: 'interactive' | 'readonly'
  footer: string
  children: any
}

function TuningField({
  label,
  labelFor,
  hint,
  hintId,
  hintLive = 'readonly',
  footer,
  children,
}: TuningFieldProps) {
  const LabelTag: any = labelFor ? 'label' : 'span'
  return (
    <div class="flex flex-col gap-1">
      <LabelTag class="text-zinc-400" {...(labelFor ? { htmlFor: labelFor } : {})}>
        {label}
      </LabelTag>
      <div>{children}</div>
      <HintBadge hint={hint} id={hintId} live={hintLive} />
      <span class="text-[10px] text-zinc-600">{footer}</span>
    </div>
  )
}

const HINT_STYLE: Record<'error' | 'warn', { color: string; word: string }> = {
  error: {
    color: 'bg-red-900/40 text-red-300 border-red-800',
    word: '⚠︎ error',
  },
  warn: {
    color: 'bg-yellow-900/40 text-yellow-200 border-yellow-800',
    word: '△ warn',
  },
}

function HintBadge({
  hint,
  id,
  live = 'readonly',
}: {
  hint: HintResult
  id?: string
  live?: 'interactive' | 'readonly'
}) {
  if (hint.level === 'ok') return null
  const { color, word } = HINT_STYLE[hint.level]
  const role = live === 'interactive' && hint.level === 'error' ? 'alert' : 'status'
  return (
    <span
      id={id}
      role={role}
      class={`inline-block text-[10px] px-2 py-0.5 border rounded ${color}`}
    >
      <span aria-hidden="true">{word}</span>
      <span class="sr-only">{hint.level === 'error' ? 'error' : 'warning'}</span>
      {' — '}
      {hint.message}
    </span>
  )
}

type EncoderGridProps = {
  layers: LayerData[]
  onEditBinding: (layerIdx: number, encoderIdx: number) => void
  onSwap: (layerIdx: number, encoderIdx: number) => void
  onInsert: (layerIdx: number) => void
  onRemove: (layerIdx: number) => void
  onCopyFrom: (fromLayerIdx: number, toLayerIdx: number) => void
  onApplyToAll: (fromLayerIdx: number) => void
}

function EncoderGrid({
  layers,
  onEditBinding,
  onSwap,
  onInsert,
  onRemove,
  onCopyFrom,
  onApplyToAll,
}: EncoderGridProps) {
  const layersWithBindings = layers
    .map((l, i) => ({ layer: l, idx: i }))
    .filter(({ layer }) => layer.sensorBindings !== null)

  return (
    <section class="border border-zinc-800 rounded p-4 flex flex-col gap-3">
      <div class="flex items-baseline justify-between">
        <h2 class="text-base font-mono">Sensor bindings per layer</h2>
        <span class="text-[10px] text-zinc-500 font-mono">
          arg0 = ↺ CCW, arg1 = ↻ CW
        </span>
      </div>

      <div class="flex flex-col gap-2">
        {layers.map((layer, layerIdx) => (
          <LayerRow
            key={layer.name}
            layer={layer}
            layerIdx={layerIdx}
            copyCandidates={layersWithBindings.filter(({ idx }) => idx !== layerIdx)}
            onEditBinding={onEditBinding}
            onSwap={onSwap}
            onInsert={onInsert}
            onRemove={onRemove}
            onCopyFrom={onCopyFrom}
            onApplyToAll={onApplyToAll}
          />
        ))}
      </div>
    </section>
  )
}

type LayerRowProps = {
  layer: LayerData
  layerIdx: number
  copyCandidates: { layer: LayerData; idx: number }[]
  onEditBinding: (layerIdx: number, encoderIdx: number) => void
  onSwap: (layerIdx: number, encoderIdx: number) => void
  onInsert: (layerIdx: number) => void
  onRemove: (layerIdx: number) => void
  onCopyFrom: (fromLayerIdx: number, toLayerIdx: number) => void
  onApplyToAll: (fromLayerIdx: number) => void
}

function LayerRow({
  layer,
  layerIdx,
  copyCandidates,
  onEditBinding,
  onSwap,
  onInsert,
  onRemove,
  onCopyFrom,
  onApplyToAll,
}: LayerRowProps) {
  const bindings = layer.sensorBindings?.perEncoder

  if (!bindings) {
    return (
      <div class="grid grid-cols-[10rem_1fr_auto] gap-3 items-center border border-zinc-800/40 rounded px-3 py-2">
        <div class="text-zinc-200 font-mono text-sm">{layer.name}</div>
        <div class="text-zinc-500 italic text-xs font-mono">no sensor-bindings declared</div>
        <button
          type="button"
          class="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white text-xs font-mono"
          onClick={() => onInsert(layerIdx)}
        >
          + Add
        </button>
      </div>
    )
  }

  return (
    <div class="grid grid-cols-[10rem_1fr_1fr_auto] gap-3 items-start border border-zinc-800/40 rounded px-3 py-2">
      <div class="text-zinc-200 font-mono text-sm pt-2">{layer.name}</div>
      {[0, 1].map((encoderIdx) => (
        <EncoderCell
          key={encoderIdx}
          chain={bindings[encoderIdx]}
          label={ENCODER_LABELS[encoderIdx]!}
          onEdit={() => onEditBinding(layerIdx, encoderIdx)}
          onSwap={() => onSwap(layerIdx, encoderIdx)}
        />
      ))}
      <div class="flex flex-col gap-1 pt-1">
        <CopyFromMenu
          layerIdx={layerIdx}
          layerName={layer.name}
          candidates={copyCandidates}
          onSelect={(fromLayerIdx) => onCopyFrom(fromLayerIdx, layerIdx)}
        />
        <button
          type="button"
          class="px-2 py-1 min-h-6 text-xs text-zinc-300 border border-zinc-700 rounded hover:border-blue-500 hover:text-white font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          onClick={() => onApplyToAll(layerIdx)}
          title="Copy this layer's sensor-bindings to every layer"
          aria-haspopup="dialog"
        >
          Apply to all
        </button>
        <button
          type="button"
          class="px-2 py-1 min-h-6 text-xs text-red-400 border border-zinc-700 rounded hover:border-red-500 hover:text-red-300 font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          onClick={() => onRemove(layerIdx)}
          title="Remove sensor-bindings from this layer"
          aria-label="Remove sensor-bindings"
        >
          <span aria-hidden="true">✕</span> Remove
        </button>
      </div>
    </div>
  )
}

type EncoderCellProps = {
  chain: BindingChain | undefined
  label: string
  onEdit: () => void
  onSwap: () => void
}

function EncoderCell({ chain, label, onEdit, onSwap }: EncoderCellProps) {
  const desc = chain ? describeEncoderRotation(chain) : null
  const canSwap = !!chain && chain.tokens.length >= 3
  const tokensDisplay = chain?.tokens.join(' ') || '<none>'
  const rotationTooltip = desc
    ? `CCW → ${desc.ccw} · CW → ${desc.cw}`
    : 'Click to edit'

  return (
    <div class="flex flex-col gap-1">
      <div class="text-[10px] text-zinc-500 font-mono">{label}</div>
      <div class="flex items-stretch gap-1">
        <button
          type="button"
          class="flex-1 text-left bg-[#1a1a1a] border border-zinc-700 rounded px-2 py-1 min-h-6 text-sm font-mono text-zinc-200 hover:border-blue-500 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          onClick={onEdit}
          title={rotationTooltip}
          aria-label={`Edit ${label} binding`}
          aria-haspopup="dialog"
        >
          {tokensDisplay}
        </button>
        <button
          type="button"
          class="px-2 min-w-6 min-h-6 text-zinc-300 border border-zinc-700 rounded hover:border-blue-500 hover:text-white text-sm font-mono disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
          onClick={onSwap}
          disabled={!canSwap}
          title="Swap CCW / CW arguments"
          aria-label="Swap CCW and CW arguments"
        >
          <span aria-hidden="true">⇄</span>
        </button>
      </div>
      <div class="text-[10px] text-zinc-500 font-mono flex justify-between">
        <span>↺ CCW</span>
        <span>↻ CW</span>
      </div>
    </div>
  )
}

type CopyFromMenuProps = {
  layerIdx: number
  layerName: string
  candidates: { layer: LayerData; idx: number }[]
  onSelect: (fromLayerIdx: number) => void
}

function CopyFromMenu({ layerIdx, layerName, candidates, onSelect }: CopyFromMenuProps) {
  const disabled = candidates.length === 0
  // `nonce` is bumped every action so live-region content changes even when
  // the user copies from the same source twice in a row; identical strings
  // in an aria-live region are not re-announced by most SRs.
  const [status, setStatus] = useState<{ message: string; nonce: number }>({ message: '', nonce: 0 })
  return (
    <>
      <select
        class="px-2 py-1 min-h-6 text-xs bg-[#1a1a1a] border border-zinc-700 rounded text-zinc-300 font-mono disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        disabled={disabled}
        value=""
        // Reset target.value after handling so the same source layer can be
        // picked again — the placeholder must resurface as the visible option
        // instead of the last-picked layer name.
        onChange={(e: Event) => {
          const target = e.target as HTMLSelectElement
          const from = Number(target.value)
          target.value = ''
          if (Number.isInteger(from) && from !== layerIdx) {
            const sourceName = candidates.find((c) => c.idx === from)?.layer.name ?? ''
            onSelect(from)
            setStatus((prev) => ({
              message: `Copied sensor-bindings from ${sourceName} to ${layerName}`,
              nonce: prev.nonce + 1,
            }))
          }
        }}
        title="Copy sensor-bindings from another layer"
        aria-label="Copy sensor-bindings from another layer"
      >
        <option value="" disabled hidden>
          Copy from…
        </option>
        {candidates.map(({ layer, idx }) => (
          <option key={idx} value={idx}>
            {layer.name}
          </option>
        ))}
      </select>
      <span key={status.nonce} role="status" aria-live="polite" class="sr-only">
        {status.message}
      </span>
    </>
  )
}

function RotationPreview({ layers }: { layers: LayerData[] }) {
  return (
    <section class="border border-zinc-800 rounded p-4 flex flex-col gap-3">
      <h2 class="text-base font-mono">Rotation preview</h2>
      <div class="flex flex-col gap-3">
        {layers.map((layer) => (
          <LayerRotationPreview key={layer.name} layer={layer} />
        ))}
      </div>
    </section>
  )
}

function LayerRotationPreview({ layer }: { layer: LayerData }) {
  const bindings = layer.sensorBindings?.perEncoder
  return (
    <div class="border border-zinc-800/60 rounded px-3 py-2 flex flex-col gap-2">
      <div class="text-xs text-zinc-300 font-mono">{layer.name}</div>
      {!bindings ? (
        <div class="text-[11px] text-zinc-500 italic font-mono">No sensor-bindings on this layer.</div>
      ) : (
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[0, 1].map((encoderIdx) => (
            <EncoderRotationCard
              key={encoderIdx}
              chain={bindings[encoderIdx]}
              label={ENCODER_LABELS[encoderIdx]!}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EncoderRotationCard({
  chain,
  label,
}: {
  chain: BindingChain | undefined
  label: string
}) {
  if (!chain) {
    return (
      <div class="border border-zinc-800/60 rounded px-3 py-2 text-[11px] text-zinc-500 font-mono italic">
        {label}: undefined
      </div>
    )
  }
  const desc = describeEncoderRotation(chain)
  return (
    <div class="border border-zinc-800/60 rounded px-3 py-2 text-[11px] font-mono flex flex-col gap-1">
      <div class="text-zinc-400">{label}</div>
      {desc ? (
        <>
          <div class="text-zinc-200">↺ CCW → {desc.ccw}</div>
          <div class="text-zinc-200">↻ CW → {desc.cw}</div>
          <div class="text-zinc-500">via {desc.behaviorLabel}</div>
        </>
      ) : (
        <>
          <div class="text-zinc-200">{chain.tokens.join(' ')}</div>
          <div class="text-zinc-500">
            via {chain.tokens[0] ?? '<none>'} (unrecognised shape)
          </div>
        </>
      )}
    </div>
  )
}

type ConfirmDialogProps = {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
}

function ConfirmDialog({ title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null)
  const titleId = 'sensors-confirm-title'
  const messageId = 'sensors-confirm-msg'

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelBtnRef.current?.focus()
    return () => {
      previousFocus?.focus()
    }
  }, [])

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
      return
    }
    // Focus trap: cycle Tab/Shift+Tab between the enabled focusables in the
    // dialog. `:not([disabled])` guards against future disabled buttons being
    // picked up as trap boundaries — a disabled boundary would silently break
    // Tab wrapping.
    if (e.key === 'Tab') {
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])')
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const active = document.activeElement
      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  return (
    <div
      class="fixed inset-0 z-50 bg-black/80 flex items-start justify-center p-4 pt-[15vh]"
      onClick={onCancel}
    >
      <div
        ref={dialogRef}
        class="bg-[#121212] border border-zinc-700 rounded-lg w-[min(90vw,480px)] p-6 text-sm font-mono flex flex-col gap-4"
        onClick={(e: Event) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <h3 id={titleId} class="text-zinc-100 text-base m-0">
          {title}
        </h3>
        <div id={messageId} class="text-zinc-300">
          {message}
        </div>
        <div class="flex justify-end gap-2">
          <button
            ref={cancelBtnRef}
            type="button"
            class="px-3 py-1 min-h-6 bg-zinc-700 text-white rounded hover:bg-zinc-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            class="px-3 py-1 min-h-6 bg-blue-600 text-white rounded hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
            onClick={onConfirm}
          >
            Apply
          </button>
        </div>
        <div class="text-[10px] text-zinc-500 text-right">esc to cancel</div>
      </div>
    </div>
  )
}

