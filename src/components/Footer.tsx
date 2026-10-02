import Link from 'next/link'

interface FooterProps {
  onOpenTeam: () => void
}

export default function Footer({ onOpenTeam }: FooterProps) {
  return (
    <footer className="border-t border-line bg-surface/30 py-10 text-ink-muted">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Brand & Copyright */}
        <div className="space-y-4">
          <div className="flex items-center gap-2.5">
            <img
              src="/team-photo.png"
              alt=""
              width={160}
              height={160}
              className="h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-line"
            />
            <h2 className="text-lg font-bold text-ink">
              Angkor<span className="neon-text">Cinemas</span>
            </h2>
          </div>
          <p className="text-sm text-ink-soft">
            Your gateway to the latest movies, TV shows, and cinematic classics.
          </p>
          <p className="text-xs text-ink-muted">
            © {new Date().getFullYear()} AngkorCinemas. All rights reserved.
          </p>
        </div>

        {/* Navigation / The Basics */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
            The Basics
          </h3>
          <ul className="space-y-2 text-sm">
            <li>
              <Link
                href="#popular"
                className="transition hover:text-accent hover:underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
              >
                Movies
              </Link>
            </li>
            <li>
              <Link
                href="#popular"
                className="transition hover:text-accent hover:underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
              >
                TV Shows
              </Link>
            </li>
            <li>
              <button
                type="button"
                onClick={onOpenTeam}
                className="text-left transition hover:text-accent hover:underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
              >
                About Us
              </button>
            </li>
            <li>
              <Link
                href="#popular"
                className="transition hover:text-accent hover:underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
              >
                Watchlist
              </Link>
            </li>
          </ul>
        </div>

        {/* Connect / Support */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
            Connect
          </h3>
          <ul className="space-y-2 text-sm">
            <li>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-accent hover:underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
              >
                GitHub
              </a>
            </li>
            <li>
              <a
                href="https://twitter.com"
                target="_blank"
                rel="noopener noreferrer"
                className="transition hover:text-accent hover:underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
              >
                Twitter/X
              </a>
            </li>
            <li>
              <a
                href="mailto:support@angkorcinemas.example"
                className="transition hover:text-accent hover:underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
              >
                Support
              </a>
            </li>
            <li>
              <a
                href="#faq"
                className="transition hover:text-accent hover:underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
              >
                FAQ
              </a>
            </li>
          </ul>
        </div>

        {/* Legal / TMDB Attribution */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
            Legal & Attribution
          </h3>
          <p className="text-sm text-ink-soft">
            This product uses the{' '}
            <a
              href="https://www.themoviedb.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-ink-soft underline-offset-4 transition hover:text-accent hover:underline focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
            >
              TMDB API
            </a>{' '}
            but is not endorsed or certified by TMDB.
          </p>
          <p className="text-xs text-ink-muted">
            TMDB and the TMDB logo are trademarks of The Movie Database.
          </p>
        </div>
      </div>
    </footer>
  )
}
