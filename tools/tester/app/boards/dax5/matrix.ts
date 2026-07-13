import type { BoardMatrix, MatrixCoord } from '../types'

// dax5 has 44 physical keys spread over 4 rows in the transform map. The
// physical index (used by combos' `key-positions`) corresponds 1:1 to the
// position in `dax5_physical_layout.keys` in `boards/shields/dax5/dax5.dtsi`,
// which is identical to the position in `default_transform.map`.
//
// Row 0/1 populate cols 0..5 and 8..13 (12 keys each).
// Row 2 populates cols 0..6 and 7..13 (14 keys — inner outer columns exist
// only in R2; c6 = left SW22, c7 = right SW1).
// Row 3 is thumb-only: L cols 3..6 + R cols 7..8 (6 keys — trackball occupies
// the right thumb area on the physical board).
const TRANSFORM: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13],
  [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  [3, 4, 5, 6, 7, 8],
]

const KEY_COUNT = TRANSFORM.reduce((a, r) => a + r.length, 0)
const ENCODER_COUNT = 2

const PHYSICAL_TO_RC: MatrixCoord[] = (() => {
  const out: MatrixCoord[] = []
  for (let r = 0; r < TRANSFORM.length; r++) {
    for (let c = 0; c < TRANSFORM[r].length; c++) {
      out.push({ row: r, col: TRANSFORM[r][c] })
    }
  }
  return out
})()

function physicalToMatrix(idx: number): MatrixCoord {
  const m = PHYSICAL_TO_RC[idx]
  if (!m) {
    throw new RangeError(`physicalToMatrix: index ${idx} out of range (0..${KEY_COUNT - 1})`)
  }
  return m
}

function matrixToPhysical(row: number, col: number): number | null {
  for (let i = 0; i < PHYSICAL_TO_RC.length; i++) {
    if (PHYSICAL_TO_RC[i].row === row && PHYSICAL_TO_RC[i].col === col) return i
  }
  return null
}

function checkIntegrity(physicalLayoutLength: number): boolean {
  return physicalLayoutLength === KEY_COUNT
}

export const matrix: BoardMatrix = {
  transform: TRANSFORM,
  keyCount: KEY_COUNT,
  encoderCount: ENCODER_COUNT,
  physicalToMatrix,
  matrixToPhysical,
  checkIntegrity,
}
