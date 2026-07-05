import type { Child, JSX } from 'hono/jsx'

/**
 * Semantic states for a keyboard cap. The concrete visual (background,
 * border, ring, shadow) is derived by CSS from these tokens so Editor and
 * Tester share a single vocabulary — the same `data-state="pressed"` reads
 * the same way in either context.
 */
export type KeyCapState =
  /** Default — neutral cell. */
  | 'idle'
  /** Hovered in the Editor edit mode (accent border). */
  | 'hover'
  /** Selected as a paste target in the Editor copy mode. */
  | 'selected'
  /** Copy-mode hover, clipboard has content — success border. */
  | 'clip-target'
  /** Copy-mode hover, clipboard empty — warning border to hint "pick source". */
  | 'clip-source'
  /** Tester: not yet exercised. */
  | 'tester-idle'
  /** Tester: successfully tested. */
  | 'tester-tested'
  /** Tester: currently pressed (glow). */
  | 'tester-pressed'
  /** Tester: chattering detected (danger). */
  | 'tester-error'
  /** Tester: physically absent / marked untestable. */
  | 'tester-untestable'

// `position` is deliberately omitted from BASE so callers can choose between
// `relative` (Editor cells, whose top/sub labels are positioned inside) and
// `absolute` (Tester cells, positioned via left/top style props). Adding
// `relative` here made `absolute` in the caller's class lose the Tailwind
// class-order tiebreaker, collapsing the Tester grid into normal flow.
const BASE =
  'w-16 h-16 flex flex-col items-center justify-center rounded-md border font-mono px-1 leading-tight text-center break-words transition-[colors,box-shadow,transform] duration-150 select-none'

const VARIANT: Record<KeyCapState, string> = {
  idle: 'bg-surface-3 border-border text-fg',
  hover: 'bg-surface-4 border-accent text-fg',
  selected:
    'bg-success-soft border-success ring-1 ring-success/60 text-fg shadow-[0_0_10px_rgb(16_185_129/0.25)]',
  'clip-target':
    'bg-surface-4 border-success text-fg shadow-[0_0_10px_rgb(16_185_129/0.35)]',
  'clip-source':
    'bg-surface-4 border-warning text-fg shadow-[0_0_10px_rgb(245_158_11/0.25)]',
  'tester-idle': 'bg-surface-3 border-border text-fg-muted',
  'tester-tested':
    'bg-accent-soft border-accent text-fg shadow-[0_0_12px_rgb(59_130_246/0.5)]',
  'tester-pressed':
    'bg-accent border-accent text-accent-fg shadow-[0_0_18px_rgb(59_130_246/0.75)] scale-[1.02]',
  'tester-error':
    'bg-danger-soft border-danger text-fg shadow-[0_0_12px_rgb(239_68_68/0.5)]',
  'tester-untestable':
    'bg-[repeating-linear-gradient(45deg,var(--color-surface-2),var(--color-surface-2)_6px,var(--color-surface-3)_6px,var(--color-surface-3)_10px)] border-border text-fg-subtle',
}

export type KeyCapProps = {
  state?: KeyCapState
  /**
   * When true, hover state gets a subtle raised effect. Non-interactive caps
   * (Tester's absolute-positioned keys used purely for display) should keep
   * this off.
   */
  interactive?: boolean
  /**
   * When true, the cap is rendered as a `<button>`. When false, a `<div>`
   * with role="presentation" — used by Tester where physical keys aren't
   * clickable.
   */
  asButton?: boolean
  /**
   * Add hoverable behavior. Combined with `asButton` this yields a
   * keyboard-focusable, clickable cell (Editor).
   */
  hoverable?: boolean
  disabled?: boolean
  title?: string
  ariaLabel?: string
  class?: string
  onClick?: JSX.IntrinsicElements['button']['onClick']
  onContextMenu?: JSX.IntrinsicElements['button']['onContextMenu']
  onMouseEnter?: JSX.IntrinsicElements['button']['onMouseEnter']
  onMouseLeave?: JSX.IntrinsicElements['button']['onMouseLeave']
  style?: string
  children?: Child
}

/**
 * Unified key-cap primitive shared by the keyboard tester and the editor
 * layer grid. Both render the same geometry / border / focus semantics; the
 * `state` prop drives the colour + glow variant so behaviour changes are
 * one-liner CSS tweaks instead of parallel implementations.
 */
export function KeyCap({
  state = 'idle',
  interactive = false,
  asButton = true,
  hoverable = false,
  disabled = false,
  title,
  ariaLabel,
  class: className,
  style,
  onClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  children,
}: KeyCapProps) {
  const hoverClass = hoverable && !disabled ? 'hover:bg-surface-4 cursor-pointer' : ''
  const interactiveClass = interactive && !disabled ? 'active:scale-[0.98]' : ''
  const composedClass = [BASE, VARIANT[state], hoverClass, interactiveClass, className || '']
    .join(' ')
    .trim()

  if (!asButton) {
    return (
      <div
        role="presentation"
        data-state={state}
        title={title}
        aria-label={ariaLabel}
        class={composedClass}
        style={style}
      >
        {children}
      </div>
    )
  }
  return (
    <button
      type="button"
      data-state={state}
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      class={composedClass}
      style={style}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </button>
  )
}
