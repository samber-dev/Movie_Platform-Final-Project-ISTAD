'use client'

import { useSyncExternalStore } from 'react'
import type { Media } from '../types'

/**
 * Titles an admin adds by hand. There is no backend behind this app, so the
 * "catalogue the admin manages" is one document in localStorage, read the same
 * way accounts and the theme are (see `usePersistedAuth`).
 *
 * The key keeps the original `soogood_kh_` prefix that the other stores use so
 * all of the app's storage stays greppable from a single string.
 */
const CUSTOM_MOVIES_KEY = 'soogood_kh_custom_movies_v1'

export const MAX_TITLE_LENGTH = 120
export const MAX_OVERVIEW_LENGTH = 2000
export const MAX_GENRE_LENGTH = 60
export const MIN_YEAR = 1888
/** Far enough out that a typo cannot block a legitimate upcoming release. */
export const MAX_YEAR = 2100

export type CustomMovie = {
  /**
   * Always negative. TMDB ids are always positive, so a negative id can never
   * collide with a real title — which matters because this id is the identity
   * used by `mediaKey`, the watchlist and the review/rating keys.
   */
  id: number
  title: string
  posterUrl: string
  overview: string
  releaseYear: number
  genre: string
  createdAt: string
  /**
   * Set the first time a title is edited, so the admin list can say a row was
   * revised rather than implying it was just added. Absent until then, and
   * absent on titles written before editing existed — hence optional.
   */
  updatedAt?: string
}

/** The fields the admin form collects; `id` and `createdAt` are assigned here. */
export type CustomMovieInput = Pick<
  CustomMovie,
  'title' | 'posterUrl' | 'overview' | 'releaseYear' | 'genre'
>

export type FieldErrors = Partial<Record<keyof CustomMovieInput, string>>

/** The raw strings a form holds before validation turns them into a value. */
export type CustomMovieDraft = Record<keyof CustomMovieInput, string>

/**
 * The inverse of `CustomMovieInput`: a stored title back into editable strings.
 * The year is stringified here so the form's year control — which is a text
 * input, because it also has to reject "97" and "twenty" — never has to.
 */
export function toDraft(movie: CustomMovie): CustomMovieDraft {
  return {
    title: movie.title,
    releaseYear: String(movie.releaseYear),
    genre: movie.genre,
    posterUrl: movie.posterUrl,
    overview: movie.overview,
  }
}

export type ValidationResult =
  | { ok: true; value: CustomMovieInput }
  | { ok: false; errors: FieldErrors }

