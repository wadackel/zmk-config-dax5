import { CommittingTextInput, Field, NativeSelect } from '../../components/ui/field'
import {
  formatPropValue,
  getBehaviorSchema,
  getRootBehaviorSchema,
  parsePropValue,
  type PropKind,
  type PropSchema,
} from '../../lib/behavior-prop-schema'
import { useEditor } from '../../lib/editor-state/context'
import type { BehaviorEntry, RootBehaviorConfig } from '../../lib/keymap-dt/types'

export function BehaviorsTab() {
  const { state, dispatch } = useEditor()
  const behaviors = state.draft.behaviors
  const rootBehaviors = state.draft.rootBehaviors

  return (
    <div class="flex flex-col gap-6">
      <section class="flex flex-col gap-3">
        <h2 class="text-base font-semibold m-0">Custom behaviours ({behaviors.length})</h2>
        {behaviors.length === 0 && (
          <div class="text-fg-subtle text-sm">No custom behaviours defined.</div>
        )}
        {behaviors.map((b, idx) => (
          <BehaviorCard
            key={idx}
            behavior={b}
            onChange={(next) =>
              dispatch({ type: 'UPDATE_BEHAVIOR', index: idx, behavior: next })
            }
          />
        ))}
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-base font-semibold m-0">
          Global behaviour configs (&amp;mt / &amp;lt)
        </h2>
        {rootBehaviors.map((rb, idx) => (
          <RootBehaviorCard
            key={idx}
            cfg={rb}
            onChange={(next) =>
              dispatch({ type: 'UPDATE_ROOT_BEHAVIOR', index: idx, cfg: next })
            }
          />
        ))}
      </section>
    </div>
  )
}

function BehaviorCard({
  behavior,
  onChange,
}: {
  behavior: BehaviorEntry
  onChange: (next: BehaviorEntry) => void
}) {
  const schema = getBehaviorSchema(behavior.compatible)
  const known = new Set(schema.map((s) => s.name))
  const unknown = behavior.props.filter((p) => !known.has(p.name))

  const updateNamed = (schemaName: string, rawValue: string | undefined) => {
    let nextProps: BehaviorEntry['props']
    const existing = behavior.props.findIndex((p) => p.name === schemaName)
    if (rawValue === undefined) {
      // Remove
      nextProps = existing >= 0 ? behavior.props.filter((_, i) => i !== existing) : behavior.props
    } else if (existing >= 0) {
      nextProps = behavior.props.map((p, i) =>
        i === existing ? { ...p, value: rawValue } : p,
      )
    } else {
      nextProps = [...behavior.props, { name: schemaName, value: rawValue }]
    }
    onChange({ ...behavior, props: nextProps })
  }

  return (
    <div class="border border-border rounded-md bg-surface-2 p-4 flex flex-col gap-3">
      <div class="flex justify-between items-center gap-2">
        <div class="flex flex-col gap-0.5 min-w-0">
          <CommittingTextInput
            aria-label="Behaviour label"
            class="font-mono"
            value={behavior.name}
            onCommit={(name) => onChange({ ...behavior, name })}
          />
        </div>
        <span class="text-[10px] text-fg-subtle font-mono shrink-0">
          {behavior.compatible}
        </span>
      </div>

      {schema.length > 0 && (
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          {schema.map((s) => {
            const prop = behavior.props.find((p) => p.name === s.name)
            return (
              <TypedPropField
                key={s.name}
                schema={s}
                idPrefix={`behavior-${behavior.name}`}
                rawValue={prop?.value}
                onChangeRaw={(next) => updateNamed(s.name, next)}
              />
            )
          })}
        </div>
      )}

      <RawPropsAdvanced
        props={unknown}
        onChange={(nextUnknown) =>
          onChange({
            ...behavior,
            props: [
              ...behavior.props.filter((p) => known.has(p.name)),
              ...nextUnknown,
            ],
          })
        }
      />
    </div>
  )
}

function RootBehaviorCard({
  cfg,
  onChange,
}: {
  cfg: RootBehaviorConfig
  onChange: (next: RootBehaviorConfig) => void
}) {
  const schema = getRootBehaviorSchema(cfg.kind)
  const known = new Set(schema.map((s) => s.name))
  const unknown = cfg.props.filter((p) => !known.has(p.name))

  const updateNamed = (schemaName: string, rawValue: string | undefined) => {
    let nextProps: RootBehaviorConfig['props']
    const existing = cfg.props.findIndex((p) => p.name === schemaName)
    if (rawValue === undefined) {
      nextProps = existing >= 0 ? cfg.props.filter((_, i) => i !== existing) : cfg.props
    } else if (existing >= 0) {
      nextProps = cfg.props.map((p, i) =>
        i === existing ? { ...p, value: rawValue } : p,
      )
    } else {
      nextProps = [...cfg.props, { name: schemaName, value: rawValue }]
    }
    onChange({ ...cfg, props: nextProps })
  }

  return (
    <div class="border border-border rounded-md bg-surface-2 p-4 flex flex-col gap-3">
      <div class="text-xs font-mono text-fg-muted">&amp;{cfg.kind}</div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        {schema.map((s) => {
          const prop = cfg.props.find((p) => p.name === s.name)
          return (
            <TypedPropField
              key={s.name}
              schema={s}
              idPrefix={`root-${cfg.kind}`}
              rawValue={prop?.value}
              onChangeRaw={(next) => updateNamed(s.name, next)}
            />
          )
        })}
      </div>
      <RawPropsAdvanced
        props={unknown}
        onChange={(nextUnknown) =>
          onChange({
            ...cfg,
            props: [
              ...cfg.props.filter((p) => known.has(p.name)),
              ...nextUnknown,
            ],
          })
        }
      />
    </div>
  )
}

