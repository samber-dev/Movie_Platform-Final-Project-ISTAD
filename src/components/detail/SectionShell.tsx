'use client'

import type { ReactNode } from 'react'

export function SectionShell({
  id,
  title,
  subtitle,
  action,
  children,
}: {
  id: string
  title: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2
            id={`${id}-heading`}
            className="text-xl font-bold text-ink md:text-2xl"
          >
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function SectionMessage({
  tone = 'muted',
  children,
  onRetry,
}: {
  tone?: 'muted' | 'error'
  children: ReactNode
  onRetry?: () => void
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-surface/70 p-5 text-sm ring-1 ring-line">
      <p className={tone === 'error' ? 'text-ink' : 'text-ink-muted'}>{children}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-surface-2 px-4 py-1.5 text-xs font-bold text-ink transition hover:bg-surface-3"
        >
          Try again
        </button>
      )}
    </div>
  )
}

export function CardSkeleton({
  count,
  className,
}: {
  count: number
  className: string
}) {
  return (
    <div className="mt-4 flex gap-4 overflow-hidden" aria-hidden="true">
      {Array.from({ length: count }, (_, n) => (
        <div
          key={n}
          className={`shrink-0 animate-pulse rounded-xl bg-surface-2 ${className}`}
        />
      ))}
    </div>
  )
}
