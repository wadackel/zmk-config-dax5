import { describe, expect, it } from 'vitest'
import { baseArityTable } from './behavior-registry'
import { allBehaviors, deriveDraftBehaviors, parseBindingCells } from './behaviors'
import {
  BEHAVIORS,
  KEYCODES,
  applyModifier,
  getBehavior,
  searchBehaviors,
  searchKeycodes,
  unwrapModifier,
  withDraft,
} from './index'

describe('picker dictionaries', () => {
  it('every keycode entry has token + label + group', () => {
    for (const k of KEYCODES) {
      expect(k.token).toBeTruthy()
      expect(k.label).toBeTruthy()
      expect(k.group).toBeTruthy()
    }
  })

  it('searchKeycodes finds letter A', () => {
    const hits = searchKeycodes('a')
    expect(hits.some((h) => h.token === 'A')).toBe(true)
  })

  it('searchKeycodes finds SCRL_UP via alias for "scroll"', () => {
    // SCRL_UP has label "Scroll↑" — case-insensitive substring match should hit.
    const hits = searchKeycodes('scroll')
    expect(hits.some((h) => h.token === 'SCRL_UP')).toBe(true)
  })

  it('BEHAVIORS contains &kp / &mt / &lt with the expected arity', () => {
    expect(getBehavior('&kp')?.arity).toEqual([1])
    expect(getBehavior('&mt')?.arity).toEqual([2])
    expect(getBehavior('&lt')?.arity).toEqual([2])
    expect(getBehavior('&trans')?.arity).toEqual([0])
  })

  it('BEHAVIORS contains dax5 customs', () => {
    expect(getBehavior('&esc_lang2_with_layer')).toBeTruthy()
    expect(getBehavior('&enc_scroll')).toBeTruthy()
    expect(getBehavior('&esc_lang2')).toBeTruthy()
  })

  it('searchBehaviors finds by partial name', () => {
    const hits = searchBehaviors('mod-tap')
    expect(hits.some((b) => b.token === '&mt')).toBe(true)
  })

  it('applyModifier wraps + unwrapModifier inverts', () => {
    expect(applyModifier('LC', 'A')).toBe('LC(A)')
    expect(unwrapModifier('LC(A)')).toEqual({ wrap: 'LC', inner: 'A' })
    expect(unwrapModifier('A')).toBeNull()
  })

  it('the picker covers every behaviour the lint table knows', () => {
    // Every static behaviour the lint recognises must be pickable — otherwise a
    // cell holding that behaviour (e.g. `&mouse_gesture` on the Mouse layer)
    // opens the picker with a blank behaviour and cannot be edited.
    for (const token of Object.keys(baseArityTable())) {
      expect(getBehavior(token), `picker missing behaviour ${token}`).toBeTruthy()
    }
  })
})

describe('parseBindingCells', () => {
  it('extracts N from `<N>` values', () => {
    expect(parseBindingCells([{ name: '#binding-cells', value: '<0>' }])).toBe(0)
    expect(parseBindingCells([{ name: '#binding-cells', value: '<1>' }])).toBe(1)
    expect(parseBindingCells([{ name: '#binding-cells', value: '<2>' }])).toBe(2)
  })

  it('rejects an implausibly large count instead of letting it reach Array.from', () => {
    expect(parseBindingCells([{ name: '#binding-cells', value: '<8>' }])).toBe(8)
    expect(parseBindingCells([{ name: '#binding-cells', value: '<9>' }])).toBeNull()
    expect(parseBindingCells([{ name: '#binding-cells', value: '<100000000>' }])).toBeNull()
    expect(parseBindingCells([{ name: '#binding-cells', value: '<4294967296>' }])).toBeNull()
  })

  it('tolerates whitespace inside the angle brackets', () => {
    expect(parseBindingCells([{ name: '#binding-cells', value: '< 2 >' }])).toBe(2)
  })

  it('returns null when the property is missing', () => {
    expect(parseBindingCells([{ name: 'compatible', value: '"zmk,behavior-macro"' }])).toBeNull()
  })

  it('returns null when the value is not a bare angle-wrapped integer', () => {
    expect(parseBindingCells([{ name: '#binding-cells', value: '<FOO>' }])).toBeNull()
    expect(parseBindingCells([{ name: '#binding-cells', value: '2' }])).toBeNull()
  })
})

