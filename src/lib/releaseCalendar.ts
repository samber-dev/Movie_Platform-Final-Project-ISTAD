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

export type DatedEntry = { media: Media; date: Date }

export type MonthGroup = {
  /** `YYYY-MM` for dated months, `undated` for the trailing TBA bucket. */
  key: string
  label: string
  entries: DatedEntry[]
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

/* ==========================================================================
   Month grid

   The month-groups above are the data. What follows lays one group out the way a
   wall calendar does: a fixed 7-column grid of day cells, weeks running Sun–Sat,
   with the releases for a given date nested inside that date's own cell.
   ========================================================================== */

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/**
 * One day cell. The leading and trailing days of the grid belong to the
 * neighbouring months, so they carry no releases and are drawn inert.
 */
export type DayCell = {
  /** Stable key for React: `YYYY-MM-DD`. */
  key: string
  date: Date
  /** False for the padding days borrowed from the month before or after. */
  inMonth: boolean
  isToday: boolean
  /** Releases landing on exactly this day. */
  entries: DatedEntry[]
}

/** One row of the grid: always seven cells, always Sun through Sat. */
export type WeekRow = DayCell[]

export type MonthGrid = {
  key: string
  label: string
  /** Zero-based month, kept so callers can render a month name without re-parsing. */
  month: number
  year: number
  weeks: WeekRow[]
  /** Releases that fall inside this month, for the month's "N titles" count. */
  entryCount: number
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * Lays one month's releases out as a 7-column grid of weeks.
 *
 * The grid always starts on the Sunday on or before the 1st and always ends on
 * the Saturday on or after the last day, so rows are full and every month has the
 * same shape. `Date.getDay()` returns 0 for Sunday, which is already the column
 * index, so no weekday arithmetic is needed to find the first cell.
 *
 * A month therefore has 4, 5 or 6 rows depending on where its 1st falls — the
 * grid never pads to six, because a wholly empty final week is visual noise.
 */
export function buildMonthGrid(
  group: MonthGroup,
  today: Date = new Date(),
): MonthGrid | null {
  if (group.key === 'undated') return null

  const [yearText, monthText] = group.key.split('-')
  const year = Number(yearText)
  const month = Number(monthText) - 1
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null

  // Grouped by day up front: a cell is filled by one lookup rather than a scan
  // over every release in the month.
  const byDay = new Map<string, DatedEntry[]>()
  for (const entry of group.entries) {
    const key = dayKey(entry.date)
    const existing = byDay.get(key)
    if (existing) existing.push(entry)
    else byDay.set(key, [entry])
  }

  const firstOfMonth = new Date(year, month, 1)
  const lastOfMonth = new Date(year, month + 1, 0)
  const gridStart = new Date(year, month, 1 - firstOfMonth.getDay())
  const gridEnd = new Date(year, month, lastOfMonth.getDate() + (6 - lastOfMonth.getDay()))

  const weeks: WeekRow[] = []
  const cursor = new Date(gridStart)
  while (cursor.getTime() <= gridEnd.getTime()) {
    const week: WeekRow = []
    for (let column = 0; column < 7; column += 1) {
      const key = dayKey(cursor)
      week.push({
        key,
        date: new Date(cursor),
        inMonth: cursor.getMonth() === month && cursor.getFullYear() === year,
        isToday: sameDay(cursor, today),
        entries: cursor.getMonth() === month ? (byDay.get(key) ?? []) : [],
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }

  return {
    key: group.key,
    label: group.label,
    month,
    year,
    weeks,
    entryCount: group.entries.length,
  }
}

/** Builds every month's grid, skipping the undated bucket. */
export function buildMonthGrids(
  groups: MonthGroup[],
  today: Date = new Date(),
): MonthGrid[] {
  const grids: MonthGrid[] = []
  for (const group of groups) {
    const grid = buildMonthGrid(group, today)
    if (grid !== null) grids.push(grid)
  }
  return grids
}
