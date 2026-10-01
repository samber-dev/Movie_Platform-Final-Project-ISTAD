'use client'

import { useEffect, useState } from 'react'
import { getResults, loadGenreNames, searchUrl, toMedia } from './tmdb'
import type { Media } from '../types'

const TYPEAHEAD_DEBOUNCE_MS = 250
export const MIN_LIVE_SEARCH_TERM = 2
const MAX_SUGGESTIONS = 8

type LiveState = {
  term: string
  items: Media[]
  loading: boolean
  failed: boolean
}

const IDLE: LiveState = { term: '', items: [], loading: false, failed: false }

export type LiveSearch = {
  results: Media[]
  /** True while the debounce or the request is in flight for the current term. */
  pending: boolean
  failed: boolean
}

/**
 * Typeahead for the navbar search. Debounced, and every superseded request is
 * aborted, so a slow response for an old keystroke can never overwrite a newer
 * one. Results are tagged with the term that produced them and anything stale
 * is dropped during render.
 */
export function useLiveSearch(query: string): LiveSearch {
  const [state, setState] = useState<LiveState>(IDLE)
  const term = query.trim()

  useEffect(() => {
    if (term.length < MIN_LIVE_SEARCH_TERM) return

    const controller = new AbortController()
    let cancelled = false

    const timer = setTimeout(async () => {
      setState({ term, items: [], loading: true, failed: false })
      try {
        const names = await loadGenreNames()
        const raw = await getResults(searchUrl(term), controller.signal)
        if (cancelled) return
        setState({
          term,
          items: toMedia(raw.results, names).slice(0, MAX_SUGGESTIONS),
          loading: false,
          failed: false,
        })
      } catch {
        if (cancelled || controller.signal.aborted) return
        setState({ term, items: [], loading: false, failed: true })
      }
    }, TYPEAHEAD_DEBOUNCE_MS)

    return () => {
      cancelled = true
      controller.abort()
      clearTimeout(timer)
    }
  }, [term])

  // Anything fetched for an older term is stale by definition.
  const live = state.term === term ? state : IDLE
  const shortTerm = term.length < MIN_LIVE_SEARCH_TERM
  return {
    results: shortTerm ? [] : live.items,
    pending: !shortTerm && (live.loading || live.term !== term),
    failed: !shortTerm && live.failed,
  }
}
