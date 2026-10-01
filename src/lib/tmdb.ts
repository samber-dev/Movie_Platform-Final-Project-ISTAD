import type { Media, MediaType } from '../types'

export type TmdbResult = {
  id: number
  media_type?: string
  title?: string
  name?: string
  overview?: string
  poster_path?: string | null
  backdrop_path?: string | null
  release_date?: string
  first_air_date?: string
  vote_average?: number
  popularity?: number
  genre_ids?: number[]
}

export type CastMember = {
  id: number
  name: string
  character: string
  profile: string
}

export type CrewCredit = {
  id: number
  name: string
  job: string
  profile: string
}

/** One selectable language, carrying enough to render a badge in either script. */
export type LanguageOption = {
  /** ISO 639-1, e.g. "en". Empty when TMDB gave a name but no code. */
  code: string
  /** The endonym, e.g. "Français". */
  nativeName: string
  /** The English name, e.g. "French". */
  englishName: string
}

/**
 * Where the subtitle list came from, so the UI can be honest about it.
 *
 * TMDB's ideal source is `translations[].data.subtitles`, a list of actual
 * subtitle files. That field is empty for the large majority of titles, so the
 * fallback is the set of languages the title's *metadata* has been localized
 * into — closely correlated, but not the same claim.
 */
export type SubtitleSource = 'files' | 'translations' | 'none'

export type MediaDetails = {
  tagline: string
  status: string
  originalLanguage: string
  /** The community average as a 0-100 percentage, as `Media.rating`. */
  communityScore: number
  /** How many people voted that average. Needed to weight a local rating fairly. */
  voteCount: number
  budget: number
  revenue: number
  runtime: number
  homepage: string
  keywords: string[]
  genres: string[]
  director: CrewCredit | null
  writers: CrewCredit[]
  cast: CastMember[]
  /** ISO 639-1 of the language the title was made in. */
  originalLanguageCode: string
  /** Languages the title has an audio track for. */
  audioLanguages: LanguageOption[]
  /** Languages the title is available with subtitles in. */
  subtitleLanguages: LanguageOption[]
  subtitleSource: SubtitleSource
}

type RawLanguage = {
  iso_639_1?: string | null
  name?: string | null
  english_name?: string | null
}

type RawDetails = {
  tagline?: string
  status?: string
  original_language?: string
  vote_average?: number
  vote_count?: number
  budget?: number
  revenue?: number
  runtime?: number | null
  episode_run_time?: number[]
  last_episode_to_air?: { runtime?: number | null } | null
  homepage?: string | null
  genres?: { id: number; name: string }[]
  credits?: {
    cast?: {
      id: number
      name: string
      character?: string
      profile_path?: string | null
      order?: number
    }[]
    crew?: { id: number; name: string; job?: string; profile_path?: string | null }[]
  }
  keywords?: { results?: { id: number; name: string }[] }
  /** Movies: a list of language objects. */
  spoken_languages?: RawLanguage[] | null
  /** TV: the same list under a shorter name, as bare ISO codes. */
  languages?: (string | RawLanguage)[] | null
  translations?: {
    translations?: {
      iso_3166_1?: string | null
      iso_639_1?: string | null
      data?: {
        subtitles?: RawLanguage[] | null
        audio?: RawLanguage[] | null
      } | null
    }[] | null
  } | null
}

export const TMDB_API_KEY = '0e42297fbdb49b4a24879c7d54325351'
export const TMDB_API = 'https://api.themoviedb.org/3'
export const TMDB_IMG_W500 = 'https://image.tmdb.org/t/p/w500'
export const TMDB_IMG_ORIGINAL = 'https://image.tmdb.org/t/p/original'
export const TMDB_FALLBACK_BACKDROP =
  'https://image.tmdb.org/t/p/original/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg'

export function tmdbUrl(path: string, params: Record<string, string>): string {
  const search = new URLSearchParams({ ...params, api_key: TMDB_API_KEY })
  return `${TMDB_API}${path}?${search.toString()}`
}

export function discoverUrl(
  type: MediaType,
  genreId: number,
  page = 1,
): string {
  return tmdbUrl(`/discover/${type}`, {
    language: 'en-US',
    page: String(page),
    sort_by: 'popularity.desc',
    include_adult: 'false',
    with_genres: String(genreId),
  })
}

