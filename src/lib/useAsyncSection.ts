'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type SectionState<T> = {
  data: T | null
  error: string | null
  loading: boolean
  reload: () => void
}

type Internal<T> = {
  /** Identifies the request the state belongs to; see `key` below. */
  key: string
  data: T | null
  error: string | null
  loading: boolean
}

/**
 * One request per section, cancelled when the deps change or the view unmounts.
 * A failure is kept separate from the data so a section can offer its own retry
 * instead of blanking out.
 */
export function useAsyncSection<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): SectionState<T> {
  const [attempt, setAttempt] = useState(0)
  // Serialising the deps gives the effect a single primitive to depend on, and
  // doubles as the identity of the request the state belongs to.
  const key = `${JSON.stringify(deps)}::${attempt}`

  // The loader is a fresh closure on every render. Keeping it in a ref means the
  // request effect does not need it as a dependency; this sync effect is
  // declared first so it has run before the request effect fires.
  const loaderRef = useRef(loader)
  useEffect(() => {
    loaderRef.current = loader
  })

  const [state, setState] = useState<Internal<T>>({
    key,
    data: null,
    error: null,
    loading: true,
  })

  // A new key means a new request, so drop the previous result. Adjusting state
  // during render is React's documented alternative to resetting it from an
  // effect, and it happens before anything is painted.
  if (state.key !== key) {
    setState({ key, data: null, error: null, loading: true })
  }

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    loaderRef.current(controller.signal).then(
      (data) => {
        if (!active) return
        setState({ key, data, error: null, loading: false })
      },
      (err: unknown) => {
        if (!active || controller.signal.aborted) return
        setState({
          key,
          data: null,
          error:
            err instanceof Error
              ? err.message
              : 'Something went wrong loading this section.',
          loading: false,
        })
      },
    )

    return () => {
      active = false
      controller.abort()
    }
  }, [key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  return {
    data: state.data,
    error: state.error,
    loading: state.loading,
    reload,
  }
}
