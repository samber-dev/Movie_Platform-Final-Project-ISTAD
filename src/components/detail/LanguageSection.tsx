'use client'

import { useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { COLLAPSED_LANGUAGE_COUNT } from '../../lib/tmdb'
import type { LanguageOption, MediaDetails } from '../../lib/tmdb'

type Group = {
  key: 'audio' | 'subtitles'
  label: string
  hint: string
  options: LanguageOption[]
  originalCode: string
}

/**
 * Drops the accents so a keyboard without them still finds the language. TMDB
 * returns endonyms like "Español" or "Français", and nobody types the accent to
 * hunt for one, so "espanol" has to reach "Español".
 */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function matches(option: LanguageOption, term: string): boolean {
  if (!term) return true
  const needle = fold(term)
  return (
    fold(option.englishName).includes(needle) ||
    fold(option.nativeName).includes(needle) ||
    option.code.toLowerCase().startsWith(needle)
  )
}

/**
 * One row of language pills. Selecting a badge reveals that language's full
 * details underneath rather than navigating away, so a viewer can confirm the
 * endonym and the ISO code without losing their place on the page.
 */
function LanguageGroup({
  group,
}: {
  group: Group
}) {
  const [term, setTerm] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [selected, setSelected] = useState<LanguageOption | null>(null)

  const filtered = useMemo(
    () => group.options.filter((option) => matches(option, term)),
    [group.options, term],
  )

  // Filtering is an explicit request to see everything it matches, so it wins
  // over the collapsed default.
  const limit = expanded || term ? filtered.length : COLLAPSED_LANGUAGE_COUNT
  const shown = filtered.slice(0, limit)
  const hidden = filtered.length - shown.length
  const overflow = group.options.length > COLLAPSED_LANGUAGE_COUNT

  // Roving tabindex: exactly one badge in the group is tabbable. A selection that
  // the current filter has hidden must not take that slot away, hence the
  // fall-back to the first visible badge.
  const selectedIndex = shown.findIndex(
    (option) => option.code === selected?.code,
  )
  const rovingIndex = selectedIndex === -1 ? 0 : selectedIndex

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const list = shown
    const step =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0
    if (step === 0) return
    event.preventDefault()
    const next = list[(index + step + list.length) % list.length]
    if (!next) return
    setSelected(next)
    // Move focus with the selection so the roving tabindex stays honest.
    const buttons = event.currentTarget.parentElement?.querySelectorAll('button')
    buttons?.[shown.indexOf(next)]?.focus()
  }

  if (group.options.length === 0) return null

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-bold text-ink">
          {group.label}
          <span className="ml-2 text-xs font-semibold text-ink-muted">
            {group.options.length}
          </span>
        </h4>
        <p className="text-[11px] text-ink-muted">{group.hint}</p>
      </div>

      {overflow && (
        <input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={`Filter ${group.label.toLowerCase()}…`}
          aria-label={`Filter ${group.label.toLowerCase()}`}
          className="neon-input mt-2.5"
        />
      )}

      {shown.length === 0 ? (
        <p className="mt-2.5 text-xs text-ink-muted">
          No language matches “{term}”.
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-label={group.label}
          className="mt-2.5 flex flex-wrap gap-2"
        >
          {shown.map((option, index) => {
            const isOriginal = option.code === group.originalCode
            const isSelected = selected?.code === option.code
            return (
              <button
                key={`${option.code}-${option.englishName}`}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={index === rovingIndex ? 0 : -1}
                onClick={() =>
                  setSelected(isSelected ? null : option)
                }
                onKeyDown={(event) => handleKeyDown(event, index)}
                title={`${option.englishName} (${option.code.toUpperCase()})`}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-accent ${
                  isSelected
                    ? 'text-on-accent bg-accent'
                    : isOriginal
                      ? 'text-ink bg-surface-2 ring-1 ring-accent'
                      : 'text-ink-soft bg-surface-2 ring-1 ring-line hover:bg-surface-3'
                }`}
              >
                {option.englishName}
                {isOriginal && (
                  <span className="ml-1.5 text-[9px] font-extrabold uppercase tracking-wider opacity-80">
                    Original
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2.5 text-xs font-bold text-accent underline-offset-4 hover:underline"
        >
          Show {hidden} more
        </button>
      )}
      {expanded && !term && hidden === 0 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-2.5 text-xs font-bold text-accent underline-offset-4 hover:underline"
        >
          Show fewer
        </button>
      )}

      {selected && (
        <p className="mt-2.5 rounded-lg bg-surface-2 px-3 py-2 text-xs text-ink-soft ring-1 ring-line">
          <span className="font-bold text-ink">{selected.englishName}</span>
          {selected.nativeName !== selected.englishName && (
            <> · {selected.nativeName}</>
          )}
          {selected.code && (
            <>
              {' · '}
              <span className="font-mono uppercase">{selected.code}</span>
            </>
          )}
        </p>
      )}
    </div>
  )
}

/**
 * Audio track and subtitle availability for a title, straight from TMDB.
 *
 * A note on the subtitle list: TMDB exposes actual subtitle *files* for only a
 * minority of titles. Where it does not, the languages the title has been
 * localized into are listed instead, and the caption says so rather than
 * implying a file exists for every badge.
 */
export function LanguageSection({ details }: { details: MediaDetails | null }) {
  // The skeleton is a separate component so this one only ever runs its hooks
  // with details in hand — a conditional early return above a hook is a rules
  // -of-hooks violation, not a style preference.
  if (details === null) return <LanguageSkeleton />
  return <LanguagePanel details={details} />
}

function LanguageSkeleton() {
  return (
    <div className="rounded-2xl bg-surface/70 p-5 ring-1 ring-line">
      <div className="h-4 w-32 animate-pulse rounded bg-surface-2" />
      <div className="mt-4 h-7 w-full animate-pulse rounded bg-surface-2" />
      <div className="mt-2 h-7 w-2/3 animate-pulse rounded bg-surface-2" />
    </div>
  )
}

function LanguagePanel({ details }: { details: MediaDetails }) {
  const groups = useMemo<Group[]>(
    () => [
      {
        key: 'audio',
        label: 'Audio',
        hint: 'Audio languages listed by TMDB',
        options: details.audioLanguages,
        originalCode: details.originalLanguageCode,
      },
      {
        key: 'subtitles',
        label: 'Subtitles',
        hint:
          details.subtitleSource === 'files'
            ? 'Confirmed subtitle tracks'
            : details.subtitleSource === 'translations'
              ? 'Localized languages · no track list published'
              : 'None listed',
        options: details.subtitleLanguages,
        originalCode: details.originalLanguageCode,
      },
    ],
    [details],
  )

  const empty = groups.every((group) => group.options.length === 0)

  return (
    <div className="rounded-2xl bg-surface/70 p-5 ring-1 ring-line">
      <h3 className="text-sm font-bold text-ink">Audio &amp; Subtitles</h3>

      {empty ? (
        <p className="mt-3 text-sm text-ink-muted">
          TMDB lists no language availability for this title yet.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map((group) => (
            <LanguageGroup key={group.key} group={group} />
          ))}
        </div>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-ink-muted">
        {details.subtitleSource === 'translations'
          ? 'TMDB publishes no subtitle track list for this title, so the languages it has been translated into are shown instead.'
          : details.subtitleSource === 'files'
            ? 'Subtitle tracks confirmed by TMDB.'
            : null}
        {' '}TMDB lists the languages a title is recorded in rather than a full
        dub inventory, so treat the audio row as a starting point rather than a
        complete list of streams.
      </p>
    </div>
  )
}
