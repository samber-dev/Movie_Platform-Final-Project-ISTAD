'use client'

import { useSyncExternalStore } from 'react'
import type { Account, Media } from '../types'

// NOTE: the three storage keys below intentionally keep their original
// `soogood_kh_` prefix. They hold real user data (accounts, password hashes,
// sessions, watchlists), so renaming them would silently sign everyone out and
// drop saved watchlists. Only the human-facing brand strings were rebranded.
const USERS_KEY = 'soogood_kh_users'
const SESSION_KEY = 'soogood_kh_session'
/** Pre-auth watchlist from the earlier guest-only build, migrated on first login. */
const GUEST_WATCHLIST_KEY = 'soogood_kh_watchlist_v2'

export const ADMIN_EMAIL = 'admin@angkorcinemas.kh'
/** Admin emails from previous brand names, purged on load to avoid duplicates. */
const LEGACY_ADMIN_EMAILS = ['admin@soogood.kh']
export const MIN_PASSWORD_LENGTH = 6

const ADMIN_SALT = 'angkorcinemas_admin_v1'
/** SHA-256 of `${ADMIN_SALT}:admin123`, precomputed so seeding stays sync. */
const ADMIN_HASH = 'f973bb0db86de485639f8789ddc76e478c6a761a852090ea5d3b4325e0aed094'
const ADMIN_CREATED_AT = '2026-01-05T09:00:00.000Z'
const ADMIN_ID = 'usr_admin_angkorcinemas'

export type AuthResult =
  | { ok: true; account: Account; users: Account[] }
  | { ok: false; error: string }

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function getSubtle(): SubtleCrypto | undefined {
  return typeof globalThis.crypto === 'undefined'
    ? undefined
    : globalThis.crypto.subtle
}

/** True when real SHA-256 is available (https or localhost). */
export function hasStrongCrypto(): boolean {
  return getSubtle() !== undefined
}

async function sha256Hex(input: string): Promise<string | null> {
  const subtle = getSubtle()
  if (!subtle) return null
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(input))
  return toHex(digest)
}

/**
 * Demo-only stand-in used when the page runs in an insecure context (plain http
 * on a LAN address), where crypto.subtle is unavailable. This is NOT real
 * password security — it only exists so the sign-up flow still works locally.
 */
function weakHex(input: string): string {
  let out = ''
  for (let round = 0; round < 4; round += 1) {
    let h = (0x811c9dc5 ^ Math.imul(round + 1, 0x9e3779b9)) >>> 0
    for (let i = 0; i < input.length; i += 1) {
      h ^= input.charCodeAt(i) + round
      h = Math.imul(h, 0x01000193) >>> 0
    }
    out += h.toString(16).padStart(8, '0')
  }
  return out
}

function digestOf(input: string): Promise<string> {
  return sha256Hex(input).then((hash) => hash ?? weakHex(input))
}

