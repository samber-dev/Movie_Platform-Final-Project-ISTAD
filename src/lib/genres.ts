import type { Media } from '../types'

export type GenreChip = {
  name: string
  id: number
  tvId: number | null
}

/**
 * TMDB uses different genre IDs for movies and TV (movie "Sci-Fi" is 878 while
 * TV "Sci-Fi & Fantasy" is 10765), so each chip carries both IDs. `tvId` is null
 * for movie-only genres — TMDB accepts them on /discover/tv but silently returns
 * zero results, so those chips are hidden on the TV tab instead.
 */
export const GENRE_CHIPS: GenreChip[] = [
  { name: 'Action', id: 28, tvId: 10759 },
  { name: 'Sci-Fi', id: 878, tvId: 10765 },
  { name: 'Fantasy', id: 14, tvId: 10765 },
  { name: 'Horror', id: 27, tvId: null },
  { name: 'Comedy', id: 35, tvId: 35 },
  { name: 'Drama', id: 18, tvId: 18 },
  { name: 'Thriller', id: 53, tvId: null },
  { name: 'Animation', id: 16, tvId: 16 },
  { name: 'Romance', id: 10749, tvId: 10749 },
  { name: 'Mystery', id: 9648, tvId: 9648 },
  { name: 'Crime', id: 80, tvId: 80 },
  { name: 'Documentary', id: 99, tvId: 99 },
]

/**
 * The admin form offers these as suggestions, so an admin-authored genre
 * matches a chip's name exactly rather than needing a fuzzy match.
 */
export const GENRE_NAMES: string[] = GENRE_CHIPS.map((chip) => chip.name)

export function hasGenre(item: Media, chip: GenreChip): boolean {
  return (
    item.genreIds.includes(chip.id) ||
    (chip.tvId !== null && item.genreIds.includes(chip.tvId)) ||
    // Admin-authored titles carry no TMDB genre ids — `genres` is all they have,
    // populated from the free-text genre the admin typed. Matching the name is
    // what lets a custom title answer the genre chips at all.
    item.genres.includes(chip.name)
  )
}
