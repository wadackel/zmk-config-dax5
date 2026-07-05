// Section-level serializer. Given structured section data, produces a clean
// DT text fragment ready to be spliced back into the source by `patch.ts`.
//
// Layout policy (dax5 44-key matrix, 4 rows × up to 14 visual columns):
// - Each row emits into the shared 14-col visual grid; empty cells become
//   pure whitespace padding sized by that column's max content width.
//   - Row 0 (12 keys): L c0..c5 + R c8..c13 (c6 and c7 are empty)
//   - Row 1 (12 keys): L c0..c5 + R c8..c13 (c6 and c7 are empty)
//   - Row 2 (14 keys): L c0..c6 + R c7..c13 (SW22/SW1 sit on R2 as outer cols)
//   - Row 3 (6 keys):  L c3..c6 + R c7..c8  (c0..c2 and c9..c13 empty)
// - Cell separator: 3 spaces within a side, LR_GAP between L (c0..c6) and R (c7..c13).
// - Column width: max content width across all rows that populate that column.
//
// This is not strictly byte-identical with hand-crafted fixtures — the first
// save normalizes whitespace, and subsequent edits round-trip cleanly.

import { DAX5_KEY_COUNT } from '../matrix-mapping'
import type {
  BehaviorEntry,
  BindingChain,
  ComboEntry,
  LayerData,
  MacroEntry,
  MouseGestureBlock,
  RootBehaviorConfig,
} from './types'

const INTER_CELL_SEP = '   ' // 3 spaces
const LR_GAP = '                   ' // 19 spaces
const INDENT_BODY = '            ' // 12 spaces (matches fixture layer body indent)
const INDENT_PROP = '            '
const ENTRY_INDENT = '        ' // 8 spaces for combo/macro/behavior entries

export function chainToString(chain: BindingChain): string {
  return chain.tokens.join(' ')
}

// ============== Layer ==============

export function serializeLayer(layer: LayerData): string {
  const lines: string[] = []
  lines.push('')
  lines.push(`${INDENT_BODY}bindings = <`)
  lines.push(serializeBindingsGrid(layer.bindings))
  lines.push(`${INDENT_BODY}>;`)
  if (layer.sensorBindings) {
    lines.push('')
    const enc0 = chainToString(layer.sensorBindings.perEncoder[0] ?? { tokens: [] })
    const enc1 = chainToString(layer.sensorBindings.perEncoder[1] ?? { tokens: [] })
    lines.push(`${INDENT_BODY}sensor-bindings = <${enc0}>, <${enc1}>;`)
  }
  lines.push('        ')
  return lines.join('\n')
}

// Per-row matrix column occupancy — parallels dax5.dtsi's default_transform.
// (row, col) tuples in physical index order. See dax5.dtsi and matrix-mapping.ts.
const L_COL_COUNT = 7 // logical L cols c0..c6
const R_COL_COUNT = 7 // logical R cols c7..c13, stored as offset 0..6 in rColWidths

const ROW_L_COLS: number[][] = [
  [0, 1, 2, 3, 4, 5], // R0
  [0, 1, 2, 3, 4, 5], // R1
  [0, 1, 2, 3, 4, 5, 6], // R2
  [3, 4, 5, 6], // R3
]
const ROW_R_COLS_ABS: number[][] = [
  [8, 9, 10, 11, 12, 13], // R0
  [8, 9, 10, 11, 12, 13], // R1
  [7, 8, 9, 10, 11, 12, 13], // R2
  [7, 8], // R3
]

/**
 * Renders the bindings array as a 4-row text grid with column-aligned cells.
 * Exported for tests.
 */
export function serializeBindingsGrid(bindings: BindingChain[]): string {
  if (bindings.length !== DAX5_KEY_COUNT) {
    throw new Error(
      `serializeBindingsGrid: expected ${DAX5_KEY_COUNT} bindings, got ${bindings.length}`,
    )
  }

  // Slice bindings into 4 rows by row-length.
  const rows: { left: BindingChain[]; right: BindingChain[] }[] = []
  let cursor = 0
  for (let r = 0; r < 4; r++) {
    const lLen = ROW_L_COLS[r].length
    const rLen = ROW_R_COLS_ABS[r].length
    const left = bindings.slice(cursor, cursor + lLen)
    cursor += lLen
    const right = bindings.slice(cursor, cursor + rLen)
    cursor += rLen
    rows.push({ left, right })
  }

  // Compute per-col max content width for L (c0..c6) and R (c7..c13, offset 0..6).
  const lColWidths: number[] = new Array(L_COL_COUNT).fill(0)
  const rColWidths: number[] = new Array(R_COL_COUNT).fill(0)
  for (let r = 0; r < 4; r++) {
    ROW_L_COLS[r].forEach((c, i) => {
      const w = chainToString(rows[r].left[i]).length
      if (w > lColWidths[c]) lColWidths[c] = w
    })
    ROW_R_COLS_ABS[r].forEach((absC, i) => {
      const c = absC - 7
      const w = chainToString(rows[r].right[i]).length
      if (w > rColWidths[c]) rColWidths[c] = w
    })
  }

  const out: string[] = []
  for (let r = 0; r < 4; r++) {
    // L side: emit each logical col c0..c6; either the binding at that col or padding.
    const lPresent = new Map<number, BindingChain>()
    ROW_L_COLS[r].forEach((c, i) => lPresent.set(c, rows[r].left[i]))
    const lParts: string[] = []
    for (let c = 0; c < L_COL_COUNT; c++) {
      const cell = lPresent.get(c)
      lParts.push(cell ? padCell(chainToString(cell), lColWidths[c]) : ' '.repeat(lColWidths[c]))
    }

    // R side: emit each logical col c7..c13.
    const rPresent = new Map<number, BindingChain>()
    ROW_R_COLS_ABS[r].forEach((absC, i) => rPresent.set(absC - 7, rows[r].right[i]))
    const rParts: string[] = []
    for (let c = 0; c < R_COL_COUNT; c++) {
      const cell = rPresent.get(c)
      rParts.push(cell ? padCell(chainToString(cell), rColWidths[c]) : ' '.repeat(rColWidths[c]))
    }

    const line = lParts.join(INTER_CELL_SEP) + LR_GAP + rParts.join(INTER_CELL_SEP)
    out.push(line.replace(/\s+$/, ''))
  }
  return out.join('\n')
}

