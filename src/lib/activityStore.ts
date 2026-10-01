'use client'

import { useSyncExternalStore } from 'react'
import { usePersistedAuth } from './authStore'
import type { Media } from '../types'

/**
 * An append-only log of what people did on this device, which is the only thing
 * the admin panel's Leaderboard tab can honestly report on.
 *
 * There is no server behind this app: accounts, watchlists, reviews and the
 * admin's own catalogue all live in this browser's localStorage. So "engagement"
 * here means real, locally recorded events rather than analytics from a backend
 * that does not exist. Every writer goes through `recordActivity`, which stamps
 * the time and the actor so the panel never has to guess who did what.
 *
 * The key keeps the `soogood_kh_` prefix the other stores use so all of the app's
 * storage stays greppable from one string.
 */
const ACTIVITY_KEY = 'soogood_kh_activity_v1'

/**
 * Hard cap on retained events. localStorage is a few megabytes and every event
 * is a small object, but this log grows without bound otherwise — one entry per
 * watchlist toggle, and a heavy user will make thousands. The oldest events are
 * dropped first, so the log always describes recent behaviour, which is what a
 * leaderboard is about.
 */
export const MAX_ACTIVITY_EVENTS = 300

export type ActivityKind =
  | 'account.created'
  | 'auth.signed-in'
  | 'auth.signed-out'
  | 'profile.updated'
  | 'watchlist.added'
  | 'watchlist.removed'
  | 'custom.added'
  | 'custom.edited'
  | 'custom.deleted'
  | 'review.posted'
  | 'review.deleted'
  | 'rating.saved'
  | 'admin.exported'
  | 'admin.user-deleted'

export type ActivityEvent = {
  id: string
  /** ISO timestamp, assigned by the store rather than the caller. */
  at: string
  kind: ActivityKind
  /**
   * The signed-in account's email, or null for a guest action. Recorded as a
   * plain string rather than an id because the leaderboard groups by person and
   * the email is what identifies a person to an admin.
   */
  actor: string | null
  /** Short human sentence, e.g. `Saved "Dune" to their watchlist`. */
  detail: string
}

/**
 * Which events count as engagement when ranking accounts. Catalogue edits are
 * excluded: they are staff actions, not member activity, and counting them
 * would put the admin permanently top of a leaderboard of members.
 */
const ENGAGEMENT_KINDS: ActivityKind[] = [
  'auth.signed-in',
  'watchlist.added',
  'watchlist.removed',
  'review.posted',
  'review.deleted',
  'rating.saved',
]

export function isEngagement(kind: ActivityKind): boolean {
  return ENGAGEMENT_KINDS.includes(kind)
}

/**
 * Staff-only events. Enumerated rather than derived as "everything that is not
 * engagement", so a member editing their own profile is not silently counted as
 * an admin action.
 */
const ADMIN_KINDS: ActivityKind[] = [
  'custom.added',
  'custom.edited',
  'custom.deleted',
  'admin.exported',
  'admin.user-deleted',
]

/** Short label for the log, so the panel does not repeat the raw kind string. */
export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  'account.created': 'Account created',
  'auth.signed-in': 'Signed in',
  'auth.signed-out': 'Signed out',
  'profile.updated': 'Profile updated',
  'watchlist.added': 'Watchlist add',
  'watchlist.removed': 'Watchlist remove',
  'custom.added': 'Title added',
  'custom.edited': 'Title edited',
  'custom.deleted': 'Title deleted',
  'review.posted': 'Review posted',
  'review.deleted': 'Review deleted',
  'rating.saved': 'Rating saved',
  'admin.exported': 'Data exported',
  'admin.user-deleted': 'Account deleted',
}

function isActivityEvent(value: unknown): value is ActivityEvent {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<ActivityEvent>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.at === 'string' &&
    typeof candidate.kind === 'string' &&
    (candidate.actor === null || typeof candidate.actor === 'string') &&
    typeof candidate.detail === 'string'
  )
}

export function loadActivity(): ActivityEvent[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Filtered rather than trusted: this blob is hand-editable, and a malformed
    // entry must not be able to throw inside the admin panel.
    return parsed.filter(isActivityEvent).slice(0, MAX_ACTIVITY_EVENTS)
  } catch {
    return []
  }
}

