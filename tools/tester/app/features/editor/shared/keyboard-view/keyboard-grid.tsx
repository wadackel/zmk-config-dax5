// Shared keyboard layout component used by the editor's tabs to position the
// 44 cells on a split layout matching the tester's visual structure.
//
// Tester keeps its existing inline layout (KeyCap with chatter badges and
// encoder widgets) to avoid disturbing the test flow; the editor uses this
// generic grid to render its own cell content. The layout constants exported
// here (UNIT / KEY_SIZE / KEY_OFFSET / RIGHT_X_OFFSET) are the single source
// of truth used by both tester and editor.

import type { JSX } from 'hono/jsx/jsx-runtime'
import type { KeyDef } from '../../../../core/layout'

export const UNIT = 64
export const KEY_SIZE = 56
export const KEY_OFFSET = 4
export const RIGHT_X_OFFSET = 8.5

const LEFT_CONTAINER_W = (6.5 + 1) * UNIT
const LEFT_CONTAINER_H = (3 + 1) * UNIT
const RIGHT_CONTAINER_W = (15 - 8.5 + 1) * UNIT
const RIGHT_CONTAINER_H = (3 + 1) * UNIT

export type CellRenderer = (key: KeyDef, position: { left: number; top: number; size: number }) => JSX.Element | null

type Props = {
  keys: KeyDef[]
  renderCell: CellRenderer
}

export function KeyboardGrid({ keys, renderCell }: Props) {
  const leftKeys = keys.filter((k) => k.side === 'left')
  const rightKeys = keys.filter((k) => k.side === 'right')

  return (
    <div class="flex flex-row gap-8 justify-center" data-keyboard-grid>
      <div
        class="relative"
        style={{ width: `${LEFT_CONTAINER_W}px`, height: `${LEFT_CONTAINER_H}px` }}
      >
        {leftKeys.map((k) => {
          const left = k.x * UNIT + KEY_OFFSET
          const top = k.y * UNIT + KEY_OFFSET
          return (
            <div key={k.index} data-key={k.index} style={{ position: 'absolute', left: `${left}px`, top: `${top}px` }}>
              {renderCell(k, { left, top, size: KEY_SIZE })}
            </div>
          )
        })}
      </div>
      <div
        class="relative"
        style={{ width: `${RIGHT_CONTAINER_W}px`, height: `${RIGHT_CONTAINER_H}px` }}
      >
        {rightKeys.map((k) => {
          const adjustedX = k.x - RIGHT_X_OFFSET
          const left = adjustedX * UNIT + KEY_OFFSET
          const top = k.y * UNIT + KEY_OFFSET
          return (
            <div key={k.index} data-key={k.index} style={{ position: 'absolute', left: `${left}px`, top: `${top}px` }}>
              {renderCell(k, { left, top, size: KEY_SIZE })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