/** Shared by the grid search and the navbar typeahead so both hit the same query. */
export function searchUrl(term: string, page = 1): string {
  return tmdbUrl('/search/multi', {
    query: term,
    language: 'en-US',
    page: String(page),
    include_adult: 'false',
  })
}

/** The "no genre" feed: one endpoint per category, trending for the mix. */
export function feedUrl(category: MediaType | 'all', page = 1): string {
  return category === 'all'
    ? tmdbUrl('/trending/all/day', { language: 'en-US', page: String(page) })
    : tmdbUrl(`/${category}/popular`, {
        language: 'en-US',
        page: String(page),
      })
}

/** How far ahead the "Coming Soon" calendar looks. */
export const UPCOMING_WINDOW_DAYS = 365

/** ISO `YYYY-MM-DD`, `offset` days from today, read in UTC. */
function isoDayFromNow(offset: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

/**
 * The "Coming Soon" feed: unreleased movies inside a rolling one-year window,
 * earliest release first.
 *
 * `/movie/upcoming` exists, but it returns a short, loosely ordered list and
 * takes no genre filter, so the calendar is built from `/discover/movie` with a
 * `primary_release_date` range instead. That also sorts by release date
 * server-side, which is the calendar's natural order — and means "Load more"
 * walks forward through time rather than through unrelated popularity.
 *
 * A genre chip is optional here: the chips carry a movie id, which is the only
 * kind this endpoint can filter by.
 */
export function upcomingUrl(page = 1, genreId: number | null = null): string {
  return tmdbUrl('/discover/movie', {
    language: 'en-US',
    page: String(page),
    include_adult: 'false',
    sort_by: 'primary_release_date.asc',
    'primary_release_date.gte': isoDayFromNow(0),
    'primary_release_date.lte': isoDayFromNow(UPCOMING_WINDOW_DAYS),
    ...(genreId === null ? {} : { with_genres: String(genreId) }),
  })
}

/** TMDB's paged envelope, so the grid knows whether "Load more" has anywhere to go. */
export type PagedResults = {
  results: TmdbResult[]
  page: number
  totalPages: number
}

export async function getResults(
  url: string,
  signal: AbortSignal,
): Promise<PagedResults> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`TMDB request failed (${res.status})`)
  const data = (await res.json()) as {
    results?: TmdbResult[]
    page?: number
    total_pages?: number
  }
  return {
    results: Array.isArray(data.results) ? data.results : [],
    page: typeof data.page === 'number' ? data.page : 1,
    totalPages: typeof data.total_pages === 'number' ? data.total_pages : 1,
  }
}

function mapResult(raw: TmdbResult, names: Map<number, string>): Media | null {
  // /search/multi also returns people, who carry `name` but no `title`. Without
  // this guard they fall through to the `name` branch below and get rendered as
  // TV shows with a blank poster.
  if (raw.media_type === 'person') return null
  const type: MediaType | null =
    raw.media_type === 'movie' || raw.media_type === 'tv'
      ? raw.media_type
      : raw.title
        ? 'movie'
        : raw.name
          ? 'tv'
          : null
  if (!type) return null
  const genreIds = raw.genre_ids ?? []
  return {
    id: raw.id,
    type,
    title: type === 'tv' ? (raw.name ?? 'Untitled') : (raw.title ?? 'Untitled'),
    rating: Math.round((raw.vote_average ?? 0) * 10),
    releaseDate:
      type === 'tv' ? (raw.first_air_date ?? '') : (raw.release_date ?? ''),
    overview: raw.overview ?? '',
    poster: raw.poster_path ? `${TMDB_IMG_W500}${raw.poster_path}` : '',
    backdrop: raw.backdrop_path
      ? `${TMDB_IMG_ORIGINAL}${raw.backdrop_path}`
      : '',
    genreIds,
    popularity: Math.round(raw.popularity ?? 0),
    genres: genreIds
      .map((id) => names.get(id))
      .filter((name): name is string => Boolean(name)),
  }
}

