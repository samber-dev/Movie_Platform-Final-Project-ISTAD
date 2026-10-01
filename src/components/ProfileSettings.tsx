'use client'

import { useCallback, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { useModalDismiss } from '../lib/useModalDismiss'
import {
  MAX_DISPLAY_NAME_LENGTH,
  MIN_DISPLAY_NAME_LENGTH,
  fileToAvatarDataUrl,
  isValidEmail,
  normalizeDisplayName,
  normalizeEmail,
  saveProfile,
} from '../lib/authStore'
import type { ProfilePatch } from '../lib/authStore'
import type { Account } from '../types'
import { recordActivity } from '../lib/activityStore'

/**
 * The account settings dialog: display name, email address and avatar.
 *
 * Every field writes through the auth store, so a change is persisted in the same
 * commit as the state change that renders it — there is no save-on-blur effect
 * that could lose an edit to a closed tab.
 *
 * Email is the account's identity, so it is the one field with real
 * consequences: it is the session key and the login handle. The dialog therefore
 * refuses a duplicate address, refuses the reserved admin address, and warns that
 * the password stays the same, because that is true and non-obvious.
 */

/** Shown while an upload is being downscaled, which is fast but not instant. */
const UPLOADING = 'Reading image…'

type Props = {
  /** Every account, so a duplicate address can be detected. */
  users: Account[]
  /** The signed-in account being edited. */
  account: Account
  onClose: () => void
}

export function ProfileSettings({ users, account, onClose }: Props) {
  const [displayName, setDisplayName] = useState(() => account.displayName ?? '')
  const [email, setEmail] = useState(account.email)
  /**
   * `undefined` means "leave whatever is stored alone", which is what makes
   * "Remove photo" and "leave it as it is" different actions: the first clears
   * it, the second never touches the field.
   */
  const [avatar, setAvatar] = useState<string | undefined>(undefined)
  const [pendingAvatar, setPendingAvatar] = useState<string | undefined>(undefined)
  const [notice, setNotice] = useState<string | null>(null)
  const [errors, setErrors] = useState<{ name?: string; email?: string; avatar?: string }>({})
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useModalDismiss(onClose)

  /** The avatar on screen: the pending upload, else what is stored. */
  const preview = pendingAvatar ?? account.avatar ?? ''

  const trimmedName = displayName.trim()
  const trimmedEmail = email.trim()

  const handleFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Cleared so picking the same file twice fires `change` again.
    event.target.value = ''
    if (!file) return

    setBusy(true)
    setNotice(UPLOADING)
    setErrors((current) => ({ ...current, avatar: undefined }))
    const dataUrl = await fileToAvatarDataUrl(file)
    setBusy(false)
    setNotice(null)

    if (dataUrl === null) {
      setErrors((current) => ({
        ...current,
        avatar: 'That image could not be used. Pick a JPEG or PNG under 8 MB.',
      }))
      return
    }
    // Both states, not just the preview one: `pendingAvatar` only drives what is
    // on screen, while `handleSubmit` reads `avatar` to build the patch. Setting
    // only the preview showed a picture that was then silently discarded on save.
    setPendingAvatar(dataUrl)
    setAvatar(dataUrl)
  }, [])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next: typeof errors = {}

    if (trimmedName !== '' && trimmedName.length < MIN_DISPLAY_NAME_LENGTH) {
      next.name = `Use at least ${MIN_DISPLAY_NAME_LENGTH} characters, or leave it empty.`
    }

    if (trimmedEmail !== account.email) {
      if (!isValidEmail(trimmedEmail)) {
        next.email = 'Enter a valid email address.'
      } else if (normalizeEmail(trimmedEmail) === account.email) {
        // Case-only change. Not an error: emails are stored lowercase and the
        // user has typed the same address in a different case.
      } else if (normalizeEmail(trimmedEmail) === 'admin@angkorcinemas.kh') {
        next.email = 'That address is reserved for the platform admin.'
      } else if (users.some((user) => user.email === normalizeEmail(trimmedEmail))) {
        next.email = 'Another account already uses that address.'
      }
    }

    if (Object.keys(next).length > 0) {
      setErrors(next)
      setNotice(null)
      return
    }

    const patch: ProfilePatch = {}
    const name = normalizeDisplayName(trimmedName)
    if (name !== null && name !== account.displayName) patch.displayName = name
    const address = normalizeEmail(trimmedEmail)
    if (address !== account.email) patch.email = address
    if (avatar !== undefined) patch.avatar = avatar

    if (Object.keys(patch).length === 0) {
      setNotice('Nothing to save.')
      return
    }

    // One line describing what actually changed, so the log reads as an event
    // rather than a diff of three fields.
    const changes: string[] = []
    if (patch.displayName !== undefined) changes.push(`name set to “${patch.displayName}”`)
    if (patch.email !== undefined) changes.push(`email changed to ${patch.email}`)
    if (patch.avatar !== undefined) {
      changes.push(patch.avatar === '' ? 'avatar removed' : 'avatar updated')
    }
    recordActivity('profile.updated', `Updated profile: ${changes.join(', ')}`, account.email)

    // The store re-validates, so a patch the dialog approved can still fail here
    // if another tab changed something in between. Surfacing that beats closing
    // on a save that did not happen.
    const result = saveProfile(account.email, patch)
    if (!result.ok) {
      setErrors({ email: result.error })
      return
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-page/90 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Profile settings"
    >
      <form
        onSubmit={handleSubmit}
        noValidate
        onClick={(event) => event.stopPropagation()}
        className="neon-panel flex max-h-[90dvh] w-full max-w-md flex-col overflow-y-auto rounded-2xl"
      >
        {/* ---- Header ---- */}
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <span className="inline-flex rounded-full bg-accent/15 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
              Your account
            </span>
            <h2 className="mt-1.5 text-lg font-extrabold text-ink">
              Profile settings
              <span className="ml-2 text-sm font-medium text-ink-muted">
                stored on this device
              </span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile settings"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-lg text-ink-soft transition hover:bg-surface-3 hover:text-ink"
          >
            ✕
          </button>
        </div>

        {/* ---- Body ---- */}
        <div className="space-y-5 px-5 py-5 sm:px-6">
          {/* ---- Avatar ---- */}
          <div className="flex flex-wrap items-center gap-4">
            <span className="shrink-0">
              {preview ? (
                <img
                  src={preview}
                  alt=""
                  className="h-20 w-20 rounded-full object-cover ring-2 ring-accent/50"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-accent/15 text-2xl font-extrabold uppercase text-accent ring-1 ring-accent/40"
                >
                  {(trimmedName || trimmedEmail).charAt(0)}
                </span>
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink">Profile picture</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                A square crop, downscaled to 256px and stored in this browser. The
                image is never uploaded anywhere.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-bold text-ink ring-1 ring-line transition hover:bg-accent hover:text-page disabled:cursor-wait disabled:opacity-60"
                >
                  {busy ? UPLOADING : preview ? 'Replace' : 'Upload'}
                </button>
                {account.avatar && (
                  <button
                    type="button"
                    onClick={() => {
                      setPendingAvatar('')
                      setAvatar('')
                    }}
                    disabled={busy}
                    className="rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-bold text-ink-soft ring-1 ring-line transition hover:bg-surface-3 hover:text-ink disabled:opacity-60"
                  >
                    Remove
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFile}
                  className="sr-only"
                  aria-label="Upload a profile picture"
                />
              </div>
              {errors.avatar && (
                <p className="mt-2 text-xs font-semibold text-score-low" role="alert">
                  {errors.avatar}
                </p>
              )}
            </div>
          </div>

          {/* ---- Display name ---- */}
          <label className="block">
            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted">
              Display name
            </span>
            <input
              type="text"
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value)
                if (errors.name) setErrors((c) => ({ ...c, name: undefined }))
              }}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              placeholder={account.email.split('@')[0]}
              aria-invalid={errors.name !== undefined}
              aria-describedby={errors.name ? 'profile-name-error' : undefined}
              className="neon-input mt-2 w-full px-3 py-2.5 text-sm text-ink"
            />
            <span id="profile-name-error" role={errors.name ? 'alert' : undefined}>
              {errors.name && (
                <span className="mt-1.5 block text-xs font-semibold text-score-low">
                  {errors.name}
                </span>
              )}
            </span>
          </label>

          {/* ---- Email ---- */}
          <label className="block">
            <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-ink-muted">
              Email address
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                if (errors.email) setErrors((c) => ({ ...c, email: undefined }))
              }}
              aria-invalid={errors.email !== undefined}
              aria-describedby={errors.email ? 'profile-email-error' : undefined}
              className="neon-input mt-2 w-full px-3 py-2.5 text-sm text-ink"
            />
            <span id="profile-email-error" role={errors.email ? 'alert' : undefined}>
              {errors.email ? (
                <span className="mt-1.5 block text-xs font-semibold text-score-low">
                  {errors.email}
                </span>
              ) : (
                trimmedEmail !== account.email && (
                  <span className="mt-1.5 block text-xs text-ink-muted">
                    Your password does not change. You sign in with the new
                    address.
                  </span>
                )
              )}
            </span>
          </label>
        </div>

        {/* ---- Footer ---- */}
        <div className="flex flex-wrap items-center gap-3 border-t border-line px-5 py-4 sm:px-6">
          <button type="submit" className="btn-neon px-5 py-2.5 text-sm">
            Save changes
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-surface-2 px-4 py-2.5 text-sm font-bold text-ink ring-1 ring-line transition hover:bg-surface-3"
          >
            Cancel
          </button>
          <span aria-live="polite" className="min-w-0 flex-1 text-right text-xs">
            {notice && notice !== UPLOADING && (
              <span className="font-semibold text-accent-2">{notice}</span>
            )}
          </span>
        </div>
      </form>
    </div>
  )
}