function TypedPropField({
  schema,
  idPrefix,
  rawValue,
  onChangeRaw,
}: {
  schema: PropSchema
  /** Scoping segment so `htmlFor`/`aria-describedby` uniquely target each
   *  card's field even when the same well-known prop (e.g. `tapping-term-ms`)
   *  appears on multiple hold-tap behaviours or root configs. */
  idPrefix: string
  rawValue: string | undefined
  onChangeRaw: (next: string | undefined) => void
}) {
  const kind = schema.kind
  const fieldId = `${idPrefix}-${schema.name}`
  const parsed = rawValue !== undefined ? parsePropValue(kind, rawValue) : undefined
  const parseFailed = rawValue !== undefined && parsed === undefined && kind.type !== 'bool'

  switch (kind.type) {
    case 'int':
    case 'int-ms': {
      const numeric = typeof parsed === 'number' ? parsed : undefined
      return (
        <Field
          htmlFor={fieldId}
          label={
            <span>
              {schema.label ?? schema.name}
              {kind.type === 'int-ms' && (
                <span class="text-fg-subtle text-[10px] ml-1 font-mono">ms</span>
              )}
              <span class="text-fg-subtle text-[10px] ml-1 font-mono">{schema.name}</span>
            </span>
          }
          hint={parseFailed ? undefined : schema.hint}
          error={parseFailed ? `Cannot parse "${rawValue}" as number` : undefined}
        >
          <CommittingTextInput
            id={fieldId}
            type="number"
            inputMode="numeric"
            min={kind.min}
            max={kind.max}
            invalid={parseFailed}
            value={numeric !== undefined ? String(numeric) : ''}
            onCommit={(v) => {
              if (v === '') onChangeRaw(undefined)
              else onChangeRaw(formatPropValue(kind, Number(v)))
            }}
          />
        </Field>
      )
    }
    case 'enum': {
      const value = typeof parsed === 'string' ? parsed : ''
      return (
        <Field
          htmlFor={fieldId}
          label={
            <span>
              {schema.label ?? schema.name}
              <span class="text-fg-subtle text-[10px] ml-1 font-mono">{schema.name}</span>
            </span>
          }
          hint={schema.hint}
        >
          <NativeSelect
            id={fieldId}
            value={value}
            onChange={(e: Event) => {
              const v = (e.target as HTMLSelectElement).value
              if (!v) onChangeRaw(undefined)
              else onChangeRaw(formatPropValue(kind, v))
            }}
          >
            <option value="">(default)</option>
            {kind.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )
    }
    case 'bool': {
      const enabled = rawValue !== undefined
      return (
        <Field
          htmlFor={fieldId}
          label={
            <span>
              {schema.label ?? schema.name}
              <span class="text-fg-subtle text-[10px] ml-1 font-mono">{schema.name}</span>
            </span>
          }
          hint={schema.hint}
        >
          <label class="inline-flex items-center gap-2 text-sm text-fg">
            <input
              id={fieldId}
              type="checkbox"
              class="accent-accent"
              checked={enabled}
              onChange={(e: Event) => {
                const on = (e.target as HTMLInputElement).checked
                onChangeRaw(on ? '' : undefined)
              }}
            />
            <span class="text-fg-muted">Enabled</span>
          </label>
        </Field>
      )
    }
    case 'raw':
      return (
        <Field htmlFor={fieldId} label={schema.label ?? schema.name} hint={schema.hint}>
          <CommittingTextInput
            id={fieldId}
            class="font-mono"
            value={rawValue ?? ''}
            onCommit={(v) => onChangeRaw(v === '' ? undefined : v)}
          />
        </Field>
      )
  }
}

function RawPropsAdvanced({
  props,
  onChange,
}: {
  props: { name: string; value: string }[]
  onChange: (next: { name: string; value: string }[]) => void
}) {
  return (
    <details class="text-sm">
      <summary class="cursor-pointer text-xs text-fg-muted hover:text-fg select-none">
        Advanced DT properties {props.length > 0 && `(${props.length})`}
      </summary>
      <div class="mt-2 flex flex-col gap-1.5">
        {props.map((p, pi) => (
          <div key={pi} class="flex gap-2">
            <CommittingTextInput
              class="flex-1 font-mono"
              aria-label="Property name"
              value={p.name}
              onCommit={(name) =>
                onChange(props.map((q, i) => (i === pi ? { ...q, name } : q)))
              }
            />
            <CommittingTextInput
              class="flex-1 font-mono"
              aria-label="Property value"
              value={p.value}
              onCommit={(value) =>
                onChange(props.map((q, i) => (i === pi ? { ...q, value } : q)))
              }
            />
          </div>
        ))}
      </div>
    </details>
  )
}
