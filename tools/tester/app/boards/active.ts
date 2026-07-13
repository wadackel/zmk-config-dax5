import type { BoardProfile } from './types'
import { PROFILE as DAX5_PROFILE } from './dax5'

let active: BoardProfile = DAX5_PROFILE

export function getBoard(): BoardProfile {
  return active
}

export function setBoardForTest(profile: BoardProfile): void {
  active = profile
}

export function resetBoardForTest(): void {
  active = DAX5_PROFILE
}
