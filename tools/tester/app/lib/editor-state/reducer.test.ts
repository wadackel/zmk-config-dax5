import { describe, expect, it } from 'vitest'
import type { BindingChain, LayerData } from '../keymap-dt/types'
import { emptyDraft, initialState, reducer } from './reducer'
import type { EditorDraft, EditorState } from './types'

function makeLayer(name: string, fill: BindingChain): LayerData {
  return {
    name,
    bindings: Array.from({ length: 44 }, () => ({ tokens: [...fill.tokens] })),
    sensorBindings: { perEncoder: [{ tokens: ['&trans'] }, { tokens: ['&trans'] }] },
  }
}

function makeState(draft?: EditorDraft): EditorState {
  const d = draft ?? {
    ...emptyDraft(),
    layers: [
      makeLayer('default_layer', { tokens: ['&trans'] }),
      makeLayer('Symbol', { tokens: ['&trans'] }),
    ],
  }
  return { ...initialState(), draft: d, baselineSource: '', baselineMtimeMs: 0 }
}

function makeStateWithBindings(): EditorState {
  const s = makeState()
  return reducer(s, {
    type: 'UPDATE_SENSOR_BINDING',
    layerIdx: 0,
    encoderIdx: 0,
    chain: { tokens: ['&enc_scroll', 'SCRL_UP', 'SCRL_DOWN'] },
  })
}

