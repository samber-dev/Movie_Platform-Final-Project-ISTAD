'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AdminDashboard } from './AdminDashboard'
import { AuthModal } from './AuthModal'
import { ProfileSettings } from './ProfileSettings'
import { ComingSoonCalendar } from './ComingSoon'
import { MovieDetail } from './MovieDetail'
import { PersonDetail } from './PersonDetail'
import type { PersonRef } from './PersonDetail'
import { PersonQuickLook } from './PersonQuickLook'
import { TeamPage } from './TeamPage'
import { setPersistedAuth, usePersistedAuth } from '../lib/authStore'
import { recordActivity, recordMediaActivity } from '../lib/activityStore'
import Footer from './Footer'
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

type Category = 'all' | 'movie' | 'tv' | 'soon' | 'watchlist'
/**
 * Categories the TMDB feed can serve. The watchlist renders straight from local
 * state, so it needs no request.
 */
type FeedCategory = Exclude<Category, 'watchlist'>

/** Tabs fed by local state rather than a TMDB request. */
function isLocalCategory(category: Category): boolean {
  return category === 'watchlist'
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
const NAV_MENU_ID = 'navbar-menu'

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
    // Fills whatever the navbar's flex row leaves over: the field is the one
    // elastic element in the bar, so signing in as an admin — which adds the
    // admin and sign-out controls — narrows the search instead of pushing the
    // row into a wrap or an overlap.
    <div ref={wrapRef} className="group relative w-full min-w-0">
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

/* ==========================================================================
   Navbar icons
   Kept as components rather than inline markup so the desktop bar, the mobile
   drawer and the account block below can all reuse one glyph at one size.
   ========================================================================== */

const ICON_CLASS = 'h-5 w-5'
const ICON_PROPS = {
  viewBox: '0 0 24 24',
  className: ICON_CLASS,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

function PeopleIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
      <circle cx="10" cy="8" r="3.2" />
      <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 5.2a3.2 3.2 0 0 1 0 5.6" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 3 5 6v5.5c0 4 2.9 7.6 7 8.5 4.1-.9 7-4.5 7-8.5V6l-7-3Z" />
      <path d="m9.5 12 1.8 1.8 3.4-3.6" />
    </svg>
  )
}

/**
 * The greeting shown for an account: the display name once one is set, otherwise
 * the email's local part. Never the whole address in the navbar — it does not
 * fit next to a search — and never a blank, which would render an avatar with no
 * letter in it.
 */
export function accountLabel(account: Account): string {
  return account.displayName ?? account.email.split('@')[0]
}

/**
 * An account's avatar: the uploaded picture when there is one, otherwise the
 * initial on the accent fill.
 *
 * The image is decorative — the accessible name belongs to whatever button wraps
 * it — so it is `alt=""` and the letter is hidden from assistive tech. Sizes are
 * fixed rather than fluid because the same component renders in the 36px navbar
 * circle and the 32px drawer one, and a fluid avatar would blur the upload.
 */
export function AccountAvatar({
  account,
  size = 'md',
}: {
  account: Account
  size?: 'sm' | 'md'
}) {
  const edge = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-9 w-9 text-sm'

  if (account.avatar) {
    return (
      <img
        src={account.avatar}
        alt=""
        className={`${edge} shrink-0 rounded-full object-cover ring-1 ring-accent/40`}
      />
    )
  }

  return (
    <span
      aria-hidden="true"
      className={`flex ${edge} shrink-0 items-center justify-center rounded-full bg-accent/15 font-extrabold uppercase text-accent ring-1 ring-accent/40`}
    >
      {accountLabel(account).charAt(0)}
    </span>
  )
}

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" />
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M14 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" />
      <path d="M10 12h10M17 9l3 3-3 3" />
    </svg>
  )
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg {...ICON_PROPS}>
      {open ? (
        <path d="M6 6l12 12M18 6 6 18" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" />
      )}
    </svg>
  )
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className={ICON_CLASS}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

type NavLinkProps = {
  label: string
  active: boolean
  onClick: () => void
  /** Count pill — watchlist and custom carry one, the rest do not. */
  badge?: number
  icon?: ReactNode
  /** Full-width row for the mobile drawer instead of an inline pill. */
  block?: boolean
}

