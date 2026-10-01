'use client'

import { useMemo, useState } from 'react'
import { useModalDismiss } from '../lib/useModalDismiss'
import { toMedia, useCustomMovies } from '../lib/customMovieStore'
import type { Account } from '../types'
import { MovieManager } from './admin/MovieManager'

const EXPORT_FILENAME = 'angkorcinemas_users.json'

type AdminTab = 'users' | 'movies'

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
  const [tab, setTab] = useState<AdminTab>('users')
  const customMovies = useCustomMovies()
  useModalDismiss(onClose)

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

  const TABS: { key: AdminTab; label: string; hint: string }[] = [
    { key: 'users', label: 'Users', hint: 'Accounts registered on this device' },
    {
      key: 'movies',
      label: 'Movies',
      hint: 'Titles you have added to the catalogue',
    },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Admin panel"
    >
      <div
        className="neon-panel flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-6">
          <div className="min-w-0">
            <span className="inline-flex rounded-full bg-accent/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
              Admin Panel
            </span>
            <h2 className="mt-3 text-2xl font-extrabold text-ink">
              Platform management
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              {tab === 'users'
                ? 'Every account registered on this device, stored in localStorage.'
                : 'Curate the catalogue by hand — everything here is stored locally.'}
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex items-center gap-2">
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
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {exported && (
              <p className="text-right text-xs text-accent-2">
                ✓ {EXPORT_FILENAME} · {formatBytes(exported.bytes)} ·{' '}
                {exported.count} account{exported.count === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </div>

        <div className="border-b border-line px-6 pt-4">
          <div
            className="flex gap-1"
            role="tablist"
            aria-label="Admin sections"
          >
            {TABS.map((entry) => {
              const selected = tab === entry.key
              return (
                <button
                  key={entry.key}
                  type="button"
                  role="tab"
                  id={`admin-tab-${entry.key}`}
                  aria-selected={selected}
                  aria-controls={`admin-panel-${entry.key}`}
                  onClick={() => setTab(entry.key)}
                  className={`relative rounded-t-lg px-4 py-2.5 text-sm font-bold transition focus-visible:ring-2 focus-visible:ring-accent ${
                    selected
                      ? 'text-ink'
                      : 'text-ink-muted hover:bg-surface-2/60 hover:text-ink-soft'
                  }`}
                >
                  {entry.label}
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full transition ${
                      selected
                        ? 'bg-accent shadow-neon'
                        : 'bg-transparent'
                    }`}
                  />
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 p-6 pb-4">
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

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <div
            role="tabpanel"
            id="admin-panel-users"
            aria-labelledby="admin-tab-users"
            hidden={tab !== 'users'}
          >
            {rows.length === 0 ? (
              <p className="py-10 text-center text-ink-muted">No accounts yet.</p>
            ) : (
              <table className="w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-surface text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Email
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Role
                    </th>
                    <th scope="col" className="py-2 pr-3 font-semibold">
                      Registered
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">
                      Saved
                    </th>
                    <th scope="col" className="py-2 text-right font-semibold">
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
          </div>

          <div
            role="tabpanel"
            id="admin-panel-movies"
            aria-labelledby="admin-tab-movies"
            hidden={tab !== 'movies'}
          >
            <MovieManager />
          </div>
        </div>
      </div>
    </div>
  )
}
