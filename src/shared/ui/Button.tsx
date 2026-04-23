import React from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-accent-strong)] text-[var(--color-bg)] hover:bg-[var(--color-accent)] focus-visible:ring-[var(--color-accent-strong)] font-semibold',
  secondary:
    'border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text)] hover:bg-[var(--color-surface)] focus-visible:ring-[var(--color-border)]',
  ghost:
    'bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)] focus-visible:ring-[var(--color-border)]',
  danger:
    'bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/40 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/20 focus-visible:ring-[var(--color-danger)]',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-5 py-2.5 text-sm rounded-xl',
  lg: 'px-7 py-3.5 text-base rounded-xl',
}

type BaseProps = {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  children?: React.ReactNode
  disabled?: boolean
}

type AsButton = BaseProps & { as?: 'button' } & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof BaseProps | 'as'>
type AsAnchor = BaseProps & { as: 'a' } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof BaseProps | 'as'>

type ButtonProps = AsButton | AsAnchor

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  disabled,
  as,
  ...rest
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)] disabled:opacity-50 disabled:cursor-not-allowed'

  const classes = [base, variantClasses[variant], sizeClasses[size], className]
    .filter(Boolean)
    .join(' ')

  if (as === 'a') {
    const anchorProps = rest as React.AnchorHTMLAttributes<HTMLAnchorElement>
    return (
      <a className={classes} {...anchorProps}>
        {children}
      </a>
    )
  }

  const buttonProps = rest as React.ButtonHTMLAttributes<HTMLButtonElement>
  return (
    <button className={classes} disabled={disabled} {...buttonProps}>
      {children}
    </button>
  )
}
