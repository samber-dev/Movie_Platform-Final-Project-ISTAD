'use client'

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useModalDismiss } from '../lib/useModalDismiss'
import { toMedia, useCustomMovies } from '../lib/customMovieStore'
import type { Account } from '../types'
import { MovieManager } from './admin/MovieManager'
import { LeaderboardPanel } from './admin/LeaderboardPanel'
import { recordActivity } from '../lib/activityStore'

const EXPORT_FILENAME = 'angkorcinemas_users.json'

type AdminTab = 'users' | 'movies' | 'leaderboard'

type TabEntry = {
  key: AdminTab
  label: string
  hint: string
  icon: ReactNode
}

/**
 * Explicit allow-list so credential material (passwordHash, salt) can never
 * reach a downloaded file — the export demonstrates the data store without
 * handing out anything that verifies a password.
 */
function toExportRecord(user: Account) {
  return {
    id: user.id,
    email: user.email,
    createdAt: user.createdAt,
    isAdmin: user.isAdmin,
    watchlist: user.watchlist,
  }
}

function formatStamp(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return 'Unknown'
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type Props = {
  users: Account[]
  currentEmail: string
  onDeleteUser: (email: string) => void
  onClose: () => void
}

export function AdminDashboard({ users, currentEmail, onDeleteUser, onClose }: Props) {
  const [exported, setExported] = useState<{ bytes: number; count: number } | null>(
    null,
  )
  const [tab, setTab] = useState<AdminTab>('movies')
  const customMovies = useCustomMovies()
  useModalDismiss(onClose)

  /**
   * The section body is wrapped in a `key={tab}` element below. Remounting it on
   * every switch is what replays the enter animation; the side effect is that a
   * half-typed form in Movies is discarded when the admin leaves, which is the
   * behaviour you want from a section change anyway.
   */

  const rows = useMemo(
    () =>
      [...users].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    [users],
  )

  const stats = useMemo(() => {
    if (tab === 'movies') {
      const years = customMovies.map((movie) => movie.releaseYear)
      const genres = new Set(
        customMovies.map((movie) => movie.genre).filter(Boolean),
      )
      return [
        { label: 'Custom titles', value: customMovies.length },
        { label: 'Genres used', value: genres.size },
        {
          label: 'Newest year',
          value: years.length > 0 ? Math.max(...years) : '—',
        },
      ]
    }
    return [
      { label: 'Total users', value: users.length },
      { label: 'Admin accounts', value: users.filter((u) => u.isAdmin).length },
      {
        label: 'Titles saved',
        value: users.reduce((sum, user) => sum + user.watchlist.length, 0),
      },
    ]
  }, [tab, users, customMovies])

  function handleDownload() {
    recordActivity(
      'admin.exported',
      `Exported ${users.length} account${users.length === 1 ? '' : 's'} and ${customMovies.length} catalogue title${customMovies.length === 1 ? '' : 's'}`,
      currentEmail,
    )
    const payload = {
      exportedAt: new Date().toISOString(),
      source: 'AngkorCinemas · Admin Panel',
      note: 'Password hashes and salts are intentionally excluded from this export.',
      totalUsers: users.length,
      users: users.map(toExportRecord),
      customMovies: customMovies.map(toMedia),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = EXPORT_FILENAME
    document.body.appendChild(link)
    link.click()
    link.remove()
    // Revoke after the browser has started the transfer, not synchronously.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setExported({ bytes: blob.size, count: users.length })
  }

  const TABS: TabEntry[] = [
    {
      key: 'leaderboard',
      label: 'Leaderboard',
      hint: 'Engagement ranking and recent activity',
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 20h16" />
          <path d="M7 20v-6M12 20V8M17 20v-9" />
        </svg>
      ),
    },
    {
      key: 'movies',
      label: 'Movies',
      hint: 'Add, edit and delete catalogue titles',
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2.5" />
          <path d="M3 9h18M8 4v5" />
        </svg>
      ),
    },
    {
      key: 'users',
      label: 'Users',
      hint: 'Accounts registered on this device',
      icon: (
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19" />
          <circle cx="10" cy="8" r="3.2" />
          <path d="M20 19v-1.5a3.5 3.5 0 0 0-2.6-3.4M15.5 5.2a3.2 3.2 0 0 1 0 5.6" />
        </svg>
      ),
    },
  ]

  const active = TABS.find((entry) => entry.key === tab) ?? TABS[0]

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-scrim backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Admin panel"
    >
      <div
        className="neon-panel flex h-full w-full max-w-6xl flex-col overflow-hidden sm:h-auto sm:max-h-[90vh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---- Header: identity of the panel, and the two global actions ---- */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/40"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3 5 6v5.5c0 4 2.9 7.6 7 8.5 4.1-.9 7-4.5 7-8.5V6l-7-3Z" />
                <path d="m9.5 12 1.8 1.8 3.4-3.6" />
              </svg>
            </span>
            <div className="min-w-0">
              <span className="inline-flex rounded-full bg-accent/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
                Admin Panel
              </span>
              <h2 className="mt-1.5 truncate text-lg font-extrabold text-ink sm:text-xl">
                {active.label}
                <span className="ml-2 text-sm font-medium text-ink-muted">
                  {active.hint}
                </span>
              </h2>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-lg bg-surface-2 px-3 py-2 text-xs font-bold text-ink ring-1 ring-line transition hover:bg-accent hover:text-page"
            >
              ⬇ Download JSON Database
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-lg text-ink-soft transition hover:bg-surface-3 hover:text-ink"
              aria-label="Close admin panel"
            >
              ✕
            </button>
          </div>
        </div>

        {exported && (
          <p className="border-b border-line bg-page/40 px-5 py-2 text-xs text-accent-2 sm:px-6">
            ✓ {EXPORT_FILENAME} · {formatBytes(exported.bytes)} ·{' '}
            {exported.count} account{exported.count === 1 ? '' : 's'}
          </p>
        )}

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          {/* ---- Sidebar: a fixed rail, so switching sections never reflows
                  the panel and the section in view is always labelled. ---- */}
          <nav
            aria-label="Admin sections"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-page/40 p-2 sm:w-56 sm:flex-col sm:overflow-x-visible sm:border-b-0 sm:border-r sm:p-3"
          >
            {TABS.map((entry) => {
              const selected = tab === entry.key
              return (
                <button
                  key={entry.key}
                  type="button"
                  onClick={() => setTab(entry.key)}
                  aria-current={selected ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition focus-visible:ring-2 focus-visible:ring-accent ${
                    selected
                      ? 'bg-accent/15 text-ink shadow-neon'
                      : 'text-ink-soft hover:bg-surface-2 hover:text-ink'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={selected ? 'text-accent' : 'text-ink-muted'}
                  >
                    {entry.icon}
                  </span>
                  <span className="whitespace-nowrap">{entry.label}</span>
                  <span className="sr-only"> — {entry.hint}</span>
                </button>
              )
            })}

            <p className="mt-auto hidden px-3 pt-4 text-[11px] leading-relaxed text-ink-muted sm:block">
              Everything in this panel lives in this browser’s localStorage.
              Nothing is uploaded.
            </p>
          </nav>

          {/* ---- Content: one scrolling column, so only the section moves --- */}
          <div className="min-w-0 flex-1 overflow-y-auto p-5 sm:p-6">
            {/* The leaderboard brings its own stat cards, so the summary strip
                above it would repeat them. */}
            {tab !== 'leaderboard' && (
              <div className="mb-5 grid grid-cols-3 gap-3">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-xl bg-page/40 p-4 ring-1 ring-line"
                  >
                    <p className="text-3xl font-extrabold text-ink">{stat.value}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* The key remount is what replays the enter transition on switch. */}
            <div key={tab} className="admin-section-enter">
            {tab === 'leaderboard' ? (
              <LeaderboardPanel
                accounts={users.map((user) => ({
                  email: user.email,
                  isAdmin: user.isAdmin,
                }))}
                currentEmail={currentEmail}
              />
            ) : tab === 'users' ? (
              <section aria-label="Registered accounts">
                {rows.length === 0 ? (
                  <p className="py-10 text-center text-ink-muted">No accounts yet.</p>
                ) : (
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-ink-muted">
                      <tr>
                        <th scope="col" className="pb-2 pr-3 font-semibold">
                          Email
                        </th>
                        <th scope="col" className="pb-2 pr-3 font-semibold">
                          Role
                        </th>
                        <th scope="col" className="pb-2 pr-3 font-semibold">
                          Registered
                        </th>
                        <th scope="col" className="pb-2 pr-3 text-right font-semibold">
                          Saved
                        </th>
                        <th scope="col" className="pb-2 text-right font-semibold">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((user) => {
                        const isSelf = user.email === currentEmail
                        return (
                          <tr
                            key={user.id}
                            className="border-t border-line align-middle"
                          >
                            <td className="max-w-[14rem] truncate py-3 pr-3 font-medium text-ink">
                              {user.email}
                              {isSelf && (
                                <span className="ml-2 text-[10px] font-bold uppercase text-accent">
                                  you
                                </span>
                              )}
                            </td>
                            <td className="py-3 pr-3">
                              <span
                                className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                                  user.isAdmin
                                    ? 'bg-accent/15 text-accent'
                                    : 'bg-surface-2 text-ink-soft'
                                }`}
                              >
                                {user.isAdmin ? 'Admin' : 'Member'}
                              </span>
                            </td>
                            <td className="whitespace-nowrap py-3 pr-3 text-ink-soft">
                              {formatStamp(user.createdAt)}
                            </td>
                            <td className="py-3 pr-3 text-right text-ink-soft">
                              {user.watchlist.length}
                            </td>
                            <td className="py-3 text-right">
                              <button
                                type="button"
                                disabled={isSelf}
                                onClick={() => onDeleteUser(user.email)}
                                title={
                                  isSelf
                                    ? 'You cannot delete the account you are signed in with'
                                    : `Delete ${user.email}`
                                }
                                className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-red-500/80 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            ) : (
              <MovieManager actor={currentEmail} />
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
