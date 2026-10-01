'use client'

import { useState } from 'react'
import type { KeyboardEvent } from 'react'
import {
  blendExplanation,
  blendedScore,
  clearUserRating,
  loadUserRating,
  MAX_RATING,
  MIN_RATING,
  ratingToPercent,
  saveUserRating,
  USER_VOTE_WEIGHT,
} from '../../lib/ratingStore'
import type { UserRating } from '../../lib/ratingStore'
import type { Media } from '../../types'
import { scoreColor } from './sectionUtils'

/**
 * One star. A real radio rather than a button so the group is reachable with a
 * single Tab stop and the arrow keys, which is what a screen reader announces
 * and what keyboard users expect from a 1-5 star picker.
 */
function Star({
  value,
  fill,
  checked,
  tabbable,
  onSelect,
  onPreview,
}: {
  /** The star's own position, 1-5. */
  value: number
  /** How many stars should render as filled right now. */
  fill: number
  /** Whether this star is the committed (or pending) selection. */
  checked: boolean
  /** Whether this star is the group's single tab stop. */
  tabbable: boolean
  onSelect: (next: number) => void
  onPreview: (next: number | null) => void
}) {
  const filled = value <= fill

  function handleKeyDown(event: KeyboardEvent<HTMLLabelElement>) {
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -1
          : 0
    if (step === 0) return
    // The native arrow behaviour is suppressed, so focus has to be moved by
    // hand: without it the selection advances one step per press and then stalls,
    // because the next press is still read against the old star.
    event.preventDefault()
    const next = Math.min(MAX_RATING, Math.max(MIN_RATING, value + step))
    onSelect(next)
    const inputs = event.currentTarget.parentElement?.querySelectorAll<HTMLInputElement>(
      'input[name="angkor-stars"]',
    )
    inputs?.[next - 1]?.focus()
  }

  return (
    <label
      className="cursor-pointer p-1"
      onKeyDown={handleKeyDown}
      onMouseEnter={() => onPreview(value)}
      onMouseLeave={() => onPreview(null)}
      title={`${value} star${value === 1 ? '' : 's'}`}
    >
      <input
        type="radio"
        name="angkor-stars"
        className="peer sr-only"
        checked={checked}
        // One tab stop for the whole group: the selected star is the entry point,
        // falling back to the first star so the group is never unreachable.
        tabIndex={tabbable ? 0 : -1}
        onChange={() => onSelect(value)}
      />
      <span
        aria-hidden="true"
        className={`block text-4xl leading-none transition peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-page group-hover:scale-110 ${
          filled
            ? 'text-score-high'
            : 'text-ink-muted/40 hover:text-ink-muted'
        }`}
      >
        ★
      </span>
      <span className="sr-only">
        {value} star{value === 1 ? '' : 's'}
      </span>
    </label>
  )
}

