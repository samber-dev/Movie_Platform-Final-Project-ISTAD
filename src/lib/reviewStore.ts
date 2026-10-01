'use client'

import type { Media } from '../types'

/**
 * Reviews the visitor writes in the detail view. TMDB's read API has no write
 * endpoint and the key shipped here cannot authenticate writes, so these are
 * stored per-browser in localStorage rather than sent anywhere. Stored under
 * the same `soogood_kh_` prefix the other storage keys use.
 */
const REVIEWS_KEY = 'soogood_kh_reviews_v1'

export type LocalReview = {
  id: string
  mediaKey: string
  author: string
  rating: number
  body: string
  createdAt: string
  /** Lets a visitor remove their own submission again. */
  mine: boolean
}

export const MAX_REVIEW_LENGTH = 2000
export const MIN_REVIEW_LENGTH = 4

function readAll(): Record<string, LocalReview[]> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(REVIEWS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    // Drop anything that does not match the shape rather than trusting the blob.
    return parsed as Record<string, LocalReview[]>
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, LocalReview[]>): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(REVIEWS_KEY, JSON.stringify(all))
  } catch {
    // Quota or private-mode failures must not break the detail view.
  }
}

export function mediaStorageKey(media: Pick<Media, 'type' | 'id'>): string {
  return `${media.type}-${media.id}`
}

export function loadLocalReviews(media: Pick<Media, 'type' | 'id'>): LocalReview[] {
  const list = readAll()[mediaStorageKey(media)]
  if (!Array.isArray(list)) return []
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function addLocalReview(
  media: Pick<Media, 'type' | 'id'>,
  review: Omit<LocalReview, 'id' | 'mediaKey' | 'createdAt' | 'mine'>,
): LocalReview {
  const key = mediaStorageKey(media)
  const entry: LocalReview = {
    ...review,
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mediaKey: key,
    createdAt: new Date().toISOString(),
    mine: true,
  }
  const all = readAll()
  all[key] = [entry, ...(Array.isArray(all[key]) ? all[key] : [])]
  writeAll(all)
  return entry
}

export function removeLocalReview(
  media: Pick<Media, 'type' | 'id'>,
  id: string,
): void {
  const key = mediaStorageKey(media)
  const all = readAll()
  if (!Array.isArray(all[key])) return
  all[key] = all[key].filter((review) => review.id !== id)
  writeAll(all)
}

/** Average of the visitor's own scores, or null when they have not rated yet. */
export function averageLocalRating(reviews: LocalReview[]): number | null {
  if (reviews.length === 0) return null
  const total = reviews.reduce((sum, review) => sum + review.rating, 0)
  return Math.round((total / reviews.length) * 10) / 10
}
