'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'soogood_kh_theme'
const LIGHT_CLASS = 'light'
/** The page background per theme, mirrored from `html.light` in globals.css. */
const THEME_COLORS: Record<Theme, string> = {
  dark: '#05060b',
  light: '#f4f1ea',
}

function readStoredTheme(): Theme {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    // Private mode / storage disabled: fall back to the dark default.
    return 'dark'
  }
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle(LIGHT_CLASS, theme === 'light')
  root.style.colorScheme = theme
  // Paint the mobile browser chrome to match. A media-scoped <meta> would track
  // the OS instead, which leaves the URL bar the wrong colour for anyone who has
  // overridden the system setting in here.
  document
    .getElementById('theme-color')
    ?.setAttribute('content', THEME_COLORS[theme])
  // Cross-fade colours, then drop the class so hover transitions stay snappy.
  // The class must outlive the 300ms transition: removing it early does not
  // cancel the in-flight transition, but it does leave the page visibly
  // settling for longer than intended, so keep a comfortable margin.
  root.classList.add('theme-anim')
  window.setTimeout(() => root.classList.remove('theme-anim'), 400)
}

/* ==========================================================================
   Persisted store

   The chosen theme is one browser-wide value, so it is exposed as a React
   external store rather than copied into component state. `useSyncExternalStore`
   is also what makes it hydration-safe: React renders `getServerSnapshot` into
   the prerendered HTML and adopts the real snapshot on the first client render,
   so the toggle's icon and aria-label can never disagree with the markup the
   server sent.
   ========================================================================== */

const listeners = new Set<() => void>()

/**
 * Cached because `getSnapshot` runs on every render and every store consistency
 * check. It has to return a stable value until something actually changes, or
 * React treats the store as perpetually out of date.
 */
let snapshot: Theme | null = null

function getSnapshot(): Theme {
  if (snapshot === null) snapshot = readStoredTheme()
  return snapshot
}

/** The server has no localStorage, so it always renders the dark default. */
function getServerSnapshot(): Theme {
  return 'dark'
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  // Another tab toggling the theme should repaint this one too.
  function onStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY && event.key !== null) return
    snapshot = null
    listener()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

function writeTheme(theme: Theme): void {
  snapshot = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Non-fatal: the toggle still works for this session.
  }
  for (const listener of listeners) listener()
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // Painting <html> is a side effect on an external system, which is exactly what
  // an effect is for. The bootstrap script in src/app/layout.tsx has already
  // done this before first paint; re-running it here is idempotent.
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const setTheme = useCallback((next: Theme) => {
    writeTheme(next)
  }, [])

  const toggleTheme = useCallback(() => {
    writeTheme(getSnapshot() === 'dark' ? 'light' : 'dark')
  }, [])

  return { theme, setTheme, toggleTheme }
}
