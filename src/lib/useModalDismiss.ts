'use client'

import { useEffect } from 'react'

/**
 * Which overlays are open, innermost last. Escape only closes the top one, so
 * stacking a person page over a title page (or a trailer over either) unwinds
 * one layer at a time instead of tearing the whole stack down at once.
 *
 * Entries are removed by identity rather than popped, because React can unmount
 * a layer that is not on top — the detail view closing underneath an open
 * person page, for instance.
 */
const openModals: symbol[] = []

/**
 * Closes the overlay on Escape and locks body scroll while it is open.
 * Shared by every modal so the behaviour stays consistent.
 *
 * `enabled` is for the one overlay that is only sometimes open — the mobile
 * navigation drawer. Passing `false` makes this a no-op, so the caller does not
 * have to reach for a second hand-rolled copy of the same two effects, and the
 * scroll lock is guaranteed to follow the menu's actual state.
 */
export function useModalDismiss(onClose: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return
    const token = Symbol('modal')
    openModals.push(token)

    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      // Only the innermost overlay reacts, so the ones beneath it stay put.
      if (openModals[openModals.length - 1] !== token) return
      event.stopPropagation()
      onClose()
    }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      const index = openModals.lastIndexOf(token)
      if (index !== -1) openModals.splice(index, 1)
      // Restoring the value this layer captured, not the current one: an inner
      // layer that saw "hidden" must hand back "hidden" to the layer under it.
      document.body.style.overflow = previousOverflow
    }
  }, [onClose, enabled])
}
