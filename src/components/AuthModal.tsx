'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  ADMIN_EMAIL,
  authenticate,
  hasStrongCrypto,
  MIN_PASSWORD_LENGTH,
  registerUser,
} from '../lib/authStore'
import { useModalDismiss } from '../lib/useModalDismiss'
import { recordActivity } from '../lib/activityStore'
import type { Account, AuthMode } from '../types'

const TABS: { key: AuthMode; label: string }[] = [
  { key: 'login', label: 'Login' },
  { key: 'register', label: 'Register' },
]

const field = 'neon-input'

const label = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-ink-muted'

type Props = {
  mode: AuthMode
  users: Account[]
  hint?: string
  onAuthenticated: (account: Account, users: Account[]) => void
  onClose: () => void
}

export function AuthModal({ mode, users, hint, onAuthenticated, onClose }: Props) {
  const [tab, setTab] = useState<AuthMode>(mode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const secure = hasStrongCrypto()

  useModalDismiss(onClose)

  function switchTab(next: AuthMode) {
    setTab(next)
    setError(null)
    setPassword('')
    setConfirm('')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    if (tab === 'register' && password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    setError(null)
    const result =
      tab === 'register'
        ? await registerUser(users, email, password)
        : await authenticate(users, email, password)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    // Logged only on success: a wrong password is not activity worth ranking.
    recordActivity(
      tab === 'register' ? 'account.created' : 'auth.signed-in',
      tab === 'register' ? 'Joined AngkorCinemas' : 'Signed in',
      result.account.email,
    )
    onAuthenticated(result.account, result.users)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-page/90 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Account sign in"
    >
      <div
        className="neon-panel w-full max-w-md overflow-hidden rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative border-b border-line p-6 pb-5">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-lg text-ink-soft transition hover:bg-surface-3 hover:text-ink"
            aria-label="Close"
          >
            ✕
          </button>
          <h2 className="text-2xl font-extrabold text-ink">
            {tab === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {tab === 'login'
              ? 'Sign in to pick up your saved watchlist.'
              : 'Register to keep a watchlist tied to your account.'}
          </p>

          <div className="mt-5 flex rounded-full bg-page/40 p-1" role="tablist" aria-label="Authentication mode">
            {TABS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="tab"
                aria-selected={tab === entry.key}
                onClick={() => switchTab(entry.key)}
                className={`flex-1 rounded-full px-4 py-2 text-sm font-bold transition ${
                  tab === entry.key
                    ? 'bg-accent text-ink shadow'
                    : 'text-ink-soft hover:text-ink'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6" noValidate>
          {hint && (
            <p className="rounded-lg bg-accent-2/10 px-4 py-2.5 text-sm text-accent-2 ring-1 ring-accent-2/40">
              {hint}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-500/10 px-4 py-2.5 text-sm text-red-300 ring-1 ring-red-400/30"
            >
              {error}
            </p>
          )}

          <div>
            <label className={label} htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={field}
            />
          </div>

          <div>
            <label className={label} htmlFor="auth-password">
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              required
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className={field}
            />
            {tab === 'register' && (
              <p className="mt-1.5 text-xs text-ink-muted">
                At least {MIN_PASSWORD_LENGTH} characters.
              </p>
            )}
          </div>

          {tab === 'register' && (
            <div>
              <label className={label} htmlFor="auth-confirm">
                Confirm password
              </label>
              <input
                id="auth-confirm"
                type="password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                className={field}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn-neon w-full disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy
              ? 'Please wait…'
              : tab === 'login'
                ? 'Sign In'
                : 'Create Account'}
          </button>
        </form>

        <div className="space-y-2 border-t border-line px-6 py-4 text-xs text-ink-muted">
          <p>
            Demo admin ·{' '}
            <span className="font-mono text-ink-soft">{ADMIN_EMAIL}</span> /{' '}
            <span className="font-mono text-ink-soft">admin123</span>
          </p>
          <p>
            {tab === 'login' ? 'No account yet?' : 'Already registered?'}{' '}
            <button
              type="button"
              onClick={() => switchTab(tab === 'login' ? 'register' : 'login')}
              className="font-semibold text-accent hover:underline"
            >
              {tab === 'login' ? 'Create one' : 'Sign in instead'}
            </button>
          </p>
          {!secure && (
            <p className="rounded-lg bg-yellow-500/10 px-3 py-2 text-yellow-200 ring-1 ring-yellow-400/30">
              Insecure context: passwords fall back to a weak demo hash. Serve
              over HTTPS or localhost for real SHA-256.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
