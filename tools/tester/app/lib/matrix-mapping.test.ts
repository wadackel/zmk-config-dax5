import { describe, expect, it } from 'vitest'
import {
  DAX5_KEY_COUNT,
  checkMatrixIntegrity,
  matrixToPhysical,
  physicalToMatrix,
} from './matrix-mapping'

describe('matrix-mapping', () => {
  it('counts 44 physical keys', () => {
    expect(DAX5_KEY_COUNT).toBe(44)
  })

  it('physical 0 = R0C0', () => {
    expect(physicalToMatrix(0)).toEqual({ row: 0, col: 0 })
  })

  it('physical 6 = R0C8 (first R side cell on R0)', () => {
    expect(physicalToMatrix(6)).toEqual({ row: 0, col: 8 })
  })

  it('physical 30 = R2C6 (extra L outer cell on R2)', () => {
    expect(physicalToMatrix(30)).toEqual({ row: 2, col: 6 })
  })

  it('physical 31 = R2C7 (extra R outer cell on R2)', () => {
    expect(physicalToMatrix(31)).toEqual({ row: 2, col: 7 })
  })

  it('physical 38 = R3C3 (first R3 cell)', () => {
    expect(physicalToMatrix(38)).toEqual({ row: 3, col: 3 })
  })

  it('physical 43 = R3C8 (last cell)', () => {
    expect(physicalToMatrix(43)).toEqual({ row: 3, col: 8 })
  })

  it('matrixToPhysical inverts physicalToMatrix', () => {
    for (let i = 0; i < DAX5_KEY_COUNT; i++) {
      const m = physicalToMatrix(i)
      expect(matrixToPhysical(m.row, m.col)).toBe(i)
    }
  })

  it('matrixToPhysical returns null for cells the layout does not include', () => {
    // R0/R1 col 7 is not wired (only R2/R3 populate c7), R3 col 0..2 and c9..c13 don't exist.
    expect(matrixToPhysical(0, 7)).toBeNull()
    expect(matrixToPhysical(1, 7)).toBeNull()
    expect(matrixToPhysical(3, 0)).toBeNull()
    expect(matrixToPhysical(3, 13)).toBeNull()
  })

  it('checkMatrixIntegrity is true for 44, false otherwise', () => {
    expect(checkMatrixIntegrity(44)).toBe(true)
    expect(checkMatrixIntegrity(48)).toBe(false)
  })

  it('out-of-range physical index throws', () => {
    expect(() => physicalToMatrix(44)).toThrow(/out of range/)
    expect(() => physicalToMatrix(-1)).toThrow(/out of range/)
  })
})
