// Behaviour catalogue for the binding picker. Each entry models one ZMK
// behaviour the user can place in a layer cell, combo, or macro chain.
//
// `arity` is a list of allowed argument counts. `argTypes` describes the kind
// of each argument so the picker can offer the right secondary input
// (keycode-picker, layer-number, profile-number, etc.).

export type BehaviorArgType =
  | 'keycode'
  | 'layer'
  | 'profile'
  | 'output'
  | 'msc-action'
  | 'gesture'
  | 'free'

export type BehaviorEntry = {
  token: string // e.g. `&kp`
  label: string // e.g. `Tap`
  description?: string
  arity: number[]
  argTypes?: BehaviorArgType[]
  /**
   * Optional human label per argument slot, used to override the generic
   * `argType` label in the picker UI (e.g. `&lt` arg0 → `Hold layer`).
   */
  argLabels?: string[]
  group: BehaviorGroup
}

export type BehaviorGroup =
  | 'basic'
  | 'mod-tap'
  | 'layer'
  | 'mouse'
  | 'system'
  | 'bluetooth'
  | 'macro'
  | 'custom'

const builtins: BehaviorEntry[] = [
  { token: '&kp', label: 'Tap key', arity: [1], argTypes: ['keycode'], group: 'basic' },
  { token: '&trans', label: 'Transparent', arity: [0], group: 'basic' },
  { token: '&none', label: 'None', arity: [0], group: 'basic' },
  {
    token: '&mt',
    label: 'Mod-tap',
    description: 'hold = mod, tap = keycode',
    arity: [2],
    argTypes: ['keycode', 'keycode'],
    argLabels: ['Hold modifier', 'Tap key'],
    group: 'mod-tap',
  },
  {
    token: '&lt',
    label: 'Layer-tap',
    description: 'hold = layer, tap = keycode',
    arity: [2],
    argTypes: ['layer', 'keycode'],
    argLabels: ['Hold layer', 'Tap key'],
    group: 'layer',
  },
  { token: '&mo', label: 'Momentary layer', arity: [1], argTypes: ['layer'], group: 'layer' },
  { token: '&to', label: 'To layer', arity: [1], argTypes: ['layer'], group: 'layer' },
  { token: '&tog', label: 'Toggle layer', arity: [1], argTypes: ['layer'], group: 'layer' },
  { token: '&sl', label: 'Sticky layer', arity: [1], argTypes: ['layer'], group: 'layer' },

  { token: '&mkp', label: 'Mouse click', arity: [1], argTypes: ['keycode'], group: 'mouse' },
  { token: '&msc', label: 'Mouse scroll', arity: [1], argTypes: ['msc-action'], group: 'mouse' },

  { token: '&bt', label: 'Bluetooth', arity: [1, 2], argTypes: ['free'], group: 'bluetooth' },
  { token: '&out', label: 'Output select', arity: [1], argTypes: ['output'], group: 'bluetooth' },

  { token: '&bootloader', label: 'Bootloader', arity: [0], group: 'system' },
  { token: '&sys_reset', label: 'System reset', arity: [0], group: 'system' },
  { token: '&studio_unlock', label: 'Studio unlock', arity: [0], group: 'system' },

  { token: '&macro_tap', label: 'Macro: tap', arity: [0], group: 'macro' },
  { token: '&macro_press', label: 'Macro: press', arity: [0], group: 'macro' },
  { token: '&macro_release', label: 'Macro: release', arity: [0], group: 'macro' },
  {
    token: '&macro_wait_time',
    label: 'Macro: wait',
    arity: [1],
    argTypes: ['free'],
    group: 'macro',
  },
  {
    token: '&macro_tap_time',
    label: 'Macro: tap time',
    arity: [1],
    argTypes: ['free'],
    group: 'macro',
  },
  { token: '&macro_pause_for_release', label: 'Macro: pause for release', arity: [0], group: 'macro' },

  {
    token: '&inc_dec_kp',
    label: 'Encoder kp inc/dec',
    arity: [2],
    argTypes: ['keycode', 'keycode'],
    argLabels: ['CCW keycode', 'CW keycode'],
    group: 'mouse',
  },
]

const dax5Customs: BehaviorEntry[] = [
  { token: '&esc_lang2_with_layer', label: 'Esc + LANG2 (hold-tap)', arity: [2], argTypes: ['layer', 'keycode'], argLabels: ['Hold layer', 'Tap key'], group: 'custom' },
  {
    token: '&enc_scroll',
    label: 'Encoder scroll var',
    arity: [2],
    argTypes: ['msc-action', 'msc-action'],
    argLabels: ['CCW keycode', 'CW keycode'],
    group: 'custom',
  },
  { token: '&esc_lang2', label: 'Esc + LANG2 macro', arity: [0], group: 'custom' },
]

export const BEHAVIORS: BehaviorEntry[] = [...builtins, ...dax5Customs]

export function getBehavior(token: string): BehaviorEntry | undefined {
  return BEHAVIORS.find((b) => b.token === token || b.token === `&${token}`)
}

export function searchBehaviors(query: string): BehaviorEntry[] {
  const q = query.toLowerCase().trim()
  if (!q) return BEHAVIORS
  return BEHAVIORS.filter((b) => {
    if (b.token.toLowerCase().includes(q)) return true
    if (b.label.toLowerCase().includes(q)) return true
    return false
  })
}
