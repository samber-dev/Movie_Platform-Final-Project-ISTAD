'use client'

import { useCallback, useEffect, useState } from 'react'
import { loadMediaDetails, TMDB_FALLBACK_BACKDROP } from '../lib/tmdb'
import type { CastMember, CrewCredit, MediaDetails } from '../lib/tmdb'
import { useModalDismiss } from '../lib/useModalDismiss'
import {
  blendExplanation,
  blendedScore,
  loadUserRating,
} from '../lib/ratingStore'
import type { UserRating } from '../lib/ratingStore'
import type { Media } from '../types'
import { LanguageSection } from './detail/LanguageSection'
import { MediaGallerySection } from './detail/MediaGallerySection'
import { RatingSection } from './detail/RatingSection'
import { ReviewsSection } from './detail/ReviewsSection'
import { SimilarRow } from './detail/SimilarRow'
import { TrailersSection } from './detail/TrailersSection'
import type { PersonRef } from './PersonDetail'

function releaseYear(date: string): string {
  if (!date) return '—'
  const year = new Date(date).getFullYear()
  return Number.isNaN(year) ? '—' : String(year)
}

function formatRuntime(minutes: number, isTv: boolean): string {
  if (!minutes) return '—'
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const label = isTv ? '/ep' : ''
  return hours > 0 ? `${hours}h ${rest}m${label}` : `${rest}m${label}`
}

function formatMoney(value: number): string {
  if (!value) return '—'
  return `$${value.toLocaleString('en-US')}`
}

function ratingColor(rating: number): string {
  if (rating >= 70) return 'bg-score-high'
  if (rating >= 50) return 'bg-score-mid'
  return 'bg-score-low'
}

/**
 * A cast or crew name was activated. `peek` is true for cast members, who get
 * the quick panel, and false for crew, who get the full filmography.
 */
type PersonSelectHandler = (person: PersonRef, peek: boolean) => void

/** Who a cast or crew credit points at. Enough to open their page. */
const personButtonClass =
  'group flex w-full items-center gap-3 rounded-lg text-left transition hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent'

function CreditRow({
  person,
  showJob = true,
  onSelect,
}: {
  person: CrewCredit
  showJob?: boolean
  onSelect?: PersonSelectHandler
}) {
  const content = (
    <>
      {person.profile ? (
        <img
          src={person.profile}
          alt=""
          loading="lazy"
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-line"
        />
      ) : (
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-ink-soft ring-1 ring-line"
          aria-hidden="true"
        >
          {person.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink group-hover:text-accent">
          {person.name}
        </p>
        {showJob && (
          <p className="truncate text-xs text-ink-muted">{person.job}</p>
        )}
      </div>
      {onSelect && (
        <span
          aria-hidden="true"
          className="shrink-0 text-xs text-ink-muted opacity-0 transition group-hover:opacity-100"
        >
          View →
        </span>
      )}
    </>
  )

  return (
    <li>
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect({ id: person.id, name: person.name }, false)}
          title={`${person.name} — view filmography`}
          className={`${personButtonClass} px-2 py-1.5 -mx-2`}
        >
          {content}
        </button>
      ) : (
        <div className={`${personButtonClass} cursor-default`}>{content}</div>
      )}
    </li>
  )
}

function CastCard({
  member,
  onSelect,
}: {
  member: CastMember
  onSelect?: PersonSelectHandler
}) {
  const content = (
    <>
      {member.profile ? (
        <img
          src={member.profile}
          alt={member.name}
          loading="lazy"
          className="h-48 w-36 rounded-lg object-cover ring-1 ring-line"
        />
      ) : (
        <div className="flex h-48 w-36 items-center justify-center rounded-lg bg-surface-2 text-3xl text-ink/40 ring-1 ring-line">
          <span aria-hidden="true">🎭</span>
        </div>
      )}
      <p className="mt-2 truncate text-sm font-semibold text-ink group-hover:text-accent">
        {member.name}
      </p>
      <p className="truncate text-xs text-ink-muted">{member.character}</p>
    </>
  )

  return (
    <li className="w-36 shrink-0">
      {onSelect ? (
        <button
          type="button"
          onClick={() => onSelect({ id: member.id, name: member.name }, true)}
          title={`Other movies featuring ${member.name}`}
          className="group w-full rounded-lg text-left transition focus-visible:ring-2 focus-visible:ring-accent"
        >
          {content}
        </button>
      ) : (
        <div className="group w-full text-left">{content}</div>
      )}
    </li>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-bold text-ink">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink-soft">{value}</dd>
    </div>
  )
}

