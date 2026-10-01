'use client'

import { useMemo, useState } from 'react'
import { loadPerson, loadPersonCredits } from '../lib/tmdb'
import type { Person, PersonCredit } from '../lib/tmdb'
import { useAsyncSection } from '../lib/useAsyncSection'
import { useModalDismiss } from '../lib/useModalDismiss'
import type { Media } from '../types'
import { scoreColor } from './detail/sectionUtils'

export type PersonRef = {
  id: number
  name: string
}

type CreditSort = 'popularity' | 'release' | 'az'

const CREDIT_SORTS: { key: CreditSort; label: string }[] = [
  { key: 'popularity', label: 'Popularity' },
  { key: 'release', label: 'Release Date' },
  { key: 'az', label: 'A-Z' },
]

const ALL_DEPARTMENTS = 'all'

/**
 * Tab order for the department filter. TMDB returns whatever departments it has
 * for a person — a typical actor has "Acting" only, a producer has a dozen — so
 * the three everyone looks for lead, and the rest follow in a sensible order
 * rather than alphabetically burying "Directing" under "Camera".
 */
const DEPARTMENT_ORDER = [
  'Acting',
  'Directing',
  'Production',
  'Writing',
  'Creator',
  'Sound',
  'Camera',
  'Editing',
  'Art',
  'Visual Effects',
  'Lighting',
  'Costume & Make-Up',
  'Crew',
  'Script & Continuity',
  'Cast',
  'Miscellaneous',
]

function departmentRank(name: string): number {
  const index = DEPARTMENT_ORDER.indexOf(name)
  // Anything TMDB adds later still gets a stable slot, just after the known ones.
  return index === -1 ? DEPARTMENT_ORDER.length : index
}

/** `"1994-07-15"` → `1994`, or null when the date is missing or unparseable. */
function yearOfDate(date: string): number | null {
  if (!date) return null
  const year = new Date(date).getFullYear()
  return Number.isNaN(year) ? null : year
}

function yearOf(media: Media): number | null {
  return yearOfDate(media.releaseDate)
}

function formatLifespan(person: Person): string {
  if (!person.birthday) return ''
  const born = yearOfDate(person.birthday)
  if (person.deathday) {
    const died = yearOfDate(person.deathday)
    return born && died ? `${born} – ${died}` : person.deathday
  }
  return born ? String(born) : ''
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-[0.15em] text-ink-muted">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-ink-soft">{value}</dd>
    </div>
  )
}