/**
 * One destination, used by both the desktop row and the mobile drawer so the
 * two can never disagree about which section is current.
 */
function NavLink({
  label,
  active,
  onClick,
  badge = 0,
  icon,
  block = false,
}: NavLinkProps) {
  const base =
    'relative flex items-center rounded-full font-semibold transition focus-visible:ring-2 focus-visible:ring-accent'
  const tone = active
    ? 'bg-surface-2 text-ink'
    : 'text-ink-soft hover:bg-surface-2/70 hover:text-ink'

  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`${base} ${
        block
          ? 'w-full justify-between gap-3 px-4 py-3 text-left text-base'
          : // 13px at `lg`, back up to 14px at `xl`: the link row shares the
            // bar with the search and, for an admin, two extra buttons, and
            // that is the only place the bar gets genuinely tight.
            'gap-1.5 px-2 py-2 text-[0.8125rem] xl:px-3 xl:text-sm'
      } ${tone}`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {icon && (
          <span
            aria-hidden="true"
            className={active ? 'text-accent' : 'text-ink-muted'}
          >
            {icon}
          </span>
        )}
        <span className="truncate">{label}</span>
      </span>

      {badge > 0 && (
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
            active ? 'bg-accent text-page' : 'bg-surface-3 text-ink-soft'
          }`}
        >
          {badge}
        </span>
      )}

      {/* Active marker, anchored to the pill itself so it tracks the selection
          with no measuring in JS. Suppressed in the drawer, where the filled
          background already says it. */}
      {active && !block && (
        <span
          aria-hidden="true"
          className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent shadow-neon"
        />
      )}
    </button>
  )
}

/**
 * The top bar, in three fixed zones so the row can never wrap into a mess:
 *
 *   left   brand lockup
 *   middle navigation links (inline from `lg`, a drawer below it)
 *   right  search, theme, then the account controls
 *
 * The search is the only elastic element — it is wrapped in `flex-1` and takes
 * whatever width the other zones leave, so an admin's two extra buttons narrow
 * the field instead of overflowing the bar. The account controls drop their
 * labels at `lg` and the email only ever exists as the avatar's accessible
 * name, because six links plus a search plus four account controls do not fit
 * on one 1280px row in full.
 */
function Navbar({
  query,
  onQueryChange,
  onSearchPick,
  active,
  onSelectCategory,
  watchlistCount,
  user,
  onSignIn,
  onSignOut,
  onOpenAdmin,
  onOpenProfile,
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
  user: Account | null
  onSignIn: () => void
  onSignOut: () => void
  onOpenAdmin: () => void
  onOpenProfile: () => void
  onOpenTeam: () => void
  theme: Theme
  onToggleTheme: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const navRef = useRef<HTMLElement>(null)

  const closeMenu = useCallback(() => setMenuOpen(false), [])

  // Escape and the scroll lock come from the shared overlay hook, gated on the
  // drawer actually being open.
  useModalDismiss(closeMenu, menuOpen)

  // A tap anywhere outside the bar dismisses the drawer, the same way a click
  // outside a modal dismisses it.
  useEffect(() => {
    if (!menuOpen) return
    function onPointerDown(event: PointerEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        closeMenu()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menuOpen, closeMenu])

  /**
   * Five destinations, and the Custom tab is deliberately not one of them:
   * admin-authored titles are merged into the Movies and All feeds below, so
   * they are browsable without a tab of their own.
   */
  const links: { key: Category; label: string }[] = [
    { key: 'movie', label: 'Movies' },
    { key: 'tv', label: 'TV Shows' },
    { key: 'soon', label: 'Coming Soon' },
    { key: 'watchlist', label: 'Watchlist' },
  ]

  /** The badge hangs off its own label rather than floating beside it. */
  const badgeFor = (key: Category): number =>
    key === 'watchlist' ? watchlistCount : 0

  /** Selecting a destination from the drawer also dismisses it. */
  function go(category: Category) {
    onSelectCategory(category)
    closeMenu()
  }

  function openTeam() {
    onOpenTeam()
    closeMenu()
  }

  return (
    <nav
      ref={navRef}
      aria-label="Main"
      className="fixed inset-x-0 top-0 z-40 border-b border-line bg-page/85 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-3">
        {/* ---- Left: brand ------------------------------------------------ */}
        <button
          type="button"
          onClick={() => go('all')}
          aria-label="AngkorCinemas — browse everything"
          className="flex shrink-0 items-center gap-2.5 rounded-xl pr-1 text-left"
        >
          {/* `MovieLogo.png` is a 1444x1089 cut-out photo of the two founders,
              not a wordmark — at `h-10` it rendered as a 53x40 thumbnail nobody
              could read, and cost 794 KB to load. `team-photo.png` is the same
              photo cropped square and downscaled, so it reads as a badge.
              Rounded square, not a circle: the two heads sit in the top corners
              of the crop, and a circular mask clips the top off both of them. */}
          <img
            src="/team-photo.png"
            alt=""
            width={160}
            height={160}
            className="h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-line"
          />
          <span className="hidden min-w-0 leading-tight sm:block">
            <span className="block truncate text-[15px] font-extrabold tracking-tight text-ink">
              Angkor<span className="neon-text">Cinemas</span>
            </span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted">
              MOVIE PLATFORM
            </span>
          </span>
        </button>

        {/* ---- Middle: destinations, inline once there is room for them ---- */}
        <ul className="hidden items-center lg:flex">
          {links.map((link) => (
            <li key={link.key}>
              <NavLink
                label={link.label}
                badge={badgeFor(link.key)}
                active={active === link.key}
                onClick={() => onSelectCategory(link.key)}
              />
            </li>
          ))}
          {/* No icon here, unlike the drawer below: four text links and a fifth
              text link read as one set, and 26px of glyph is 26px the search
              does not have at `lg`. */}
          <li>
            <NavLink label="About Us" active={false} onClick={onOpenTeam} />
          </li>
        </ul>

        {/* ---- Right: search, theme, then the account controls -------------
            `flex-1` with `min-w-0`: this cluster absorbs every pixel the
            brand and the link row do not claim, and the search inside it is
            the one thing allowed to shrink. */}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <SearchBox query={query} onQueryChange={onQueryChange} onPick={onSearchPick} />

          <button
            type="button"
            onClick={onToggleTheme}
            className="icon-btn theme-toggle shrink-0"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-pressed={theme === 'light'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          {user ? (
            <div className="flex shrink-0 items-center gap-2">
              {user.isAdmin && (
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  aria-label="Open the admin panel"
                  title="Admin Panel"
                  className="hidden items-center gap-2 rounded-full bg-surface-2 px-2.5 py-2 text-sm font-bold text-ink ring-1 ring-line transition hover:bg-accent hover:text-page lg:inline-flex"
                >
                  <ShieldIcon />
                  <span className="hidden xl:inline">Admin Panel</span>
                </button>
              )}

              {/* The avatar carries the account, so it is the accessible name and
                  the tooltip rather than inline text — and it is a button, because
                  clicking it is how a profile is edited. */}
              <button
                type="button"
                onClick={onOpenProfile}
                aria-label={`Profile settings for ${accountLabel(user)}`}
                title={`${accountLabel(user)} — profile settings`}
                className="shrink-0 rounded-full transition hover:ring-2 hover:ring-accent focus-visible:ring-2 focus-visible:ring-accent"
              >
                <AccountAvatar account={user} />
              </button>

              <button
                type="button"
                onClick={onSignOut}
                aria-label="Sign out"
                title="Sign Out"
                className="hidden items-center gap-2 rounded-full bg-surface-2 px-2.5 py-2 text-sm font-bold text-ink-soft ring-1 ring-line transition hover:bg-surface-3 hover:text-ink lg:inline-flex"
              >
                <SignOutIcon />
                <span className="hidden xl:inline">Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="btn-neon shrink-0 !px-4 !py-2"
            >
              Sign In
            </button>
          )}

          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls={NAV_MENU_ID}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="icon-btn shrink-0 lg:hidden"
          >
            <MenuIcon open={menuOpen} />
          </button>
        </div>
      </div>

      {/* ---- Mobile drawer: the same destinations, stacked --------------- */}
      {menuOpen && (
        <div
          id={NAV_MENU_ID}
          className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-line bg-page/95 shadow-neon-soft backdrop-blur-xl lg:hidden"
        >
          <div className="mx-auto max-w-7xl space-y-5 p-4">
            <div>
              <p className="px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted">
                Browse
              </p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {links.map((link) => (
                  <li key={link.key}>
                    <NavLink
                      block
                      label={link.label}
                      badge={badgeFor(link.key)}
                      active={active === link.key}
                      onClick={() => go(link.key)}
                    />
                  </li>
                ))}
                <li>
                  <NavLink
                    block
                    label="About Us"
                    icon={<PeopleIcon />}
                    active={false}
                    onClick={openTeam}
                  />
                </li>
              </ul>
            </div>

            {user && (
              <div>
                <p className="px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted">
                  Account
                </p>
                <div className="mt-2 rounded-2xl bg-surface/70 p-3 ring-1 ring-line">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu()
                        onOpenProfile()
                      }}
                      aria-label={`Profile settings for ${accountLabel(user)}`}
                      className="shrink-0 rounded-full transition hover:ring-2 hover:ring-accent focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <AccountAvatar account={user} size="sm" />
                    </button>
                    <span className="min-w-0">
                      {user.displayName && (
                        <span className="block truncate text-sm font-bold text-ink">
                          {user.displayName}
                        </span>
                      )}
                      <span className="block truncate text-sm text-ink-muted">
                        {user.email}
                      </span>
                    </span>
                  </div>
                  {/* Admin and sign-out live here rather than in the bar, so a
                      signed-in admin's extra controls cannot crowd the search
                      field on a phone. */}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu()
                        onOpenProfile()
                      }}
                      className="flex items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 py-2.5 text-sm font-bold text-ink ring-1 ring-line transition hover:bg-surface-3"
                    >
                      <UserIcon />
                      Settings
                    </button>
                    {user.isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          closeMenu()
                          onOpenAdmin()
                        }}
                        className="btn-neon justify-start !px-4 !py-2.5"
                      >
                        <ShieldIcon />
                        Admin Panel
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onSignOut}
                      className="flex items-center gap-2 rounded-xl bg-surface-2 px-4 py-2.5 text-sm font-bold text-ink ring-1 ring-line transition hover:bg-surface-3"
                    >
                      <SignOutIcon />
                      Sign Out
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
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
   * so they render through the identical grid and card components. They are
   * merged into the Movies and All feeds rather than given a navbar tab; see the
   * `feed` memo. See `customMovieStore`.
   */
  const customMovies = useCustomMovies()
  const [authMode, setAuthMode] = useState<AuthMode | null>(null)
  const [authHint, setAuthHint] = useState<string | undefined>(undefined)
  const [adminOpen, setAdminOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
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
    // The watchlist renders straight from state, so it needs no request.
    if (filter === 'watchlist') return

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
  /** Tabs fed by local state: no request, no loading spinner, no Load more. */
  const isLocalView = isWatchlistView
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
  const closeProfile = useCallback(() => setProfileOpen(false), [])

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
      const wasSaved = isSaved(media)
      // Logged here rather than in the four writers below, because this is the
      // one place that knows both the direction and whether the actor was a guest.
      recordMediaActivity(
        wasSaved ? 'watchlist.removed' : 'watchlist.added',
        wasSaved ? 'Removed' : 'Saved',
        media,
        currentUser === null ? null : currentUser.email,
      )

      if (currentUser === null) {
        if (wasSaved) removeFromGuestWatchlist(media)
        else addToGuestWatchlist(media)
        return
      }
      if (wasSaved) removeFromWatchlist(media)
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
    // The sign-in/register event is recorded by AuthModal, which knows which of the
    // two actually happened.
    //
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
    // Recorded before the session is cleared, since afterwards there is no
    // account left to attribute it to.
    recordActivity('auth.signed-out', 'Signed out', sessionEmail)
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
    recordActivity('admin.user-deleted', `Deleted the account ${email}`, sessionEmail)
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

  /**
   * The TMDB feed with admin-authored titles folded into it, so a locally added
   * movie is browsable exactly like a TMDB one instead of sitting behind a tab of
   * its own. They are appended rather than interleaved: a custom title has no
   * TMDB popularity, so it would otherwise sort to the bottom of a popularity
   * sort and read as "not really part of the catalogue".
   *
   * `dedupe` still runs because a custom title's negative id cannot collide with
   * a TMDB id — but the feed may already have been appended to by "Load more",
   * and this is the one place the two lists are joined.
   *
   * The release calendar is excluded: Coming Soon is a TMDB release-date feed,
   * and a hand-entered year would land a title in the wrong month.
   */
  const feed = useMemo(
    () =>
      filter === 'soon' || customMedia.length === 0
        ? items
        : dedupe([...items, ...customMedia]),
    [filter, items, customMedia],
  )

  /** Everything the current view could show, before sort and year narrowing. */
  const source = isWatchlistView ? watchlist : feed

  const availableYears = useMemo(() => collectYears(source), [source])

  /**
   * A year that has left the feed would silently hide everything, so it is
   * ignored rather than reset — the selection comes back on its own if the user
   * returns to a feed that still has that year.
   */
  const activeYear =
    year !== null && availableYears.includes(year) ? year : null

  const shown = useMemo(() => {
    const matching = isWatchlistView
      ? source.filter((item) => !needle || item.title.toLowerCase().includes(needle))
      : source.filter((item) => {
          // "soon" is already a movies-only feed, so a type check would only
          // ever be `item.type === 'movie'` and could never fail.
          if (filter !== 'all' && filter !== 'soon' && item.type !== filter) {
            return false
          }
          // `hasGenre` also matches a custom title by genre *name*, since an
          // admin-authored title carries no TMDB genre ids.
          if (genre && !hasGenre(item, genre)) return false
          return !needle || item.title.toLowerCase().includes(needle)
        })
    return matching
      .filter((item) => activeYear === null || yearOf(item) === activeYear)
      .sort((a, b) => compareMedia(a, b, sort))
  }, [source, isWatchlistView, filter, genre, needle, activeYear, sort])

  const baseHeading = isWatchlistView
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

  const sourceLabel = isWatchlistView
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

  /**
   * How many admin-authored titles are folded into the feed being shown. Shown
   * next to the source so a locally added title in the grid is explainable
   * without opening the admin panel.
   */
  const localCount =
    !isWatchlistView && filter !== 'soon' ? customMedia.length : 0

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
        user={currentUser}
        onSignIn={() => openAuth('login')}
        onSignOut={handleSignOut}
        onOpenAdmin={() => setAdminOpen(true)}
        onOpenProfile={() => setProfileOpen(true)}
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
          {/* `min-w-0` + `break-words`: the source string is a single long
              token like `/3/discover/movie?primary_release_date.gte…`, which
              would otherwise set the page's minimum width on a phone. */}
          <div className="min-w-0">
            <h2 className="text-2xl font-bold">{heading}</h2>
            <p className="mt-1 break-words font-mono text-xs text-ink-muted">
              source: {sourceLabel}
            </p>
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

        {localCount > 0 && (
          <p className="mb-4 rounded-xl bg-page/40 p-4 text-sm text-ink-soft ring-1 ring-line">
            <span className="font-semibold text-ink">
              {localCount} locally added {localCount === 1 ? 'title' : 'titles'}
            </span>{' '}
            sit at the end of this feed, stored on this device.{' '}
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
            <p className="text-4xl">{isWatchlistView ? '🎬' : '🔎'}</p>
            <p className="mt-4 text-lg font-semibold">
              {needle
                ? `No results for “${query.trim()}”`
                : isWatchlistView
                  ? 'Your watchlist is empty'
                  : activeYear !== null
                    ? `No titles released in ${activeYear}`
                      : genre
                      ? `No ${genre.name} titles found`
                      : 'Nothing here yet'}
            </p>
            <p className="mt-1 text-sm">
              {isWatchlistView
                ? 'Tap ＋ on any movie or show to save it here.'
                : activeYear !== null
                  ? 'Pick a different year or clear the filters.'
                  : 'Try a different title, genre, or clear the search.'}
            </p>
          </div>
        )}
      </main>

      <Footer onOpenTeam={() => setTeamOpen(true)} />

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

      {/* Keyed by email so an address change inside the dialog re-points it at the
          saved account rather than leaving it editing a stale one. */}
      {profileOpen && currentUser && (
        <ProfileSettings
          key={currentUser.email}
          users={users}
          account={currentUser}
          onClose={closeProfile}
        />
      )}
    </div>
  )
}

