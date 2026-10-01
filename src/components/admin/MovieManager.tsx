'use client'

import { useMemo, useState } from 'react'
import {
  addCustomMovie,
  byNewestFirst,
  deleteCustomMovie,
  toDraft,
  updateCustomMovie,
  useCustomMovies,
} from '../../lib/customMovieStore'
import type { CustomMovie } from '../../lib/customMovieStore'
import { recordActivity } from '../../lib/activityStore'
import { MovieForm } from './MovieForm'

function formatStamp(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return 'Unknown'
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function Poster({ movie }: { movie: CustomMovie }) {
  const [failed, setFailed] = useState(false)

  if (movie.posterUrl && !failed) {
    return (
      <img
        src={movie.posterUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-16 w-11 shrink-0 rounded-lg object-cover ring-1 ring-line"
      />
    )
  }
  // A title can be saved without a poster, or with a URL that 404s; the grid
  // shows the same glyph, so the placeholder reads as "no usable artwork yet"
  // rather than a broken image.
  return (
    <span
      aria-hidden="true"
      className="flex h-16 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-lg ring-1 ring-line"
    >
      🎬
    </span>
  )
}

/**
 * One row of the admin list.
 *
 * Deleting is two-step: a title is unrecoverable once removed, and the row that
 * owns the button is the row a stray click lands on, so the confirm sits next to
 * the action it guards. Editing hands the form the stored title and swaps the
 * panel into edit mode; the row stays put either way.
 */
function MovieRow({
  movie,
  editing,
  onEdit,
  onDelete,
}: {
  movie: CustomMovie
  editing: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <li
      className={`flex flex-wrap items-center gap-4 rounded-xl p-3 ring-1 transition ${
        editing
          ? 'bg-accent/10 ring-accent/60'
          : 'bg-page/40 ring-line hover:bg-surface-2/60'
      }`}
    >
      <Poster movie={movie} />

      <div className="min-w-[10rem] flex-1">
        <p className="truncate font-semibold text-ink" title={movie.title}>
          {movie.title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
          <span className="tabular-nums">{movie.releaseYear}</span>
          {movie.genre && (
            <>
              <span aria-hidden="true">·</span>
              <span className="rounded-full bg-accent/15 px-2 py-0.5 font-bold text-accent">
                {movie.genre}
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>
            {movie.updatedAt
              ? `edited ${formatStamp(movie.updatedAt)}`
              : `added ${formatStamp(movie.createdAt)}`}
          </span>
        </p>
        {movie.overview && (
          <p className="mt-1 line-clamp-2 text-xs text-ink-soft">
            {movie.overview}
          </p>
        )}
      </div>

      {confirming ? (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="text-xs font-semibold text-ink-soft">Delete?</span>
          <button
            type="button"
            onClick={() => {
              onDelete()
              setConfirming(false)
            }}
            className="rounded-lg bg-red-500/80 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-500"
          >
            Yes, delete
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-bold text-ink-soft transition hover:bg-surface-3 hover:text-ink"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${movie.title}`}
            aria-pressed={editing}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              editing
                ? 'bg-accent text-page'
                : 'bg-surface-2 text-ink hover:bg-accent hover:text-page'
            }`}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${movie.title}`}
            className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-red-500/80 hover:text-white"
          >
            Delete
          </button>
        </div>
      )}
    </li>
  )
}

/**
 * The Movies tab: add / edit / delete for the admin-authored catalogue.
 *
 * The form is the panel's left column and the catalogue its right, so a saved
 * title is visible without scrolling away from the fields that saved it. Both
 * write through `customMovieStore`, which persists to localStorage and
 * republishes into the Movies feed on the main grid.
 */
export function MovieManager({ actor }: { actor: string }) {
  const movies = useCustomMovies()
  const [editingId, setEditingId] = useState<number | null>(null)
  const [query, setQuery] = useState('')

  const rows = useMemo(() => byNewestFirst(movies), [movies])
  const editing =
    editingId === null ? null : movies.find((m) => m.id === editingId) ?? null

  const needle = query.trim().toLowerCase()
  const visible = useMemo(
    () =>
      needle === ''
        ? rows
        : rows.filter(
            (movie) =>
              movie.title.toLowerCase().includes(needle) ||
              movie.genre.toLowerCase().includes(needle) ||
              String(movie.releaseYear).includes(needle),
          ),
    [rows, needle],
  )

  return (
    <div className="grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)] xl:items-start">
      {/* Keyed on the title being edited, so picking a different row starts a
          fresh draft instead of carrying the previous row's values over. */}
      <MovieForm
        key={editing === null ? 'add' : `edit-${editing.id}`}
        mode={editing === null ? 'add' : 'edit'}
        initial={editing === null ? undefined : toDraft(editing)}
        onSubmit={(input) => {
          // Logged here rather than inside the store, so the store stays a plain
          // data layer and the activity log records what the admin actually did.
          if (editing === null) {
            const added = addCustomMovie(input)
            recordActivity('custom.added', `Added “${added.title}” to the catalogue`, actor)
          } else {
            const updated = updateCustomMovie(editing.id, input)
            recordActivity('custom.edited', `Edited “${updated?.title ?? input.title}”`, actor)
          }
        }}
        onCancel={
          editing === null ? undefined : () => setEditingId(null)
        }
      />

      <section aria-label="Custom titles" className="min-w-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-[0.18em] text-accent">
              Catalogued titles
            </h3>
            <p className="mt-1 text-xs text-ink-muted">
              {movies.length} {movies.length === 1 ? 'title' : 'titles'} in
              localStorage
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-64">
            <label className="relative block w-full">
              <span className="sr-only">Search custom titles</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by title, genre, year…"
                className="neon-input"
              />
            </label>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="mt-4 rounded-xl bg-page/40 p-8 text-center text-sm text-ink-muted ring-1 ring-line">
            No titles here yet. Add one with the form and it appears in the{' '}
            <span className="font-semibold text-ink-soft">Movies</span> feed on
            the main grid.
          </p>
        ) : visible.length === 0 ? (
          <p className="mt-4 rounded-xl bg-page/40 p-8 text-center text-sm text-ink-muted ring-1 ring-line">
            Nothing matches “{query.trim()}”.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {visible.map((movie) => (
              <MovieRow
                key={movie.id}
                movie={movie}
                editing={movie.id === editingId}
                onEdit={() =>
                  setEditingId((current) => (current === movie.id ? null : movie.id))
                }
                onDelete={() => {
                  recordActivity('custom.deleted', `Deleted “${movie.title}” from the catalogue`, actor)
                  deleteCustomMovie(movie.id)
                  // The form was showing this title; leaving it in edit mode
                  // would point it at a title that no longer exists.
                  setEditingId((current) => (current === movie.id ? null : current))
                }}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