function saveActivity(events: ActivityEvent[]): void {
  try {
    if (events.length === 0) localStorage.removeItem(ACTIVITY_KEY)
    else localStorage.setItem(ACTIVITY_KEY, JSON.stringify(events))
  } catch {
    // Quota or private mode: the log is a nicety, so it degrades to empty rather
    // than breaking the action that was being recorded.
  }
}

/** Newest first, so the log reads top-down without sorting at every render. */
function byNewest(a: ActivityEvent, b: ActivityEvent): number {
  return b.at.localeCompare(a.at)
}

let counter = 0

/**
 * Appends one event. Newest first, capped: the caller gets the stored entry back
 * so a confirmation line can name the exact action that was logged.
 */
export function recordActivity(
  kind: ActivityKind,
  detail: string,
  actor: string | null,
): ActivityEvent {
  counter += 1
  const event: ActivityEvent = {
    // `at` is what orders the log, so the id only has to be unique; the counter
    // keeps two events inside the same millisecond apart.
    id: `${Date.now().toString(36)}-${counter.toString(36)}`,
    at: new Date().toISOString(),
    kind,
    actor,
    detail,
  }
  const next = [event, ...getSnapshot().filter((e) => e.id !== event.id)].slice(
    0,
    MAX_ACTIVITY_EVENTS,
  )
  snapshot = next
  saveActivity(next)
  for (const listener of listeners) listener()
  return event
}

/**
 * Convenience for the many call sites that log a title: keeps the quoted-title
 * wording identical everywhere so the log reads consistently.
 */
export function recordMediaActivity(
  kind: ActivityKind,
  verb: string,
  media: Pick<Media, 'title'>,
  actor: string | null,
): ActivityEvent {
  return recordActivity(kind, `${verb} “${media.title}”`, actor)
}

/* ==========================================================================
   Persisted store

   Same shape as `usePersistedAuth` and `useCustomMovies`: one document, one
   write path, `useSyncExternalStore` so the prerendered shell and the first
   client render agree. Without it the admin panel would hydration-mismatch for
   a signed-in admin on every visit.
   ========================================================================== */

const EMPTY: ActivityEvent[] = []

const listeners = new Set<() => void>()

let snapshot: ActivityEvent[] | null = null

function getSnapshot(): ActivityEvent[] {
  if (snapshot === null) snapshot = loadActivity().sort(byNewest)
  return snapshot
}

