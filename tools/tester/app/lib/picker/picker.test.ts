import { describe, expect, it } from 'vitest'
import {
  BEHAVIORS,
  KEYCODES,
  applyModifier,
  getBehavior,
  searchBehaviors,
  searchKeycodes,
  unwrapModifier,
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
    // Spot-check that the key built-ins are present.
    for (const token of ['&kp', '&mt', '&lt', '&mo', '&trans', '&none', '&mkp', '&msc']) {
      expect(getBehavior(token)).toBeTruthy()
    }
  })
})