function CastSkeleton() {
  return (
    <ul className="flex gap-4 overflow-hidden">
      {[0, 1, 2, 3, 4].map((n) => (
        <li key={n} className="w-36 shrink-0">
          <div className="h-48 w-36 animate-pulse rounded-lg bg-surface-2" />
          <div className="mt-2 h-3 w-28 animate-pulse rounded bg-surface-2" />
          <div className="mt-1.5 h-3 w-20 animate-pulse rounded bg-surface-2" />
        </li>
      ))}
    </ul>
  )
}

type Props = {
  item: Media
  saved: boolean
  onToggleWatchlist: () => void
  /** Opens another title from the recommendations row. */
  onSelectMedia?: (media: Media) => void
  /** Opens a cast or crew name's filmography — quick panel or full page. */
  onSelectPerson?: PersonSelectHandler
  /** Opens the trailer overlay. Falls back to the inline player when absent. */
  onPlayTrailer?: (media: Media) => void
  onClose: () => void
}

export function MovieDetail({
  item,
  saved,
  onToggleWatchlist,
  onSelectMedia,
  onSelectPerson,
  onPlayTrailer,
  onClose,
}: Props) {
  const [details, setDetails] = useState<MediaDetails | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [playRequest, setPlayRequest] = useState(0)
  // The visitor's own verdict, held here so the hero badge and the rating card
  // always read from one value. This view is keyed by media in MoviePlatformApp.tsx, so
  // switching titles remounts it and the storage read re-runs for free.
  const [myRating, setMyRating] = useState<UserRating | null>(() =>
    loadUserRating(item),
  )
  const isTv = item.type === 'tv'
  /**
   * Admin-authored titles have no TMDB record behind them, so the TMDB-backed
   * sections on this page are withheld rather than left to fail against an id
   * that cannot exist. What is left — poster, title, overview, your rating and
   * your reviews — is all local data that still works.
   */
  const isCustom = item.isCustom === true

  useModalDismiss(onClose)

  useEffect(() => {
    // A curated title has no TMDB record, and every TMDB-backed section is
    // withheld below, so there is nothing to fetch. `details` and `error`
    // start null on mount and this view is keyed by media, so no reset is
    // needed when `isCustom` flips.
    if (isCustom) return
    const controller = new AbortController()
    loadMediaDetails(item, controller.signal)
      .then(setDetails)
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(
          err instanceof Error ? err.message : 'Could not load title details',
        )
      })
    return () => controller.abort()
  }, [item, isCustom])

  // TMDB's vote count is what makes the blend fair, but it only arrives with the
  // details request. Until then the grid's score stands in and the badge simply
  // re-renders once the real numbers land.
  const communityScore = details?.communityScore ?? item.rating
  const voteCount = details?.voteCount ?? 0
  const displayScore = blendedScore(communityScore, voteCount, myRating?.stars ?? null)
  const handleRatingChange = useCallback((next: UserRating | null) => {
    setMyRating(next)
  }, [])

  const genres = details?.genres.length ? details.genres : item.genres
  const writers = details?.writers ?? []
  const runtime = formatRuntime(details?.runtime ?? 0, isTv)
  const facts = [
    { label: 'Status', value: details?.status ?? '—' },
    { label: 'Original Language', value: details?.originalLanguage ?? '—' },
    { label: 'Budget', value: formatMoney(details?.budget ?? 0) },
    {
      label: 'Revenue',
      value: isTv ? '—' : formatMoney(details?.revenue ?? 0),
    },
  ]


  /**
   * Credits, cast and languages all come from a TMDB record. A curated title
   * has none, so the whole group is withheld rather than left to fail.
   */
  const tmdbSections = isCustom ? null : (
    <>
          <div className="mt-8 grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted">
                Director
              </h3>
              {details === null ? (
                <div className="mt-3 h-10 w-40 animate-pulse rounded bg-surface-2" />
              ) : details.director ? (
                <ul className="mt-3">
                  <CreditRow
                    person={details.director}
                    showJob={false}
                    onSelect={onSelectPerson}
                  />
                </ul>
              ) : (
                <p className="mt-3 text-sm text-ink-muted">Not credited</p>
              )}
            </div>

            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted">
                Writer{writers.length === 1 ? '' : 's'}
              </h3>
              {details === null ? (
                <div className="mt-3 space-y-2">
                  <div className="h-10 w-44 animate-pulse rounded bg-surface-2" />
                  <div className="h-10 w-36 animate-pulse rounded bg-surface-2" />
                </div>
              ) : writers.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {writers.map((writer) => (
                    <CreditRow
                      key={writer.id}
                      person={writer}
                      onSelect={onSelectPerson}
                    />
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-ink-muted">Not credited</p>
              )}
            </div>
          </div>

          <h2 className="mt-10 text-xl font-bold text-ink md:text-2xl">
            Top Billed Cast
          </h2>
          {error ? (
            <p className="mt-3 text-sm text-ink-muted">{error}</p>
          ) : details === null ? (
            <div className="mt-4">
              <CastSkeleton />
            </div>
          ) : details.cast.length > 0 ? (
            <ul className="mt-4 flex gap-4 overflow-x-auto pb-3">
              {details.cast.map((member) => (
                <CastCard
                  key={member.id}
                  member={member}
                  onSelect={onSelectPerson}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">
              No cast credits available for this title.
            </p>
          )}

          {/* Full width rather than in the sidebar: the language lists run long
              and the sidebar is sticky, so a tall card there would push its own
              footer off the bottom of the viewport. */}
          <div className="mt-10">
            <LanguageSection details={details} />
          </div>

    </>
  )
  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-page"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.title} details`}
    >
      <header className="relative isolate bg-void">
        <div className="relative h-[45vh] min-h-72 w-full overflow-hidden">
          <img
            src={item.backdrop || TMDB_FALLBACK_BACKDROP}
            alt=""
            className="h-full w-full object-cover"
          />
          {/* The hero is always dark, in both themes, so the banner text can stay
              white. Three stacked scrims over the artwork: a flat base, a
              vertical ramp that goes solid behind the title block, and a
              left-weighted wash under the poster. */}
          <div className="absolute inset-0 bg-void/55" />
          <div className="absolute inset-0 bg-gradient-to-t from-void from-15% via-void/85 to-void/45" />
          <div className="absolute inset-0 bg-gradient-to-r from-void/85 via-void/30 to-transparent" />
        </div>

        <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 p-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-full bg-black/50 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span aria-hidden="true">←</span> Back to Movies
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-lg text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Close details"
          >
            ✕
          </button>
        </div>

        {/* `relative z-10` is load-bearing: the banner above is a positioned
            box, and positioned boxes paint over static in-flow content, so
            without this the scrims cover the title and tagline. */}
        <div className="relative z-10 mx-auto -mt-44 max-w-6xl px-4 pb-6 md:-mt-52">
          {/* A fixed poster column with top alignment, rather than
              `items-end` against a fixed-height poster: bottom alignment made
              the title's vertical position depend on how many lines the title,
              tagline and meta row happened to take. */}
          <div className="grid items-start gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
            {item.poster ? (
              <img
                src={item.poster}
                alt={`${item.title} poster`}
                className="h-56 w-40 rounded-xl object-cover shadow-2xl ring-1 ring-white/15 md:h-72 md:w-full"
              />
            ) : (
              <div className="flex h-56 w-40 items-center justify-center rounded-xl bg-white/5 text-5xl ring-1 ring-white/15 md:h-72 md:w-full">
                <span aria-hidden="true">🎬</span>
              </div>
            )}

            <div className="min-w-0">
              <h1 className="break-words text-3xl font-extrabold leading-tight text-white drop-shadow-[0_2px_12px_rgb(0_0_0/0.6)] md:text-5xl">
                {item.title}
              </h1>

              {/* The slot is always reserved so the title, meta row and buttons
                  land in the same place whether or not a tagline exists. */}
              <p className="mt-2 min-h-[1.75rem] text-sm italic text-white/80 md:text-base">
                {details?.tagline ?? ''}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-semibold text-white">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full font-bold text-page ${ratingColor(displayScore)}`}
                  title={blendExplanation(voteCount, myRating?.stars ?? null)}
                >
                  {displayScore}%
                </span>
                {myRating && (
                  <span className="rounded bg-white/15 px-2 py-1 text-xs font-bold text-white ring-1 ring-white/20">
                    ★ Your {myRating.stars}/5
                  </span>
                )}
                <span className="rounded bg-white/15 px-2 py-1 text-xs font-bold uppercase tracking-wide text-white ring-1 ring-white/20">
                  {isTv ? 'TV Series' : 'Movie'}
                </span>
                <span>{releaseYear(item.releaseDate)}</span>
                {/* Runtime only exists on a TMDB record, and would otherwise
                    render as a lone "—" on a curated title. */}
                {!isCustom && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{runtime}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                {/* Always rendered, so the row never collapses to a dangling
                    separator when a title has no genres. */}
                <span>
                  {genres.length > 0 ? genres.slice(0, 3).join(', ') : 'Genre TBD'}
                </span>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {!isCustom && (
                  <button
                    type="button"
                    onClick={() =>
                      // With the overlay wired up, "Play Trailer" plays in place
                      // instead of scrolling down to the inline section. Standalone
                      // use (no handler) still scrolls, so the button always does
                      // something.
                      onPlayTrailer ? onPlayTrailer(item) : setPlayRequest((n) => n + 1)
                    }
                    className="btn-neon"
                  >
                    ▶ Play Trailer
                  </button>
                )}
                {isCustom && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-accent/15 px-4 py-2 text-xs font-bold uppercase tracking-wide text-accent ring-1 ring-accent/40">
                    <span aria-hidden="true">✦</span> Curated title
                  </span>
                )}
                <button
                  type="button"
                  onClick={onToggleWatchlist}
                  aria-pressed={saved}
                  aria-label={
                    saved ? 'Remove from watchlist' : 'Add to watchlist'
                  }
                  className={`rounded px-6 py-2 font-bold transition ${
                    saved
                      ? 'bg-score-high text-page'
                      : 'bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20'
                  }`}
                >
                  {saved ? '✓ In Watchlist' : '＋ Add to Watchlist'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pb-16 pt-6">
        <div className="grid gap-10 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-ink md:text-2xl">Overview</h2>
            <p className="mt-3 max-w-3xl leading-relaxed text-ink-soft">
              {item.overview || 'No overview available for this title yet.'}
            </p>

            <div className="mt-6">
              <RatingSection
                item={item}
                communityScore={communityScore}
                voteCount={voteCount}
                onChange={handleRatingChange}
              />
            </div>

            {tmdbSections}
          </div>

          <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
            {/* Budget, revenue, status and language are all TMDB fields, so a
                curated title gets the facts it actually has instead of four
                rows of em dashes. */}
            <dl className="space-y-4 rounded-2xl bg-surface/70 p-5 ring-1 ring-line">
              {isCustom
                ? [
                    { label: 'Title', value: item.title },
                    { label: 'Release year', value: releaseYear(item.releaseDate) },
                    {
                      label: 'Genre',
                      value: genres.length > 0 ? genres.join(', ') : 'Unspecified',
                    },
                    { label: 'Source', value: 'Added by an admin' },
                  ].map((fact) => (
                    <Fact key={fact.label} {...fact} />
                  ))
                : facts.map((fact) => <Fact key={fact.label} {...fact} />)}
              {details?.homepage && (
                <div>
                  <dt className="text-sm font-bold text-ink">Homepage</dt>
                  <dd className="mt-0.5">
                    <a
                      href={details.homepage}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-accent underline-offset-4 hover:underline"
                    >
                      Visit official site ↗
                    </a>
                  </dd>
                </div>
              )}
            </dl>

            {details?.keywords.length ? (
              <div className="rounded-2xl bg-surface/70 p-5 ring-1 ring-line">
                <h3 className="text-sm font-bold text-ink">Keywords</h3>
                <ul className="mt-3 flex flex-wrap gap-2">
                  {details.keywords.map((keyword) => (
                    <li
                      key={keyword}
                      className="rounded-full bg-surface-2 px-3 py-1 text-xs text-ink-soft ring-1 ring-line"
                    >
                      {keyword}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>

        {!isCustom && (
          <>
            <TrailersSection item={item} playRequest={playRequest} />

            <MediaGallerySection item={item} />
          </>
        )}

        {/* Reviews are the visitor's own, keyed off the media id, so they work
            for a curated title too — ReviewsSection skips its TMDB half. */}
        <ReviewsSection item={item} />

        {!isCustom && onSelectMedia && (
          <SimilarRow item={item} onSelectMedia={onSelectMedia} />
        )}
      </div>
    </div>
  )
}
