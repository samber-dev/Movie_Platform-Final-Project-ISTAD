'use client'

import type { Media } from '../types'
import {
  countdownLabel,
  daysUntil,
  formatLongDate,
  groupByMonth,
  shortMonth,
} from '../lib/releaseCalendar'

function ReleaseCard({
  media,
  date,
  dated,
  saved,
  onSelect,
  onToggleWatchlist,
  onPlayTrailer,
}: {
  media: Media
  date: Date
  /** False for the "date TBA" bucket, where a date stamp would be a lie. */
  dated: boolean
  saved: boolean
  onSelect: () => void
  onToggleWatchlist: () => void
  onPlayTrailer: () => void
}) {
  const days = daysUntil(date, new Date())
  const soon = days >= 0 && days <= 30

  return (
    <li className="group relative flex gap-3 overflow-hidden rounded-2xl bg-surface/70 p-3 ring-1 ring-line transition hover:bg-surface-2">
      {dated ? (
        <div
          className={`flex w-14 shrink-0 flex-col items-center justify-center rounded-xl py-2 text-center ${
            soon ? 'bg-accent text-on-accent' : 'bg-surface-2 text-ink-soft'
          }`}
          aria-hidden="true"
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-80">
            {shortMonth(date)}
          </span>
          <span className="text-xl font-extrabold leading-tight">
            {date.getDate()}
          </span>
        </div>
      ) : (
        <div className="flex w-14 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-center text-[10px] font-bold uppercase tracking-[0.15em] text-ink-muted">
          TBA
        </div>
      )}

      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left focus-visible:ring-2 focus-visible:ring-accent"
      >
        <h3
          className="truncate text-base font-bold text-ink group-hover:text-accent"
          title={media.title}
        >
          {media.title}
        </h3>
        <p className="mt-0.5 text-xs text-ink-muted">
          {dated ? formatLongDate(date) : 'Release date not announced yet'}
        </p>
        {media.genres.length > 0 && (
          <p className="mt-0.5 truncate text-xs text-ink-soft">
            {media.genres.slice(0, 3).join(', ')}
          </p>
        )}
      </button>

      <div className="flex shrink-0 flex-col items-end justify-between gap-2">
        {dated && (
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
              soon
                ? 'bg-accent/15 text-accent ring-1 ring-accent/40'
                : 'bg-surface-2 text-ink-muted ring-1 ring-line'
            }`}
          >
            {countdownLabel(days)}
          </span>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPlayTrailer}
            aria-label={`Play trailer for ${media.title}`}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-ink ring-1 ring-line transition hover:bg-accent hover:text-page"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
              <path d="M8 5.5v13l11-6.5-11-6.5Z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onToggleWatchlist}
            aria-pressed={saved}
            aria-label={saved ? `Remove ${media.title} from watchlist` : `Add ${media.title} to watchlist`}
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ring-1 ring-line transition hover:scale-110 ${
              saved ? 'bg-accent text-page' : 'bg-surface-2 text-ink hover:bg-surface-3'
            }`}
          >
            {saved ? '✓' : '＋'}
          </button>
        </div>
      </div>
    </li>
  )
}

export function ComingSoonCalendar({
  items,
  isSaved,
  onSelect,
  onToggleWatchlist,
  onPlayTrailer,
}: {
  items: Media[]
  isSaved: (media: Media) => boolean
  onSelect: (media: Media) => void
  onToggleWatchlist: (media: Media) => void
  onPlayTrailer: (media: Media) => void
}) {
  const groups = groupByMonth(items)

  if (groups.length === 0) {
    return (
      <div className="py-20 text-center text-ink-muted">
        <p className="text-4xl">🗓️</p>
        <p className="mt-4 text-lg font-semibold">No upcoming releases found</p>
        <p className="mt-1 text-sm">Try a different genre or clear the search.</p>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`release-${group.key}`}>
          <div className="mb-4 flex items-baseline gap-3 border-b border-line pb-2">
            <h3
              id={`release-${group.key}`}
              className="text-lg font-bold text-ink"
            >
              {group.label}
            </h3>
            <span className="text-xs font-semibold text-ink-muted">
              {group.entries.length} title{group.entries.length === 1 ? '' : 's'}
            </span>
          </div>
          <ul className="grid gap-3 lg:grid-cols-2">
            {group.entries.map(({ media, date }) => (
              <ReleaseCard
                key={`${media.type}-${media.id}`}
                media={media}
                date={date}
                dated={group.key !== 'undated'}
                saved={isSaved(media)}
                onSelect={() => onSelect(media)}
                onToggleWatchlist={() => onToggleWatchlist(media)}
                onPlayTrailer={() => onPlayTrailer(media)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
