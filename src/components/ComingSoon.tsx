'use client'

import { useState } from 'react'
import type { Media } from '../types'
import {
  WEEKDAY_LABELS,
  buildMonthGrids,
  countdownLabel,
  daysUntil,
  groupByMonth,
} from '../lib/releaseCalendar'
import type { DayCell, DatedEntry, MonthGrid } from '../lib/releaseCalendar'

/**
 * The Coming Soon view, drawn the way TMDB draws its release calendar: one month
 * grid at a time, seven fixed columns of day cells running Sun–Sat, and the
 * releases for a date nested inside that date's own cell.
 *
 * Only one month is on screen. A calendar is only a calendar if it shows a month
 * at a glance — stacking every month down the page turns the whole thing back
 * into the release list it replaced, and there are routinely twenty of them.
 *
 * The data is unchanged from the row-based version: `groupByMonth` still supplies
 * the month groups and the undated bucket, and the same handlers are wired to the
 * same cards. Only the arrangement changed.
 */

/** Day cell bodies get taller than this before further posters are collapsed. */
const POSTERS_PER_CELL = 2

/** Poster with the same "no artwork" glyph the grid uses when TMDB has none. */
function Thumb({ media }: { media: Media }) {
  const [failed, setFailed] = useState(false)

  if (!media.poster || failed) {
    return (
      <span
        aria-hidden="true"
        data-calendar-poster
        className="flex w-full items-center justify-center rounded-md bg-surface-3 py-2 text-base ring-1 ring-line"
      >
        🎬
      </span>
    )
  }
  return (
    <img
      src={media.poster}
      alt=""
      data-calendar-poster
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-full rounded-md object-cover ring-1 ring-line"
    />
  )
}

/**
 * One title inside a day cell: poster, title, and a watchlist toggle that stays
 * reachable without opening the title's page.
 *
 * The toggle is a real button with `aria-pressed` rather than a glyph inside the
 * card button, so a cell holds two buttons and not two nested ones.
 */
function CellCard({
  entry,
  saved,
  onSelect,
  onToggleWatchlist,
}: {
  entry: DatedEntry
  saved: boolean
  onSelect: () => void
  onToggleWatchlist: () => void
}) {
  const { media } = entry

  return (
    <li className="group/card relative">
      <button
        type="button"
        onClick={onSelect}
        className="block w-full rounded-lg text-left focus-visible:ring-2 focus-visible:ring-accent"
      >
        <span className="block">
          <Thumb media={media} />
        </span>
        {/* `break-words` rather than relying on the clamp: a single unbroken word
            is wider than a 49px cell, and it pushed the cell's scroll width
            past its own box. The line clamp still caps the height. */}
        <span className="mt-1 block break-words text-[11px] font-semibold leading-tight text-ink-soft transition group-hover/card:text-accent">
          <span className="line-clamp-2">{media.title}</span>
        </span>
        {media.genres.length > 0 && (
          <span className="mt-0.5 block truncate text-[10px] text-ink-muted">
            {media.genres.slice(0, 2).join(', ')}
          </span>
        )}
      </button>

      <button
        type="button"
        onClick={onToggleWatchlist}
        aria-pressed={saved}
        aria-label={
          saved
            ? `Remove ${media.title} from watchlist`
            : `Add ${media.title} to watchlist`
        }
        title={saved ? 'Remove from watchlist' : 'Add to watchlist'}
        className={`absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold shadow-neon-soft transition focus-visible:ring-2 focus-visible:ring-accent ${
          saved
            ? 'bg-score-high text-page'
            : 'bg-page/80 text-ink-soft ring-1 ring-line opacity-0 hover:bg-accent hover:text-page group-hover/card:opacity-100 focus-visible:opacity-100'
        }`}
      >
        <span aria-hidden="true">{saved ? '✓' : '＋'}</span>
      </button>
    </li>
  )
}

/**
 * One day of the grid.
 *
 * A day with nothing in it still renders its number, because a calendar with
 * gaps in it is not a calendar — the shape of the month is the information. Days
 * from the neighbouring months are drawn at reduced contrast so the current month
 * reads as a block rather than as an island.
 */
