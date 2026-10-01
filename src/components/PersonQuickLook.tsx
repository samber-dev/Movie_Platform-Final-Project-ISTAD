'use client'

import { useMemo } from 'react'
import { loadPerson, loadPersonCredits } from '../lib/tmdb'
import type { Person, PersonCredit } from '../lib/tmdb'
import { useAsyncSection } from '../lib/useAsyncSection'
import { useModalDismiss } from '../lib/useModalDismiss'
import type { Media } from '../types'
import { scoreColor } from './detail/sectionUtils'
import type { PersonRef } from './PersonDetail'

/** How many other titles the cast quick-look lists before "view all" takes over. */
const QUICK_LOOK_LIMIT = 8

/**
 * The films worth showing in the quick-look panel.
 *
 * Movies only. `combined_credits` mixes in TV, and a guest spot on a late-night
 * talk show outscores most feature films on popularity — without this filter the
 * panel for a film actor lists eight chat shows and none of their films.
 *
 * Ranked by TMDB popularity, with score only breaking ties. Score is deliberately
 * not a ranking term: a credit carries no vote count alongside it, so a cameo in
 * a documentary with two votes scores 100 and would float above a starring role
 * in a film thousands have seen. Released titles only, since an upcoming credit
 * belongs to the Coming Soon calendar.
 */
function quickLookCredits(credits: PersonCredit[]): PersonCredit[] {
  return credits
    .filter((credit) => credit.departments.includes('Acting'))
    .filter((credit) => credit.media.type === 'movie')
    .filter((credit) => yearOf(credit.media.releaseDate) !== null)
    .sort(
      (a, b) =>
        (b.media.popularity ?? 0) - (a.media.popularity ?? 0) ||
        b.media.rating - a.media.rating,
    )
    .slice(0, QUICK_LOOK_LIMIT)
}

function yearOf(date: string): number | null {
  if (!date) return null
  const year = new Date(date).getFullYear()
  return Number.isNaN(year) ? null : year
}

function formatLifespan(person: Person): string {
  if (!person.birthday) return ''
  const born = yearOf(person.birthday)
  if (person.deathday) {
    const died = yearOf(person.deathday)
    return born && died ? `${born} – ${died}` : person.deathday
  }
  return born ? String(born) : ''
}

function QuickLookCard({ credit }: { credit: PersonCredit }) {
  const { media, role } = credit
  const year = yearOf(media.releaseDate)

  return (
    <li className="flex items-center gap-3">
      {media.poster ? (
        <img
          src={media.poster}
          alt=""
          loading="lazy"
          className="h-16 w-11 shrink-0 rounded object-cover ring-1 ring-line"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-16 w-11 shrink-0 items-center justify-center rounded bg-surface-2 text-xs text-ink-muted"
        >
          🎬
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink" title={media.title}>
          {media.title}
        </p>
        <p className="truncate text-xs text-ink-muted">
          {year ?? '—'}
          {role ? ` · ${role}` : ''}
        </p>
      </div>
      {media.rating > 0 && (
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-void ${scoreColor(media.rating)}`}
        >
          ★ {media.rating}
        </span>
      )}
    </li>
  )
}

/**
 * A quick filmography: who this person is plus their most notable other credits,
 * without the cost of leaving the title page.
 *
 * Only the header strip is loaded up front. The full list belongs behind
 * "View full filmography" because a prolific actor's combined credits run to
 * hundreds of titles, and fetching all of them to show eight would be a slow
 * way to answer "what else are they in?".
 */
export function PersonQuickLook({
  person,
  onClose,
  onOpenFull,
  onSelectMedia,
}: {
  person: PersonRef
  /** Dismisses the panel, returning the visitor to the title page. */
  onClose: () => void
  /** Replaces it with the full filmography page. */
  onOpenFull: () => void
  onSelectMedia: (media: Media) => void
}) {
  useModalDismiss(onClose)

  const profile = useAsyncSection((signal) => loadPerson(person.id, signal), [
    person.id,
  ])
  const credits = useAsyncSection(
    (signal) => loadPersonCredits(person.id, signal),
    [person.id],
  )

  const data = profile.data
  const highlights = useMemo(
    () => quickLookCredits(credits.data ?? []),
    [credits.data],
  )
  const total = credits.data?.length ?? 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${person.name} filmography`}
    >
      <div
        className="neon-panel max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4 border-b border-line p-5">
          {profile.loading && data === null ? (
            <span
              aria-hidden="true"
              className="h-20 w-20 shrink-0 animate-pulse rounded-2xl bg-surface-2"
            />
          ) : data?.profile ? (
            <img
              src={data.profile}
              alt={data.name}
              loading="lazy"
              className="h-20 w-20 shrink-0 rounded-2xl object-cover ring-1 ring-line"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-2xl text-ink/40"
            >
              🎭
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-extrabold text-ink">
              {data?.name ?? person.name}
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              {[data?.knownForDepartment, data ? formatLifespan(data) : '']
                .filter(Boolean)
                .join(' · ') || 'Loading profile…'}
            </p>
            <button
              type="button"
              onClick={onOpenFull}
              className="mt-2 text-xs font-bold text-accent underline-offset-4 transition hover:underline focus-visible:ring-2 focus-visible:ring-accent"
            >
              View full filmography →
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close the filmography preview"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg text-ink ring-1 ring-line transition hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent"
          >
            ✕
          </button>
        </div>

        <div className="p-5">
          <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted">
            Other notable credits
          </h3>

          {profile.error !== null && data === null ? (
            <p className="mt-3 text-sm text-ink-muted">
              Couldn’t load this profile: {profile.error}
            </p>
          ) : credits.error !== null && credits.data === null ? (
            <p className="mt-3 text-sm text-ink-muted">
              Couldn’t load the filmography: {credits.error}
            </p>
          ) : highlights.length === 0 && credits.loading ? (
            <div className="mt-4 space-y-3" aria-hidden="true">
              {[0, 1, 2, 3].map((n) => (
                <div key={n} className="flex items-center gap-3">
                  <span className="h-16 w-11 animate-pulse rounded bg-surface-2" />
                  <span className="h-3 w-32 animate-pulse rounded bg-surface-2" />
                </div>
              ))}
            </div>
          ) : highlights.length === 0 ? (
            <p className="mt-3 text-sm text-ink-muted">
              No other film credits are on record for {person.name} yet.
            </p>
          ) : (
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {highlights.map((credit) => (
                <button
                  key={`${credit.media.type}-${credit.media.id}`}
                  type="button"
                  onClick={() => onSelectMedia(credit.media)}
                  className="w-full rounded-lg text-left transition hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <QuickLookCard credit={credit} />
                </button>
              ))}
            </ul>
          )}

          {total > highlights.length && (
            <p className="mt-4 text-xs text-ink-muted">
              Showing {highlights.length} of {total} credits.{' '}
              <button
                type="button"
                onClick={onOpenFull}
                className="font-bold text-accent underline-offset-4 transition hover:underline"
              >
                See them all
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
