'use client'

import { useId, useState } from 'react'
import { GENRE_NAMES } from '../../lib/genres'
import {
  MAX_OVERVIEW_LENGTH,
  MAX_TITLE_LENGTH,
  useCustomMovies,
  validateDraft,
} from '../../lib/customMovieStore'
import type { CustomMovieDraft, CustomMovieInput, FieldErrors } from '../../lib/customMovieStore'

const EMPTY_DRAFT: CustomMovieDraft = {
  title: '',
  releaseYear: '',
  genre: '',
  posterUrl: '',
  overview: '',
}

const label =
  'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted'

/** Shared by every control so the error ring matches the resting ring. */
function control(hasError: boolean): string {
  return `neon-input ${hasError ? 'ring-1 ring-score-low' : ''}`
}

type Props = {
  onAdd: (input: CustomMovieInput) => void
}

/**
 * Only http(s) previews are rendered. A `javascript:` or `data:` URL would be
 * rejected on submit anyway, and this keeps the preview from being the one
 * place such a value reaches the DOM.
 */
function previewable(url: string): string {
  const value = url.trim()
  if (!value) return ''
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`
  try {
    const parsed = new URL(candidate)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.href
      : ''
  } catch {
    return ''
  }
}

export function AddMovieForm({ onAdd }: Props) {
  const fieldId = useId()
  const [draft, setDraft] = useState<CustomMovieDraft>(EMPTY_DRAFT)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [added, setAdded] = useState<string | null>(null)
  const movies = useCustomMovies()

  // The confirmation names one specific title, so it has to stop claiming that
  // title is in the catalogue once it has been deleted again.
  const addedIsStillListed = added !== null && movies.some((movie) => movie.title === added)

  const preview = previewable(draft.posterUrl)
  const overviewLength = draft.overview.length

  function update(field: keyof CustomMovieDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    // Clear a field's error as soon as it is edited, so the form stops shouting
    // about something the admin is already fixing.
    setErrors((current) => {
      if (!(field in current)) return current
      const next = { ...current }
      delete next[field]
      return next
    })
    setAdded(null)
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = validateDraft(draft)
    if (!result.ok) {
      setErrors(result.errors)
      setAdded(null)
      return
    }
    onAdd(result.value)
    setDraft(EMPTY_DRAFT)
    setErrors({})
    setAdded(result.value.title)
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby={`${fieldId}-heading`}
      className="rounded-2xl bg-surface-2/60 p-5 ring-1 ring-line"
    >
      <h3
        id={`${fieldId}-heading`}
        className="text-sm font-extrabold uppercase tracking-[0.18em] text-accent"
      >
        Add a title
      </h3>
      <p className="mt-1 text-xs text-ink-muted">
        Saved to this device and published to the Custom tab immediately.
      </p>

      <div className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem]">
        <div>
          <label className={label} htmlFor={`${fieldId}-title`}>
            Title
          </label>
          <input
            id={`${fieldId}-title`}
            className={control(Boolean(errors.title))}
            value={draft.title}
            onChange={(e) => update('title', e.target.value)}
            placeholder="The Long Walk Home"
            maxLength={MAX_TITLE_LENGTH}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? `${fieldId}-title-error` : undefined}
          />
          {errors.title && (
            <p id={`${fieldId}-title-error`} className="mt-1.5 text-xs text-score-low">
              {errors.title}
            </p>
          )}
        </div>

        <div>
          <label className={label} htmlFor={`${fieldId}-year`}>
            Year
          </label>
          <input
            id={`${fieldId}-year`}
            type="text"
            inputMode="numeric"
            className={control(Boolean(errors.releaseYear))}
            value={draft.releaseYear}
            onChange={(e) => update('releaseYear', e.target.value)}
            placeholder="1997"
            aria-invalid={Boolean(errors.releaseYear)}
            aria-describedby={
              errors.releaseYear ? `${fieldId}-year-error` : undefined
            }
          />
          {errors.releaseYear && (
            <p id={`${fieldId}-year-error`} className="mt-1.5 text-xs text-score-low">
              {errors.releaseYear}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <label className={label} htmlFor={`${fieldId}-genre`}>
          Genre
        </label>
        <input
          id={`${fieldId}-genre`}
          className={control(Boolean(errors.genre))}
          value={draft.genre}
          onChange={(e) => update('genre', e.target.value)}
          placeholder="Drama"
          list={`${fieldId}-genres`}
          aria-invalid={Boolean(errors.genre)}
          aria-describedby={
            errors.genre ? `${fieldId}-genre-error` : `${fieldId}-genre-hint`
          }
        />
        <datalist id={`${fieldId}-genres`}>
          {GENRE_NAMES.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {errors.genre ? (
          <p id={`${fieldId}-genre-error`} className="mt-1.5 text-xs text-score-low">
            {errors.genre}
          </p>
        ) : (
          <p id={`${fieldId}-genre-hint`} className="mt-1.5 text-xs text-ink-muted">
            Picking one of the suggestions lets the genre chips filter this title.
          </p>
        )}
      </div>

      <div className="mt-4">
        <label className={label} htmlFor={`${fieldId}-poster`}>
          Poster image URL
        </label>
        <div className="flex gap-3">
          <input
            id={`${fieldId}-poster`}
            className={control(Boolean(errors.posterUrl))}
            value={draft.posterUrl}
            onChange={(e) => update('posterUrl', e.target.value)}
            placeholder="https://image.tmdb.org/t/p/w500/…"
            aria-invalid={Boolean(errors.posterUrl)}
            aria-describedby={
              errors.posterUrl ? `${fieldId}-poster-error` : undefined
            }
          />
          {/* Live preview, so a mistyped URL is obvious before saving. */}
          <div className="flex h-[2.6rem] w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-3 ring-1 ring-line">
            {preview ? (
              <img
                src={preview}
                alt=""
                className="h-full w-full object-cover"
                // The value is re-validated on submit; a preview must never be
                // the thing that decides a URL is safe to fetch.
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden'
                }}
              />
            ) : (
              <span aria-hidden="true" className="text-xs text-ink-muted">
                🎬
              </span>
            )}
          </div>
        </div>
        {errors.posterUrl && (
          <p id={`${fieldId}-poster-error`} className="mt-1.5 text-xs text-score-low">
            {errors.posterUrl}
          </p>
        )}
      </div>

      <div className="mt-4">
        <label className={label} htmlFor={`${fieldId}-overview`}>
          Overview
        </label>
        <textarea
          id={`${fieldId}-overview`}
          rows={4}
          className={`${control(Boolean(errors.overview))} resize-y`}
          value={draft.overview}
          onChange={(e) => update('overview', e.target.value)}
          placeholder="A short synopsis shown on the title's detail page."
          maxLength={MAX_OVERVIEW_LENGTH}
          aria-invalid={Boolean(errors.overview)}
          aria-describedby={
            errors.overview ? `${fieldId}-overview-error` : undefined
          }
        />
        <div className="mt-1.5 flex items-start justify-between gap-3">
          {errors.overview ? (
            <p id={`${fieldId}-overview-error`} className="text-xs text-score-low">
              {errors.overview}
            </p>
          ) : (
            <span />
          )}
          <span className="text-xs tabular-nums text-ink-muted">
            {overviewLength}/{MAX_OVERVIEW_LENGTH}
          </span>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button type="submit" className="btn-neon px-5 py-2.5">
          ＋ Add movie
        </button>
        {addedIsStillListed && (
          <p className="text-xs font-semibold text-accent-2">
            ✓ “{added}” is now in the Custom tab
          </p>
        )}
      </div>
    </form>
  )
}