function makeSalt(): string {
  const bytes = new Uint8Array(16)
  const webcrypto = globalThis.crypto
  if (typeof webcrypto?.getRandomValues === 'function') {
    webcrypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  return toHex(bytes.buffer)
}

function makeId(): string {
  const webcrypto = globalThis.crypto
  if (typeof webcrypto?.randomUUID === 'function') return webcrypto.randomUUID()
  return `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
}

function isMedia(value: unknown): value is Media {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Media>
  return (
    typeof candidate.id === 'number' &&
    (candidate.type === 'movie' || candidate.type === 'tv') &&
    typeof candidate.title === 'string'
  )
}

function normalizeMedia(media: Media): Media {
  return {
    ...media,
    rating: media.rating ?? 0,
    releaseDate: media.releaseDate ?? '',
    overview: media.overview ?? '',
    poster: media.poster ?? '',
    backdrop: media.backdrop ?? '',
    genres: Array.isArray(media.genres) ? media.genres : [],
    genreIds: Array.isArray(media.genreIds) ? media.genreIds : [],
  }
}

function isAccount(value: unknown): value is Account {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<Account>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.email === 'string' &&
    typeof candidate.passwordHash === 'string' &&
    typeof candidate.salt === 'string' &&
    typeof candidate.createdAt === 'string'
  )
}

/**
 * Cap on an avatar's stored size.
 *
 * An uploaded photo straight off a phone camera is 3-5 MB, and localStorage caps
 * the whole origin at roughly 5 MB alongside accounts, watchlists, reviews and the
 * activity log. Storing one raw would blow the quota and take every other feature
 * down with it, so images are downscaled to 256px square before they are ever
 * written. That is well above the 36px the navbar renders, and leaves room for a
 * future profile page without another migration.
 */
export const MAX_AVATAR_BYTES = 48 * 1024

/** Downscaled square edge, in CSS pixels. */
const AVATAR_EDGE = 256

export const MIN_DISPLAY_NAME_LENGTH = 2
export const MAX_DISPLAY_NAME_LENGTH = 40

/**
 * Trims a display name and rejects the values that would render as an empty
 * greeting. Returns null when the name is unusable, so callers can fall back to
 * the email rather than rendering a blank avatar.
 */
export function normalizeDisplayName(value: string | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (trimmed.length < MIN_DISPLAY_NAME_LENGTH) return null
  return trimmed.slice(0, MAX_DISPLAY_NAME_LENGTH)
}

/**
 * Reads an uploaded image file into a square data URL, downscaled and re-encoded
 * as JPEG.
 *
 * This runs entirely in the browser — `FileReader` plus a canvas — so the photo
 * never leaves the device. Downscaling is what makes the upload safe to persist:
 * see `MAX_AVATAR_BYTES`.
 *
 * Returns null when the file is not a decodable image or comes out over the cap.
 * A GIF or an animated WebP is re-encoded to a still JPEG, which is deliberate:
 * the avatar is a 36px circle and a still frame is both smaller and truer to what
 * the navbar shows anyway.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null

  const bitmap = await createImageBitmap(file).catch(() => null)
  if (bitmap === null) return null

  try {
    const edge = Math.min(AVATAR_EDGE, Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = edge
    canvas.height = edge
    const context = canvas.getContext('2d')
    if (context === null) return null

    // Centre-crop to a square before scaling, so an avatar is never stretched.
    const side = Math.min(bitmap.width, bitmap.height)
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      edge,
      edge,
    )

    const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
    // The length is a proxy for bytes: a base64 data URL is ~4/3 the size of the
    // JPEG it wraps, and comparing strings avoids decoding a megabyte to learn
    // its length.
    if (dataUrl.length > MAX_AVATAR_BYTES * 1.4) return null
    return dataUrl
  } finally {
    bitmap.close()
  }
}

/** Only JPEG data URLs this module produced are accepted back out of storage. */
function normalizeAvatar(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (!value.startsWith('data:image/jpeg;base64,')) return undefined
  if (value.length > MAX_AVATAR_BYTES * 1.4) return undefined
  return value
}

function adminAccount(): Account {
  return {
    id: ADMIN_ID,
    email: ADMIN_EMAIL,
    passwordHash: ADMIN_HASH,
    salt: ADMIN_SALT,
    createdAt: ADMIN_CREATED_AT,
    isAdmin: true,
    watchlist: [],
  }
}

export function loadUsers(): Account[] {
  let parsed: unknown = null
  try {
    const raw = localStorage.getItem(USERS_KEY)
    if (raw) parsed = JSON.parse(raw)
  } catch {
    parsed = null
  }
  const stored = Array.isArray(parsed) ? parsed.filter(isAccount) : []
  // Drop the admin seeded under the previous brand so the rename does not
  // leave a stale duplicate behind (normalizeUsers re-seeds the current one).
  const users = stored
    .filter((user) => !LEGACY_ADMIN_EMAILS.includes(normalizeEmail(user.email)))
    .map((user) => {
      const displayName = normalizeDisplayName(user.displayName)
      const avatar = normalizeAvatar(user.avatar)
      return {
        ...user,
        email: normalizeEmail(user.email),
        isAdmin: user.email === ADMIN_EMAIL,
        watchlist: Array.isArray(user.watchlist)
          ? user.watchlist.filter(isMedia).map(normalizeMedia)
          : [],
        // Spread onto undefined rather than kept as null: the optional fields are
        // omitted entirely when unset, which is how they were written.
        ...(displayName === null ? {} : { displayName }),
        ...(avatar === undefined ? {} : { avatar }),
      }
    })
  if (!users.some((user) => user.email === ADMIN_EMAIL)) {
    users.unshift(adminAccount())
  }
  return users
}

export function saveUsers(users: Account[]): void {
  try {
    localStorage.setItem(USERS_KEY, JSON.stringify(users))
  } catch {
    // Storage full or blocked: the session still works for this tab.
  }
}

export function loadSession(): string | null {
  try {
    return localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

export function saveSession(email: string | null): void {
  try {
    if (email === null) localStorage.removeItem(SESSION_KEY)
    else localStorage.setItem(SESSION_KEY, email)
  } catch {
    // Ignore: the in-memory session still works for this tab.
  }
}

export function loadGuestWatchlist(): Media[] {
  try {
    const raw = localStorage.getItem(GUEST_WATCHLIST_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isMedia).map(normalizeMedia) : []
  } catch {
    return []
  }
}

export function clearGuestWatchlist(): void {
  try {
    localStorage.removeItem(GUEST_WATCHLIST_KEY)
  } catch {
    // Ignore.
  }
}

/**
 * Persist the signed-out watchlist. Saving no longer requires an account, so
 * this is the storage path used until the visitor signs in -- at which point
 * `handleAuthenticated` folds these titles into the account and clears them.
 */
export function saveGuestWatchlist(items: Media[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(GUEST_WATCHLIST_KEY)
    else localStorage.setItem(GUEST_WATCHLIST_KEY, JSON.stringify(items))
  } catch {
    // Quota or private mode: the in-memory list still works for this session.
  }
}

export async function registerUser(
  users: Account[],
  emailRaw: string,
  password: string,
): Promise<AuthResult> {
  const email = normalizeEmail(emailRaw)
  if (!isValidEmail(email)) {
    return { ok: false, error: 'Enter a valid email address.' }
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    }
  }
  if (email === ADMIN_EMAIL) {
    return { ok: false, error: 'That email is reserved for the platform admin.' }
  }
  if (users.some((user) => user.email === email)) {
    return { ok: false, error: 'An account with that email already exists.' }
  }

  const salt = makeSalt()
  const account: Account = {
    id: makeId(),
    email,
    salt,
    passwordHash: await digestOf(`${salt}:${password}`),
    createdAt: new Date().toISOString(),
    isAdmin: false,
    watchlist: [],
  }
  return { ok: true, account, users: [...users, account] }
}

export async function authenticate(
  users: Account[],
  emailRaw: string,
  password: string,
): Promise<AuthResult> {
  const email = normalizeEmail(emailRaw)
  const account = users.find((user) => user.email === email)
  if (!account) return { ok: false, error: 'No account found for that email.' }

  // Accept either digest so accounts keep verifying if the page later runs in a
  // context with or without crypto.subtle.
  const target = `${account.salt}:${password}`
  const strong = await sha256Hex(target)
  const matches =
    (strong !== null && strong === account.passwordHash) ||
    weakHex(target) === account.passwordHash
  if (!matches) return { ok: false, error: 'Incorrect password.' }
  return { ok: true, account, users }
}

/* ==========================================================================
   Persisted store

   Accounts, the signed-in session and the guest watchlist are one browser-wide
   document, so they are exposed together as a React external store rather than
   mirrored into three separate copies of `useState`. Writing through
   `setPersistedAuth` also replaces the old save-on-change effect: persistence
   happens in the same commit as the state change, so the two can never drift.

   `useSyncExternalStore` is what makes this hydration-safe. React renders
   `getServerSnapshot` — which has no localStorage to read — into the
   prerendered HTML, then adopts the real snapshot on the first client render.
   The navbar therefore cannot render a different account chip than the one the
   server sent, which is exactly what a `useState(loadUsers)` initialiser would
   have done on every signed-in visit.
   ========================================================================== */

export type PersistedAuth = {
  users: Account[]
  sessionEmail: string | null
  guestWatchlist: Media[]
}

const EMPTY: PersistedAuth = { users: [], sessionEmail: null, guestWatchlist: [] }

const listeners = new Set<() => void>()

/**
 * Cached for the same reason as the theme store: `getSnapshot` runs on every
 * render, so it has to hand back a stable identity until something changes.
 */
let snapshot: PersistedAuth | null = null

function getSnapshot(): PersistedAuth {
  if (snapshot === null) {
    snapshot = {
      users: loadUsers(),
      sessionEmail: loadSession(),
      guestWatchlist: loadGuestWatchlist(),
    }
  }
  return snapshot
}

/** The server has no localStorage, so it renders the signed-out shell. */
function getServerSnapshot(): PersistedAuth {
  return EMPTY
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  function onStorage(event: StorageEvent) {
    // `key === null` is a `localStorage.clear()`, which drops all three keys.
    if (event.key === null || event.key === USERS_KEY || event.key === SESSION_KEY ||
      event.key === GUEST_WATCHLIST_KEY) {
      snapshot = null
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

/**
 * The single write path: applies `update`, persists all three keys, then wakes
 * every subscriber. `saveUsers`/`saveSession`/`saveGuestWatchlist` already remove
 * their key when handed an empty value, so signing out or emptying the guest
 * list cleans storage up rather than leaving `"null"` or `"[]"` behind.
 */
export function setPersistedAuth(
  update: (current: PersistedAuth) => PersistedAuth,
): void {
  const next = update(getSnapshot())
  snapshot = next
  saveUsers(next.users)
  saveSession(next.sessionEmail)
  saveGuestWatchlist(next.guestWatchlist)
  for (const listener of listeners) listener()
}

export function usePersistedAuth(): PersistedAuth {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/* ==========================================================================
   Profile updates

   A separate write path from `setPersistedAuth`, because an email change has to
   move the session key too: the session is stored as an email string, so
   renaming an account without rewriting `sessionEmail` would sign the user out
   the moment they saved. Doing both in one commit means they never see the
   intermediate state.

   Watchlists are keyed by account id elsewhere, so renaming an account leaves
   every saved title exactly where it was — which is the behaviour you want from
   a profile edit, and the reason the update touches only the three fields.
   ========================================================================== */

export type ProfilePatch = {
  displayName?: string
  email?: string
  /** An empty string removes the avatar; omitted leaves it alone. */
  avatar?: string
}

export type ProfileResult =
  | { ok: true; account: Account; users: Account[] }
  | { ok: false; error: string }

/**
 * Applies a profile edit to `account`, validating the new email against the
 * other accounts. The caller has already confirmed intent with the dialog; this
 * re-checks rather than trusting it, because the session key depends on it.
 */
export function updateProfile(
  users: Account[],
  email: string,
  patch: ProfilePatch,
): ProfileResult {
  const account = users.find((user) => user.email === email)
  if (account === undefined) {
    return { ok: false, error: 'That account no longer exists.' }
  }

  const next: Account = { ...account }

  if (patch.displayName !== undefined) {
    const displayName = normalizeDisplayName(patch.displayName)
    if (displayName === null) {
      return {
        ok: false,
        error: `Display name must be at least ${MIN_DISPLAY_NAME_LENGTH} characters.`,
      }
    }
    next.displayName = displayName
  }

  if (patch.avatar !== undefined) {
    if (patch.avatar === '') delete next.avatar
    else next.avatar = normalizeAvatar(patch.avatar)
  }

  if (patch.email !== undefined) {
    const address = normalizeEmail(patch.email)
    if (!isValidEmail(address)) {
      return { ok: false, error: 'Enter a valid email address.' }
    }
    if (address === ADMIN_EMAIL && address !== account.email) {
      return { ok: false, error: 'That address is reserved for the platform admin.' }
    }
    if (address !== account.email && users.some((user) => user.email === address)) {
      return { ok: false, error: 'Another account already uses that address.' }
    }
    next.email = address
  }

  return {
    ok: true,
    account: next,
    users: users.map((user) => (user.email === email ? next : user)),
  }
}

/**
 * Commits a profile edit. When the email changes the session moves to the new
 * address in the same write, so the user stays signed in.
 */
export function saveProfile(email: string, patch: ProfilePatch): ProfileResult {
  const result = updateProfile(getSnapshot().users, email, patch)
  if (!result.ok) return result

  setPersistedAuth((current) => ({
    ...current,
    users: current.users.map((user) =>
      user.email === email ? result.account : user,
    ),
    sessionEmail:
      current.sessionEmail === email ? result.account.email : current.sessionEmail,
  }))
  return result
}