function CreditCard({
  credit,
  onSelect,
}: {
  credit: PersonCredit
  onSelect: (media: Media) => void
}) {
  const { media, role, department, departments } = credit
  const year = yearOf(media)
  // "Director, Producer" on one card: showing only the headline department would
  // make the film look like it belongs to a tab it is also listed under.
  const deptLabel = departments.length > 1 ? departments.join(' / ') : department
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(media)}
        className="group w-full text-left transition focus-visible:ring-2 focus-visible:ring-accent"
      >
        {media.poster ? (
          <img
            src={media.poster}
            alt=""
            loading="lazy"
            className="aspect-[2/3] w-full rounded-xl object-cover ring-1 ring-line"
          />
        ) : (
          <div className="flex aspect-[2/3] w-full items-center justify-center rounded-xl bg-surface-2 text-2xl text-ink/40 ring-1 ring-line">
            <span aria-hidden="true">🎬</span>
          </div>
        )}
        <div className="mt-2 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink group-hover:text-accent">
              {media.title}
            </p>
            <p className="truncate text-xs text-ink-muted">
              {year ?? '—'}
              {deptLabel ? ` · ${deptLabel}` : ''}
            </p>
            {role && <p className="truncate text-xs text-ink-soft">{role}</p>}
          </div>
          {media.rating > 0 && (
            <span
              className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold text-void ${scoreColor(media.rating)}`}
            >
              ★ {media.rating}
            </span>
          )}
        </div>
      </button>
    </li>
  )
}

function CreditSkeleton() {
  return (
    <div
      className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5"
      aria-hidden="true"
    >
      {Array.from({ length: 10 }, (_, n) => (
        <div key={n}>
          <div className="aspect-[2/3] w-full animate-pulse rounded-xl bg-surface-2" />
          <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-surface-2" />
          <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-surface-2" />
        </div>
      ))}
    </div>
  )
}

type Props = {
  person: PersonRef
  /** Opens a title from the filmography. */
  onSelectMedia: (media: Media) => void
  onClose: () => void
}

/**
 * A person's page: bio and personal details above their full filmography.
 * Opened from any cast or crew name on a title page.
 */
export function PersonDetail({ person, onSelectMedia, onClose }: Props) {
  const [sort, setSort] = useState<CreditSort>('popularity')
  const [department, setDepartment] = useState(ALL_DEPARTMENTS)

  useModalDismiss(onClose)

  const profile = useAsyncSection(
    (signal) => loadPerson(person.id, signal),
    [person.id],
  )
  const credits = useAsyncSection(
    (signal) => loadPersonCredits(person.id, signal),
    [person.id],
  )

  const data = profile.data
  const lifespan = data ? formatLifespan(data) : ''

  // Only the departments actually present, so a chip is never a dead end, plus
  // how many titles sit behind it. A title credited in two departments is counted
  // under both, so the department counts do not necessarily add up to "All" —
  // which is the number of titles, exactly what the grid shows underneath.
  const tabs = useMemo(() => {
    const counts = new Map<string, number>()
    for (const credit of credits.data ?? []) {
      for (const name of credit.departments) {
        counts.set(name, (counts.get(name) ?? 0) + 1)
      }
    }
    const names = [...counts.keys()].sort(
      (a, b) => departmentRank(a) - departmentRank(b) || a.localeCompare(b, 'en'),
    )
    return [
      { key: ALL_DEPARTMENTS, label: 'All', count: credits.data?.length ?? 0 },
      ...names.map((name) => ({
        key: name,
        label: name,
        count: counts.get(name) ?? 0,
      })),
    ]
  }, [credits.data])

  const visible = useMemo(() => {
    const list = (credits.data ?? []).filter(
      (credit) =>
        department === ALL_DEPARTMENTS ||
        // A title can sit in several departments at once ("Director, Producer"),
        // so membership is tested against the whole set, not the headline one.
        credit.departments.includes(department),
    )
    const sorted = [...list]
    if (sort === 'release') {
      sorted.sort((a, b) => (yearOf(b.media) ?? 0) - (yearOf(a.media) ?? 0))
    } else if (sort === 'az') {
      sorted.sort((a, b) => a.media.title.localeCompare(b.media.title, 'en'))
    } else {
      sorted.sort(
        (a, b) => (b.media.popularity ?? 0) - (a.media.popularity ?? 0),
      )
    }
    return sorted
  }, [credits.data, department, sort])

  // A person page is not deep-linkable, but the tab state does survive a
  // re-render; guard anyway so a department that vanishes from the response can
  // never leave the grid showing an empty, unexplained list.
  const activeTab = tabs.some((tab) => tab.key === department)
    ? department
    : ALL_DEPARTMENTS
  const activeLabel =
    tabs.find((tab) => tab.key === activeTab)?.label ?? ALL_DEPARTMENTS

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-page"
      role="dialog"
      aria-modal="true"
      aria-label={`${person.name} filmography`}
    >
      <header className="sticky top-0 z-20 border-b border-line bg-page/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm font-bold text-ink ring-1 ring-line transition hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span aria-hidden="true">←</span> Back
          </button>
          <p className="truncate text-sm font-bold text-ink-soft">
            {person.name}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
          {profile.loading && data === null ? (
            <div
              className="h-64 w-48 shrink-0 animate-pulse rounded-2xl bg-surface-2"
              aria-hidden="true"
            />
          ) : data?.profile ? (
            <img
              src={data.profile}
              alt={data.name}
              className="h-64 w-48 shrink-0 rounded-2xl object-cover ring-1 ring-line"
            />
          ) : null}

          <div className="min-w-0 flex-1">
            {profile.error !== null && data === null ? (
              <p className="rounded-2xl bg-surface/70 p-5 text-sm text-ink ring-1 ring-line">
                Couldn’t load this profile: {profile.error}
              </p>
            ) : data === null ? (
              <div className="space-y-3" aria-hidden="true">
                <div className="h-9 w-2/3 animate-pulse rounded bg-surface-2" />
                <div className="h-4 w-1/3 animate-pulse rounded bg-surface-2" />
              </div>
            ) : (
              <>
                <h1 className="text-3xl font-bold text-ink md:text-4xl">
                  {data.name}
                </h1>
                <p className="mt-2 text-sm text-ink-muted">
                  {[data.knownForDepartment, lifespan]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {data.alsoKnownAs.length > 0 && (
                  <p className="mt-1 text-xs text-ink-muted">
                    Also known as {data.alsoKnownAs.slice(0, 3).join(', ')}
                  </p>
                )}
                {data.homepage && (
                  <a
                    href={data.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block rounded-full bg-surface-2 px-4 py-2 text-xs font-bold text-ink ring-1 ring-line transition hover:bg-surface-3"
                  >
                    Official site ↗
                  </a>
                )}

                <dl className="mt-6 grid gap-5 sm:grid-cols-2">
                  <Fact label="Born" value={data.birthday} />
                  <Fact label="Place of birth" value={data.placeOfBirth} />
                </dl>

                {data.biography ? (
                  <div className="mt-8">
                    <h2 className="text-lg font-bold text-ink">Biography</h2>
                    {/* TMDB biographies carry literal "\n" escapes, not newlines. */}
                    <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                      {data.biography.replace(/\\n/g, '\n')}
                    </p>
                  </div>
                ) : (
                  <p className="mt-8 text-sm text-ink-muted">
                    No biography has been added for {data.name} yet.
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <section aria-labelledby="filmography-heading" className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="filmography-heading" className="text-xl font-bold text-ink md:text-2xl">
                Filmography
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                {credits.loading && credits.data === null
                  ? 'Loading credits…'
                  : `${visible.length} title${visible.length === 1 ? '' : 's'}` +
                    (activeTab === ALL_DEPARTMENTS
                      ? ''
                      : ` in ${activeLabel}`)}
              </p>
            </div>

            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-ink-muted">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as CreditSort)}
                className="rounded-full bg-surface-2 px-3 py-2 text-sm font-semibold normal-case tracking-normal text-ink ring-1 ring-line focus-visible:ring-2 focus-visible:ring-accent"
              >
                {CREDIT_SORTS.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Department chips, matching the genre filter on the browse grid. The
              `chip-on` indicator hangs below the pill, so the row reserves room
              for it with pb-5 and stays clear of the grid with mb-7. Hidden
              entirely for a single-department filmography, where it would filter
              nothing. */}
          {tabs.length > 2 && (
            <div
              role="group"
              aria-label="Filter credits by department"
              className="-mx-4 mb-7 mt-5 flex items-center gap-2 overflow-x-auto px-4 pt-2 pb-5"
            >
              {tabs.map((tab) => {
                const active = tab.key === activeTab
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setDepartment(tab.key)}
                    aria-pressed={active}
                    className={`chip shrink-0 ${active ? 'chip-on' : ''}`}
                  >
                    {tab.label}
                    <span
                      aria-hidden="true"
                      className={`ml-2 text-xs font-semibold ${
                        active ? 'opacity-80' : 'text-ink-muted'
                      }`}
                    >
                      {tab.count}
                    </span>
                    <span className="sr-only">, {tab.count} credits</span>
                  </button>
                )
              })}
            </div>
          )}

          {credits.error !== null && credits.data === null ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-surface/70 p-5 text-sm ring-1 ring-line">
              <p className="text-ink">Couldn’t load the filmography.</p>
              <button
                type="button"
                onClick={credits.reload}
                className="rounded-full bg-surface-2 px-4 py-1.5 text-xs font-bold text-ink transition hover:bg-surface-3"
              >
                Try again
              </button>
            </div>
          ) : credits.loading && credits.data === null ? (
            <CreditSkeleton />
          ) : visible.length > 0 ? (
            <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {visible.map((credit) => (
                <CreditCard
                  key={`${credit.media.type}-${credit.media.id}`}
                  credit={credit}
                  onSelect={onSelectMedia}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink-muted">
              No credits to show
              {activeTab === ALL_DEPARTMENTS ? '' : ` for ${activeLabel}`}.
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
