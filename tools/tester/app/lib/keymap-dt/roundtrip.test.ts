// Whole-keymap roundtrip: parse the fixture, re-emit every known section, and
// verify that re-parsing the result yields equivalent structured data.
//
// Byte-identical roundtrip is intentionally NOT required (see serialize.ts
// header for why); this test guards against structural drift.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseKeymap } from './parse'
import { applyEdits, type Edit } from './patch'
import {
  serializeBehavior,
  serializeCombo,
  serializeLayer,
  serializeMacro,
  serializeMouseGestureBlock,
  serializeRootBehavior,
} from './serialize'

const fixturePath = path.resolve(__dirname, '__fixtures__/dax5.keymap')
const fixture = readFileSync(fixturePath, 'utf8')

function reemitAll(source: string): string {
  const parsed = parseKeymap(source)
  const edits: Edit[] = []
  let layerIdx = 0
  let comboIdx = 0
  let macroIdx = 0
  let behaviorIdx = 0
  let mouseGestureIdx = 0
  let rootBehaviorIdx = 0
  for (const s of parsed.sections) {
    switch (s.kind) {
      case 'layer':
        edits.push({ range: s.bodyRange, replacement: serializeLayer(parsed.layers[layerIdx++]) })
        break
      case 'combo-entry':
        edits.push({ range: s.bodyRange, replacement: serializeCombo(parsed.combos[comboIdx++]) })
        break
      case 'macro-entry':
        edits.push({ range: s.bodyRange, replacement: serializeMacro(parsed.macros[macroIdx++]) })
        break
      case 'behavior-entry':
        edits.push({
          range: s.bodyRange,
          replacement: serializeBehavior(parsed.behaviors[behaviorIdx++]),
        })
        break
      case 'mouse-gesture-root':
      case 'mouse-gesture-named':
        edits.push({
          range: s.bodyRange,
          replacement: serializeMouseGestureBlock(parsed.mouseGestures[mouseGestureIdx++]),
        })
        break
      case 'root-mt':
      case 'root-lt':
        edits.push({
          range: s.bodyRange,
          replacement: serializeRootBehavior(parsed.rootBehaviors[rootBehaviorIdx++]),
        })
        break
      default:
        break
    }
  }
  return applyEdits(source, edits)
}

describe('roundtrip', () => {
  it('re-emitting every section yields a re-parseable text', () => {
    const reemitted = reemitAll(fixture)
    // Should still parse without errors.
    const reparsed = parseKeymap(reemitted)
    expect(reparsed.layers.length).toBe(8)
    expect(reparsed.combos.length).toBe(2)
    expect(reparsed.macros.length).toBe(1)
    expect(reparsed.behaviors.length).toBe(2)
    expect(reparsed.mouseGestures.length).toBe(2)
    expect(reparsed.rootBehaviors.length).toBe(2)
  })

  it('structured data survives a full re-emit pass (layers + combos + macros + behaviors)', () => {
    const original = parseKeymap(fixture)
    const reemitted = reemitAll(fixture)
    const reparsed = parseKeymap(reemitted)

    expect(reparsed.layers.map((l) => l.name)).toEqual(original.layers.map((l) => l.name))
    for (let i = 0; i < original.layers.length; i++) {
      expect(reparsed.layers[i].bindings).toEqual(original.layers[i].bindings)
      expect(reparsed.layers[i].sensorBindings).toEqual(original.layers[i].sensorBindings)
    }
    expect(reparsed.combos).toEqual(original.combos)
    expect(reparsed.macros.map((m) => m.bindingsList)).toEqual(
      original.macros.map((m) => m.bindingsList),
    )
    for (let i = 0; i < original.behaviors.length; i++) {
      expect(reparsed.behaviors[i].name).toBe(original.behaviors[i].name)
      expect(reparsed.behaviors[i].compatible).toBe(original.behaviors[i].compatible)
      expect(reparsed.behaviors[i].bindings).toEqual(original.behaviors[i].bindings)
    }
  })

  it('content outside any section (comments, #define) is preserved byte-for-byte', () => {
    const reemitted = reemitAll(fixture)
    // Preprocessor directives should appear verbatim.
    expect(reemitted).toContain('#define ZMK_POINTING_DEFAULT_SCRL_VAL 120')
    expect(reemitted).toContain('#define MAC_GESTURE 7')
    // The combo container body around the combo-entry sections is also
    // preserved (it is outside any single combo's body).
    expect(reemitted).toContain('compatible = "zmk,combos"')
  })
})