export function toMedia(
  results: TmdbResult[],
  names: Map<number, string>,
): Media[] {
  return results
    .map((raw) => mapResult(raw, names))
    .filter((media): media is Media => media !== null)
}

const WRITER_JOBS = new Set(['Writer', 'Screenplay', 'Story', 'Novel'])
const MAX_CAST = 12
const MAX_WRITERS = 3

const displayNames = new Intl.DisplayNames(['en'], { type: 'language' })

function profileUrl(path: string | null | undefined): string {
  return path ? `${TMDB_IMG_W500}${path}` : ''
}

function languageName(code: string): string {
  if (!code) return 'Unknown'
  try {
    return displayNames.of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

/**
 * How many languages a badge row shows before it collapses behind a "show all"
 * control. Some titles localise into forty languages, which would otherwise
 * push the rest of the detail page off the screen.
 */
export const COLLAPSED_LANGUAGE_COUNT = 8

/**
 * Normalises TMDB's two shapes — `{ iso_639_1, name, english_name }` and, for
 * TV `languages`, a bare code string — into one option, de-duplicated by code
 * and ordered original-first, then English, then alphabetically.
 */
function toLanguageOptions(
  entries: (RawLanguage | string | null | undefined)[],
  originalCode: string,
  englishFirst = true,
): LanguageOption[] {
  const byCode = new Map<string, LanguageOption>()

  for (const entry of entries) {
    const raw: RawLanguage | null =
      typeof entry === 'string' ? { iso_639_1: entry } : (entry ?? null)
    if (!raw) continue
    const code = (raw.iso_639_1 ?? '').trim()
    // A code is the only stable identity here: TMDB's `name` flips between the
    // endonym and the English name depending on which endpoint it came from.
    const key = code || (raw.english_name ?? raw.name ?? '').toLowerCase()
    if (!key || byCode.has(key)) continue
    const englishName = raw.english_name?.trim() || languageName(code)
    byCode.set(key, {
      code,
      nativeName: raw.name?.trim() || englishName,
      englishName,
    })
  }

  const rank = (option: LanguageOption): number => {
    if (option.code && option.code === originalCode) return 0
    if (option.code === 'en' && englishFirst) return 1
    return 2
  }

  return [...byCode.values()].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.englishName.localeCompare(b.englishName, 'en'),
  )
}

/**
 * Audio and subtitle availability for a title.
 *
 * `spoken_languages` (and its TV twin `languages`) is the audio list. Subtitles
 * come from the actual subtitle files in `translations[].data.subtitles` when
 * TMDB has them; when that is empty — which is most titles — the languages the
 * title's metadata has been localized into are the closest honest proxy.
 */
function parseLanguages(
  raw: RawDetails,
): Pick<
  MediaDetails,
  | 'originalLanguageCode'
  | 'audioLanguages'
  | 'subtitleLanguages'
  | 'subtitleSource'
> {
  const originalCode = (raw.original_language ?? '').trim()
  const audio = toLanguageOptions(
    [...(raw.spoken_languages ?? []), ...(raw.languages ?? [])],
    originalCode,
  )

  // `append_to_response=translations` nests the list one level deeper than the
  // dedicated /translations endpoint does; both are handled.
  const translations = raw.translations?.translations ?? []
  const subtitleFiles: RawLanguage[] = []
  // The whole entry is kept, not just its code: the localized-name fallback still
  // wants the endonym ("Español"), and a bare code would make every language
  // report the English name as its native one too.
  const localized: RawLanguage[] = []
  for (const entry of translations) {
    subtitleFiles.push(...(entry.data?.subtitles ?? []))
    if ((entry.iso_639_1 ?? '').trim()) localized.push(entry)
  }

  // Subtitle files never include the original language — a title does not
  // subtitle itself — but audio always lists it, so the original is added back
  // so a viewer can always confirm what the title is actually in.
  if (originalCode) subtitleFiles.unshift({ iso_639_1: originalCode })

  const hasFiles = subtitleFiles.some((entry) => (entry.iso_639_1 ?? '') !== originalCode)
  const subtitles = toLanguageOptions(
    hasFiles ? subtitleFiles : localized,
    originalCode,
  )

  return {
    originalLanguageCode: originalCode,
    audioLanguages: audio,
    subtitleLanguages: subtitles,
    subtitleSource: hasFiles ? 'files' : subtitles.length > 0 ? 'translations' : 'none',
  }
}

function toMap(people: NonNullable<RawDetails['credits']>['crew']): CrewCredit[] {
  return (people ?? []).map((person) => ({
    id: person.id,
    name: person.name,
    job: person.job ?? '',
    profile: profileUrl(person.profile_path),
  }))
}

function parseDetails(type: MediaType, raw: RawDetails): MediaDetails {
  const crew = toMap(raw.credits?.crew)
  const director = crew.find((person) => person.job === 'Director') ?? null

  const seenWriters = new Set<number>()
  const writers = crew
    .filter((person) => WRITER_JOBS.has(person.job))
    .filter((person) => {
      if (seenWriters.has(person.id)) return false
      seenWriters.add(person.id)
      return true
    })
    .slice(0, MAX_WRITERS)

  const cast = [...(raw.credits?.cast ?? [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .slice(0, MAX_CAST)
    .map((person) => ({
      id: person.id,
      name: person.name,
      character: person.character ?? '',
      profile: profileUrl(person.profile_path),
    }))

  // TV has no single runtime: average the episode lengths, and fall back to the
  // last aired episode because episode_run_time is often empty.
  const episodeTimes = raw.episode_run_time ?? []
  const runtime =
    type === 'tv'
      ? episodeTimes.length > 0
        ? Math.round(
            episodeTimes.reduce((sum, n) => sum + n, 0) / episodeTimes.length,
          )
        : (raw.last_episode_to_air?.runtime ?? 0)
      : (raw.runtime ?? 0)

  return {
    tagline: raw.tagline ?? '',
    status: raw.status ?? 'Unknown',
    originalLanguage: languageName(raw.original_language ?? ''),
    communityScore: Math.round((raw.vote_average ?? 0) * 10),
    voteCount: raw.vote_count ?? 0,
    budget: raw.budget ?? 0,
    revenue: raw.revenue ?? 0,
    runtime: Number.isFinite(runtime) ? runtime : 0,
    homepage: raw.homepage ?? '',
    keywords: (raw.keywords?.results ?? []).map((k) => k.name),
    genres: (raw.genres ?? []).map((g) => g.name),
    director,
    writers,
    cast,
    ...parseLanguages(raw),
  }
}

const detailsCache = new Map<string, MediaDetails>()

/**
 * Full credits, facts and language availability for the detail view.
 * `append_to_response` carries credits, keywords and translations for both movies
 * and TV, so this stays a single request. A failure to attach them is not fatal —
 * TMDB has no translations for plenty of titles, and the detail view must still
 * render the synopsis and cast.
 */
export async function loadMediaDetails(
  media: Pick<Media, 'type' | 'id'>,
  signal: AbortSignal,
): Promise<MediaDetails> {
  const cacheKey = mediaKey(media)
  const cached = detailsCache.get(cacheKey)
  if (cached) return cached

  const res = await fetch(
    tmdbUrl(`/${media.type}/${media.id}`, {
      language: 'en-US',
      append_to_response: 'credits,keywords,translations',
    }),
    { signal },
  )
  if (!res.ok) throw new Error(`TMDB request failed (${res.status})`)
  const raw = (await res.json()) as RawDetails

  const details = parseDetails(media.type, raw)
  detailsCache.set(cacheKey, details)
  return details
}

function mediaKey(media: Pick<Media, 'type' | 'id'>): string {
  return `${media.type}-${media.id}`
}

/* ==========================================================================
   Detail-view extras: videos, recommendations, reviews, image galleries
   ========================================================================== */

export type MediaVideo = {
  key: string
  name: string
  /** TMDB's own label: Trailer, Teaser, Clip, Featurette, Behind the Scenes… */
  kind: string
  official: boolean
}

export type MediaReview = {
  id: string
  author: string
  avatar: string
  /** TMDB returns null when the reviewer did not assign a score. */
  rating: number | null
  content: string
  createdAt: string
}

export type MediaImage = {
  path: string
  width: number
  height: number
  language: string
}

export type MediaGallery = {
  backdrops: MediaImage[]
  posters: MediaImage[]
}

/** YouTube thumbnails are public and need no key; `hqdefault` is the safe pick. */
export function youtubeThumb(key: string): string {
  return `https://img.youtube.com/vi/${key}/hqdefault.jpg`
}

export function youtubeEmbed(key: string): string {
  return `https://www.youtube-nocookie.com/embed/${key}?rel=0`
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`TMDB request failed (${res.status})`)
  return (await res.json()) as T
}

const videosCache = new Map<string, MediaVideo[]>()

/**
 * Official trailers plus teasers and clips, best-first. TMDB marks a lot of
 * entries `official: false`; those are still real clips, so they are kept but
 * sorted below the official ones rather than discarded.
 */
export async function loadMediaVideos(
  media: Pick<Media, 'type' | 'id'>,
  signal: AbortSignal,
): Promise<MediaVideo[]> {
  const cacheKey = mediaKey(media)
  const cached = videosCache.get(cacheKey)
  if (cached) return cached

  const raw = await fetchJson<{
    results?: {
      key: string
      name: string
      site: string
      type: string
      official?: boolean
    }[]
  }>(tmdbUrl(`/${media.type}/${media.id}/videos`, { language: 'en-US' }), signal)

  const kindRank: Record<string, number> = {
    Trailer: 0,
    Teaser: 1,
    Clip: 2,
    Featurette: 3,
    'Behind the Scenes': 4,
  }

  const videos = (raw.results ?? [])
    // Only YouTube entries are embeddable; Vimeo and others have no key we can use.
    .filter((video) => video.site === 'YouTube' && video.key)
    .map((video) => ({
      key: video.key,
      name: video.name || 'Video',
      kind: video.type || 'Video',
      official: video.official === true,
    }))
    .sort(
      (a, b) =>
        Number(b.official) - Number(a.official) ||
        (kindRank[a.kind] ?? 9) - (kindRank[b.kind] ?? 9) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 12)

  videosCache.set(cacheKey, videos)
  return videos
}

const relatedCache = new Map<string, Media[]>()

/**
 * Recommendations first, then similar titles that were not already recommended,
 * de-duplicated by id so the carousel never shows the same film twice.
 */
export async function loadMediaRelated(
  media: Pick<Media, 'type' | 'id'>,
  signal: AbortSignal,
): Promise<Media[]> {
  const cacheKey = mediaKey(media)
  const cached = relatedCache.get(cacheKey)
  if (cached) return cached

  const [names, recommended, similar] = await Promise.all([
    loadGenreNames(),
    fetchJson<{ results?: TmdbResult[] }>(
      tmdbUrl(`/${media.type}/${media.id}/recommendations`, { language: 'en-US' }),
      signal,
    ).catch(() => ({ results: [] })),
    fetchJson<{ results?: TmdbResult[] }>(
      tmdbUrl(`/${media.type}/${media.id}/similar`, { language: 'en-US' }),
      signal,
    ).catch(() => ({ results: [] })),
  ])

  const seen = new Set<number>([media.id])
  const merged: Media[] = []
  for (const raw of [...(recommended.results ?? []), ...(similar.results ?? [])]) {
    if (seen.has(raw.id)) continue
    const mapped = mapResult(raw, names)
    if (!mapped) continue
    seen.add(raw.id)
    merged.push(mapped)
    if (merged.length >= 18) break
  }

  relatedCache.set(cacheKey, merged)
  return merged
}

const reviewsCache = new Map<string, MediaReview[]>()

export async function loadMediaReviews(
  media: Pick<Media, 'type' | 'id'>,
  signal: AbortSignal,
): Promise<MediaReview[]> {
  const cacheKey = mediaKey(media)
  const cached = reviewsCache.get(cacheKey)
  if (cached) return cached

  const raw = await fetchJson<{
    results?: {
      id: string
      author: string
      content: string
      created_at?: string
      author_details?: {
        rating?: number | null
        avatar_path?: string | null
      }
    }[]
  }>(
    tmdbUrl(`/${media.type}/${media.id}/reviews`, {
      language: 'en-US',
      page: '1',
    }),
    signal,
  )

  const reviews = (raw.results ?? [])
    .filter((review) => review.content.trim().length > 0)
    .map((review) => ({
      id: review.id,
      author: review.author || 'Anonymous',
      avatar: profileUrl(review.author_details?.avatar_path),
      rating:
        typeof review.author_details?.rating === 'number'
          ? review.author_details.rating
          : null,
      content: review.content.trim(),
      createdAt: review.created_at ?? '',
    }))

  reviewsCache.set(cacheKey, reviews)
  return reviews
}

const galleryCache = new Map<string, MediaGallery>()

/** TMDB names the image field `file_path`; the UI wants a plain `path`. */
type RawImage = {
  file_path?: string | null
  width?: number
  height?: number
  iso_639_1?: string | null
}

function toImages(raw: RawImage[] | undefined, limit: number): MediaImage[] {
  return (raw ?? [])
    .map((image) => ({
      path: image.file_path ?? '',
      width: image.width ?? 0,
      height: image.height ?? 0,
      language: image.iso_639_1 ?? '',
    }))
    .filter((image) => image.path.length > 0 && image.width > 0)
    .sort((a, b) => b.width - a.width)
    .slice(0, limit)
}

export async function loadMediaGallery(
  media: Pick<Media, 'type' | 'id'>,
  signal: AbortSignal,
): Promise<MediaGallery> {
  const cacheKey = mediaKey(media)
  const cached = galleryCache.get(cacheKey)
  if (cached) return cached

  const raw = await fetchJson<{
    backdrops?: RawImage[]
    posters?: RawImage[]
  }>(tmdbUrl(`/${media.type}/${media.id}/images`, { language: 'en-US' }), signal)

  const gallery: MediaGallery = {
    backdrops: toImages(raw.backdrops, 12),
    posters: toImages(raw.posters, 12),
  }

  galleryCache.set(cacheKey, gallery)
  return gallery
}

/* ==========================================================================
   People: bios and filmographies, opened from a cast or crew credit
   ========================================================================== */

type RawPersonCredit = TmdbResult & {
  character?: string | null
  job?: string | null
  department?: string | null
}

/** A filmography can run to hundreds of entries; keep the notable ones. */
const MAX_CREDITS = 120

export type Person = {
  id: number
  name: string
  biography: string
  birthday: string
  deathday: string
  placeOfBirth: string
  profile: string
  /** TMDB's own label, e.g. "Acting", "Directing". */
  knownForDepartment: string
  alsoKnownAs: string[]
  homepage: string
}

export type PersonCredit = {
  media: Media
  /** "as Character" for acting credits, otherwise the job or department. */
  role: string
  /** The credit's primary department — the one shown on the card. */
  department: string
  /**
   * Every department this person was credited in on this title. A film often
   * credits the same person twice over ("Director, Producer"), and collapsing
   * that to one department would silently drop it from the other tab, so the
   * full set is kept even though the grid shows one card.
   */
  departments: string[]
}

type RawPerson = {
  id?: number
  name?: string
  biography?: string | null
  birthday?: string | null
  deathday?: string | null
  place_of_birth?: string | null
  profile_path?: string | null
  known_for_department?: string | null
  also_known_as?: string[]
  homepage?: string | null
}

const personCache = new Map<number, Person>()
const creditsCache = new Map<number, PersonCredit[]>()

/** The `/person/{id}` profile behind a cast or crew name. */
export async function loadPerson(
  personId: number,
  signal: AbortSignal,
): Promise<Person> {
  const cached = personCache.get(personId)
  if (cached) return cached

  const raw = await fetchJson<RawPerson>(
    tmdbUrl(`/person/${personId}`, { language: 'en-US' }),
    signal,
  )

  const person: Person = {
    id: raw.id ?? personId,
    name: raw.name ?? 'Unknown person',
    biography: raw.biography ?? '',
    birthday: raw.birthday ?? '',
    deathday: raw.deathday ?? '',
    placeOfBirth: raw.place_of_birth ?? '',
    profile: raw.profile_path ? `${TMDB_IMG_W500}${raw.profile_path}` : '',
    knownForDepartment: raw.known_for_department ?? '',
    alsoKnownAs: Array.isArray(raw.also_known_as) ? raw.also_known_as : [],
    homepage: raw.homepage ?? '',
  }

  personCache.set(personId, person)
  return person
}

/**
 * Folds one raw credit into the per-title map, unioning departments when a title
 * credits the same person more than once.
 */
function addCredit(
  byKey: Map<string, PersonCredit>,
  entry: RawPersonCredit,
  names: Map<number, string>,
  fallbackDepartment: string,
): void {
  const media = mapResult(entry, names)
  if (!media) return
  const department = entry.department ?? fallbackDepartment
  const character = entry.character ?? ''
  const job = entry.job ?? ''
  const key = mediaKey(media)
  const existing = byKey.get(key)

  if (existing) {
    if (department && !existing.departments.includes(department)) {
      existing.departments.push(department)
    }
    // A named character beats a bare job title, whichever order they arrived in.
    if (!existing.role.startsWith('as ') && character) {
      existing.role = `as ${character}`
    }
    return
  }

  byKey.set(key, {
    media,
    role: character ? `as ${character}` : job ? job : department,
    department,
    departments: department ? [department] : [],
  })
}

/**
 * Everything they are credited on, acting and crew combined. TMDB returns the
 * two lists separately, so they are merged and de-duplicated into one card per
 * title — but a person credited twice on the same film (directed *and* produced
 * it) has their departments unioned rather than one being dropped, so department
 * filtering still finds the title under each of them.
 */
export async function loadPersonCredits(
  personId: number,
  signal: AbortSignal,
): Promise<PersonCredit[]> {
  const cached = creditsCache.get(personId)
  if (cached) return cached

  const raw = await fetchJson<{
    cast?: RawPersonCredit[]
    crew?: RawPersonCredit[]
  }>(
    tmdbUrl(`/person/${personId}/combined_credits`, { language: 'en-US' }),
    signal,
  )

  const names = await loadGenreNames()
  const byKey = new Map<string, PersonCredit>()

  // Cast is walked first, so an acting credit becomes the card's headline role.
  // A later crew entry for the same title contributes its department but not its
  // job title, which would read as noise beside "as Ellen Ripley".
  //
  // `combined_credits` omits `department` from every cast entry, so acting has to
  // be inferred from which list the entry came from. Trusting the field alone
  // leaves every acting credit with no department, which drops it from the Acting
  // tab entirely — the one tab an actor's page exists for.
  for (const entry of raw.cast ?? []) {
    addCredit(byKey, entry, names, 'Acting')
  }
  for (const entry of raw.crew ?? []) {
    addCredit(byKey, entry, names, entry.department ?? '')
  }

  const credits = [...byKey.values()]

  // Most-notable-first, then keep a generous but finite slice so a very long
  // career (producers, composers) cannot blow up the grid.
  credits.sort(
    (a, b) => (b.media.popularity ?? 0) - (a.media.popularity ?? 0),
  )
  const trimmed = credits.slice(0, MAX_CREDITS)

  creditsCache.set(personId, trimmed)
  return trimmed
}

const genreNames = new Map<number, string>()

let genreNamesRequest: Promise<Map<number, string>> | null = null

/** Cached for the session: the genre list never changes under us. */
export function loadGenreNames(): Promise<Map<number, string>> {
  if (!genreNamesRequest) {
    genreNamesRequest = (async () => {
      const [movieRes, tvRes] = await Promise.all([
        fetch(tmdbUrl('/genre/movie/list', { language: 'en-US' })),
        fetch(tmdbUrl('/genre/tv/list', { language: 'en-US' })),
      ])
      if (!movieRes.ok || !tvRes.ok) throw new Error('TMDB request failed')
      const [movieData, tvData] = await Promise.all([
        movieRes.json() as Promise<{ genres: { id: number; name: string }[] }>,
        tvRes.json() as Promise<{ genres: { id: number; name: string }[] }>,
      ])
      for (const genre of [...movieData.genres, ...tvData.genres]) {
        genreNames.set(genre.id, genre.name)
      }
      return genreNames
    })().catch((err: unknown) => {
      genreNamesRequest = null
      throw err
    })
  }
  return genreNamesRequest
}