function Day({ cell, saved, onSelect, onToggleWatchlist }: {
  cell: DayCell
  saved: (media: Media) => boolean
  onSelect: (media: Media) => void
  onToggleWatchlist: (media: Media) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const days = cell.entries.length > 0 ? daysUntil(cell.date, new Date()) : null
  const visible = expanded ? cell.entries : cell.entries.slice(0, POSTERS_PER_CELL)
  const hidden = cell.entries.length - visible.length

  return (
    <div
      data-calendar-cell={cell.key}
      className={`flex min-h-[7.5rem] flex-col gap-1.5 border-b border-r border-line p-1.5 sm:min-h-[9rem] sm:p-2 ${
        cell.inMonth ? 'bg-page/20' : 'bg-page/5'
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        {/* The number is the cell's anchor, so it is bold on the current month,
            muted on padding days, and ringed on today. */}
        <span
          aria-current={cell.isToday ? 'date' : undefined}
          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
            cell.isToday
              ? 'bg-accent text-page'
              : cell.inMonth
                ? 'text-ink'
                : 'text-ink-muted/50'
          }`}
        >
          {cell.date.getDate()}
        </span>
        {/* `sm:inline-flex` rather than always-on: at 375px a cell is 49px wide
            and the day number plus this badge together overflow it. Below `sm`
            the badge's own information survives as the tooltip, and "today" is
            already carried by the filled date pill. */}
        {days !== null && days >= 0 && days <= 30 && cell.entries.length > 0 && (
          <span
            data-cell-badge={countdownLabel(days)}
            className="hidden rounded-full bg-accent/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent sm:inline-flex"
            title={countdownLabel(days)}
          >
            {days === 0 ? 'today' : `${days}d`}
          </span>
        )}
      </div>

      {cell.entries.length > 0 ? (
        <>
          {/*
            A scrolling body rather than an unbounded one. A release-heavy day
            would otherwise stretch its whole week row — a 6-title day made one
            row three times the height of every other, and the month lost its
            grid entirely. The cell scrolls instead, which keeps every week row
            the same height and the month readable at a glance.
          */}
          <div className="h-[13rem] overflow-y-auto sm:h-[17rem]">
          <ul className="space-y-1.5">
            {visible.map((entry) => (
              <CellCard
                key={`${entry.media.type}-${entry.media.id}`}
                entry={entry}
                saved={saved(entry.media)}
                onSelect={() => onSelect(entry.media)}
                onToggleWatchlist={() => onToggleWatchlist(entry.media)}
              />
            ))}
          </ul>
          </div>
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="self-start rounded-md px-1 py-0.5 text-[10px] font-bold text-accent transition hover:bg-accent/10"
            >
              +{hidden} more
            </button>
          )}
        </>
      ) : (
        // Keeps the cell a fixed minimum height without a spacer element, so the
        // grid's row rhythm does not depend on which days have releases.
        <span aria-hidden="true" className="flex-1" />
      )}
    </div>
  )
}

