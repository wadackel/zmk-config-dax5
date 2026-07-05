import type { JSX } from 'hono/jsx'

export type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'subtle' | 'plain'
export type ButtonSize = 'xs' | 'sm' | 'md'

export type ButtonProps = Omit<JSX.IntrinsicElements['button'], 'size' | 'type'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  type?: 'button' | 'submit' | 'reset'
}

const BASE =
  'inline-flex items-center justify-center gap-1.5 font-medium select-none whitespace-nowrap rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

const SIZE: Record<ButtonSize, string> = {
  xs: 'text-[11px] px-2 py-0.5',
  sm: 'text-xs px-2.5 py-1',
  md: 'text-sm px-3 py-1.5',
}

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-hover',
  ghost:
    'bg-transparent text-fg-muted border border-border hover:text-fg hover:bg-surface-3',
  subtle: 'bg-surface-3 text-fg border border-border hover:bg-surface-4',
  danger: 'bg-danger text-danger-fg hover:brightness-110',
  plain:
    'bg-transparent text-fg-muted hover:text-fg hover:bg-surface-3 border border-transparent',
}

export function Button({
  variant = 'ghost',
  size = 'md',
  type = 'button',
  class: className,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      class={[BASE, SIZE[size], VARIANT[variant], className || ''].join(' ')}
    />
  )
}