describe('deriveDraftBehaviors', () => {
  const emptyDraft = { macros: [], behaviors: [], mouseGestures: [] }

  it('surfaces a macro entry with arity from #binding-cells', () => {
    const entries = deriveDraftBehaviors({
      ...emptyDraft,
      macros: [
        {
          name: 'my_macro',
          props: [
            { name: 'compatible', value: '"zmk,behavior-macro"' },
            { name: '#binding-cells', value: '<0>' },
          ],
        },
      ],
    })
    expect(entries).toEqual([
      { token: '&my_macro', label: 'my_macro', group: 'macro', arity: [0], argTypes: [] },
    ])
  })

  it('surfaces a user-defined behavior with #binding-cells=<2>', () => {
    const entries = deriveDraftBehaviors({
      ...emptyDraft,
      behaviors: [
        {
          name: 'my_ht',
          props: [{ name: '#binding-cells', value: '<2>' }],
          bindings: [{ tokens: ['&kp'] }, { tokens: ['&kp'] }],
        },
      ],
    })
    expect(entries[0]).toEqual({
      token: '&my_ht',
      label: 'my_ht',
      group: 'custom',
      arity: [2],
      argTypes: ['free', 'free'],
    })
  })

  it('falls back to [2] for behaviors with bindings but no #binding-cells', () => {
    const entries = deriveDraftBehaviors({
      ...emptyDraft,
      behaviors: [
        {
          name: 'implicit_ht',
          props: [],
          bindings: [{ tokens: ['&kp'] }, { tokens: ['&kp'] }],
        },
      ],
    })
    expect(entries[0]?.arity).toEqual([2])
  })

  it('falls back to [0] for behaviors without bindings and without #binding-cells', () => {
    const entries = deriveDraftBehaviors({
      ...emptyDraft,
      behaviors: [{ name: 'zeroable', props: [] }],
    })
    expect(entries[0]?.arity).toEqual([0])
  })

  it('getBehavior resolves a draft-defined macro to its arity', () => {
    const draft = {
      macros: [
        { name: 'my_macro', props: [{ name: '#binding-cells', value: '<0>' }] },
      ],
      behaviors: [],
      mouseGestures: [],
    }
    expect(getBehavior('&my_macro')).toBeUndefined() // no draft — invisible
    expect(getBehavior('&my_macro', draft)?.arity).toEqual([0])
    expect(getBehavior('&my_macro', draft)?.group).toBe('macro')
  })

  it('searchBehaviors picks up draft macros when a draft is passed', () => {
    const draft = {
      macros: [{ name: 'kp_zerozreo', props: [] }],
      behaviors: [],
      mouseGestures: [],
    }
    const hits = searchBehaviors('zero', draft)
    expect(hits.some((b) => b.token === '&kp_zerozreo')).toBe(true)
  })

  it('surfaces named mouse-gesture blocks only (root would duplicate the builtin &zip_mouse_gesture row)', () => {
    const entries = deriveDraftBehaviors({
      ...emptyDraft,
      mouseGestures: [
        { kind: 'root', props: [] },
        { kind: 'named', name: 'zip_mouse_gesture_mac', props: [] },
      ],
    })
    expect(entries.map((e) => e.token)).toEqual(['&zip_mouse_gesture_mac'])
    expect(entries[0]?.group).toBe('custom')
  })
})

describe('withDraft', () => {
  const emptyDraft = { macros: [], behaviors: [], mouseGestures: [] }

  it('returns the static list untouched without a draft', () => {
    expect(withDraft()).toEqual(allBehaviors())
  })

  it('keeps the static entry when a draft node redeclares a board custom', () => {
    // The board profile declares `&esc_lang2` as a custom and the keymap also
    // defines it as a macro, so both sources produce the same token.
    const staticEntry = allBehaviors().find((b) => b.token === '&esc_lang2')
    expect(staticEntry).toBeTruthy()

    const merged = withDraft({
      ...emptyDraft,
      macros: [{ name: 'esc_lang2', props: [] }],
    })
    const hits = merged.filter((b) => b.token === '&esc_lang2')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toBe(staticEntry)
  })

  it('appends draft nodes that no static entry covers', () => {
    const merged = withDraft({
      ...emptyDraft,
      macros: [{ name: 'brand_new_macro', props: [] }],
    })
    expect(merged.filter((b) => b.token === '&brand_new_macro')).toHaveLength(1)
  })

  it('collapses a collision between two draft nodes sharing a label', () => {
    const merged = withDraft({
      ...emptyDraft,
      macros: [{ name: 'shared_label', props: [] }],
      behaviors: [{ name: 'shared_label', props: [] }],
    })
    expect(merged.filter((b) => b.token === '&shared_label')).toHaveLength(1)
  })
})
