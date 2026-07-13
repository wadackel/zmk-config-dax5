import type { BoardBranding } from '../types'

export const branding: BoardBranding = {
  title: 'dax5 Keyboard Tester',
  shortLabel: 'dax5',
  subtitle: (layerCount) => `dax5 · 44 keys · ${layerCount} layers`,
  encoderLabel: '2 rotary encoders',
  gestureLabel: 'trackball · stroke directions',
  testerHeaderLabel: (keyCount) => `dax5 · ${keyCount} keys · Auto-detect keyboard chatter`,
  pngFileName: 'dax5-layers.png',
  reloadGuardSymbolKey: 'dax5-keymap-reload-guard',
}
