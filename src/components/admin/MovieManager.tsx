'use client'

import { useState } from 'react'
import {
  addCustomMovie,
  byNewestFirst,
  deleteCustomMovie,
  useCustomMovies,
} from '../../lib/customMovieStore'
import type { CustomMovie } from '../../lib/customMovieStore'
import { AddMovieForm } from './AddMovieForm'

function formatAdded(iso: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return 'Unknown'
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function Poster({ movie }: { movie: CustomMovie }) {
  if (movie.posterUrl) {
    return (
      <img
        src={movie.posterUrl}
        alt=""
        loading="lazy"
        className="h-16 w-11 shrink-0 rounded-lg object-cover ring-1 ring-line"
      />
    )
  }
  // A title can be saved without a poster; the grid shows the same glyph, so
  // the placeholder reads as "no artwork yet" rather than a broken image.
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
 * One row of the admin list. Deleting is two-step: a title is unrecoverable
 * once removed, and the row that owns the button is the row a stray click
 * lands on, so the confirm sits next to the action it guards.
 */
function MovieRow({
  movie,
  onDelete,
}: {
  movie: CustomMovie
  onDelete: (id: number) => void
}) {
  const [confirming, setConfirming] = useState(false)

  return (
    <li className="flex items-center gap-4 rounded-xl bg-page/40 p-3 ring-1 ring-line">
      <Poster movie={movie} />

      <div className="min-w-0 flex-1">
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
          <span>added {formatAdded(movie.createdAt)}</span>
        </p>
      </div>

      {confirming ? (
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onDelete(movie.id)
              setConfirming(false)
            }}
            className="rounded-lg bg-red-500/80 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-500"
          >
            Delete
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
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label={`Delete ${movie.title}`}
          className="shrink-0 rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-red-500/80 hover:text-white"
        >
          Delete
        </button>
      )}
    </li>
  )
}

export function MovieManager() {
  const movies = useCustomMovies()
  const rows = byNewestFirst(movies)

  return (
    <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
      <AddMovieForm onAdd={addCustomMovie} />

      <section aria-label="Custom titles">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-extrabold uppercase tracking-[0.18em] text-accent">
            Catalogued titles
          </h3>
          <span className="text-xs tabular-nums text-ink-muted">
            {movies.length} {movies.length === 1 ? 'title' : 'titles'}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="mt-4 rounded-xl bg-page/40 p-8 text-center text-sm text-ink-muted ring-1 ring-line">
            No custom titles yet. Add one with the form and it appears in the{' '}
            <span className="font-semibold text-ink-soft">Custom</span> tab on
            the main grid.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {rows.map((movie) => (
              <MovieRow key={movie.id} movie={movie} onDelete={deleteCustomMovie} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