function padCell(s: string, width: number): string {
  return s + ' '.repeat(Math.max(0, width - s.length))
}

// ============== Combo ==============

export function serializeCombo(combo: ComboEntry): string {
  // Body content (between `name {` and `}`).
  const lines: string[] = []
  lines.push('')
  lines.push(`${INDENT_PROP}bindings = <${chainToString(combo.bindings)}>;`)
  lines.push(`${INDENT_PROP}key-positions = <${combo.keyPositions.join(' ')}>;`)
  lines.push(`${INDENT_PROP}layers = <${combo.layers.join(' ')}>;`)
  lines.push(ENTRY_INDENT)
  return lines.join('\n')
}

// ============== Macro ==============

export function serializeMacro(macro: MacroEntry): string {
  const lines: string[] = []
  lines.push('')
  for (const p of macro.props) {
    lines.push(`${INDENT_PROP}${p.name}${p.value ? ' = ' + p.value : ''};`)
  }
  if (macro.bindingsList.length > 0) {
    const groups = macro.bindingsList.map((c) => `<${chainToString(c)}>`)
    lines.push(`${INDENT_PROP}bindings = ${groups.join(', ')};`)
  }
  lines.push(ENTRY_INDENT)
  return lines.join('\n')
}

// ============== Behavior ==============

export function serializeBehavior(behavior: BehaviorEntry): string {
  const lines: string[] = []
  lines.push('')
  if (behavior.compatible) {
    lines.push(`${INDENT_PROP}compatible = "${behavior.compatible}";`)
  }
  if (behavior.bindings && behavior.bindings.length > 0) {
    const groups = behavior.bindings.map((c) => `<${chainToString(c)}>`)
    lines.push(`${INDENT_PROP}bindings = ${groups.join(', ')};`)
  }
  for (const p of behavior.props) {
    lines.push(`${INDENT_PROP}${p.name}${p.value ? ' = ' + p.value : ''};`)
  }
  lines.push(ENTRY_INDENT)
  return lines.join('\n')
}

// ============== Mouse gesture block ==============

/**
 * @param bodyIndent number of leading spaces for body-level lines (e.g. 4 for a
 *   root `&zip_mouse_gesture { … }`, 8 for `zip_mouse_gesture_mac` nested under
 *   `/ { … }`). The closing brace of the block sits at `bodyIndent - 4` and is
 *   emitted by the wrapping container, not by this function.
 */
export function serializeMouseGestureBlock(
  block: MouseGestureBlock,
  bodyIndent = 4,
): string {
  const body = ' '.repeat(bodyIndent)
  const inner = ' '.repeat(bodyIndent + 4)
  // The block's `bodyRange` ends at the byte position of the closing `}` of
  // the block, but the LINE containing that `}` is indented `bodyIndent - 4`.
  // We must end our replacement with `\n${closerLead}` so the existing `}` on
  // disk lands at the correct column.
  const closerLead = ' '.repeat(Math.max(0, bodyIndent - 4))
  const parts: string[] = ['']
  for (const p of block.props) {
    parts.push(`${body}${p.name}${p.value ? ' = ' + p.value : ''};`)
  }
  for (const entry of block.entries) {
    parts.push('')
    parts.push(`${body}${entry.name} {`)
    parts.push(`${inner}pattern = <GESTURE_${entry.pattern}>;`)
    parts.push(`${inner}bindings = <${chainToString(entry.bindings)}>;`)
    parts.push(`${body}};`)
  }
  parts.push(closerLead)
  return parts.join('\n')
}

// ============== Root behavior config ==============

export function serializeRootBehavior(cfg: RootBehaviorConfig, bodyIndent = 4): string {
  const body = ' '.repeat(bodyIndent)
  const closerLead = ' '.repeat(Math.max(0, bodyIndent - 4))
  const parts: string[] = ['']
  for (const p of cfg.props) {
    parts.push(`${body}${p.name}${p.value ? ' = ' + p.value : ''};`)
  }
  parts.push(closerLead)
  return parts.join('\n')
}

/**
 * Returns the leading-space count of the line containing `pos` in `source`.
 * Used by the editor to keep nested DT blocks (e.g. `zip_mouse_gesture_mac`
 * inside `/ { … }`) emitting at their original indent depth.
 */
export function detectLineIndent(source: string, pos: number): number {
  let i = pos
  while (i > 0 && source[i - 1] !== '\n') i--
  let indent = 0
  while (i < source.length && source[i] === ' ') {
    indent++
    i++
  }
  return indent
}
