'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="relative flex min-h-[calc(100svh-4rem)] items-center justify-center px-4">
      <div className="neon-panel mx-auto flex max-w-md flex-col items-center gap-6 rounded-2xl p-8 text-center shadow-neon-soft sm:p-10">
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl md:text-6xl">
          <span className="neon-text">404</span>
        </h1>
        <div className="space-y-3">
          <h2 className="text-xl font-bold text-ink sm:text-2xl">
            Page Not Found
          </h2>
          <p className="text-sm leading-relaxed text-ink-muted sm:text-base">
            Sorry, the page you&apos;re looking for doesn&apos;t exist or has
            moved.
          </p>
        </div>
        <div className="flex w-full flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/"
            aria-label="Return to home page"
            className="btn-neon w-full sm:w-auto"
          >
            Back to Home
          </Link>
          <Link
            href="/explore"
            aria-label="Explore movies and TV shows"
            className="btn-neon-ghost w-full sm:w-auto"
          >
            Explore Now
          </Link>
        </div>
      </div>
    </main>
  );
}
