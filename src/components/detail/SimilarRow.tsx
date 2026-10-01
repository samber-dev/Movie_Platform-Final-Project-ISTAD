'use client'

import { useEffect, useRef, useState } from 'react'
import { loadMediaRelated } from '../../lib/tmdb'
import { useAsyncSection } from '../../lib/useAsyncSection'
import type { Media } from '../../types'
import { CardSkeleton, SectionMessage, SectionShell } from './SectionShell'
import { scoreColor, useSectionMessage } from './sectionUtils'

function releaseYear(date: string): string {
  if (!date) return '—'
  const year = new Date(date).getFullYear()
  return Number.isNaN(year) ? '—' : String(year)
}

function RelatedCard({
  media,
  onSelect,
}: {
  media: Media
  onSelect: () => void
}) {
  return (
    <li className="w-40 shrink-0 sm:w-44" style={{ scrollSnapAlign: 'start' }}>
      <button
        type="button"
        onClick={onSelect}
        className="group block w-full text-left"
        aria-label={`Open details for ${media.title}`}
      >
        <span className="relative block aspect-[2/3] w-full overflow-hidden rounded-xl bg-surface-2 ring-1 ring-line transition group-hover:-translate-y-1 group-hover:ring-accent/60">
          {media.poster ? (
            <img
              src={media.poster}
              alt={media.title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-3xl text-ink/40">
              <span aria-hidden="true">🎬</span>
            </span>
          )}
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-page/90 to-transparent p-2">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold text-page ${scoreColor(media.rating)}`}
            >
              {media.rating}%
            </span>
          </span>
        </span>
        <span className="mt-2 line-clamp-2 block text-sm font-semibold text-ink">
          {media.title}
        </span>
        <span className="mt-0.5 block text-xs text-ink-muted">
          {releaseYear(media.releaseDate)}
          {media.genres.length > 0 ? ` · ${media.genres[0]}` : ''}
        </span>
      </button>
    </li>
  )
}

export function SimilarRow({
  item,
  onSelectMedia,
}: {
  item: Media
  onSelectMedia: (media: Media) => void
}) {
  const state = useAsyncSection<Media[]>(
    (signal) => loadMediaRelated(item, signal),
    [item.type, item.id],
  )
  const trackRef = useRef<HTMLUListElement>(null)
  const [atStart, setAtStart] = useState(true)
  const [atEnd, setAtEnd] = useState(false)
  const related = state.data ?? []
  const { showSkeleton, showError, showEmpty } = useSectionMessage(state)

  // Arrow affordances depend on the scroll position, so they are measured rather
  // than assumed; a row that fits on screen hides both.
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const update = () => {
      const max = track.scrollWidth - track.clientWidth
      setAtStart(track.scrollLeft <= 4)
      setAtEnd(max <= 4 || track.scrollLeft >= max - 4)
    }
    update()
    track.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      track.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [related.length])

  const nudge = (direction: 1 | -1) => {
    const track = trackRef.current
    if (!track) return
    track.scrollBy({ left: direction * Math.max(240, track.clientWidth * 0.8), behavior: 'smooth' })
  }

  return (
    <SectionShell
      id="similar"
      title="More Like This"
      subtitle={showEmpty && related.length > 0 ? 'Recommended and similar titles' : undefined}
      action={
        related.length > 2 ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => nudge(-1)}
              disabled={atStart}
              aria-label="Scroll similar titles left"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-ink ring-1 ring-line transition hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-surface-2"
            >
              <span aria-hidden="true">←</span>
            </button>
            <button
              type="button"
              onClick={() => nudge(1)}
              disabled={atEnd}
              aria-label="Scroll similar titles right"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-ink ring-1 ring-line transition hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-surface-2"
            >
              <span aria-hidden="true">→</span>
            </button>
          </div>
        ) : null
      }
    >
      {showSkeleton && (
        <CardSkeleton count={6} className="aspect-[2/3] w-40 sm:w-44" />
      )}

      {showError && (
        <SectionMessage tone="error" onRetry={state.reload}>
          Could not load recommendations. {state.error}
        </SectionMessage>
      )}

      {related.length === 0 && showEmpty && (
        <SectionMessage>No similar titles to suggest yet.</SectionMessage>
      )}

      {related.length > 0 && (
        <ul
          ref={trackRef}
          className="mt-5 flex gap-4 overflow-x-auto pb-3"
          style={{ scrollSnapType: 'x proximity' }}
        >
          {related.map((media) => (
            <RelatedCard
              key={`${media.type}-${media.id}`}
              media={media}
              onSelect={() => onSelectMedia(media)}
            />
          ))}
        </ul>
      )}
    </SectionShell>
  )
}