/** Collapses runs of whitespace so a pasted title cannot smuggle in newlines. */
function tidy(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

/**
 * Accepts an absolute http(s) URL, and also helps with the common paste of a
 * bare host (`image.tmdb.org/t/p/…`) by assuming https.
 *
 * Anything carrying a scheme that is not http(s) — `javascript:`, `data:` — is
 * rejected. The value is written straight into an `img src`, so this is the one
 * place a pasted string could turn into something other than a picture.
 */
function normalizeUrl(raw: string): string | null {
  const value = raw.trim()
  if (!value) return ''
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value)
  const candidate = hasScheme ? value : `https://${value}`
  try {
    const url = new URL(candidate)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

/** Reuses the lowest id in use, minus one, so a delete cannot hand out a dup. */
function nextId(movies: CustomMovie[]): number {
  return Math.min(0, ...movies.map((movie) => movie.id)) - 1
}

/**
 * Validate and normalise raw form strings. Returns every problem at once, so
 * the form can mark every bad field on the first submit instead of revealing
 * them one re-render at a time.
 */
export function validateDraft(draft: CustomMovieDraft): ValidationResult {
  const errors: FieldErrors = {}

  const title = tidy(draft.title)
  if (!title) errors.title = 'Give the title a name.'
  else if (title.length > MAX_TITLE_LENGTH) {
    errors.title = `Keep the title under ${MAX_TITLE_LENGTH} characters.`
  }

  const yearText = draft.releaseYear.trim()
  const year = Number(yearText)
  if (!yearText) {
    errors.releaseYear = 'Enter the release year.'
  } else if (!/^\d{4}$/.test(yearText)) {
    errors.releaseYear = 'Use four digits, for example 1997.'
  } else if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    errors.releaseYear = `Pick a year between ${MIN_YEAR} and ${MAX_YEAR}.`
  }

  const genre = tidy(draft.genre)
  if (genre.length > MAX_GENRE_LENGTH) {
    errors.genre = `Keep the genre under ${MAX_GENRE_LENGTH} characters.`
  }

  const posterUrl = normalizeUrl(draft.posterUrl)
  if (posterUrl === null) {
    errors.posterUrl = 'Enter an http(s) image URL.'
  }

  const overview = tidy(draft.overview)
  if (overview.length > MAX_OVERVIEW_LENGTH) {
    errors.overview = `Keep the overview under ${MAX_OVERVIEW_LENGTH} characters.`
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    // A null URL already produced an error and returned above, so the `?? ''`
    // here is unreachable — it only satisfies the type checker.
    value: { title, releaseYear: year, genre, posterUrl: posterUrl ?? '', overview },
  }
}

function isCustomMovie(value: unknown): value is CustomMovie {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<CustomMovie>
  return (
    typeof candidate.id === 'number' &&
    candidate.id < 0 &&
    typeof candidate.title === 'string' &&
    typeof candidate.releaseYear === 'number'
  )
}

function normalizeMovie(movie: CustomMovie): CustomMovie {
  return {
    id: movie.id,
    title: movie.title,
    releaseYear: movie.releaseYear,
    posterUrl: typeof movie.posterUrl === 'string' ? movie.posterUrl : '',
    overview: typeof movie.overview === 'string' ? movie.overview : '',
    genre: typeof movie.genre === 'string' ? movie.genre : '',
    createdAt:
      typeof movie.createdAt === 'string' ? movie.createdAt : new Date().toISOString(),
    // Kept only when it really is a timestamp, so a hand-edited storage entry
    // cannot make the admin list render "edited undefined".
    updatedAt:
      typeof movie.updatedAt === 'string' ? movie.updatedAt : undefined,
  }
}

export function loadCustomMovies(): CustomMovie[] {
  let parsed: unknown = null
  try {
    const raw = localStorage.getItem(CUSTOM_MOVIES_KEY)
    if (raw) parsed = JSON.parse(raw)
  } catch {
    parsed = null
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter(isCustomMovie).map(normalizeMovie)
}

function saveCustomMovies(movies: CustomMovie[]): void {
  try {
    if (movies.length === 0) localStorage.removeItem(CUSTOM_MOVIES_KEY)
    else localStorage.setItem(CUSTOM_MOVIES_KEY, JSON.stringify(movies))
  } catch {
    // Quota or private mode: the list still works for this session.
  }
}

/**
 * Present a custom title in the same shape as a TMDB one, so it renders through
 * the identical grid, card, hero, watchlist and review code paths.
 *
 * `genreIds` stays empty: a custom title's genre is free text, and resolving it
 * to a TMDB id would need a network round-trip this store must not depend on.
 * `hasGenre` matches those titles by genre *name* instead.
 */
export function toMedia(movie: CustomMovie): Media {
  return {
    id: movie.id,
    type: 'movie',
    title: movie.title,
    rating: 0,
    releaseDate: `${movie.releaseYear}-01-01`,
    overview: movie.overview,
    poster: movie.posterUrl,
    backdrop: '',
    genres: movie.genre ? [movie.genre] : [],
    genreIds: [],
    popularity: 0,
    isCustom: true,
  }
}

/* ==========================================================================
   Persisted store

   Same shape as `usePersistedAuth`: one document, one write path, and
   `useSyncExternalStore` so the prerendered shell and the first client render
   agree. Without it, an admin who has added titles would get a hydration
   mismatch on the Movies feed on every visit.
   ========================================================================== */

const EMPTY: CustomMovie[] = []

const listeners = new Set<() => void>()

/**
 * Cached because `getSnapshot` runs on every render and has to hand back a
 * stable identity until something actually changes.
 */
let snapshot: CustomMovie[] | null = null

function getSnapshot(): CustomMovie[] {
  if (snapshot === null) snapshot = loadCustomMovies()
  return snapshot
}

/** The server has no localStorage, so it renders the empty state. */
function getServerSnapshot(): CustomMovie[] {
  return EMPTY
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  function onStorage(event: StorageEvent) {
    if (event.key === null || event.key === CUSTOM_MOVIES_KEY) {
      snapshot = null
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** Newest first, so the tab the admin just added to is the one they land on. */
function byNewest(a: CustomMovie, b: CustomMovie): number {
  return b.createdAt.localeCompare(a.createdAt)
}

function setCustomMovies(update: (current: CustomMovie[]) => CustomMovie[]): void {
  const next = update(getSnapshot())
  snapshot = next
  saveCustomMovies(next)
  for (const listener of listeners) listener()
}

export function useCustomMovies(): CustomMovie[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** Appends a validated title and returns it, so the caller can confirm by name. */
export function addCustomMovie(input: CustomMovieInput): CustomMovie {
  const movie: CustomMovie = {
    ...input,
    id: nextId(getSnapshot()),
    createdAt: new Date().toISOString(),
  }
  setCustomMovies((current) => [movie, ...current])
  return movie
}

/**
 * Rewrites the five editable fields of an existing title and returns it.
 *
 * `id` and `createdAt` are deliberately not editable: the id is the identity the
 * watchlist and the review/rating keys are built from, so changing it would
 * silently orphan every save pointing at that title, and the original add date
 * stays true however many times the row is revised.
 *
 * Returns null when the id is not in the catalogue, which is reachable — the
 * admin list and this store are the same snapshot, so a delete from another tab
 * can land between the click and the save.
 */
export function updateCustomMovie(
  id: number,
  input: CustomMovieInput,
): CustomMovie | null {
  const current = getSnapshot().find((movie) => movie.id === id)
  if (current === undefined) return null
  const updated: CustomMovie = {
    ...current,
    ...input,
    updatedAt: new Date().toISOString(),
  }
  setCustomMovies((list) => list.map((movie) => (movie.id === id ? updated : movie)))
  return updated
}

export function deleteCustomMovie(id: number): void {
  setCustomMovies((current) => current.filter((movie) => movie.id !== id))
}

/** Sorted copy for the admin list, without touching the cached snapshot. */
export function byNewestFirst(movies: CustomMovie[]): CustomMovie[] {
  return [...movies].sort(byNewest)
}
