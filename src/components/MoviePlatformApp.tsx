'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminDashboard } from './AdminDashboard'
import { AuthModal } from './AuthModal'
import { ComingSoonCalendar } from './ComingSoon'
import { MovieDetail } from './MovieDetail'
import { PersonDetail } from './PersonDetail'
import type { PersonRef } from './PersonDetail'
import { PersonQuickLook } from './PersonQuickLook'
import { TeamPage } from './TeamPage'
import { setPersistedAuth, usePersistedAuth } from '../lib/authStore'
import {
  discoverUrl,
  feedUrl,
  getResults,
  loadGenreNames,
  searchUrl,
  TMDB_FALLBACK_BACKDROP,
  toMedia,
  upcomingUrl,
} from '../lib/tmdb'
import { MIN_LIVE_SEARCH_TERM, useLiveSearch } from '../lib/useLiveSearch'
import { loadMediaVideos, youtubeEmbed, youtubeThumb } from '../lib/tmdb'
import type { MediaVideo } from '../lib/tmdb'
import { useAsyncSection } from '../lib/useAsyncSection'
import { useModalDismiss } from '../lib/useModalDismiss'
import { useTheme } from '../lib/useTheme'
import type { Theme } from '../lib/useTheme'
import { toMedia as customToMedia, useCustomMovies } from '../lib/customMovieStore'
import { GENRE_CHIPS, hasGenre } from '../lib/genres'
import type { GenreChip } from '../lib/genres'
import type { Account, AuthMode, Media } from '../types'

type Category = 'all' | 'movie' | 'tv' | 'soon' | 'watchlist' | 'custom'
/**
 * Categories the TMDB feed can serve. The watchlist and the custom catalogue
 * both render straight from local state, so neither needs a request.
 */
type FeedCategory = Exclude<Category, 'watchlist' | 'custom'>

/** Tabs fed by local state rather than a TMDB request. */
function isLocalCategory(category: Category): boolean {
  return category === 'watchlist' || category === 'custom'
}

const SEARCH_DEBOUNCE_MS = 350

/* ==========================================================================
   Sorting and release-year filtering
   ========================================================================== */

type SortKey = 'popularity' | 'release' | 'rating' | 'az'

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'popularity', label: 'Popularity' },
  { key: 'release', label: 'Release Date' },
  { key: 'rating', label: 'Highest Rated' },
  { key: 'az', label: 'A-Z' },
]

function yearOf(media: Media): number | null {
  if (!media.releaseDate) return null
  const year = new Date(media.releaseDate).getFullYear()
  return Number.isNaN(year) ? null : year
}

/**
 * Applied to whatever the current feed returned rather than pushed into the
 * TMDB request, so one code path covers all four sources — trending, popular,
 * discover, search and the watchlist — and re-sorts the titles already loaded
 * by "Load more" instead of only the first page. Popularity therefore falls back
 * to the server's own order, which is already `popularity.desc`.
 */
function compareMedia(a: Media, b: Media, key: SortKey): number {
  const byPopularity = (b.popularity ?? 0) - (a.popularity ?? 0)
  switch (key) {
    case 'release':
      return (yearOf(b) ?? 0) - (yearOf(a) ?? 0) || byPopularity
    case 'rating':
      return b.rating - a.rating || byPopularity
    case 'az':
      return a.title.localeCompare(b.title, 'en', { sensitivity: 'base' })
    case 'popularity':
    default:
      return byPopularity
  }
}

/** The distinct release years present in the current source, newest first. */
function collectYears(items: Media[]): number[] {
  const years = new Set<number>()
  for (const item of items) {
    const year = yearOf(item)
    if (year !== null) years.add(year)
  }
  return [...years].sort((a, b) => b - a)
}

function mediaKey(media: Pick<Media, 'type' | 'id'>): string {
  return `${media.type}-${media.id}`
}

