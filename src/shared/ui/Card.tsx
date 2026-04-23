import React from 'react'

type CardProps = {
  className?: string
  children?: React.ReactNode
  as?: React.ElementType
} & React.HTMLAttributes<HTMLElement>

export function Card({ className = '', children, as: Tag = 'div', ...rest }: CardProps) {
  return (
    <Tag
      className={[
        'rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </Tag>
  )
}
