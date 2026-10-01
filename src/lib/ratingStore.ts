'use client'

import type { Media } from '../types'
import { mediaStorageKey } from './reviewStore'

/**
 * A visitor's own 1-5 star verdict on a title.
 *
 * TMDB's read API has no write endpoint and the key shipped with this app cannot
 * authenticate writes, so — exactly like the review store next door — these are
 * kept per-browser in localStorage under the same `soogood_kh_` prefix rather
 * than being sent anywhere.
 */
const RATINGS_KEY = 'soogood_kh_ratings_v1'

export const MIN_RATING = 1
export const MAX_RATING = 5

export type UserRating = {
  /** 1-5 stars, always an integer inside [MIN_RATING, MAX_RATING]. */
  stars: number
  updatedAt: string
}

type RatingMap = Record<string, UserRating>

function readAll(): RatingMap {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(RATINGS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as RatingMap
  } catch {
    // Malformed blob: behave as if nothing was ever rated rather than throwing
    // out of the detail view.
    return {}
  }
}

function writeAll(all: RatingMap): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(RATINGS_KEY, JSON.stringify(all))
  } catch {
    // Quota or private-mode failures must not break the detail view.
  }
}

/** Every rating this browser has left, keyed by `mediaStorageKey`. */
export function loadAllUserRatings(): RatingMap {
  return readAll()
}

export function loadUserRating(
  media: Pick<Media, 'type' | 'id'>,
): UserRating | null {
  const stored = readAll()[mediaStorageKey(media)]
  if (!stored || typeof stored.stars !== 'number') return null
  // Reject anything outside the range rather than rendering a bogus star count.
  if (stored.stars < MIN_RATING || stored.stars > MAX_RATING) return null
  return stored
}

/** Stores a verdict, replacing any previous one for the same title. */
export function saveUserRating(
  media: Pick<Media, 'type' | 'id'>,
  stars: number,
): UserRating {
  const clamped = Math.min(MAX_RATING, Math.max(MIN_RATING, Math.round(stars)))
  const entry: UserRating = { stars: clamped, updatedAt: new Date().toISOString() }
  const all = readAll()
  all[mediaStorageKey(media)] = entry
  writeAll(all)
  return entry
}

export function clearUserRating(media: Pick<Media, 'type' | 'id'>): void {
  const all = readAll()
  delete all[mediaStorageKey(media)]
  writeAll(all)
}

/* ==========================================================================
   Blending the visitor's verdict with TMDB's community average
   ========================================================================== */

/** Five stars expressed on the same 0-100 scale the rest of the UI uses. */
export function ratingToPercent(stars: number): number {
  return Math.round((stars / MAX_RATING) * 100)
}

/**
 * How many community votes one visitor's verdict is worth.
 *
 * TMDB cannot be written to, so a rating submitted here has no effect on anyone
 * else's copy of the page. Weighting it at exactly one vote against a typical
 * 40,000-vote average would move the number by a hundredth of a point, which
 * reads as a broken control. Counting the verdict as 5,000 votes instead keeps a
 * change clearly visible (roughly +/-4 points on a well-reviewed title) while
 * still being far too small a minority to overwrite the consensus.
 */
export const USER_VOTE_WEIGHT = 5000

/**
 * The visitor-weighted score: TMDB's average pooled with the local verdict.
 * Falls back to the local verdict alone when TMDB has no vote count (a brand
 * new release, or a title whose score is genuinely unrated).
 */
export function blendedScore(
  communityPercent: number,
  voteCount: number,
  stars: number | null,
): number {
  if (stars === null) return communityPercent
  const mine = ratingToPercent(stars)
  if (voteCount <= 0) return mine
  const total = (communityPercent * voteCount + mine * USER_VOTE_WEIGHT) /
    (voteCount + USER_VOTE_WEIGHT)
  return Math.round(total)
}

/** A short, human-readable explanation of the blend, for tooltips and captions. */
export function blendExplanation(
  voteCount: number,
  stars: number | null,
): string {
  if (stars === null) {
    return voteCount > 0
      ? `TMDB community score from ${voteCount.toLocaleString('en-US')} votes.`
      : 'TMDB community score. This title has no votes yet.'
  }
  const mine = `${stars} star${stars === 1 ? '' : 's'}`
  if (voteCount <= 0) return `No community votes yet — showing your ${mine}.`
  return (
    `Your ${mine} (${ratingToPercent(stars)}%) is weighted as ` +
    `${USER_VOTE_WEIGHT.toLocaleString('en-US')} votes alongside ` +
    `${voteCount.toLocaleString('en-US')} TMDB votes.`
  )
}