function Stat({
  label,
  value,
  swatch,
}: {
  label: string
  value: string
  swatch?: string
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted">
        {label}
      </dt>
      <dd className="mt-1 flex items-center gap-2">
        {swatch && (
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${swatch}`}
          />
        )}
        <span className="truncate text-lg font-bold text-ink">{value}</span>
      </dd>
    </div>
  )
}

/**
 * The visitor's own verdict on a title: pick a star rating, submit it, and watch
 * the blended score above it move.
 *
 * `onChange` is lifted to the parent so the hero badge can re-render from the
 * same value rather than the two drifting apart.
 */
export function RatingSection({
  item,
  communityScore,
  voteCount,
  onChange,
}: {
  item: Media
  /** TMDB's 0-100 average. Falls back to the grid's figure before details load. */
  communityScore: number
  voteCount: number
  onChange: (rating: UserRating | null) => void
}) {
  const [saved, setSaved] = useState<UserRating | null>(() => loadUserRating(item))
  // `null` means "not hovering", which falls back to the committed rating.
  const [preview, setPreview] = useState<number | null>(null)
  const [draft, setDraft] = useState(0)
  const [notice, setNotice] = useState('')

  const committed = saved?.stars ?? 0
  /** What is actually selected: an unsubmitted pick, else what is stored. */
  const picked = draft || committed
  /**
   * What the stars are filled to. The hover preview is deliberately *not* the
   * radio's `checked` value: a radio the browser already considers checked fires
   * no `change` event, so letting the preview drive it would make a click on a
   * different star silently do nothing.
   */
  const fill = preview ?? picked
  const dirty = draft > 0 && draft !== committed
  const combined = blendedScore(communityScore, voteCount, committed || null)

  function commit() {
    if (draft < MIN_RATING) return
    const next = saveUserRating(item, draft)
    setSaved(next)
    setDraft(0)
    setNotice(`Rating saved: ${next.stars} out of 5.`)
    onChange(next)
  }

  function clear() {
    clearUserRating(item)
    setSaved(null)
    setDraft(0)
    setNotice('Rating removed. Showing the TMDB community score again.')
    onChange(null)
  }

  return (
    <section
      aria-labelledby="your-verdict-heading"
      className="rounded-2xl bg-surface/70 p-5 ring-1 ring-line"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="your-verdict-heading"
            className="text-lg font-bold text-ink"
          >
            Your verdict
          </h2>
          <p className="mt-1 text-xs text-ink-muted">
            Click a star to rate {item.title}. Saved to this browser only.
          </p>
        </div>

        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-extrabold text-page ${scoreColor(combined)}`}
          title={blendExplanation(voteCount, committed || null)}
        >
          {combined}%
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div
          role="radiogroup"
          aria-label={`Your rating out of ${MAX_RATING} stars`}
          className="flex items-center"
        >
          {Array.from({ length: MAX_RATING }, (_, n) => n + 1).map((value) => (
            <Star
              key={value}
              value={value}
              fill={fill}
              checked={picked === value}
              tabbable={picked > 0 ? picked === value : value === 1}
              onSelect={setDraft}
              onPreview={setPreview}
            />
          ))}
        </div>

        <p className="min-w-[5.5rem] text-sm font-bold text-ink-soft">
          {fill > 0 ? `${fill} / ${MAX_RATING}` : `— / ${MAX_RATING}`}
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={commit}
            disabled={draft < MIN_RATING}
            className="btn-neon px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {committed > 0 ? 'Update rating' : 'Submit rating'}
          </button>
          {committed > 0 && (
            <button
              type="button"
              onClick={clear}
              className="rounded-full bg-surface-2 px-4 py-2 text-xs font-bold text-ink-soft ring-1 ring-line transition hover:bg-surface-3 hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4">
        <Stat
          label="Your score"
          value={committed > 0 ? `${ratingToPercent(committed)}%` : 'Not rated'}
          swatch={committed > 0 ? 'bg-score-high' : undefined}
        />
        <Stat
          label="Community"
          value={`${communityScore}%`}
          swatch="bg-accent-2"
        />
        <Stat
          label="Votes"
          value={voteCount.toLocaleString('en-US')}
        />
      </dl>

      <p className="mt-4 text-xs leading-relaxed text-ink-muted">
        {blendExplanation(voteCount, committed || null)}
        {committed > 0 && voteCount > 0 && (
          <>
            {' '}
            Community scores are TMDB&apos;s, so they are identical for every
            visitor; the blended figure is unique to you.
          </>
        )}
      </p>

      {/* The only live region on the card: confirms the write, and doubles as
          the disabled-state hint when no star is selected yet. */}
      <p aria-live="polite" className="mt-2 min-h-[1.25rem] text-xs">
        {notice ? (
          <span className="font-semibold text-score-high">{notice}</span>
        ) : dirty ? (
          <span className="text-ink-muted">
            Pick a new score and press Update rating to apply it.
          </span>
        ) : committed > 0 ? (
          <span className="text-ink-muted">
            {USER_VOTE_WEIGHT.toLocaleString('en-US')} votes to{' '}
            {voteCount.toLocaleString('en-US')} for your verdict to become the
            majority view.
          </span>
        ) : null}
      </p>
    </section>
  )
}
