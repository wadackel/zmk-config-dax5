import { useState, useEffect, useCallback, useRef } from 'hono/jsx'
import { KeyCap } from '../components/ui/key-cap'
import type { KeyCapState } from '../components/ui/key-cap'
import { KEY_OFFSET, KEY_SIZE, RIGHT_X_OFFSET, UNIT } from '../components/keyboard-grid'
import { KEYS, ENCODERS } from '../lib/layout'
import type { KeyDef, EncoderDef } from '../lib/layout'
import { resolveKeyboardEvent, resolveMouseEvent } from '../lib/keymap'
import { createInitialState, getProgress } from '../lib/state'
import type { TestState, KeyState, EncoderState, EventLogEntry } from '../lib/state'
import { detectChattering } from '../lib/chattering'

const LOG_MAX = 100
const ENCODER_SIZE = 72

const LEFT_CONTAINER_W = (6.5 + 1) * UNIT  // 480
const LEFT_CONTAINER_H = (3 + 1) * UNIT    // 256
const RIGHT_CONTAINER_W = (15 - 8.5 + 1) * UNIT // 480
const RIGHT_CONTAINER_H = (3 + 1) * UNIT   // 256

function statusToState(status: KeyState['status'], isPressed: boolean, isUntestable: boolean): KeyCapState {
  if (isUntestable) return 'tester-untestable'
  if (isPressed) return 'tester-pressed'
  switch (status) {
    case 'tested':
      return 'tester-tested'
    case 'chattering':
      return 'tester-error'
    default:
      return 'tester-idle'
  }
}

function TesterKey({ keyDef, keyState, side }: { keyDef: KeyDef; keyState: KeyState | undefined; side: 'left' | 'right' }) {
  const status = keyState?.status ?? 'untested'
  const isPressed = keyState?.isPressed ?? false
  const chatterCount = keyState?.chatterCount ?? 0
  const isUntestable = keyDef.testability === 'untestable'

  const x = side === 'right' ? keyDef.x - RIGHT_X_OFFSET : keyDef.x
  const left = x * UNIT + KEY_OFFSET
  const top = keyDef.y * UNIT + KEY_OFFSET

  return (
    <KeyCap
      state={statusToState(status, isPressed, isUntestable)}
      asButton={false}
      class="absolute text-[11px]"
      style={`width:${KEY_SIZE}px;height:${KEY_SIZE}px;left:${left}px;top:${top}px;`}
    >
      <span>{keyDef.label}</span>
      {chatterCount > 0 && (
        <span class="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-danger text-danger-fg text-[9px] font-bold leading-none px-1">
          {chatterCount}
        </span>
      )}
    </KeyCap>
  )
}

function EncoderWidget({
  encoder,
  encoderState,
  isFocused,
  onFocus,
}: {
  encoder: EncoderDef
  encoderState: EncoderState | undefined
  isFocused: boolean
  onFocus: (id: string) => void
}) {
  const cw = encoderState?.clockwiseCount ?? 0
  const ccw = encoderState?.counterClockwiseCount ?? 0
  const isTested = encoderState?.isTested ?? false

  let borderClass: string
  if (isFocused) {
    borderClass = 'border-blue-500 shadow-[0_0_16px_rgba(59,130,246,0.5)]'
  } else if (isTested) {
    borderClass = 'border-emerald-500'
  } else {
    borderClass = 'border-border'
  }

  return (
    <div class="flex flex-col items-center gap-1">
      <button
        type="button"
        data-encoder={encoder.id}
        class={`rounded-full bg-surface-3 border-2 flex flex-col items-center justify-center font-mono text-[10px] text-fg-muted transition-all duration-150 cursor-pointer hover:border-border-strong ${borderClass}`}
        style={{ width: `${ENCODER_SIZE}px`, height: `${ENCODER_SIZE}px` }}
        onMouseDown={(e: MouseEvent) => {
          e.stopPropagation()
          onFocus(encoder.id)
        }}
      >
        <span>{encoder.label}</span>
        <span class="text-[9px] text-fg-subtle mt-0.5">
          &#x21bb; {cw} / &#x21ba; {ccw}
        </span>
      </button>
      <span class="text-[10px] text-fg-subtle font-mono">
        {isFocused ? 'selected' : 'click to select'}
      </span>
    </div>
  )
}

