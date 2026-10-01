'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { loadMediaReviews } from '../../lib/tmdb'
import type { MediaReview } from '../../lib/tmdb'
import {
  addLocalReview,
  averageLocalRating,
  loadLocalReviews,
  MAX_REVIEW_LENGTH,
  MIN_REVIEW_LENGTH,
  removeLocalReview,
} from '../../lib/reviewStore'
import type { LocalReview } from '../../lib/reviewStore'
import { useAsyncSection } from '../../lib/useAsyncSection'
import type { Media } from '../../types'
import { recordMediaActivity, useActorEmail } from '../../lib/activityStore'
import { SectionMessage, SectionShell } from './SectionShell'
import { scoreColor } from './sectionUtils'

function formatDate(iso: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function StarRow({
  value,
  onChange,
  readOnly = false,
  label,
}: {
  value: number
  onChange?: (next: number) => void
  readOnly?: boolean
  label: string
}) {
  return (
    <div
      className="flex items-center gap-1"
      role={readOnly ? 'img' : 'radiogroup'}
      aria-label={label}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value
        if (readOnly) {
          return (
            <span
              key={star}
              aria-hidden="true"
              className={`text-base leading-none ${filled ? 'text-score-high' : 'text-ink-muted/50'}`}
            >
              ★
            </span>
          )
        }
        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} star${star === 1 ? '' : 's'}`}
            onClick={() => onChange?.(star)}
            className={`text-xl leading-none transition hover:scale-110 ${
              filled ? 'text-score-high' : 'text-ink-muted/60'
            }`}
          >
            <span aria-hidden="true">★</span>
          </button>
        )
      })}
    </div>
  )
}

function ReviewCard({
  review,
  onDelete,
}: {
  review: MediaReview | LocalReview
  onDelete?: () => void
}) {
  const isLocal = 'mine' in review
  const rating = isLocal
    ? (review as LocalReview).rating * 2
    : ((review as MediaReview).rating ?? 0)
  const body = isLocal ? (review as LocalReview).body : (review as MediaReview).content
  const created = isLocal ? (review as LocalReview).createdAt : (review as MediaReview).createdAt

  return (
    <li className="rounded-2xl bg-surface/70 p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-3">
        {!isLocal && (review as MediaReview).avatar ? (
          <img
            src={(review as MediaReview).avatar}
            alt=""
            loading="lazy"
            className="h-10 w-10 rounded-full object-cover ring-1 ring-line"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-ink-soft"
          >
            {(isLocal ? (review as LocalReview).author : (review as MediaReview).author)
              .slice(0, 1)
              .toUpperCase()}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">
            {isLocal ? (review as LocalReview).author : (review as MediaReview).author}
          </p>
          <p className="text-xs text-ink-muted">
            {isLocal ? 'Your review' : 'TMDB reader'}
            {formatDate(created) ? ` · ${formatDate(created)}` : ''}
          </p>
        </div>

        {rating > 0 && (
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-page ${scoreColor(rating)}`}
            title={`${rating}%`}
          >
            {rating}%
          </span>
        )}
      </div>

      {rating > 0 && (
        <div className="mt-3">
          <StarRow value={Math.round(rating / 2)} readOnly label={`${rating} out of 10`} />
        </div>
      )}

      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
        {body}
      </p>

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="mt-3 text-xs font-semibold text-ink-muted underline-offset-4 transition hover:text-ink hover:underline"
        >
          Delete my review
        </button>
      )}
    </li>
  )
}

