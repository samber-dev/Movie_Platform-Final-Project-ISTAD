import type { Media } from '../types'

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * TMDB sends bare `YYYY-MM-DD` strings, which `new Date()` reads as UTC
 * midnight — that renders as the previous day west of Greenwich, and a release
 * date is exactly the field that must not drift. The parts are read into a local
 * date instead.
 */
export function parseReleaseDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

/** Whole days from today to `date`; negative once it has passed. */
export function daysUntil(date: Date, today: Date): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.round((end.getTime() - start.getTime()) / 86400000)
}

/** "Today", "Tomorrow", "in 5 days", "in 6 weeks", "in 4 months", "in 2 years". */
export function countdownLabel(days: number): string {
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  const span = Math.abs(days)
  if (days < 0) return span < 31 ? `${span} days ago` : 'Already released'
  if (span < 31) return `in ${span} days`
  if (span < 365) {
    // Weeks up to nine, months past that. `<= 9` rather than `< 9` so exactly
    // nine weeks reads as "in 9 weeks" instead of flipping to "in 2 months" a
    // fortnight early.
    const weeks = Math.round(span / 7)
    return weeks <= 9 ? `in ${weeks} weeks` : `in ${Math.round(span / 30)} months`
  }
  const years = Math.round(span / 365)
  return `in ${years} year${years === 1 ? '' : 's'}`
}

export function formatLongDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/** The short month label used in a release card's day stamp. */
export function shortMonth(date: Date): string {
  return SHORT_MONTHS[date.getMonth()]
}

type Dated = { media: Media; date: Date }

export type MonthGroup = {
  /** `YYYY-MM` for dated months, `undated` for the trailing TBA bucket. */
  key: string
  label: string
  entries: Dated[]
}

/**
 * Buckets titles into release months, earliest first.
 *
 * Titles TMDB has no date for are collected into a trailing "date to be
 * announced" group rather than dropped: a calendar cannot place a date it does
 * not have, but silently hiding real upcoming releases is worse.
 */
export function groupByMonth(items: Media[]): MonthGroup[] {
  const byMonth = new Map<string, MonthGroup>()
  const undated: Media[] = []
  const today = new Date()

  for (const media of items) {
    const date = parseReleaseDate(media.releaseDate)
    if (date === null) {
      undated.push(media)
      continue
    }
    const year = date.getFullYear()
    const month = date.getMonth()
    const key = `${year}-${String(month + 1).padStart(2, '0')}`
    let group = byMonth.get(key)
    if (group === undefined) {
      group = { key, label: `${shortMonth(date)} ${year}`, entries: [] }
      byMonth.set(key, group)
    }
    group.entries.push({ media, date })
  }

  // Zero-padded keys sort chronologically as plain strings.
  const groups = [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key))
  for (const group of groups) {
    group.entries.sort((a, b) => a.date.getTime() - b.date.getTime())
  }

  if (undated.length > 0) {
    groups.push({
      key: 'undated',
      label: 'Date to be announced',
      entries: undated.map((media) => ({ media, date: today })),
    })
  }
  return groups
}