function EventLog({ entries }: { entries: EventLogEntry[] }) {
  const logRef = useRef<HTMLDivElement>(null)

  return (
    <div class="w-full">
      <div class="text-xs font-mono text-fg-subtle mb-1">Event Log</div>
      <div
        ref={logRef}
        class="h-48 overflow-y-auto bg-surface-1 border border-border rounded-md p-2 font-mono text-xs"
      >
        {entries.length === 0 ? (
          <div class="text-fg-subtle text-center mt-8">
            Waiting for input...
          </div>
        ) : (
          [...entries].reverse().map((entry) => {
            const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              fractionalSecondDigits: 3,
            } as Intl.DateTimeFormatOptions)

            let typeColor = 'text-fg-muted'
            if (entry.type === 'keyup' || entry.type === 'mouseup') {
              typeColor = 'text-fg-subtle'
            }
            if (entry.isChattering) {
              typeColor = 'text-red-400'
            }

            const detail = entry.isChattering
              ? `CHATTER (${entry.chatterInterval}ms)`
              : ''

            return (
              <div key={entry.id} class={`flex gap-3 py-0.5 ${typeColor}`}>
                <span class="text-fg-subtle shrink-0">{time}</span>
                <span class="w-20 shrink-0">{entry.type}</span>
                <span class="w-24 shrink-0">{entry.label}</span>
                <span>{detail}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default function KeyboardTester() {
  const [state, setState] = useState<TestState>(() => createInitialState())

  useEffect(() => {
    const addLogEntry = (
      prev: TestState,
      type: EventLogEntry['type'],
      label: string,
      isChattering: boolean,
      chatterInterval?: number,
    ): EventLogEntry[] => {
      const newEntry: EventLogEntry = {
        id: prev.logIdCounter,
        timestamp: Date.now(),
        type,
        label,
        isChattering,
        chatterInterval,
      }
      const newLog = [...prev.eventLog, newEntry]
      if (newLog.length > LOG_MAX) {
        return newLog.slice(newLog.length - LOG_MAX)
      }
      return newLog
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      if (e.repeat) return

      const keyDef = resolveKeyboardEvent(e)
      if (!keyDef) {
        setState((prev) => ({
          ...prev,
          eventLog: addLogEntry(prev, 'keydown', `? code=${e.code} key=${e.key}`, false),
          logIdCounter: prev.logIdCounter + 1,
        }))
        return
      }

      const now = Date.now()

      setState((prev) => {
        const newKeys = new Map(prev.keys)
        const existing = newKeys.get(keyDef.index)
        if (!existing) return prev

        const keyState = { ...existing }
        const chatter = detectChattering(keyState.lastKeyupTime, now)

        keyState.isPressed = true
        keyState.pressCount += 1
        keyState.lastKeydownTime = now

        if (chatter.isChattering) {
          keyState.status = 'chattering'
          keyState.chatterCount += 1
        } else {
          if (keyState.status !== 'chattering') {
            keyState.status = 'pressed'
          }
        }

        newKeys.set(keyDef.index, keyState)

        const testedCount = countTested(newKeys)

        return {
          ...prev,
          keys: newKeys,
          testedCount,
          eventLog: addLogEntry(prev, 'keydown', keyDef.label, chatter.isChattering, chatter.isChattering ? chatter.interval : undefined),
          logIdCounter: prev.logIdCounter + 1,
        }
      })
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault()

      const keyDef = resolveKeyboardEvent(e)
      if (!keyDef) {
        setState((prev) => ({
          ...prev,
          eventLog: addLogEntry(prev, 'keyup', `? code=${e.code} key=${e.key}`, false),
          logIdCounter: prev.logIdCounter + 1,
        }))
        return
      }

      const now = Date.now()

      setState((prev) => {
        const newKeys = new Map(prev.keys)
        const existing = newKeys.get(keyDef.index)
        if (!existing) return prev

        const keyState = { ...existing }
        keyState.isPressed = false
        keyState.lastKeyupTime = now

        if (keyState.status === 'pressed') {
          keyState.status = 'tested'
        }

        newKeys.set(keyDef.index, keyState)

        const testedCount = countTested(newKeys)

        return {
          ...prev,
          keys: newKeys,
          testedCount,
          eventLog: addLogEntry(prev, 'keyup', keyDef.label, false),
          logIdCounter: prev.logIdCounter + 1,
        }
      })
    }

    const handleMouseDown = (e: MouseEvent) => {
      // Ignore clicks on encoder widgets
      const target = e.target as HTMLElement
      if (target.closest('[data-encoder]')) return

      const keyDef = resolveMouseEvent(e)
      if (!keyDef) return

      const now = Date.now()

      setState((prev) => {
        const newKeys = new Map(prev.keys)
        const existing = newKeys.get(keyDef.index)
        if (!existing) return prev

        const keyState = { ...existing }
        const chatter = detectChattering(keyState.lastKeyupTime, now)

        keyState.isPressed = true
        keyState.pressCount += 1
        keyState.lastKeydownTime = now

        if (chatter.isChattering) {
          keyState.status = 'chattering'
          keyState.chatterCount += 1
        } else {
          if (keyState.status !== 'chattering') {
            keyState.status = 'pressed'
          }
        }

        newKeys.set(keyDef.index, keyState)

        const testedCount = countTested(newKeys)

        return {
          ...prev,
          keys: newKeys,
          testedCount,
          eventLog: addLogEntry(prev, 'mousedown', keyDef.label, chatter.isChattering, chatter.isChattering ? chatter.interval : undefined),
          logIdCounter: prev.logIdCounter + 1,
        }
      })
    }

    const handleMouseUp = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-encoder]')) return

      const keyDef = resolveMouseEvent(e)
      if (!keyDef) return

      const now = Date.now()

      setState((prev) => {
        const newKeys = new Map(prev.keys)
        const existing = newKeys.get(keyDef.index)
        if (!existing) return prev

        const keyState = { ...existing }
        keyState.isPressed = false
        keyState.lastKeyupTime = now

        if (keyState.status === 'pressed') {
          keyState.status = 'tested'
        }

        newKeys.set(keyDef.index, keyState)

        const testedCount = countTested(newKeys)

        return {
          ...prev,
          keys: newKeys,
          testedCount,
          eventLog: addLogEntry(prev, 'mouseup', keyDef.label, false),
          logIdCounter: prev.logIdCounter + 1,
        }
      })
    }

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()

      setState((prev) => {
        if (!prev.focusedEncoder) return prev

        const newEncoders = new Map(prev.encoders)
        const existing = newEncoders.get(prev.focusedEncoder)
        if (!existing) return prev

        const encoderState = { ...existing }
        const direction = e.deltaY > 0 ? 'cw' : 'ccw'

        if (direction === 'cw') {
          encoderState.clockwiseCount += 1
        } else {
          encoderState.counterClockwiseCount += 1
        }
        encoderState.lastEventTime = Date.now()
        encoderState.isTested = true

        newEncoders.set(prev.focusedEncoder, encoderState)

        const encoderDef = ENCODERS.find((enc) => enc.id === prev.focusedEncoder)
        const label = encoderDef ? `${encoderDef.label} ${direction === 'cw' ? 'CW' : 'CCW'}` : prev.focusedEncoder

        return {
          ...prev,
          encoders: newEncoders,
          eventLog: addLogEntry(prev, 'wheel', label, false),
          logIdCounter: prev.logIdCounter + 1,
        }
      })
    }

    const handleContextMenu = (e: Event) => {
      e.preventDefault()
    }

    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('keyup', handleKeyUp, true)
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('wheel', handleWheel, { passive: false })
    document.addEventListener('contextmenu', handleContextMenu)

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('keyup', handleKeyUp, true)
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('wheel', handleWheel)
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [])

  const leftKeys = KEYS.filter((k) => k.side === 'left')
  const rightKeys = KEYS.filter((k) => k.side === 'right')
  const leftEncoder = ENCODERS.find((e) => e.side === 'left')!
  const rightEncoder = ENCODERS.find((e) => e.side === 'right')!
  const { tested, total, percent } = getProgress(state)

  const handleReset = useCallback(() => {
    setState(createInitialState())
  }, [])

  const handleEncoderFocus = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      focusedEncoder: prev.focusedEncoder === id ? null : id,
    }))
  }, [])

  return (
    <div class="min-h-screen bg-surface-0 text-fg p-6 flex flex-col items-center gap-6 select-none">
      {/* Header */}
      <div class="w-full max-w-[1040px] flex flex-col gap-3">
        <div class="flex items-center justify-between">
          <h1 class="text-lg font-mono font-bold text-fg">dax5 Key Tester</h1>
          <button
            type="button"
            onMouseDown={(e: MouseEvent) => e.stopPropagation()}
            onClick={handleReset}
            class="px-4 py-2 text-sm font-mono bg-surface-3 border border-border text-fg-muted rounded hover:border-border-strong hover:text-fg transition-colors"
          >
            Reset
          </button>
        </div>

        {/* Progress Bar */}
        <div class="flex items-center gap-3">
          <div class="flex-1 h-2 bg-surface-3 rounded-full overflow-hidden">
            <div
              class="h-full bg-emerald-500 rounded-full transition-all duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span class="text-xs font-mono text-fg-muted shrink-0">
            {tested}/{total} ({Math.round(percent)}%)
          </span>
        </div>
      </div>

      {/* Keyboard Layout */}
      <div class="flex items-start gap-8">
        {/* Left half */}
        <div class="flex flex-col items-center gap-3">
          <EncoderWidget
            encoder={leftEncoder}
            encoderState={state.encoders.get(leftEncoder.id)}
            isFocused={state.focusedEncoder === leftEncoder.id}
            onFocus={handleEncoderFocus}
          />
          <div
            class="relative"
            style={{ width: `${LEFT_CONTAINER_W}px`, height: `${LEFT_CONTAINER_H}px` }}
          >
            {leftKeys.map((keyDef) => (
              <TesterKey
                key={keyDef.index}
                keyDef={keyDef}
                keyState={state.keys.get(keyDef.index)}
                side="left"
              />
            ))}
          </div>
        </div>

        {/* Right half */}
        <div class="flex flex-col items-center gap-3">
          <EncoderWidget
            encoder={rightEncoder}
            encoderState={state.encoders.get(rightEncoder.id)}
            isFocused={state.focusedEncoder === rightEncoder.id}
            onFocus={handleEncoderFocus}
          />
          <div
            class="relative"
            style={{ width: `${RIGHT_CONTAINER_W}px`, height: `${RIGHT_CONTAINER_H}px` }}
          >
            {rightKeys.map((keyDef) => (
              <TesterKey
                key={keyDef.index}
                keyDef={keyDef}
                keyState={state.keys.get(keyDef.index)}
                side="right"
              />
            ))}
          </div>
        </div>
      </div>

      {/* Event Log */}
      <div class="w-full max-w-[1040px]">
        <EventLog entries={state.eventLog} />
      </div>
    </div>
  )
}

/** Count keys that are tested or chattering (both count as "tested") */
function countTested(keys: Map<number, KeyState>): number {
  let count = 0
  keys.forEach((keyState, index) => {
    const keyDef = KEYS.find((k) => k.index === index)
    if (!keyDef || keyDef.testability === 'untestable') return
    if (keyState.status === 'tested' || keyState.status === 'chattering') {
      count += 1
    }
  })
  return count
}
