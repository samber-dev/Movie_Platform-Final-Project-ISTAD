'use client'

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ACTIVITY_LABELS,
  buildLeaderboard,
  relativeTime,
  summarise,
  useActivity,
} from '../../lib/activityStore'
import type { ActivityEvent } from '../../lib/activityStore'

/**
 * The Leaderboard & Activity tab.
 *
 * Everything here is derived from the local event log rather than invented:
 * there is no analytics backend, so these numbers describe real actions recorded
 * in this browser. The panel says so, rather than implying a scale it cannot see.
 */

type Props = {
  /** Every registered account, so idle members still appear at zero. */
  accounts: { email: string; isAdmin: boolean }[]
  /** The signed-in admin, highlighted in the ranking. */
  currentEmail: string
}

/** How many rows the ranking shows before it becomes a wall of text. */
const MAX_ROWS = 10
/** How many log entries the activity feed keeps. */
const MAX_LOG = 25

const MEDAL: Record<number, string> = {
  1: '🥇',
  2: '🥈',
  3: '🥉',
}

function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: string
  tone?: 'default' | 'accent'
}) {
  return (
    <div
      className={`rounded-xl p-4 ring-1 ${
        tone === 'accent'
          ? 'bg-accent/10 ring-accent/40'
          : 'bg-page/40 ring-line'
      }`}
    >
      <p
        className={`text-3xl font-extrabold tabular-nums ${
          tone === 'accent' ? 'text-accent' : 'text-ink'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {label}
      </p>
      {hint && <p className="mt-1.5 text-[11px] leading-snug text-ink-muted">{hint}</p>}
    </div>
  )
}

/** A horizontal meter: the same width for every row so bars are comparable. */
function ShareBar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.max(2, Math.round((value / max) * 100))
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
      role="presentation"
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

/** Colour-codes the log so admin actions are distinguishable at a glance. */
function kindTone(kind: ActivityEvent['kind']): string {
  if (kind === 'auth.signed-in' || kind === 'auth.signed-out') {
    return 'bg-surface-2 text-ink-soft'
  }
  if (kind === 'watchlist.added' || kind === 'watchlist.removed') {
    return 'bg-score-high/20 text-score-high'
  }
  if (kind === 'review.posted' || kind === 'rating.saved') {
    return 'bg-accent/15 text-accent'
  }
  if (kind === 'custom.deleted' || kind === 'admin.user-deleted') {
    return 'bg-red-500/15 text-red-300'
  }
  return 'bg-accent-2/15 text-accent-2'
}

export function LeaderboardPanel({ accounts, currentEmail }: Props) {
  const events = useActivity()
  const [showAllAccounts, setShowAllAccounts] = useState(false)

  const totals = useMemo(() => summarise(events), [events])
  const rows = useMemo(() => buildLeaderboard(events, accounts), [events, accounts])

  /** Ranked rows with any activity at all — a row of zeroes is not a rank. */
  const ranked = useMemo(
    () => rows.filter((row) => row.score > 0),
    [rows],
  )
  const idle = useMemo(() => rows.filter((row) => row.score === 0), [rows])

  const visible = showAllAccounts ? ranked : ranked.slice(0, MAX_ROWS)
  const topScore = ranked.length > 0 ? ranked[0].score : 0

  const log = useMemo(() => events.slice(0, MAX_LOG), [events])

  return (
    <div className="space-y-8">
      {/* ---- Headline counters ------------------------------------------ */}
      <section aria-label="Platform totals">
        <h3 className="text-sm font-extrabold uppercase tracking-[0.18em] text-accent">
          Platform usage
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Events recorded"
            value={totals.events}
            hint={
              totals.lastEventAt === null
                ? 'Nothing has happened yet.'
                : `Last activity ${relativeTime(totals.lastEventAt)}`
            }
          />
          <StatCard
            label="Active accounts"
            value={totals.activeAccounts}
            hint="Accounts with at least one logged action"
          />
          <StatCard
            label="Titles saved"
            value={totals.watchlistAdds}
            hint={`${totals.reviews} reviews · ${totals.ratings} ratings`}
          />
          <StatCard
            label="Admin actions"
            value={totals.adminActions}
            hint={`${totals.titlesAdded} added · ${totals.titlesEdited} edited · ${totals.titlesDeleted} deleted`}
            tone="accent"
          />
        </div>
      </section>

      {/* ---- Ranking ----------------------------------------------------- */}
      <section aria-label="Engagement leaderboard">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-[0.18em] text-accent">
              Top contributors
            </h3>
            <p className="mt-1 text-xs text-ink-muted">
              Ranked by engagement — sign-ins, watchlist changes, reviews and
              ratings. Catalogue edits count only as a tie-breaker.
            </p>
          </div>
          {ranked.length > MAX_ROWS && (
            <button
              type="button"
              onClick={() => setShowAllAccounts((value) => !value)}
              className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-bold text-ink ring-1 ring-line transition hover:bg-accent hover:text-page"
            >
              {showAllAccounts
                ? `Show top ${MAX_ROWS}`
                : `Show all ${ranked.length}`}
            </button>
          )}
        </div>

        {ranked.length === 0 ? (
          <p className="mt-4 rounded-xl bg-page/40 p-8 text-center text-sm text-ink-muted ring-1 ring-line">
            No activity recorded yet. Signing in, saving a title or writing a
            review all appear here.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className="w-12 pb-2 pr-2 font-semibold">
                    #
                  </th>
                  <th scope="col" className="pb-2 pr-3 font-semibold">
                    Account
                  </th>
                  <th scope="col" className="pb-2 pr-3 text-right font-semibold">
                    Saved
                  </th>
                  <th scope="col" className="pb-2 pr-3 text-right font-semibold">
                    Reviews
                  </th>
                  <th scope="col" className="pb-2 pr-3 text-right font-semibold">
                    Sign-ins
                  </th>
                  <th scope="col" className="pb-2 pr-3 text-right font-semibold">
                    Admin
                  </th>
                  <th scope="col" className="pb-2 font-semibold">
                    Last seen
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row, index) => {
                  const isSelf = row.actor === currentEmail
                  return (
                    <tr
                      key={row.actor}
                      className={`border-t border-line align-middle ${
                        isSelf ? 'bg-accent/5' : ''
                      }`}
                    >
                      <td className="py-3 pr-2 font-bold text-ink-soft tabular-nums">
                        {MEDAL[index + 1] ?? index + 1}
                      </td>
                      <td className="py-3 pr-3">
                        <span
                          className={`truncate font-medium ${
                            row.isGuest ? 'italic text-ink-muted' : 'text-ink'
                          }`}
                          title={row.actor}
                        >
                          {row.actor}
                        </span>
                        {isSelf && (
                          <span className="ml-2 text-[10px] font-bold uppercase text-accent">
                            you
                          </span>
                        )}
                        <span className="mt-1.5 block max-w-[12rem]">
                          <ShareBar value={row.score} max={topScore} />
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-right tabular-nums text-ink-soft">
                        {row.watchlistAdds}
                      </td>
                      <td className="py-3 pr-3 text-right tabular-nums text-ink-soft">
                        {row.reviews}
                      </td>
                      <td className="py-3 pr-3 text-right tabular-nums text-ink-soft">
                        {row.signIns}
                      </td>
                      <td className="py-3 pr-3 text-right tabular-nums text-ink-soft">
                        {row.adminActions}
                      </td>
                      <td className="whitespace-nowrap py-3 text-ink-muted">
                        {row.lastSeenAt === null
                          ? '—'
                          : relativeTime(row.lastSeenAt)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {idle.length > 0 && (
          <p className="mt-3 text-xs text-ink-muted">
            {idle.length} {idle.length === 1 ? 'account has' : 'accounts have'}{' '}
            no recorded activity yet: {idle.map((row) => row.actor).join(', ')}
          </p>
        )}
      </section>

      {/* ---- Recent activity --------------------------------------------- */}
      <section aria-label="Recent activity">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-[0.18em] text-accent">
              Recent activity
            </h3>
            <p className="mt-1 text-xs text-ink-muted">
              The last {Math.min(log.length, MAX_LOG)} actions recorded on this
              device.
            </p>
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-bold text-ink ring-1 ring-line transition hover:bg-accent hover:text-page"
          >
            Print this report
          </button>
        </div>

        {log.length === 0 ? (
          <p className="mt-4 rounded-xl bg-page/40 p-8 text-center text-sm text-ink-muted ring-1 ring-line">
            Nothing logged yet.
          </p>
        ) : (
          <ol className="mt-4 space-y-1.5">
            {log.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-page/40 px-3 py-2 ring-1 ring-line"
              >
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${kindTone(
                    event.kind,
                  )}`}
                >
                  {ACTIVITY_LABELS[event.kind]}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">
                  {event.detail}
                  <span className="text-ink-muted">
                    {' — '}
                    {event.actor ?? 'signed out'}
                  </span>
                </span>
                <time
                  dateTime={event.at}
                  className="shrink-0 whitespace-nowrap text-xs tabular-nums text-ink-muted"
                >
                  {relativeTime(event.at)}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="rounded-xl bg-page/40 p-4 text-xs leading-relaxed text-ink-muted ring-1 ring-line">
        These figures cover this browser only. AngkorCinemas has no server, so
        activity is recorded in localStorage as it happens rather than being
        collected from anywhere else.
      </p>
    </div>
  )
}