function ReviewForm({
  item,
  onSubmit,
}: {
  item: Media
  onSubmit: (review: LocalReview) => void
}) {
  const actor = useActorEmail()
  const [name, setName] = useState('')
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [posted, setPosted] = useState(false)

  const trimmedName = name.trim()
  const trimmedBody = body.trim()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (rating === 0) {
      setError('Pick a star rating first.')
      return
    }
    if (trimmedBody.length < MIN_REVIEW_LENGTH) {
      setError(`Write at least ${MIN_REVIEW_LENGTH} characters.`)
      return
    }
    const review = addLocalReview(item, {
      author: trimmedName || 'Anonymous',
      rating,
      body: trimmedBody.slice(0, MAX_REVIEW_LENGTH),
    })
    recordMediaActivity('review.posted', 'Reviewed', item, actor)
    onSubmit(review)
    setBody('')
    setRating(0)
    setError(null)
    setPosted(true)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-5 rounded-2xl bg-surface/70 p-5 ring-1 ring-line"
    >
      <h3 className="text-sm font-bold text-ink">Write a review</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Saved to this browser only — TMDB&apos;s API cannot accept new reviews.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted">
            Your name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Anonymous"
            className="mt-2 w-44 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink ring-1 ring-line placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>

        <div>
          <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted">
            Your rating
          </span>
          <div className="mt-1.5">
            <StarRow
              value={rating}
              onChange={(next) => {
                setRating(next)
                setError(null)
              }}
              label="Your rating"
            />
          </div>
        </div>
      </div>

      <label className="mt-4 block">
        <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted">
          Your review
        </span>
        <textarea
          value={body}
          onChange={(e) => {
            setBody(e.target.value)
            if (error) setError(null)
          }}
          rows={4}
          maxLength={MAX_REVIEW_LENGTH}
          placeholder="What did you think of it?"
          className="mt-2 w-full resize-y rounded-lg bg-surface-2 px-3 py-2 text-sm leading-relaxed text-ink ring-1 ring-line placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-accent"
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-neon px-5 py-2 text-sm">
          Post review
        </button>
        <span aria-live="polite" className="text-xs">
          {error ? (
            <span className="font-semibold text-score-low">{error}</span>
          ) : posted ? (
            <span className="font-semibold text-ink-soft">Review posted.</span>
          ) : (
            <span className="text-ink-muted">
              {body.length}/{MAX_REVIEW_LENGTH}
            </span>
          )}
        </span>
      </div>
    </form>
  )
}

export function ReviewsSection({ item }: { item: Media }) {
  const state = useAsyncSection<MediaReview[]>(
    // A curated title has no TMDB record to fetch reviews from, but the
    // visitor's own reviews are keyed off the media id and work fine. Resolving
    // to an empty list keeps this section rendering them instead of showing a
    // failed request.
    (signal) =>
      item.isCustom ? Promise.resolve([]) : loadMediaReviews(item, signal),
    [item.type, item.id, item.isCustom],
  )
  const [mine, setMine] = useState<LocalReview[]>(() => loadLocalReviews(item))
  const actor = useActorEmail()

  const remote = state.data ?? []
  const mineAverage = averageLocalRating(mine)
  const total = remote.length + mine.length

  return (
    <SectionShell
      id="reviews"
      title="User Reviews"
      subtitle={
        total > 0
          ? `${total} review${total === 1 ? '' : 's'}${
              mineAverage !== null ? ` · your average ${mineAverage}/10` : ''
            }`
          : undefined
      }
    >
      {state.loading && state.data === null && (
        <div className="mt-4 space-y-3" aria-hidden="true">
          {[0, 1].map((n) => (
            <div key={n} className="h-32 animate-pulse rounded-2xl bg-surface-2" />
          ))}
        </div>
      )}

      {state.error && state.data === null && (
        <SectionMessage tone="error" onRetry={state.reload}>
          Could not load reviews. {state.error}
        </SectionMessage>
      )}

      {total === 0 && !state.loading && state.error === null && (
        <SectionMessage>
          No reviews yet. Be the first to share what you think.
        </SectionMessage>
      )}

      {total > 0 && (
        <ul className="mt-5 space-y-3">
          {mine.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              onDelete={() => {
                recordMediaActivity('review.deleted', 'Deleted their review of', item, actor)
                removeLocalReview(item, review.id)
                setMine(loadLocalReviews(item))
              }}
            />
          ))}
          {remote.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </ul>
      )}

      <ReviewForm
        item={item}
        onSubmit={(review) => setMine((current) => [review, ...current])}
      />
    </SectionShell>
  )
}