describe('editor reducer', () => {
  it('LOAD replaces the entire state', () => {
    const draft = { ...emptyDraft(), layers: [makeLayer('Foo', { tokens: ['&kp', 'A'] })] }
    const s = reducer(initialState(), {
      type: 'LOAD',
      source: 'src',
      mtimeMs: 123,
      draft,
    })
    expect(s.draft.layers[0].name).toBe('Foo')
    expect(s.baselineSource).toBe('src')
    expect(s.baselineMtimeMs).toBe(123)
  })

  it('UPDATE_BINDING changes the targeted key and records history', () => {
    const before = makeState()
    const after = reducer(before, {
      type: 'UPDATE_BINDING',
      layerIdx: 0,
      keyIdx: 5,
      chain: { tokens: ['&kp', 'Z'] },
    })
    expect(after.draft.layers[0].bindings[5].tokens).toEqual(['&kp', 'Z'])
    expect(after.past.length).toBe(1)
  })

  it('UNDO restores the previous draft and pushes onto future', () => {
    let s = makeState()
    s = reducer(s, { type: 'UPDATE_BINDING', layerIdx: 0, keyIdx: 0, chain: { tokens: ['&kp', 'X'] } })
    const undone = reducer(s, { type: 'UNDO' })
    expect(undone.draft.layers[0].bindings[0].tokens).toEqual(['&trans'])
    expect(undone.future.length).toBe(1)
  })

  it('REDO re-applies the undone state', () => {
    let s = makeState()
    s = reducer(s, { type: 'UPDATE_BINDING', layerIdx: 0, keyIdx: 0, chain: { tokens: ['&kp', 'X'] } })
    s = reducer(s, { type: 'UNDO' })
    s = reducer(s, { type: 'REDO' })
    expect(s.draft.layers[0].bindings[0].tokens).toEqual(['&kp', 'X'])
  })

  it('ADD_COMBO appends a new combo with sensible defaults', () => {
    let s = makeState()
    s = reducer(s, { type: 'ADD_COMBO' })
    expect(s.draft.combos.length).toBe(1)
    expect(s.draft.combos[0].name).toBe('combo_1')
    expect(s.draft.combos[0].keyPositions).toEqual([])
  })

  it('REMOVE_COMBO removes by index', () => {
    let s = makeState()
    s = reducer(s, { type: 'ADD_COMBO' })
    s = reducer(s, { type: 'ADD_COMBO' })
    s = reducer(s, { type: 'REMOVE_COMBO', index: 0 })
    expect(s.draft.combos.length).toBe(1)
    expect(s.draft.combos[0].name).toBe('combo_2')
  })

  it('INSERT_SENSOR_BINDING is a no-op when the layer already has sensor-bindings', () => {
    const before = makeState()
    const after = reducer(before, { type: 'INSERT_SENSOR_BINDING', layerIdx: 0 })
    expect(after.draft.layers[0].sensorBindings).toEqual(before.draft.layers[0].sensorBindings)
  })

  it('INSERT_SENSOR_BINDING adds defaults when none present', () => {
    const draft = {
      ...emptyDraft(),
      layers: [
        {
          name: 'NoSensors',
          bindings: Array.from({ length: 44 }, () => ({ tokens: ['&trans'] })),
          sensorBindings: null,
        },
      ],
    }
    const before = makeState(draft)
    const after = reducer(before, { type: 'INSERT_SENSOR_BINDING', layerIdx: 0 })
    expect(after.draft.layers[0].sensorBindings).not.toBeNull()
    expect(after.draft.layers[0].sensorBindings!.perEncoder.length).toBe(2)
  })

  it('REMOVE_SENSOR_BINDING clears the layer sensor-bindings back to null', () => {
    const before = makeState()
    const after = reducer(before, { type: 'REMOVE_SENSOR_BINDING', layerIdx: 0 })
    expect(after.draft.layers[0].sensorBindings).toBeNull()
    expect(after.past.length).toBe(1)
  })

  it('REMOVE_SENSOR_BINDING on an already-null layer is a no-op', () => {
    const draft = {
      ...emptyDraft(),
      layers: [
        {
          name: 'NoSensors',
          bindings: Array.from({ length: 44 }, () => ({ tokens: ['&trans'] })),
          sensorBindings: null,
        },
      ],
    }
    const before = makeState(draft)
    const after = reducer(before, { type: 'REMOVE_SENSOR_BINDING', layerIdx: 0 })
    expect(after).toBe(before)
  })

  it('SWAP_SENSOR_BINDING_ARGS swaps arg0 and arg1 while preserving the head token', () => {
    const before = makeStateWithBindings()
    const after = reducer(before, { type: 'SWAP_SENSOR_BINDING_ARGS', layerIdx: 0, encoderIdx: 0 })
    expect(after.draft.layers[0].sensorBindings!.perEncoder[0].tokens).toEqual([
      '&enc_scroll',
      'SCRL_DOWN',
      'SCRL_UP',
    ])
  })

  it('SWAP_SENSOR_BINDING_ARGS is a no-op for chains with fewer than 2 args', () => {
    const before = reducer(makeState(), {
      type: 'UPDATE_SENSOR_BINDING',
      layerIdx: 0,
      encoderIdx: 0,
      chain: { tokens: ['&trans'] },
    })
    const after = reducer(before, { type: 'SWAP_SENSOR_BINDING_ARGS', layerIdx: 0, encoderIdx: 0 })
    expect(after).toBe(before)
  })

  it('COPY_SENSOR_BINDINGS deep-copies the perEncoder chains into the destination', () => {
    const before = makeStateWithBindings()
    const after = reducer(before, { type: 'COPY_SENSOR_BINDINGS', fromLayerIdx: 0, toLayerIdx: 1 })
    const src = after.draft.layers[0].sensorBindings!.perEncoder
    const dst = after.draft.layers[1].sensorBindings!.perEncoder
    expect(dst[0].tokens).toEqual(src[0].tokens)
    expect(dst[0]).not.toBe(src[0])
    expect(dst[0].tokens).not.toBe(src[0].tokens)
  })

  it('COPY_SENSOR_BINDINGS is a no-op when the source layer has no sensor-bindings', () => {
    const draft = {
      ...emptyDraft(),
      layers: [
        {
          name: 'NoSensors',
          bindings: Array.from({ length: 44 }, () => ({ tokens: ['&trans'] })),
          sensorBindings: null,
        },
        makeLayer('B', { tokens: ['&trans'] }),
      ],
    }
    const before = makeState(draft)
    const after = reducer(before, {
      type: 'COPY_SENSOR_BINDINGS',
      fromLayerIdx: 0,
      toLayerIdx: 1,
    })
    expect(after).toBe(before)
  })

  it('APPLY_SENSOR_BINDINGS_TO_ALL propagates the source layer to every layer', () => {
    const before = makeStateWithBindings()
    const after = reducer(before, { type: 'APPLY_SENSOR_BINDINGS_TO_ALL', fromLayerIdx: 0 })
    for (const layer of after.draft.layers) {
      expect(layer.sensorBindings!.perEncoder[0].tokens).toEqual([
        '&enc_scroll',
        'SCRL_UP',
        'SCRL_DOWN',
      ])
    }
    expect(after.draft.layers[0].sensorBindings!.perEncoder[0].tokens).not.toBe(
      after.draft.layers[1].sensorBindings!.perEncoder[0].tokens,
    )
  })

  it('APPLY_SENSOR_BINDINGS_TO_ALL is a no-op when the source has no sensor-bindings', () => {
    const draft = {
      ...emptyDraft(),
      layers: [
        {
          name: 'NoSensors',
          bindings: Array.from({ length: 44 }, () => ({ tokens: ['&trans'] })),
          sensorBindings: null,
        },
        makeLayer('B', { tokens: ['&trans'] }),
      ],
    }
    const before = makeState(draft)
    const after = reducer(before, { type: 'APPLY_SENSOR_BINDINGS_TO_ALL', fromLayerIdx: 0 })
    expect(after).toBe(before)
  })

  it('ADD_LAYER appends a layer of 44 &trans and switches activeLayerIdx', () => {
    const before = makeState()
    const after = reducer(before, { type: 'ADD_LAYER', name: 'MyTest' })
    expect(after.draft.layers.length).toBe(3)
    expect(after.draft.layers[2].name).toBe('MyTest')
    expect(after.draft.layers[2].bindings.length).toBe(44)
    expect(after.draft.layers[2].bindings.every((b) => b.tokens[0] === '&trans')).toBe(true)
    expect(after.draft.layers[2].sensorBindings).toBeNull()
    expect(after.activeLayerIdx).toBe(2)
  })

  it('ADD_LAYER rejects duplicate / empty names (no-op)', () => {
    const before = makeState()
    expect(reducer(before, { type: 'ADD_LAYER', name: 'default_layer' }).draft.layers.length).toBe(2)
    expect(reducer(before, { type: 'ADD_LAYER', name: '   ' }).draft.layers.length).toBe(2)
  })

  it('REMOVE_LAYER protects idx 0 (default_layer)', () => {
    const before = makeState()
    const after = reducer(before, { type: 'REMOVE_LAYER', idx: 0 })
    expect(after.draft.layers).toEqual(before.draft.layers)
  })

  it('REMOVE_LAYER shifts combo `layers` indices and drops the removed one', () => {
    const draft: EditorDraft = {
      ...emptyDraft(),
      layers: [
        makeLayer('default_layer', { tokens: ['&trans'] }),
        makeLayer('Symbol', { tokens: ['&trans'] }),
        makeLayer('Num', { tokens: ['&trans'] }),
        makeLayer('Function', { tokens: ['&trans'] }),
      ],
      combos: [
        {
          name: 'c1',
          bindings: { tokens: ['&trans'] },
          keyPositions: [0, 1],
          layers: [0, 2, 3],
        },
      ],
    }
    const before = makeState(draft)
    const after = reducer(before, { type: 'REMOVE_LAYER', idx: 2 })
    expect(after.draft.layers.length).toBe(3)
    // 0 stays, 2 removed, 3 shifts to 2.
    expect(after.draft.combos[0].layers).toEqual([0, 2])
  })

  it('REMOVE_LAYER replaces &mo N with &trans when N === idx and decrements N > idx', () => {
    const base = makeLayer('default_layer', { tokens: ['&trans'] })
    base.bindings[0] = { tokens: ['&mo', '2'] } // references removed layer
    base.bindings[1] = { tokens: ['&mo', '3'] } // shifts down
    base.bindings[2] = { tokens: ['&mo', '1'] } // unchanged (< idx)
    const draft: EditorDraft = {
      ...emptyDraft(),
      layers: [
        base,
        makeLayer('Symbol', { tokens: ['&trans'] }),
        makeLayer('Num', { tokens: ['&trans'] }),
        makeLayer('Function', { tokens: ['&trans'] }),
      ],
    }
    const before = makeState(draft)
    const after = reducer(before, { type: 'REMOVE_LAYER', idx: 2 })
    expect(after.draft.layers[0].bindings[0].tokens).toEqual(['&trans'])
    expect(after.draft.layers[0].bindings[1].tokens).toEqual(['&mo', '2'])
    expect(after.draft.layers[0].bindings[2].tokens).toEqual(['&mo', '1'])
  })

  it('REMOVE_LAYER rewrites &lt N k similarly (N === idx → &trans, N > idx → decrement)', () => {
    const base = makeLayer('default_layer', { tokens: ['&trans'] })
    base.bindings[0] = { tokens: ['&lt', '2', 'SPACE'] }
    base.bindings[1] = { tokens: ['&lt', '3', 'ENTER'] }
    const draft: EditorDraft = {
      ...emptyDraft(),
      layers: [
        base,
        makeLayer('Symbol', { tokens: ['&trans'] }),
        makeLayer('Num', { tokens: ['&trans'] }),
        makeLayer('Function', { tokens: ['&trans'] }),
      ],
    }
    const before = makeState(draft)
    const after = reducer(before, { type: 'REMOVE_LAYER', idx: 2 })
    expect(after.draft.layers[0].bindings[0].tokens).toEqual(['&trans'])
    expect(after.draft.layers[0].bindings[1].tokens).toEqual(['&lt', '2', 'ENTER'])
  })

  it('REMOVE_LAYER leaves non-numeric layer args (e.g. #define names) untouched', () => {
    const base = makeLayer('default_layer', { tokens: ['&trans'] })
    base.bindings[0] = { tokens: ['&mo', 'NUM'] } // preprocessor reference
    const draft: EditorDraft = {
      ...emptyDraft(),
      layers: [
        base,
        makeLayer('Symbol', { tokens: ['&trans'] }),
        makeLayer('Num', { tokens: ['&trans'] }),
      ],
    }
    const before = makeState(draft)
    const after = reducer(before, { type: 'REMOVE_LAYER', idx: 2 })
    expect(after.draft.layers[0].bindings[0].tokens).toEqual(['&mo', 'NUM'])
  })

  it('REMOVE_LAYER clamps activeLayerIdx when the active layer is removed or out of range', () => {
    const before = { ...makeState(), activeLayerIdx: 1 }
    const after = reducer(before, { type: 'REMOVE_LAYER', idx: 1 })
    expect(after.draft.layers.length).toBe(1)
    expect(after.activeLayerIdx).toBe(0)
  })

  it('SET_CLIPBOARD with a non-null chain stores a deep copy; past/future/draft unchanged', () => {
    const before = { ...makeState(), past: [emptyDraft()], future: [emptyDraft()] }
    const original = before.draft
    const src: BindingChain = { tokens: ['&kp', 'A'] }
    const after = reducer(before, { type: 'SET_CLIPBOARD', chain: src })
    expect(after.clipboard).toEqual({ tokens: ['&kp', 'A'] })
    // Deep copy: mutating the source does not affect the clipboard.
    src.tokens.push('B')
    expect(after.clipboard!.tokens).toEqual(['&kp', 'A'])
    expect(after.draft).toBe(original)
    expect(after.past).toBe(before.past)
    expect(after.future).toBe(before.future)
  })

  it('SET_CLIPBOARD with null clears the clipboard (idempotent)', () => {
    const seeded = { ...makeState(), clipboard: { tokens: ['&kp', 'A'] } }
    const cleared = reducer(seeded, { type: 'SET_CLIPBOARD', chain: null })
    expect(cleared.clipboard).toBeNull()
    const again = reducer(cleared, { type: 'SET_CLIPBOARD', chain: null })
    expect(again.clipboard).toBeNull()
  })

  it('UPDATE_BINDINGS_BULK applies all edits and records a single history entry', () => {
    const before = makeState()
    const after = reducer(before, {
      type: 'UPDATE_BINDINGS_BULK',
      layerIdx: 0,
      edits: [
        { keyIdx: 1, chain: { tokens: ['&kp', 'Q'] } },
        { keyIdx: 2, chain: { tokens: ['&kp', 'Q'] } },
        { keyIdx: 3, chain: { tokens: ['&kp', 'Q'] } },
      ],
    })
    expect(after.draft.layers[0].bindings[1].tokens).toEqual(['&kp', 'Q'])
    expect(after.draft.layers[0].bindings[2].tokens).toEqual(['&kp', 'Q'])
    expect(after.draft.layers[0].bindings[3].tokens).toEqual(['&kp', 'Q'])
    expect(after.draft.layers[0].bindings[0].tokens).toEqual(['&trans']) // untouched
    expect(after.past.length).toBe(1) // single undo step for the whole batch
  })

  it('UPDATE_BINDINGS_BULK with empty edits is a no-op (no history entry)', () => {
    const before = makeState()
    const after = reducer(before, { type: 'UPDATE_BINDINGS_BULK', layerIdx: 0, edits: [] })
    expect(after).toBe(before)
  })

  it('LOAD preserves the clipboard across a re-load', () => {
    const seeded = { ...makeState(), clipboard: { tokens: ['&kp', 'A'] } }
    const reloaded = reducer(seeded, {
      type: 'LOAD',
      source: 'new src',
      mtimeMs: 999,
      draft: emptyDraft(),
    })
    expect(reloaded.clipboard).toEqual({ tokens: ['&kp', 'A'] })
    // History was reset though.
    expect(reloaded.past).toEqual([])
    expect(reloaded.future).toEqual([])
  })

  it('SAVE_COMMIT preserves activeTab / activeLayerIdx / clipboard', () => {
    const seeded: EditorState = {
      ...makeState(),
      activeTab: 'combos',
      activeLayerIdx: 1,
      clipboard: { tokens: ['&kp', 'A'] },
    }
    const draft = {
      ...emptyDraft(),
      layers: [
        makeLayer('default_layer', { tokens: ['&trans'] }),
        makeLayer('Symbol', { tokens: ['&trans'] }),
      ],
    }
    const after = reducer(seeded, {
      type: 'SAVE_COMMIT',
      source: 'new src',
      mtimeMs: 999,
      draft,
    })
    expect(after.activeTab).toBe('combos')
    expect(after.activeLayerIdx).toBe(1)
    expect(after.clipboard).toEqual({ tokens: ['&kp', 'A'] })
  })

  it('SAVE_COMMIT replaces baseline and clears history', () => {
    const seeded: EditorState = {
      ...makeState(),
      past: [emptyDraft()],
      future: [emptyDraft()],
    }
    const draft = {
      ...emptyDraft(),
      layers: [makeLayer('default_layer', { tokens: ['&kp', 'A'] })],
    }
    const after = reducer(seeded, {
      type: 'SAVE_COMMIT',
      source: 'new src',
      mtimeMs: 999,
      draft,
    })
    expect(after.baselineSource).toBe('new src')
    expect(after.baselineMtimeMs).toBe(999)
    expect(after.past).toEqual([])
    expect(after.future).toEqual([])
    expect(after.draft).toBe(draft)
  })

  it('SAVE_COMMIT clamps activeLayerIdx when new draft has fewer layers', () => {
    const seeded: EditorState = { ...makeState(), activeLayerIdx: 5 }
    const draft = {
      ...emptyDraft(),
      layers: [
        makeLayer('default_layer', { tokens: ['&trans'] }),
        makeLayer('Symbol', { tokens: ['&trans'] }),
      ],
    }
    const after = reducer(seeded, {
      type: 'SAVE_COMMIT',
      source: 'new src',
      mtimeMs: 999,
      draft,
    })
    expect(after.activeLayerIdx).toBe(1)
  })

})