function dedupe(items: Media[]): Media[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = mediaKey(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function interleave(movies: Media[], shows: Media[]): Media[] {
  const out: Media[] = []
  const length = Math.max(movies.length, shows.length)
  for (let i = 0; i < length; i += 1) {
    if (movies[i]) out.push(movies[i])
    if (shows[i]) out.push(shows[i])
  }
  return out
}

type FeedPage = {
  items: Media[]
  totalPages: number
}

/**
 * One page of the grid, whichever endpoint the current tab needs. Shared by the
 * initial load and by "Load more" so both always ask for the same thing — only
 * the page number differs.
 */
async function fetchFeedPage(
  category: FeedCategory,
  genre: GenreChip | null,
  searchTerm: string,
  page: number,
  signal: AbortSignal,
): Promise<FeedPage> {
  const names = await loadGenreNames()

  if (searchTerm) {
    const res = await getResults(searchUrl(searchTerm, page), signal)
    return { items: toMedia(res.results, names), totalPages: res.totalPages }
  }

  // Checked before the genre branch: `upcomingUrl` takes the genre id itself,
  // and "soon" is movies-only, so the TV genre id this branch would otherwise
  // pick has no meaning here.
  if (category === 'soon') {
    const res = await getResults(upcomingUrl(page, genre?.id ?? null), signal)
    return { items: toMedia(res.results, names), totalPages: res.totalPages }
  }

  if (genre === null) {
    const res = await getResults(feedUrl(category, page), signal)
    return { items: toMedia(res.results, names), totalPages: res.totalPages }
  }

  if (category === 'all') {
    // Genre across both types: two discover calls, interleaved into one grid.
    // A movie-only genre has no TV id, so that half is simply empty.
    const shows =
      genre.tvId === null
        ? null
        : await getResults(discoverUrl('tv', genre.tvId, page), signal)
    const movies = await getResults(
      discoverUrl('movie', genre.id, page),
      signal,
    )
    return {
      items: interleave(
        toMedia(movies.results, names),
        toMedia(shows?.results ?? [], names),
      ),
      // Stop when either list runs out, so the mix stays balanced.
      totalPages: Math.min(movies.totalPages, shows?.totalPages ?? movies.totalPages),
    }
  }

  const genreId = category === 'tv' ? genre.tvId : genre.id
  if (genreId === null) return { items: [], totalPages: 1 }
  const res = await getResults(discoverUrl(category, genreId, page), signal)
  return { items: toMedia(res.results, names), totalPages: res.totalPages }
}

function ratingColor(rating: number): string {
  if (rating >= 70) return 'bg-score-high'
  if (rating >= 50) return 'bg-score-mid'
  return 'bg-score-low'
}

function releaseYear(date: string): number | string {
  if (!date) return '—'
  const year = new Date(date).getFullYear()
  return Number.isNaN(year) ? '—' : year
}

function formatDate(date: string): string {
  if (!date) return 'Unknown date'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return 'Unknown date'
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function Poster({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)

  if (failed || !src) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-surface-2 to-surface ${className ?? ''}`}
      >
        <span className="text-5xl text-ink/40">🎬</span>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  )
}

function RatingBadge({ rating, size = 'md' }: { rating: number; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-9 w-9 text-xs' : 'h-12 w-12 text-sm'
  return (
    <span
      className={`flex items-center justify-center rounded-full font-bold text-page ring-2 ring-line ${box} ${ratingColor(rating)}`}
      title={`User score: ${rating}%`}
    >
      {rating}%
    </span>
  )
}

function WatchlistButton({
  saved,
  onClick,
  className,
  label = true,
}: {
  saved: boolean
  onClick: () => void
  className?: string
  label?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={saved ? 'Remove from watchlist' : 'Add to watchlist'}
      aria-pressed={saved}
      className={`rounded px-6 py-2 font-bold text-ink transition ${
        saved
          ? 'bg-score-high text-page'
          : 'bg-accent text-ink hover:bg-accent-3'
      } ${label ? '' : 'px-0 py-0'} ${className ?? ''}`}
    >
      {saved ? '✓ In Watchlist' : '＋ Add to Watchlist'}
    </button>
  )
}

const SEARCH_LISTBOX_ID = 'navbar-search-suggestions'

/**
 * Navbar search with a live typeahead: matches stream in while the visitor
 * types, and picking one drops straight into the grid for that title.
 * Follows the combobox/listbox pattern so arrow keys, Enter and Escape work.
 */
function SearchBox({
  query,
  onQueryChange,
  onPick,
}: {
  query: string
  onQueryChange: (value: string) => void
  onPick: (media: Media) => void
}) {
  const { results, pending, failed } = useLiveSearch(query)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const wrapRef = useRef<HTMLDivElement>(null)
  const term = query.trim()
  const showList = open && term.length >= MIN_LIVE_SEARCH_TERM
  const showResults = showList && !pending && !failed && results.length > 0

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function close() {
    setOpen(false)
    setActive(-1)
  }

  function pick(media: Media) {
    onPick(media)
    close()
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (results.length === 0) return
      event.preventDefault()
      setOpen(true)
      setActive((index) => {
        const step = event.key === 'ArrowDown' ? 1 : -1
        const next = index + step
        if (next < 0) return results.length - 1
        if (next >= results.length) return 0
        return next
      })
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      // An active row wins; otherwise the typed term stands and the grid shows it.
      if (active >= 0 && results[active]) pick(results[active])
      else close()
      return
    }
    if (event.key === 'Escape') {
      // Only dismiss the list — a second Escape can still reach other overlays.
      if (showList) event.stopPropagation()
      close()
    }
  }

  return (
    <div ref={wrapRef} className="group relative w-36 min-w-0 sm:w-52 md:w-64 md:focus-within:w-72">
      <label className="relative block">
        <span className="sr-only">Search movies and TV shows</span>
        <input
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={SEARCH_LISTBOX_ID}
          aria-autocomplete="list"
          aria-activedescendant={
            showResults && active >= 0 ? `search-option-${active}` : undefined
          }
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value)
            setActive(-1)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search for a movie or TV show..."
          className="w-full rounded-full bg-surface/80 py-2 pl-10 pr-9 text-sm text-ink placeholder-ink-muted outline-none transition focus:bg-surface-2 focus:ring-2 focus:ring-accent"
        />
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        {query !== '' && (
          <button
            type="button"
            onClick={() => {
              onQueryChange('')
              close()
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted transition hover:bg-surface-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </label>

      {showList && (
        <div className="fixed inset-x-3 top-16 z-50 mt-2 overflow-hidden rounded-2xl bg-surface ring-1 ring-line shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96">
          <ul
            id={SEARCH_LISTBOX_ID}
            role="listbox"
            aria-label="Search suggestions"
            className="max-h-96 overflow-y-auto py-1"
          >
            {pending && (
              <li
                role="presentation"
                className="flex items-center gap-3 px-4 py-3 text-sm text-ink-muted"
              >
                <span
                  className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent"
                  aria-hidden="true"
                />
                Searching…
              </li>
            )}

            {failed && (
              <li
                role="presentation"
                className="px-4 py-3 text-sm text-ink-muted"
              >
                Search is unavailable right now.
              </li>
            )}

            {!pending &&
              !failed &&
              results.length === 0 && (
                <li
                  role="presentation"
                  className="px-4 py-3 text-sm text-ink-muted"
                >
                  No matches for “{term}”.
                </li>
              )}

            {!pending &&
              !failed &&
              results.map((media, index) => (
                <li key={mediaKey(media)} role="presentation">
                  <button
                    id={`search-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => pick(media)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left transition ${
                      index === active ? 'bg-surface-3' : 'hover:bg-surface-2'
                    }`}
                  >
                    {media.poster ? (
                      <img
                        src={media.poster}
                        alt=""
                        loading="lazy"
                        width={36}
                        height={52}
                        className="h-13 w-9 shrink-0 rounded object-cover ring-1 ring-line"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-13 w-9 shrink-0 items-center justify-center rounded bg-surface-2 text-[10px] text-ink-muted"
                      >
                        N/A
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {media.title}
                      </span>
                      <span className="block truncate text-xs text-ink-muted">
                        {media.type === 'tv' ? 'TV Show' : 'Movie'} ·{' '}
                        {releaseYear(media.releaseDate)}
                        {media.rating > 0 && ` · ★ ${media.rating}`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
          </ul>

          {!pending && !failed && (
            <button
              type="button"
              onClick={close}
              className="w-full border-t border-line px-4 py-2.5 text-left text-xs font-semibold text-accent transition hover:bg-surface-2"
            >
              See all results for “{term}”
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Navbar({
  query,
  onQueryChange,
  onSearchPick,
  active,
  onSelectCategory,
  watchlistCount,
  customCount,
  user,
  onSignIn,
  onSignOut,
  onOpenAdmin,
  onOpenTeam,
  theme,
  onToggleTheme,
}: {
  query: string
  onQueryChange: (value: string) => void
  onSearchPick: (media: Media) => void
  active: Category
  onSelectCategory: (category: Category) => void
  watchlistCount: number
  customCount: number
  user: Account | null
  onSignIn: () => void
  onSignOut: () => void
  onOpenAdmin: () => void
  onOpenTeam: () => void
  theme: Theme
  onToggleTheme: () => void
}) {
  const links: { key: Category; label: string }[] = [
    { key: 'movie', label: 'Movies' },
    { key: 'tv', label: 'TV Shows' },
    { key: 'soon', label: 'Coming Soon' },
    { key: 'watchlist', label: 'Watchlist' },
    { key: 'custom', label: 'Custom' },
  ]

  /** Both badges hang off the last character of their label. */
  const badgeFor = (key: Category): number =>
    key === 'watchlist' ? watchlistCount : customCount

  return (
    <nav className="fixed inset-x-0 top-0 z-40 bg-page/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4">
        <div className="flex min-w-0 items-center gap-2">
          {/* `MovieLogo.png` is a 1444x1089 cut-out photo of the two founders,
              not a wordmark — at `h-10` it rendered as a 53x40 thumbnail nobody
              could read, and cost 794 KB to load. `team-photo.png` is the same
              photo cropped square and downscaled, so it reads as a badge.
              Rounded square, not a circle: the two heads sit in the top corners
              of the crop, and a circular mask clips the top off both of them. */}
          <img
            src="/team-photo.png"
            alt="AngkorCinemas"
            width={160}
            height={160}
            className="h-10 w-10 shrink-0 rounded-2xl object-cover"
          />
        </div>

        <div className="hidden items-center gap-6 text-sm font-semibold md:flex">
          {links.map((link) => (
            <button
              key={link.key}
              type="button"
              onClick={() => onSelectCategory(link.key)}
              className={`relative hover:text-ink ${
                active === link.key ? 'text-ink' : 'text-ink-soft'
              }`}
            >
              {link.label}
              {badgeFor(link.key) > 0 && (
                <span className="absolute -right-4 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-page">
                  {badgeFor(link.key)}
                </span>
              )}
            </button>
          ))}
          <button
            type="button"
            onClick={onOpenTeam}
            className="relative rounded-full px-3 py-1.5 text-ink-soft transition hover:bg-surface-2 hover:text-ink"
          >
            About Us
          </button>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onOpenTeam}
            className="icon-btn shrink-0 md:hidden"
            aria-label="About Us — meet the team"
            title="About Us"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
              <circle cx="10" cy="8" r="3.2" />
              <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 5.2a3.2 3.2 0 0 1 0 5.6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            className="icon-btn theme-toggle shrink-0"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={theme === 'light'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? (
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
              </svg>
            )}
          </button>
          <SearchBox query={query} onQueryChange={onQueryChange} onPick={onSearchPick} />

          {user ? (
            <div className="flex items-center gap-3">
              {user.isAdmin && (
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-bold text-ink ring-1 ring-line transition hover:bg-accent hover:text-page"
                >
                  Admin Panel
                </button>
              )}
              <span
                title={user.email}
                className="flex max-w-[9rem] items-center gap-2 rounded-full bg-page/40 py-1 pl-1 pr-3 ring-1 ring-line"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-extrabold uppercase text-page">
                  {user.email.charAt(0)}
                </span>
                <span className="hidden truncate text-xs font-semibold text-ink-soft sm:block">
                  {user.email}
                </span>
              </span>
              <button
                type="button"
                onClick={onSignOut}
                className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-bold text-ink transition hover:bg-surface-3"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="btn-neon !px-4 !py-2"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}

/**
 * Trailer overlay: an embedded player over a scrim, opened from a poster's play
 * button or a "Play Trailer" call to action.
 *
 * It reads the same cached `loadMediaVideos` list as the detail page's trailer
 * section, so opening the modal on a title whose videos are already loaded costs
 * nothing and always agrees with what the detail page shows.
 */
function TrailerModal({
  item,
  saved,
  onToggleWatchlist,
  onOpenDetails,
  onClose,
}: {
  item: Media
  saved: boolean
  onToggleWatchlist: () => void
  /** Swaps the overlay for the full title page. */
  onOpenDetails: () => void
  onClose: () => void
}) {
  const state = useAsyncSection<MediaVideo[]>(
    (signal) => loadMediaVideos(item, signal),
    [item.type, item.id],
  )
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  useModalDismiss(onClose)

  const videos = state.data ?? []
  // Null selection means "the best-ranked clip", which `loadMediaVideos` already
  // sorted official-trailer-first — so the default is the real trailer.
  const current =
    videos.find((video) => video.key === selectedKey) ?? videos[0] ?? null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${item.title} trailer`}
    >
      <div
        className="neon-panel max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative aspect-video w-full bg-ink">
          {state.loading && videos.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <span className="block h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
              <p className="text-sm text-ink-soft">Finding the trailer…</p>
            </div>
          ) : current ? (
            <iframe
              key={current.key}
              src={`${youtubeEmbed(current.key)}&autoplay=1`}
              title={`${item.title} — ${current.name}`}
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm font-semibold text-ink">
                {state.error !== null
                  ? 'Could not reach TMDB to load the trailer.'
                  : 'No trailer is available for this title.'}
              </p>
              {state.error !== null && (
                <button
                  type="button"
                  onClick={state.reload}
                  className="rounded bg-surface-2 px-4 py-2 text-sm font-bold text-ink transition hover:bg-surface-3"
                >
                  Try again
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close trailer"
            className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-page/80 text-lg text-ink backdrop-blur transition hover:bg-page focus-visible:ring-2 focus-visible:ring-accent"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-extrabold text-ink">{item.title}</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {current
                ? `${current.name} · ${current.kind}${current.official ? ' · Official' : ''}`
                : item.genres.join(', ') ||
                  (item.type === 'tv' ? 'TV Series' : 'Movie')}
            </p>
            <button
              type="button"
              onClick={onOpenDetails}
              className="mt-2 text-xs font-bold text-accent underline-offset-4 transition hover:underline focus-visible:ring-2 focus-visible:ring-accent"
            >
              View full details →
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            <WatchlistButton
              saved={saved}
              onClick={onToggleWatchlist}
              className="px-5 py-2"
            />
            <button
              type="button"
              onClick={onClose}
              className="rounded bg-surface-2 px-5 py-2 font-bold text-ink transition hover:bg-surface-3"
            >
              Close
            </button>
          </div>
        </div>

        {/* Other clips for the same title, so the modal is not limited to one
            video the way the previous inline fetch was. */}
        {videos.length > 1 && (
          <div className="border-t border-line px-5 pb-5">
            <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted">
              More clips
            </h3>
            <ul className="mt-3 flex gap-3 overflow-x-auto pb-2">
              {videos.map((video) => {
                const active = video.key === current?.key
                return (
                  <li key={video.key} className="w-44 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedKey(video.key)}
                      aria-pressed={active}
                      className={`block w-full overflow-hidden rounded-lg text-left ring-1 transition ${
                        active
                          ? 'ring-2 ring-accent'
                          : 'ring-line hover:ring-accent/60'
                      }`}
                    >
                      <span className="relative block aspect-video w-full bg-ink">
                        <img
                          src={youtubeThumb(video.key)}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute inset-0 bg-gradient-to-t from-page/85 via-page/10 to-transparent" />
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-page/80 pl-0.5 text-ink">
                            <svg
                              viewBox="0 0 24 24"
                              className="h-4 w-4 fill-current"
                              aria-hidden="true"
                            >
                              <path d="M8 5.5v13l11-6.5-11-6.5Z" />
                            </svg>
                          </span>
                        </span>
                      </span>
                      <span className="line-clamp-2 block bg-surface/80 px-2 py-1.5 text-[11px] font-semibold text-ink">
                        {video.name}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

function Hero({
  featured,
  isSaved,
  onToggleWatchlist,
  onPlayTrailer,
}: {
  featured: Media | undefined
  isSaved: (media: Media) => boolean
  onToggleWatchlist: (media: Media) => void
  onPlayTrailer: (media: Media) => void
}) {
  const year = featured ? releaseYear(featured.releaseDate) : '—'
  const featuredSaved = featured ? isSaved(featured) : false

  return (
    <header
      className="relative h-[440px] w-full overflow-hidden bg-cover bg-center"
      style={{
        backgroundImage: `url(${featured?.backdrop || TMDB_FALLBACK_BACKDROP})`,
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-page via-page/70 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-page/90 via-transparent to-transparent" />
      <div className="absolute inset-0 flex flex-col justify-center px-4 md:px-10">
        <span className="kicker mb-3 w-fit animate-neon-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-2" aria-hidden="true" />
          Featured Spotlight
        </span>
        <h1 className="max-w-3xl text-5xl font-extrabold text-ink md:text-7xl">
          Welcome<span className="neon-text">.</span>
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-soft">
          Discover exclusive movies, trending hits, and top picks curated for Cambodia.
        </p>
        {featured && (
          <>
            <div className="mt-5 flex flex-wrap gap-3">
              <span className="rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold text-ink-soft backdrop-blur">
                {featured.genres[0] || 'Movie'} • {year} • 4K
              </span>
            </div>
            <div className="mt-6 flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => onPlayTrailer(featured)}
                className="btn-neon"
              >
                ▶ Play Trailer
              </button>
              <button
                type="button"
                onClick={() => onToggleWatchlist(featured)}
                className={`btn-neon-ghost ${featuredSaved ? 'is-saved-ghost' : ''}`}
              >
                {featuredSaved ? '✓ Watchlist' : '＋ Watchlist'}
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}

function MovieCard({
  item,
  saved,
  showRemove,
  showTrailer = true,
  onToggleWatchlist,
  onSelect,
  onPlayTrailer,
}: {
  item: Media
  saved: boolean
  showRemove: boolean
  /**
   * Admin-authored titles have no TMDB video record, so the play button is
   * hidden rather than left to fail against an id that cannot exist.
   */
  showTrailer?: boolean
  onToggleWatchlist: () => void
  onSelect: () => void
  onPlayTrailer: () => void
}) {
  return (
    <article
      className="group cursor-pointer overflow-hidden rounded-lg bg-surface ring-1 ring-line transition-all duration-300 ease-out hover:-translate-y-1.5 hover:shadow-neon-lift hover:ring-accent/60"
      onClick={onSelect}
    >
      <div className="relative aspect-[2/3] overflow-hidden">
        <Poster
          src={item.poster}
          alt={item.title}
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface/90 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        {showTrailer && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onPlayTrailer()
            }}
            aria-label={`Play trailer for ${item.title}`}
            className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-page/75 pl-0.5 text-ink opacity-0 ring-1 ring-line backdrop-blur transition duration-300 hover:scale-110 hover:bg-page focus-visible:opacity-100 group-hover:opacity-100"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 fill-current"
              aria-hidden="true"
            >
              <path d="M8 5.5v13l11-6.5-11-6.5Z" />
            </svg>
          </button>
        )}
        <div className="absolute left-2 top-2">
          <RatingBadge rating={item.rating} size="sm" />
        </div>
        <span
          className={`badge-type absolute right-2 top-2 ${
            item.type === 'tv' ? 'badge-tv' : 'badge-movie'
          }`}
        >
          {item.type === 'tv' ? 'TV' : 'Movie'}
        </span>
        {showRemove ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleWatchlist()
            }}
            aria-label={`Remove ${item.title} from watchlist`}
            className="absolute bottom-2 right-2 rounded-full bg-page/80 px-3 py-1.5 text-xs font-bold text-ink ring-1 ring-line backdrop-blur transition hover:bg-accent hover:text-page"
          >
            Remove
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleWatchlist()
            }}
            aria-label={saved ? 'Remove from watchlist' : 'Add to watchlist'}
            aria-pressed={saved}
            className={`absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold shadow-lg ring-1 ring-line backdrop-blur transition hover:scale-110 ${
              saved ? 'bg-accent text-page' : 'bg-page/70 text-ink hover:bg-page/90'
            }`}
          >
            {saved ? '✓' : '＋'}
          </button>
        )}
      </div>
      <div className="p-3">
        <h3 className="truncate font-semibold text-ink" title={item.title}>
          {item.title}
        </h3>
        <p className="text-xs text-ink-muted">
          {formatDate(item.releaseDate)}
          {item.genres.length > 0 ? ` · ${item.genres[0]}` : ''}
        </p>
      </div>
    </article>
  )
}

function GenreChips({
  active,
  category,
  onSelect,
}: {
  active: GenreChip | null
  category: Category
  onSelect: (genre: GenreChip | null) => void
}) {
  const base = 'chip shrink-0'
  const on = 'chip-on'
  const visible = GENRE_CHIPS.filter(
    (chip) => category !== 'tv' || chip.tvId !== null,
  )

  return (
    <div
      // `overflow-x-auto` forces overflow-y to auto too, so the row clips
      // anything bleeding past it. The vertical padding reserves room for the
      // active chip's glow and its ::after indicator, plus `mb-7` keeps the
      // whole block clear of the grid below.
      className="-mx-4 mb-7 flex items-center gap-2 overflow-x-auto px-4 pt-2 pb-5"
      role="group"
      aria-label="Filter by genre"
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        aria-pressed={active === null}
        className={`${base} ${active === null ? on : ''}`}
      >
        All Genres
      </button>
      {visible.map((chip) => (
        <button
          key={chip.name}
          type="button"
          onClick={() => onSelect(chip)}
          aria-pressed={active === chip}
          className={`${base} ${active === chip ? on : ''}`}
        >
          {chip.name}
        </button>
      ))}
    </div>
  )
}

/**
 * The media-type tab strip. "Coming Soon" is deliberately absent: it is not a
 * type filter but its own movies-only feed, and it already has a navbar entry.
 * So is "Custom", which is neither a type nor a TMDB feed — it is the admin's
 * own list and also has a navbar entry.
 */
const tabs: { key: Category; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'movie', label: 'Movies' },
  { key: 'tv', label: 'TV Shows' },
]

/**
 * Sort and year controls for the grid. Year options come from the titles
 * actually loaded, so the list never offers a year that would return nothing.
 */
function FilterToolbar({
  sort,
  onSortChange,
  year,
  years,
  onYearChange,
  shownCount,
  totalCount,
}: {
  sort: SortKey
  onSortChange: (sort: SortKey) => void
  year: number | null
  years: number[]
  onYearChange: (year: number | null) => void
  shownCount: number
  totalCount: number
}) {
  const selectClass = 'glass-select'
  const labelClass =
    'text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted'

  return (
    <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2">
        <span className={labelClass}>Sort</span>
        <select
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SortKey)}
          aria-label="Sort titles by"
          className={selectClass}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2">
        <span className={labelClass}>Year</span>
        <select
          value={year === null ? 'all' : String(year)}
          onChange={(event) =>
            onYearChange(event.target.value === 'all' ? null : Number(event.target.value))
          }
          aria-label="Filter by release year"
          className={selectClass}
        >
          <option value="all">All years</option>
          {years.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>

      {shownCount !== totalCount && (
        <p className="text-xs text-ink-muted">
          Showing {shownCount} of {totalCount} loaded titles
        </p>
      )}
    </div>
  )
}

export function MoviePlatformApp() {
  const { theme, toggleTheme } = useTheme()
  const [filter, setFilter] = useState<Category>('all')
  const [genre, setGenre] = useState<GenreChip | null>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selected, setSelected] = useState<Media | null>(null)
  const [items, setItems] = useState<Media[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('popularity')
  const [year, setYear] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)
  /**
   * Accounts, the session and the guest watchlist are one persisted document,
   * read as an external store so the server-rendered shell and the first client
   * render always agree. See `usePersistedAuth` in src/lib/authStore.ts.
   */
  const { users, sessionEmail, guestWatchlist } = usePersistedAuth()
  /**
   * Admin-authored titles, shaped into the same `Media` the TMDB feed produces
   * so they render through the identical grid and card components. See
   * `customMovieStore`.
   */
  const customMovies = useCustomMovies()
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)
  const [authHint, setAuthHint] = useState<string | undefined>(undefined)
  const [adminOpen, setAdminOpen] = useState(false)
  const [teamOpen, setTeamOpen] = useState(false)
  const [trailerItem, setTrailerItem] = useState<Media | null>(null)
  const [person, setPerson] = useState<PersonRef | null>(null)
  /** The quick filmography panel, which sits over the title page it was opened from. */
  const [peeked, setPeeked] = useState<PersonRef | null>(null)
  /** A "Load more" in flight, so a tab change can cancel it. */
  const moreRequest = useRef<AbortController | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    // The watchlist and the custom catalogue render straight from state, so
    // neither needs a request.
    if (filter === 'watchlist' || filter === 'custom') return

    const category: FeedCategory = filter
    const searchTerm = debouncedQuery.trim()
    const controller = new AbortController()
    let cancelled = false

    // Any half-finished append belongs to the previous feed. Clearing the ref
    // stops the stale request from clearing the flag for the new one.
    moreRequest.current?.abort()
    moreRequest.current = null

    async function load() {
      setLoading(true)
      setLoadingMore(false)
      setMoreError(null)
      try {
        const result = await fetchFeedPage(
          category,
          genre,
          searchTerm,
          1,
          controller.signal,
        )
        if (cancelled) return
        setItems(dedupe(result.items))
        setPage(1)
        setTotalPages(result.totalPages)
        setError(null)
      } catch (e) {
        if (cancelled || controller.signal.aborted) return
        setItems([])
        setError(e instanceof Error ? e.message : 'Something went wrong')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [filter, genre, debouncedQuery])

  const isWatchlistView = filter === 'watchlist'
  const isCustomView = filter === 'custom'
  /** Tabs fed by local state: no request, no loading spinner, no Load more. */
  const isLocalView = isWatchlistView || isCustomView
  const hasMore = !isLocalView && page < totalPages

  /** Appends the next page in place; the first page comes from the effect above. */
  const loadMore = useCallback(async () => {
    if (isLocalView || loadingMore || loading || page >= totalPages) return
    const category: FeedCategory = filter
    const searchTerm = debouncedQuery.trim()
    const next = page + 1
    const controller = new AbortController()
    moreRequest.current = controller
    setLoadingMore(true)
    setMoreError(null)
    try {
      const result = await fetchFeedPage(
        category,
        genre,
        searchTerm,
        next,
        controller.signal,
      )
      if (controller.signal.aborted) return
      setItems((prev) => dedupe([...prev, ...result.items]))
      setPage(next)
      setTotalPages(result.totalPages)
    } catch (e) {
      if (controller.signal.aborted) return
      setMoreError(
        e instanceof Error ? e.message : 'Could not load more titles',
      )
    } finally {
      if (moreRequest.current === controller) moreRequest.current = null
      if (!controller.signal.aborted) setLoadingMore(false)
    }
  }, [
    filter,
    genre,
    debouncedQuery,
    page,
    totalPages,
    loadingMore,
    loading,
    isLocalView,
  ])

  const currentUser = useMemo(
    () =>
      sessionEmail === null
        ? null
        : (users.find((user) => user.email === sessionEmail) ?? null),
    [users, sessionEmail],
  )
  const watchlist = currentUser?.watchlist ?? guestWatchlist
  const isAdmin = currentUser?.isAdmin ?? false

  const savedKeys = useMemo(
    () => new Set(watchlist.map(mediaKey)),
    [watchlist],
  )

  const isSaved = useCallback(
    (media: Media) => savedKeys.has(mediaKey(media)),
    [savedKeys],
  )

  const openAuth = useCallback((mode: AuthMode, hint?: string) => {
    setAuthMode(mode)
    setAuthHint(hint)
  }, [])

  const closeAuth = useCallback(() => {
    setAuthMode(null)
    setAuthHint(undefined)
  }, [])

  const closeAdmin = useCallback(() => setAdminOpen(false), [])

  const updateOwnWatchlist = useCallback(
    (update: (current: Media[]) => Media[]) => {
      setPersistedAuth((current) => ({
        ...current,
        users: current.users.map((user) =>
          user.email === sessionEmail
            ? { ...user, watchlist: update(user.watchlist) }
            : user,
        ),
      }))
    },
    [sessionEmail],
  )

  /** Signed-out visitors save to their own local list, mirrored to storage. */
  const updateGuestWatchlist = useCallback(
    (update: (current: Media[]) => Media[]) => {
      setPersistedAuth((current) => ({
        ...current,
        guestWatchlist: update(current.guestWatchlist),
      }))
    },
    [],
  )

  const addToWatchlist = useCallback(
    (media: Media) => {
      updateOwnWatchlist((current) =>
        current.some((item) => mediaKey(item) === mediaKey(media))
          ? current
          : [media, ...current],
      )
    },
    [updateOwnWatchlist],
  )

  const removeFromWatchlist = useCallback(
    (media: Media) => {
      updateOwnWatchlist((current) =>
        current.filter((item) => mediaKey(item) !== mediaKey(media)),
      )
    },
    [updateOwnWatchlist],
  )

  const addToGuestWatchlist = useCallback(
    (media: Media) => {
      updateGuestWatchlist((current) =>
        current.some((item) => mediaKey(item) === mediaKey(media))
          ? current
          : [media, ...current],
      )
    },
    [updateGuestWatchlist],
  )

  const removeFromGuestWatchlist = useCallback(
    (media: Media) => {
      updateGuestWatchlist((current) =>
        current.filter((item) => mediaKey(item) !== mediaKey(media)),
      )
    },
    [updateGuestWatchlist],
  )

  /**
   * Saving works signed out too: guests get a local list that survives reloads,
   * and signing in folds it into the account (see handleAuthenticated).
   */
  const toggleWatchlist = useCallback(
    (media: Media) => {
      if (currentUser === null) {
        if (isSaved(media)) removeFromGuestWatchlist(media)
        else addToGuestWatchlist(media)
        return
      }
      if (isSaved(media)) removeFromWatchlist(media)
      else addToWatchlist(media)
    },
    [
      currentUser,
      isSaved,
      addToWatchlist,
      removeFromWatchlist,
      addToGuestWatchlist,
      removeFromGuestWatchlist,
    ],
  )

  function handleAuthenticated(account: Account, nextUsers: Account[]) {
    // Carry over anything saved before the account existed. The guest list is
    // unioned rather than swapped in: signing in to an account that already has
    // saves used to throw the guest list away, silently losing titles.
    const guest = dedupe(guestWatchlist)
    const merged = dedupe([...account.watchlist, ...guest])
    // One write covers all three keys: the account keeps the merged list, the
    // session opens, and the guest list is emptied. Clearing it here is what
    // stops signing back out from resurrecting the pre-login titles.
    setPersistedAuth(() => ({
      users: nextUsers.map((user) =>
        user.email === account.email ? { ...user, watchlist: merged } : user,
      ),
      sessionEmail: account.email,
      guestWatchlist: [],
    }))
    closeAuth()
  }

  function handleSignOut() {
    setPersistedAuth((current) => ({ ...current, sessionEmail: null }))
  }

  /** A typeahead pick should land on results, not on whatever tab was open. */
  function handleSearchPick(media: Media) {
    setQuery(media.title)
    if (filter !== 'all') setFilter('all')
    if (genre !== null) setGenre(null)
    setYear(null)
    document.getElementById('popular')?.scrollIntoView({ behavior: 'smooth' })
  }

  function handleDeleteUser(email: string) {
    if (email === sessionEmail) return
    setPersistedAuth((current) => ({
      ...current,
      users: current.users.filter((user) => user.email !== email),
    }))
  }

  /**
   * Cast names open the quick panel and crew names the full filmography — see
   * MovieDetail's prop docs. Whichever opens, the other layer is dismissed first
   * so the two can never stack on top of each other.
   */
  function handleSelectPerson(person: PersonRef, peek: boolean) {
    setPerson(null)
    setPeeked(peek ? person : null)
  }

  /** The quick panel's "view full filmography" hand-off. */
  function promotePeekToFull() {
    if (peeked === null) return
    const target = peeked
    setPeeked(null)
    setPerson(target)
  }

  const featured = items[0]
  const needle = debouncedQuery.trim().toLowerCase()
  const isLoading = loading && !isLocalView
  const feedError = isLocalView ? null : error

  const customMedia = useMemo(() => customMovies.map(customToMedia), [customMovies])

  /** Everything the current view could show, before sort and year narrowing. */
  const source = useMemo(
    () => (isCustomView ? customMedia : isWatchlistView ? watchlist : items),
    [isCustomView, customMedia, isWatchlistView, watchlist, items],
  )

  const availableYears = useMemo(() => collectYears(source), [source])

  /**
   * A year that has left the feed would silently hide everything, so it is
   * ignored rather than reset — the selection comes back on its own if the user
   * returns to a feed that still has that year.
   */
  const activeYear =
    year !== null && availableYears.includes(year) ? year : null

  const shown = useMemo(() => {
    const matching = isCustomView
      ? // Every custom title is a movie, so only the genre chip and the search
        // term narrow this list. `hasGenre` matches these by genre name, since
        // they carry no TMDB genre ids.
        source.filter((item) => {
          if (genre && !hasGenre(item, genre)) return false
          return !needle || item.title.toLowerCase().includes(needle)
        })
      : isWatchlistView
        ? source.filter(
            (item) => !needle || item.title.toLowerCase().includes(needle),
          )
        : source.filter((item) => {
            // "soon" is already a movies-only feed, so a type check would only
            // ever be `item.type === 'movie'` and could never fail.
            if (filter !== 'all' && filter !== 'soon' && item.type !== filter) {
              return false
            }
            if (genre && !hasGenre(item, genre)) return false
            return !needle || item.title.toLowerCase().includes(needle)
          })
    return matching
      .filter((item) => activeYear === null || yearOf(item) === activeYear)
      .sort((a, b) => compareMedia(a, b, sort))
  }, [source, isCustomView, isWatchlistView, filter, genre, needle, activeYear, sort])

  const baseHeading = isCustomView
    ? 'Custom Catalogue'
    : isWatchlistView
      ? 'My Watchlist'
      : filter === 'soon'
        ? 'Coming Soon · Release Calendar'
        : filter === 'movie'
          ? 'Popular Movies'
          : filter === 'tv'
            ? 'Popular TV Shows'
            : 'Popular Movies & TV Shows'

  const heading = [
    baseHeading,
    genre && !isWatchlistView ? ` · ${genre.name}` : '',
    isLocalView ? ` (${source.length})` : '',
  ].join('')

  const sourceLabel = isCustomView
    ? 'localStorage · soogood_kh_custom_movies_v1'
    : isWatchlistView
      ? currentUser
        ? `saved to ${currentUser.email}`
        : 'sign in to save titles'
      : debouncedQuery.trim()
        ? '/3/search/multi'
        : filter === 'soon'
          ? `/3/discover/movie?primary_release_date.gte=today&sort_by=primary_release_date.asc${
              genre ? `&with_genres=${genre.id}` : ''
            }`
          : genre === null
            ? filter === 'all'
              ? '/3/trending/all/day'
              : `/3/${filter}/popular`
            : filter === 'all'
              ? genre.tvId === null
                ? `/3/discover/movie?with_genres=${genre.id}`
                : `/3/discover/movie?with_genres=${genre.id} + /3/discover/tv?with_genres=${genre.tvId}`
              : filter === 'tv'
                ? `/3/discover/tv?with_genres=${genre.tvId}`
                : `/3/discover/movie?with_genres=${genre.id}`

  function selectCategory(category: Category) {
    setFilter(category)
    // Drop a movie-only genre when landing on the TV tab, which has no such id.
    if (category === 'tv' && genre?.tvId === null) setGenre(null)
    // Years rarely overlap between feeds, so a filter carried across tabs would
    // usually empty the grid.
    if (!isLocalCategory(category)) setYear(null)
  }

  return (
    <div className="min-h-screen text-ink">
      <Navbar
        query={query}
        onQueryChange={setQuery}
        onSearchPick={handleSearchPick}
        active={filter}
        onSelectCategory={selectCategory}
        watchlistCount={watchlist.length}
        customCount={customMovies.length}
        user={currentUser}
        onSignIn={() => openAuth('login')}
        onSignOut={handleSignOut}
        onOpenAdmin={() => setAdminOpen(true)}
        onOpenTeam={() => setTeamOpen(true)}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <Hero
        featured={featured}
        isSaved={isSaved}
        onToggleWatchlist={toggleWatchlist}
        onPlayTrailer={setTrailerItem}
      />

      <main id="popular" className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">{heading}</h2>
            <p className="mt-1 font-mono text-xs text-ink-muted">source: {sourceLabel}</p>
          </div>

          <div
            className="flex rounded-full bg-surface/70 p-1 ring-1 ring-line backdrop-blur"
            role="tablist"
            aria-label="Filter by media type"
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={filter === tab.key}
                onClick={() => selectCategory(tab.key)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  filter === tab.key
                    ? 'bg-accent text-ink shadow'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {!isWatchlistView && (
          <GenreChips active={genre} category={filter} onSelect={setGenre} />
        )}

        {isCustomView && (
          <p className="mb-4 rounded-xl bg-page/40 p-4 text-sm text-ink-soft ring-1 ring-line">
            Titles added by an admin, stored on this device. They sit beside the
            TMDB catalogue in their own tab so the trending and popularity feeds
            stay untouched.{' '}
            {isAdmin ? 'Manage them under Admin Panel → Movies.' : ''}
          </p>
        )}

        <FilterToolbar
          sort={sort}
          onSortChange={setSort}
          year={activeYear}
          years={availableYears}
          onYearChange={setYear}
          shownCount={shown.length}
          totalCount={source.length}
        />

        {isLoading ? (
          <div className="py-20 text-center text-ink-muted">
            <span className="mx-auto block h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent" />
            <p className="mt-4 text-lg font-semibold">Loading movies & TV shows…</p>
          </div>
        ) : feedError ? (
          <div className="py-20 text-center text-ink-muted">
            <p className="text-4xl">⚠️</p>
            <p className="mt-4 text-lg font-semibold">Couldn’t load titles</p>
            <p className="mt-1 text-sm">{feedError}</p>
          </div>
        ) : shown.length > 0 ? (
          <>
            {filter === 'soon' ? (
              <ComingSoonCalendar
                items={shown}
                isSaved={isSaved}
                onSelect={setSelected}
                onToggleWatchlist={toggleWatchlist}
                onPlayTrailer={setTrailerItem}
              />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {shown.map((item) => (
                  <MovieCard
                    key={mediaKey(item)}
                    item={item}
                    saved={isSaved(item)}
                    showRemove={isWatchlistView}
                    showTrailer={item.isCustom !== true}
                    onToggleWatchlist={() => toggleWatchlist(item)}
                    onSelect={() => setSelected(item)}
                    onPlayTrailer={() => setTrailerItem(item)}
                  />
                ))}
              </div>
            )}

            {!isWatchlistView && (hasMore || moreError !== null) && (
              <div className="mt-10 flex flex-col items-center gap-3">
                {moreError !== null ? (
                  <p className="text-sm text-ink-muted">{moreError}</p>
                ) : null}
                {hasMore && (
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="btn-neon rounded-full px-6 py-3 disabled:cursor-wait disabled:opacity-70"
                  >
                    {loadingMore ? (
                      <>
                        <span
                          aria-hidden="true"
                          className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                        />
                        Loading…
                      </>
                    ) : (
                      'Load more'
                    )}
                  </button>
                )}
                <p className="text-xs text-ink-muted">
                  {items.length} titles loaded · page {page} of {totalPages}
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="py-20 text-center text-ink-muted">
            <p className="text-4xl">
              {isCustomView ? '🎞️' : isWatchlistView ? '🎬' : '🔎'}
            </p>
            <p className="mt-4 text-lg font-semibold">
              {needle
                ? `No results for “${query.trim()}”`
                : isCustomView
                  ? customMovies.length === 0
                    ? 'No custom titles yet'
                    : 'Nothing matches these filters'
                  : isWatchlistView
                    ? 'Your watchlist is empty'
                    : activeYear !== null
                      ? `No titles released in ${activeYear}`
                      : genre
                        ? `No ${genre.name} titles found`
                        : 'Nothing here yet'}
            </p>
            <p className="mt-1 text-sm">
              {isCustomView
                ? customMovies.length === 0
                  ? isAdmin
                    ? 'Open Admin Panel → Movies to add the first one.'
                    : 'An admin can add titles from the Admin Panel.'
                  : 'Pick a different year or clear the filters.'
                : isWatchlistView
                  ? 'Tap ＋ on any movie or show to save it here.'
                  : activeYear !== null
                    ? 'Pick a different year or clear the filters.'
                    : 'Try a different title, genre, or clear the search.'}
            </p>
          </div>
        )}
      </main>

      <footer className="border-t border-line py-8 text-center text-xs text-ink-muted">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4">
          <p className="text-ink-soft">AngkorCinemas © 2026 · A Movie Platform demo</p>

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <button
              type="button"
              onClick={() => setTeamOpen(true)}
              className="font-semibold text-ink-soft underline-offset-4 transition hover:text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent"
            >
              About Us
            </button>
            <span aria-hidden="true" className="text-ink-muted">
              ·
            </span>

            {/* TMDB requires visible credit for API use plus a non-endorsement note. */}
            <p className="max-w-lg text-pretty">
              Uses the{' '}
              <a
                href="https://www.themoviedb.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-ink-soft underline-offset-4 transition hover:text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent"
              >
                TMDB API
              </a>
              . This product is not endorsed or certified by TMDB.
            </p>
          </div>
        </div>
      </footer>

      {selected && (
        <MovieDetail
          key={mediaKey(selected)}
          item={selected}
          saved={isSaved(selected)}
          onToggleWatchlist={() => toggleWatchlist(selected)}
          // The detail view is keyed by media, so swapping `selected` remounts
          // it on the new title and returns the reader to the top of the page.
          onSelectMedia={setSelected}
          onSelectPerson={handleSelectPerson}
          onPlayTrailer={setTrailerItem}
          onClose={() => {
            setPeeked(null)
            setSelected(null)
          }}
        />
      )}

      {/* Rendered after the detail view so a person page opened from a cast
          name sits on top of it, and picking a film swaps straight over. */}
      {person && (
        <PersonDetail
          key={person.id}
          person={person}
          onSelectMedia={(media) => {
            setPerson(null)
            setPeeked(null)
            setSelected(media)
          }}
          onClose={() => setPerson(null)}
        />
      )}

      {/* Above the detail view: the quick panel is a peek at someone else, and
          the title page it was opened from stays mounted behind it. */}
      {peeked && (
        <PersonQuickLook
          key={`peek-${peeked.id}`}
          person={peeked}
          onClose={() => setPeeked(null)}
          onOpenFull={promotePeekToFull}
          onSelectMedia={(media) => {
            setPeeked(null)
            setSelected(media)
          }}
        />
      )}

      {trailerItem !== null && (
        <TrailerModal
          key={`${trailerItem.type}-${trailerItem.id}`}
          item={trailerItem}
          saved={isSaved(trailerItem)}
          onToggleWatchlist={() => toggleWatchlist(trailerItem)}
          // Keeps the modal open behind the detail view rather than flashing the
          // grid: `setSelected` re-renders App, and the overlay is only unmounted
          // once `trailerItem` clears on the next tick of that same commit.
          onOpenDetails={() => {
            const target = trailerItem
            setTrailerItem(null)
            setSelected(target)
          }}
          onClose={() => setTrailerItem(null)}
        />
      )}

      {authMode !== null && (
        <AuthModal
          mode={authMode}
          users={users}
          hint={authHint}
          onAuthenticated={handleAuthenticated}
          onClose={closeAuth}
        />
      )}

      {adminOpen && isAdmin && currentUser && (
        <AdminDashboard
          users={users}
          currentEmail={currentUser.email}
          onDeleteUser={handleDeleteUser}
          onClose={closeAdmin}
        />
      )}

      {teamOpen && <TeamPage onClose={() => setTeamOpen(false)} />}
    </div>
  )
}

