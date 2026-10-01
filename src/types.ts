export type MediaType = 'movie' | 'tv'

export type Media = {
  id: number
  type: MediaType
  title: string
  rating: number
  releaseDate: string
  overview: string
  poster: string
  backdrop: string
  genres: string[]
  genreIds: number[]
  /** TMDB popularity, rounded. Drives the "Popularity" sort option. */
  popularity?: number
  /**
   * An admin-authored title with no TMDB record behind it. Its `id` is negative
   * (TMDB ids are always positive), and the TMDB-backed sections of the detail
   * page skip these rather than requesting an id that cannot exist.
   */
  isCustom?: boolean
}

export type Account = {
  id: string
  email: string
  passwordHash: string
  salt: string
  createdAt: string
  isAdmin: boolean
  watchlist: Media[]
}

export type AuthMode = 'login' | 'register'
