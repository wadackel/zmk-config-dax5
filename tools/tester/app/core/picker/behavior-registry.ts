// Single source of truth for behaviour arity + layer-index/layer-tap classifiers.
// Consolidates the arity table that used to be duplicated between
// `keymap-dt/lint.ts` (BUILTIN_ARITY) and each entry in `picker/behaviors.ts`.

import { getBoard } from '../../boards/active'
import { BEHAVIORS as BUILTIN_BEHAVIORS, type BehaviorEntry } from './behaviors'

export const LAYER_INDEX_BEHAVIORS: ReadonlySet<string> = new Set([
  '&mo',
  '&to',
  '&tog',
  '&sl',
])

/**
 * All behaviours the picker should offer — builtins + the active board's custom
 * behaviours + mouse-gesture family. Callers should use this rather than the raw
 * `BEHAVIORS` constant so a swapped board profile picks up its own customs.
 */
export function getAllBehaviors(): readonly BehaviorEntry[] {
  return [...BUILTIN_BEHAVIORS, ...getBoard().behaviors.customs]
}

export function findBehavior(token: string): BehaviorEntry | undefined {
  const needle = token.startsWith('&') ? token : `&${token}`
  return getAllBehaviors().find((b) => b.token === needle)
}

/**
 * Arity lookup table indexed by behaviour name (with `&` prefix). Merges the
 * static builtin arities with the arities declared by the active board's custom
 * behaviours. `lint.ts` extends this with keymap-declared macros/behaviours at
 * lint time; this function returns only the statically-known slice.
 */
export function baseArityTable(): Record<string, readonly number[]> {
  const out: Record<string, readonly number[]> = {}
  for (const b of getAllBehaviors()) {
    out[b.token] = b.arity
  }
  return out
}
