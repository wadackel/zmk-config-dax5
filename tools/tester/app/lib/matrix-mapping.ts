// Physical key index ↔ matrix RC translation for dax5.
//
// dax5 has 44 physical keys spread over 4 rows in the transform map. The
// physical index (used by combos' `key-positions`) corresponds 1:1 to the
// position in `dax5_physical_layout.keys` in `boards/shields/dax5/dax5.dtsi`,
// which is identical to the position in `default_transform.map`. This 1:1
// relationship is what makes byte-level combo editing tractable.

export type MatrixCoord = { row: number; col: number }

/**
 * Transform map per row (in order of physical index). dax5 rows are
 * 12 / 12 / 14 / 6 = 44. R0/R1 use 0..5 + 8..13; R2 uses 0..6 + 7..13
 * (SW1 and SW22 sit on R2 as outer c7/c6 columns); R3 uses 3..6 + 7..8
 * (trackball reduces R thumb).
 */
const TRANSFORM: number[][] = [
  // R0 (12)
  [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13],
  // R1 (12)
  [0, 1, 2, 3, 4, 5, 8, 9, 10, 11, 12, 13],
  // R2 (14)
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  // R3 (6)
  [3, 4, 5, 6, 7, 8],
]

export const DAX5_KEY_COUNT = TRANSFORM.reduce((a, r) => a + r.length, 0)

const PHYSICAL_TO_RC: MatrixCoord[] = (() => {
  const out: MatrixCoord[] = []
  for (let r = 0; r < TRANSFORM.length; r++) {
    for (let c = 0; c < TRANSFORM[r].length; c++) {
      out.push({ row: r, col: TRANSFORM[r][c] })
    }
  }
  return out
})()

export function physicalToMatrix(idx: number): MatrixCoord {
  const m = PHYSICAL_TO_RC[idx]
  if (!m) {
    throw new RangeError(`physicalToMatrix: index ${idx} out of range (0..${DAX5_KEY_COUNT - 1})`)
  }
  return m
}

export function matrixToPhysical(row: number, col: number): number | null {
  for (let i = 0; i < PHYSICAL_TO_RC.length; i++) {
    if (PHYSICAL_TO_RC[i].row === row && PHYSICAL_TO_RC[i].col === col) return i
  }
  return null
}

/**
 * Integrity check used by the build-time codegen and by tests. Confirms that
 * the physical layout (loaded externally) has the same number of entries as
 * the transform map's effective entry count.
 */
export function checkMatrixIntegrity(physicalLayoutLength: number): boolean {
  return physicalLayoutLength === DAX5_KEY_COUNT
}