/** One month: heading, weekday header, and the 7-column body. */
function MonthPanel({
  grid,
  saved,
  onSelect,
  onToggleWatchlist,
  onPrev,
  onNext,
  isFirst,
  isLast,
}: {
  grid: MonthGrid
  saved: (media: Media) => boolean
  onSelect: (media: Media) => void
  onToggleWatchlist: (media: Media) => void
  onPrev: () => void
  onNext: () => void
  isFirst: boolean
  isLast: boolean
}) {
  return (
    <section aria-label={`Releases in ${grid.label}`}>
      {/* ---- Month heading with paging ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
            {/* From the grid's own month, not from its first cell: the first
                cell is often a padding day belonging to the month before. */}
            {new Date(grid.year, grid.month, 1).toLocaleDateString('en-US', {
              month: 'long',
            })}{' '}
            <span className="text-ink-muted">{grid.year}</span>
          </h3>
          <p className="mt-0.5 text-xs font-semibold text-ink-muted">
            {grid.entryCount} title{grid.entryCount === 1 ? '' : 's'} releasing
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            disabled={isFirst}
            aria-label="Previous month"
            className="icon-btn disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m15 5-7 7 7 7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={isLast}
            aria-label="Next month"
            className="icon-btn disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m9 5 7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* ---- Weekday header: its own grid so the columns line up with the body
              without either side having to know the other's markup. ---- */}
      <div className="mt-4 grid grid-cols-7 overflow-hidden rounded-t-xl ring-1 ring-line">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            data-weekday={label}
            className="bg-surface/70 px-1 py-2 text-center text-[10px] font-bold uppercase tracking-[0.15em] text-ink-muted last:border-r-0"
          >
            {/* The full weekday for screen readers, the short one on screen: a
                header reading "T T" three times is unreadable. */}
            <span aria-hidden="true">{label.slice(0, 1)}</span>
            <span className="sr-only">{label}</span>
          </div>
        ))}
      </div>

      {/* ---- The grid itself ---- */}
      <div className="grid grid-cols-7 overflow-hidden rounded-b-xl ring-1 ring-line">
        {grid.weeks.map((week) => (
          <div key={week[0].key} data-calendar-week={week[0].key} className="contents">
            {week.map((cell) => (
              <Day
                key={cell.key}
                cell={cell}
                saved={saved}
                onSelect={onSelect}
                onToggleWatchlist={onToggleWatchlist}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

export function ComingSoonCalendar({
  items,
  isSaved,
  onSelect,
  onToggleWatchlist,
}: {
  items: Media[]
  isSaved: (media: Media) => boolean
  onSelect: (media: Media) => void
  onToggleWatchlist: (media: Media) => void
}) {
  const groups = groupByMonth(items)
  const grids = buildMonthGrids(groups)
  const [index, setIndex] = useState(0)

  // The selected month is clamped rather than stored per mount: paging past the
  // end (or back past the start) lands on the last month rather than blanking
  // the grid, and a month can disappear when the feed reloads underneath.
  const active = index < grids.length ? index : Math.max(0, grids.length - 1)
  const undated = groups.find((group) => group.key === 'undated')

  if (grids.length === 0 && undated === undefined) {
    return (
      <div className="py-20 text-center text-ink-muted">
        <p className="text-4xl">🗓️</p>
        <p className="mt-4 text-lg font-semibold">No upcoming releases found</p>
        <p className="mt-1 text-sm">Try a different genre or clear the search.</p>
      </div>
    )
  }

  const grid = grids[active]

  return (
    <div className="space-y-8">
      {grid && (
        <MonthPanel
          key={grid.key}
          grid={grid}
          saved={isSaved}
          onSelect={onSelect}
          onToggleWatchlist={onToggleWatchlist}
          onPrev={() => setIndex(Math.max(0, active - 1))}
          onNext={() => setIndex(Math.min(grids.length - 1, active + 1))}
          isFirst={active === 0}
          isLast={active === grids.length - 1}
        />
      )}

      {grids.length > 1 && (
        /* A month is the unit here, so the stepper names how far through the
           releases you are rather than just "page 4 of 19". */
        <p aria-live="polite" className="text-center text-xs text-ink-muted">
          Month {active + 1} of {grids.length} ·{' '}
          {grids.slice(0, active + 1).reduce((sum, g) => sum + g.entryCount, 0)} of{' '}
          {grids.reduce((sum, g) => sum + g.entryCount, 0)} releases shown
        </p>
      )}

      {/* Titles TMDB has no date for cannot be placed in a cell, so they get a
          list of their own rather than being dropped. */}
      {undated && active === grids.length - 1 && (
        <section aria-labelledby="undated-releases">
          <h3
            id="undated-releases"
            className="text-sm font-extrabold uppercase tracking-[0.18em] text-accent"
          >
            Date to be announced
          </h3>
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {undated.entries.map((entry) => (
              <li key={`${entry.media.type}-${entry.media.id}`}>
                <button
                  type="button"
                  onClick={() => onSelect(entry.media)}
                  className="block w-full rounded-lg text-left focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <span className="block">
                    <Thumb media={entry.media} />
                  </span>
                  <span className="mt-1.5 block text-xs font-semibold leading-tight text-ink-soft">
                    <span className="line-clamp-2">{entry.media.title}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
