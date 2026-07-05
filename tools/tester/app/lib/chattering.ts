export const CHATTER_THRESHOLD_MS = 50

export interface ChatterResult {
  isChattering: boolean
  interval: number
}

/**
 * keydown イベント発生時にチャタリングを検出する。
 * lastKeyupTime から 50ms 未満で keydown が来たらチャタリングと判定。
 */
export function detectChattering(lastKeyupTime: number, currentTime: number): ChatterResult {
  if (lastKeyupTime === 0) {
    return { isChattering: false, interval: 0 }
  }

  const interval = currentTime - lastKeyupTime

  return {
    isChattering: interval < CHATTER_THRESHOLD_MS,
    interval,
  }
}
