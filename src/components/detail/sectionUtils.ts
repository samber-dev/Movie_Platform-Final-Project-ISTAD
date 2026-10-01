import type { SectionState } from '../../lib/useAsyncSection'

/** Mirrors the hero badge colours so scores read the same everywhere. */
export function scoreColor(rating: number): string {
  if (rating >= 70) return 'bg-score-high'
  if (rating >= 50) return 'bg-score-mid'
  return 'bg-score-low'
}

type Flags = {
  showSkeleton: boolean
  showError: boolean
  showEmpty: boolean
}

/**
 * A section shows its skeleton only before the first successful load, keeps the
 * stale data visible while refreshing, and only reports "empty" once it knows
 * the request succeeded.
 */
export function useSectionMessage<T>(state: SectionState<T>): Flags {
  return {
    showSkeleton: state.loading && state.data === null,
    showError: state.error !== null && state.data === null,
    showEmpty: !state.loading && state.error === null && state.data !== null,
  }
}
