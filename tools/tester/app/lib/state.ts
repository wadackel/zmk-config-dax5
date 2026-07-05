import { KEYS, TESTABLE_KEY_COUNT } from './layout'

export type KeyStatus = 'untested' | 'pressed' | 'tested' | 'chattering'

export interface KeyState {
  status: KeyStatus
  pressCount: number
  chatterCount: number
  lastKeydownTime: number
  lastKeyupTime: number
  isPressed: boolean
}

export interface EncoderState {
  clockwiseCount: number
  counterClockwiseCount: number
  lastEventTime: number
  isTested: boolean
}

export interface EventLogEntry {
  id: number
  timestamp: number
  type: 'keydown' | 'keyup' | 'mousedown' | 'mouseup' | 'wheel'
  label: string
  isChattering: boolean
  chatterInterval?: number
}

export interface TestState {
  keys: Map<number, KeyState>
  encoders: Map<string, EncoderState>
  eventLog: EventLogEntry[]
  testedCount: number
  focusedEncoder: string | null
  logIdCounter: number
}

export function createInitialState(): TestState {
  const keys = new Map<number, KeyState>()
  for (const key of KEYS) {
    keys.set(key.index, {
      status: key.testability === 'untestable' ? 'untested' : 'untested',
      pressCount: 0,
      chatterCount: 0,
      lastKeydownTime: 0,
      lastKeyupTime: 0,
      isPressed: false,
    })
  }

  const encoders = new Map<string, EncoderState>()
  encoders.set('left', {
    clockwiseCount: 0,
    counterClockwiseCount: 0,
    lastEventTime: 0,
    isTested: false,
  })
  encoders.set('right', {
    clockwiseCount: 0,
    counterClockwiseCount: 0,
    lastEventTime: 0,
    isTested: false,
  })

  return {
    keys,
    encoders,
    eventLog: [],
    testedCount: 0,
    focusedEncoder: null,
    logIdCounter: 0,
  }
}

export function getProgress(state: TestState): { tested: number; total: number; percent: number } {
  const total = TESTABLE_KEY_COUNT
  const tested = state.testedCount
  const percent = total === 0 ? 100 : Math.round((tested / total) * 100)
  return { tested, total, percent }
}