/** The server has no localStorage, so it renders an empty log. */
function getServerSnapshot(): ActivityEvent[] {
  return EMPTY
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  function onStorage(event: StorageEvent) {
    if (event.key === null || event.key === ACTIVITY_KEY) {
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

export function useActivity(): ActivityEvent[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/**
 * The account to attribute a caller's action to.
 *
 * Deep components — the review form, the star rating — are several levels below
 * the shell that holds the session, and threading an `actor` prop down to them
 * for one string would mean every intermediate component gains a prop it never
 * reads. Reading the session from the store instead keeps the log honest at the
 * point of action, which is where the value has to be correct.
 */
export function useActorEmail(): string | null {
  return usePersistedAuth().sessionEmail
}

/* ==========================================================================
   Aggregation for the Leaderboard tab

   Kept out of the component so the numbers can be reasoned about — and tested —
   without rendering anything.
   ========================================================================== */

export type LeaderboardRow = {
  /** The account's email, or a guest marker for unsigned-in activity. */
  actor: string
  /** Events that count as engagement (see `ENGAGEMENT_KINDS`). */
  engagement: number
  signIns: number
  watchlistAdds: number
  reviews: number
  ratings: number
  /** Staff-only events: catalogue edits and admin actions. */
  adminActions: number
  lastSeenAt: string | null
  /**
   * The ranking score. Engagement dominates, with admin actions as the
   * tie-breaker so two equally active members are ordered by who also maintains
   * the catalogue rather than by email.
   */
  score: number
  isGuest: boolean
}

/**
 * Rolls the log up per account, most engaged first.
 *
 * `accounts` is passed in so the panel can show every registered member, not
 * just the ones who happen to have done something — a member with no activity
 * still belongs on the list, at zero. Accounts with no events at all are
 * appended after the active ones.
 */
export function buildLeaderboard(
  events: ActivityEvent[],
  accounts: { email: string }[],
): LeaderboardRow[] {
  const rows = new Map<string, LeaderboardRow>()

  function blank(actor: string): LeaderboardRow {
    return {
      actor,
      engagement: 0,
      signIns: 0,
      watchlistAdds: 0,
      reviews: 0,
      ratings: 0,
      adminActions: 0,
      lastSeenAt: null,
      score: 0,
      isGuest: false,
    }
  }

  for (const account of accounts) {
    if (!rows.has(account.email)) rows.set(account.email, blank(account.email))
  }

  for (const event of events) {
    // Guest activity is bucketed under one label rather than dropped, so the
    // panel can still show that anonymous saving is happening.
    const actor = event.actor ?? 'Guests (signed out)'
    let row = rows.get(actor)
    if (row === undefined) {
      row = blank(actor)
      row.isGuest = actor === 'Guests (signed out)'
      rows.set(actor, row)
    }

    switch (event.kind) {
      case 'auth.signed-in':
        row.signIns += 1
        break
      case 'watchlist.added':
        row.watchlistAdds += 1
        break
      case 'review.posted':
      case 'review.deleted':
        row.reviews += 1
        break
      case 'rating.saved':
        row.ratings += 1
        break
      default:
        if (ADMIN_KINDS.includes(event.kind)) row.adminActions += 1
    }

    if (isEngagement(event.kind)) row.engagement += 1
    if (row.lastSeenAt === null || event.at > row.lastSeenAt) {
      row.lastSeenAt = event.at
    }
  }

  for (const row of rows.values()) {
    row.score = row.engagement + row.adminActions
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.score - a.score ||
      b.engagement - a.engagement ||
      // Alphabetical last, so the order never flickers between renders of the
      // same data.
      a.actor.localeCompare(b.actor, 'en', { sensitivity: 'base' }),
  )
}

export type PlatformTotals = {
  events: number
  engagements: number
  adminActions: number
  activeAccounts: number
  signIns: number
  watchlistAdds: number
  reviews: number
  ratings: number
  titlesAdded: number
  titlesEdited: number
  titlesDeleted: number
  firstEventAt: string | null
  lastEventAt: string | null
}

/** Whole-platform counters behind the stat cards. */
export function summarise(events: ActivityEvent[]): PlatformTotals {
  const totals: PlatformTotals = {
    events: events.length,
    engagements: 0,
    adminActions: 0,
    activeAccounts: 0,
    signIns: 0,
    watchlistAdds: 0,
    reviews: 0,
    ratings: 0,
    titlesAdded: 0,
    titlesEdited: 0,
    titlesDeleted: 0,
    firstEventAt: null,
    lastEventAt: null,
  }

  const actors = new Set<string>()

  for (const event of events) {
    if (isEngagement(event.kind)) totals.engagements += 1
    else totals.adminActions += 1

    if (event.actor !== null) actors.add(event.actor)

    switch (event.kind) {
      case 'auth.signed-in':
        totals.signIns += 1
        break
      case 'watchlist.added':
        totals.watchlistAdds += 1
        break
      case 'review.posted':
      case 'review.deleted':
        totals.reviews += 1
        break
      case 'rating.saved':
        totals.ratings += 1
        break
      case 'custom.added':
        totals.titlesAdded += 1
        break
      case 'custom.edited':
        totals.titlesEdited += 1
        break
      case 'custom.deleted':
        totals.titlesDeleted += 1
        break
      default:
        break
    }

    if (totals.firstEventAt === null || event.at < totals.firstEventAt) {
      totals.firstEventAt = event.at
    }
    if (totals.lastEventAt === null || event.at > totals.lastEventAt) {
      totals.lastEventAt = event.at
    }
  }

  totals.activeAccounts = actors.size
  return totals
}

/** "just now", "14m ago", "3d ago" — an age, not a wall-clock stamp. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return 'Unknown'
  const seconds = Math.max(0, Math.round((now.getTime() - then.getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.round(months / 12)}y ago`
}
