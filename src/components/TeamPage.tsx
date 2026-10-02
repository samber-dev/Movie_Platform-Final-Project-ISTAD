'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { useModalDismiss } from '../lib/useModalDismiss'

/** How long a card sits in view before the carousel moves on. */
const AUTO_ADVANCE_MS = 4500
/** After a manual action, leave the carousel alone long enough to read the card. */
const RESUME_AFTER_MS = 6000

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return reduced
}

/**
 * Geometry is derived from the live DOM rather than from the `--per` breakpoint,
 * so the dots stay correct across resizes without duplicating breakpoint maths.
 */
function stepOf(el: HTMLElement) {
  if (el.children.length < 2) return el.clientWidth
  const first = el.children[0] as HTMLElement
  const second = el.children[1] as HTMLElement
  return second.offsetLeft - first.offsetLeft
}

function maxScrollOf(el: HTMLElement) {
  return el.scrollWidth - el.clientWidth
}

/** One dot per reachable scroll position, not per card. */
function positionCountOf(el: HTMLElement) {
  const step = stepOf(el)
  if (step <= 0) return 1
  return Math.max(1, Math.round(maxScrollOf(el) / step) + 1)
}

type TeamIcon = 'github' | 'linkedin' | 'mail'

type TeamLink = {
  label: string
  href: string
  icon: TeamIcon
}

type TeamMember = {
  id: string
  name: string
  role: string
  image: string
  /**
   * Intrinsic size, so the frame reserves the right space before load — and,
   * more importantly, so the photo plate gets the correct aspect ratio. When
   * these disagree with the actual file, the backing ends up wider than the
   * picture and `object-fit: contain` letterboxes the photo inside its own
   * plate. The regression suite compares each value against the image's real
   * `naturalWidth`/`naturalHeight`, so a swapped-in file fails rather than
   * quietly shipping grey bars.
   */
  width: number
  height: number
  blurb: string
  /**
   * TODO(real-quotes): written by us as placeholders. Replace each with a real
   * line from the person before publishing — a quote attributed to a named
   * person should be theirs, not ours.
   */
  quote: string
  focus: string[]
  links: TeamLink[]
}

/**
 * The instructor, shown above the member carousel rather than inside it.
 *
 * Kept separate from `TEAM` on purpose. The carousel is a peer row of the students
 * who built the thing, and the instructor in that row would read as another
 * contributor. Up top, in their own wider card, the relationship is accurate: the
 * person teaching, distinct from the team.
 */
const SUPERVISOR = {
  name: 'Srorng Sokcheat',
  role: 'Instructor',
  image: '/Teacher.jpg',
  /** Real pixel dimensions of the file — see the note on `TeamMember.width`. */
  width: 1170,
  height: 1147,
  blurb:
    'Provided exceptional guidance throughout the architectural scope and development lifecycle, facilitating rigorous code review cycles and maintaining industry-grade quality standards. Ensured the platform met strict technical readiness criteria by providing critical feedback, constructive oversight, and technical mentorship at every stage of execution.',
} satisfies Omit<TeamMember, 'id' | 'quote' | 'focus' | 'links'>

/**
 * TODO(real-links): the `links` below are project-level placeholders on our own
 * domain. Swap in each member's real handles before shipping — do not publish
 * third-party accounts that were not confirmed with the person.
 */
const TEAM: TeamMember[] = [
  {
    id: 'sambat-samber',
    name: 'Sambat Samber',
    role: 'Lead Developer & Project Creator',
    image: '/ber.jpg',
    width: 720,
    height: 1280,
    blurb:
      'Owns the architecture end to end and keeps the interface fast, accessible and consistent as the catalogue grows.',
    quote: 'Ship it so you would happily open it again tomorrow.',
    focus: ['React', 'TypeScript', 'API Integration', 'Architecture'],
    links: [
      { label: 'GitHub', href: 'https://github.com/angkorcinemas', icon: 'github' },
      { label: 'Email', href: 'mailto:sambat@angkorcinemas.com', icon: 'mail' },
    ],
  },
  {
    id: 'skd',
    name: 'SKD',
    role: 'Backend Database Engineer',
    image: '/SKD.jpg',
    width: 960,
    height: 1280,
    blurb:
      'Designs the data layer — schema, migrations and the APIs every screen reads from.',
    quote: 'Get the data model right and the queries follow.',
    focus: ['SQL', 'Schema Design', 'Data Modelling', 'APIs'],
    links: [
      { label: 'GitHub', href: 'https://github.com/angkorcinemas', icon: 'github' },
      { label: 'Email', href: 'mailto:skd@angkorcinemas.com', icon: 'mail' },
    ],
  },
  {
    id: 'roth',
    name: 'Roth',
    role: 'UI/UX Designer & Frontend Developer',
    image: '/Roth.jpg',
    width: 548,
    height: 568,
    blurb:
      'Shapes how AngkorCinemas looks and feels, carrying the design system all the way into shipped components.',
    quote: 'Good design goes invisible once it is working.',
    focus: ['Design Systems', 'Figma', 'CSS', 'Accessibility'],
    links: [
      { label: 'GitHub', href: 'https://github.com/angkorcinemas', icon: 'github' },
      { label: 'Email', href: 'mailto:roth@angkorcinemas.com', icon: 'mail' },
    ],
  },
  {
    id: 'rothna',
    name: 'Rothna',
    role: 'Backend & Database Engineer',
    image: '/Rothna.jpg',
    width: 528,
    height: 592,
    blurb:
      'Builds and tunes the backend services, keeping queries and sign-in fast under real traffic.',
    quote: 'Fast is a feature. Boring is a promise.',
    focus: ['REST APIs', 'MySQL', 'Auth', 'Performance'],
    links: [
      { label: 'GitHub', href: 'https://github.com/angkorcinemas', icon: 'github' },
      { label: 'Email', href: 'mailto:rothna@angkorcinemas.com', icon: 'mail' },
    ],
  },
  {
    id: 'tongtong',
    name: 'Tongtong',
    role: 'Content & Media Manager',
    image: '/tongtong.jpg',
    width: 157,
    height: 182,
    blurb:
      'Curates the catalogue and the artwork, trailers and metadata that give every title its context.',
    quote: 'Every film deserves a reason to press play.',
    focus: ['Curation', 'Trailers', 'Editorial', 'Metadata'],
    links: [
      { label: 'LinkedIn', href: 'https://www.linkedin.com/company/angkorcinemas', icon: 'linkedin' },
      { label: 'Email', href: 'mailto:tongtong@angkorcinemas.com', icon: 'mail' },
    ],
  },
]

/**
 * Headline metrics for the strip above the grid. The member count is derived
 * rather than typed, because it now has to stay consistent with two places: this
 * strip and the carousel below it. Hardcoding `5` and adding the instructor card
 * elsewhere is exactly the drift this avoids.
 */
const STATS: { value: string; label: string; sub: string }[] = [
  { value: String(TEAM.length), label: 'Team Members', sub: 'Plus one instructor' },
  { value: '100+', label: 'Hours Built', sub: 'Design, code and testing' },
  { value: 'TMDB', label: 'API Integrated', sub: 'A live movie catalogue' },
  { value: '1', label: 'Enterprise Vision', sub: 'Built to scale' },
]

const ICON_PATH: Record<TeamIcon, string> = {
  github:
    'M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.3 5.4 2.6 5.4 2.6a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21',
  linkedin:
    'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6zM7 9H3v12h4zM5 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4z',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm18 2-10 7L2 6',
}

function TeamLinkIcon({ icon }: { icon: TeamIcon }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill={icon === 'mail' ? 'none' : 'currentColor'}
      stroke={icon === 'mail' ? 'currentColor' : 'none'}
      strokeWidth={icon === 'mail' ? 2 : 0}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATH[icon]} />
    </svg>
  )
}

/**
 * Every card renders through this one component — no per-member layout branch —
 * so the five photos, names, roles and tag rows stay identical in size and
 * rhythm.
 *
 * The photo is split across two boxes. The frame is a fixed-height, centred
 * flex container, so the band is the same for all five cards and cannot collapse
 * while an image loads. The plate inside it is sized from the member's own
 * intrinsic ratio and carries the dark backing, so that backing hugs the picture
 * instead of filling the whole band — the sources span 9:16 to roughly 1:1, and a
 * backing painted on a single shared shape either crops the portrait or leaves
 * the wide photos marooned on a slab. `contain` inside a plate that already has
 * the photo's shape means nothing is ever cropped.
 *
 * Those `width`/`height` values are read from the files, not guessed — see the
 * note on `TeamMember.width` for what a wrong one costs.
 *
 * `--photo-ratio` and `--photo-ar` are set on the card because both boxes read
 * them, and a custom property only inherits downwards: set on the plate alone,
 * the frame falls back to a square on phones. The unitless `--photo-ar` is what
 * lets the plate's width be `min(100%, band x ratio)`.
 */
function MemberCard({ member }: { member: TeamMember }) {
  return (
    <article
      className="team-card"
      style={
        {
          '--photo-ratio': `${member.width} / ${member.height}`,
          '--photo-ar': `${member.width / member.height}`,
        } as CSSProperties
      }
    >
      <div className="team-photo-frame">
        <span className="team-photo-plate">
          <img
            className="team-photo-img"
            src={member.image}
            alt={`${member.name}, ${member.role}`}
            width={member.width}
            height={member.height}
            loading="lazy"
            decoding="async"
          />
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold leading-tight text-ink">{member.name}</h3>
        <p className="mt-1 min-h-10 text-sm font-semibold leading-snug text-accent-2">
          {member.role}
        </p>
        {/* Clamped to three lines so the five cards stay one height; the longest
            blurb (Sambat, 112 chars) fills exactly three at the narrowest card
            width, and the suite asserts none of them is actually truncated. */}
        <p className="mt-3 line-clamp-3 min-h-[4.25rem] text-sm leading-relaxed text-ink-soft">
          {member.blurb}
        </p>

        <blockquote className="mt-4 border-l-2 border-accent/60 pl-3">
          <p className="line-clamp-2 min-h-[2.875rem] text-sm italic leading-relaxed text-ink-soft">
            “{member.quote}”
          </p>
        </blockquote>

        {/* Reserved for two rows of 25px tags plus the 8px gap: the four
            labels wrap differently per member, and without the floor the cards
            end up 33px apart in height. */}
        <ul className="mt-4 flex min-h-[3.625rem] flex-wrap content-start gap-2">
          {member.focus.map((tag) => (
            <li key={tag} className="team-tag">
              {tag}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex items-center gap-2 pt-1">
          {member.links.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target={link.icon === 'mail' ? undefined : '_blank'}
              rel={link.icon === 'mail' ? undefined : 'noopener noreferrer'}
              className="team-link"
              aria-label={`${member.name} on ${link.label}`}
              title={link.label}
            >
              <TeamLinkIcon icon={link.icon} />
            </a>
          ))}
        </div>
      </div>
    </article>
  )
}

/**
 * The instructor's card, above the member carousel.
 *
 * A separate component rather than a `MemberCard` variant, because the two cards
 * answer different questions: this one says who taught the work, the carousel
 * says who did it. Forcing it through `MemberCard` would mean stubbing a quote, a
 * focus list and social links that do not apply to the relationship, and it would
 * put the instructor in a peer row of contributors.
 *
 * The photo reuses the same frame/plate split as the member cards, so the
 * `object-fit` behaviour is identical and sized from its own ratio — the mismatch
 * that letterboxed Roth's photo would otherwise show here too.
 */
function SupervisorCard() {
  return (
    <article
      className="team-card team-supervisor"
      style={
        {
          '--photo-ratio': `${SUPERVISOR.width} / ${SUPERVISOR.height}`,
          '--photo-ar': `${SUPERVISOR.width / SUPERVISOR.height}`,
        } as CSSProperties
      }
    >
      <div className="team-photo-frame">
        <span className="team-photo-plate">
          <img
            className="team-photo-img"
            src={SUPERVISOR.image}
            alt={`${SUPERVISOR.name}, ${SUPERVISOR.role}`}
            width={SUPERVISOR.width}
            height={SUPERVISOR.height}
            loading="lazy"
            decoding="async"
          />
        </span>
      </div>

      <div className="flex flex-1 flex-col p-6 sm:p-7">
        <span className="kicker self-start">Instructor</span>
        <h3 className="mt-3 text-2xl font-bold leading-tight tracking-tight text-ink">
          {SUPERVISOR.name}
        </h3>
        <p className="mt-1.5 text-sm font-semibold text-accent-2">{SUPERVISOR.role}</p>
        <p className="mt-3 max-w-prose text-pretty text-sm leading-relaxed text-ink-soft">
          {SUPERVISOR.blurb}
        </p>
      </div>
    </article>
  )
}

/**
 * Auto-advancing carousel. The track is a real horizontally scrollable box
 * rather than a `transform`-shifted strip, so touch swipe, keyboard scrolling
 * and the programmatic auto-advance all drive the same `scrollLeft` and cannot
 * fight each other.
 *
 * The timer is a self-rearming `setTimeout` chain rather than a `setInterval`.
 * An interval keeps firing on a fixed grid, so after a pause the first move
 * lands anywhere between 0ms and a full dwell after the pointer leaves — the
 * carousel lurches forward the instant you look away. Re-arming after each move
 * (and on each release of a hold) guarantees the full dwell every time.
 */
function TeamCarousel() {
  const trackRef = useRef<HTMLUListElement>(null)
  /** Which of the three pointer/keyboard holds are currently down. */
  const holdsRef = useRef({ hover: false, focus: false, touch: false })
  /** Dwell the next tick should wait; lengthened after a manual action. */
  const delayRef = useRef(AUTO_ADVANCE_MS)
  /** Lets a manual action re-arm the pending tick immediately. */
  const rearmRef = useRef<() => void>(() => {})
  const [dots, setDots] = useState(1)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  /** Bumped per tick so the dwell bar's animation restarts. */
  const [cycle, setCycle] = useState(0)
  const [cycleMs, setCycleMs] = useState(AUTO_ADVANCE_MS)
  const reduced = usePrefersReducedMotion()
  const autoplay = !reduced

  /** Keep dot count and active dot in step with the real scroll position. */
  const sync = useCallback(() => {
    const track = trackRef.current
    if (!track) return
    const count = positionCountOf(track)
    setDots((prev) => (prev === count ? prev : count))
    const step = stepOf(track)
    if (step > 0) {
      const next = Math.min(count - 1, Math.max(0, Math.round(track.scrollLeft / step)))
      setIndex((prev) => (prev === next ? prev : next))
    }
  }, [])

  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        sync()
      })
    }

    track.addEventListener('scroll', onScroll, { passive: true })
    sync()

    // Card widths change with the viewport, so re-measure when they do.
    const observer = new ResizeObserver(() => sync())
    observer.observe(track)

    return () => {
      track.removeEventListener('scroll', onScroll)
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [sync])

  /**
   * Move one stop in `direction`, wrapping at either end. `instantWrap` is for
   * the timed cycle only: the jump from the last card back to the first must not
   * read as a long slide backwards, but the same jump from a click should.
   */
  const advance = useCallback(
    (direction: 1 | -1, instantWrap = false) => {
      const track = trackRef.current
      if (!track) return
      const step = stepOf(track)
      if (step <= 0) return
      const count = positionCountOf(track)
      const from = Math.min(count - 1, Math.max(0, Math.round(track.scrollLeft / step)))
      const raw = from + direction
      const wrapped = raw < 0 || raw > count - 1
      const to = wrapped ? (direction < 0 ? count - 1 : 0) : raw
      track.scrollTo({
        left: Math.min(maxScrollOf(track), to * step),
        behavior: !reduced && !(wrapped && instantWrap) ? 'smooth' : 'auto',
      })
    },
    [reduced],
  )

  /** Park the carousel after any manual action, then restart the dwell. */
  const hold = () => {
    delayRef.current = RESUME_AFTER_MS
    rearmRef.current()
  }

  useEffect(() => {
    if (!autoplay || paused) return

    let id = 0
    const tick = () => {
      if (!document.hidden) {
        const dwell = delayRef.current
        delayRef.current = AUTO_ADVANCE_MS
        setCycleMs(dwell)
        setCycle((n) => n + 1)
        advance(1, true)
      }
      id = window.setTimeout(tick, delayRef.current)
    }
    id = window.setTimeout(tick, delayRef.current)
    rearmRef.current = () => {
      window.clearTimeout(id)
      id = window.setTimeout(tick, delayRef.current)
    }
    return () => {
      window.clearTimeout(id)
      rearmRef.current = () => {}
    }
  }, [advance, autoplay, paused])

  /** Track hover, focus and touch separately, but surface one paused flag. */
  const setHold = (source: 'hover' | 'focus' | 'touch', on: boolean) => {
    holdsRef.current[source] = on
    const { hover, focus, touch } = holdsRef.current
    setPaused(hover || focus || touch)
  }

  const stepManually = (direction: 1 | -1) => {
    hold()
    advance(direction)
  }

  const jumpTo = (target: number) => {
    const track = trackRef.current
    if (!track) return
    const step = stepOf(track)
    if (step <= 0) return
    const count = positionCountOf(track)
    const to = Math.min(count - 1, Math.max(0, target))
    hold()
    track.scrollTo({
      left: Math.min(maxScrollOf(track), to * step),
      behavior: reduced ? 'auto' : 'smooth',
    })
  }

  const multiple = dots > 1

  return (
    /* Hover and touch are watched on the wrapper, so pointing at the cards or at
       the controls both stop the movement — and lifting the pointer away always
       restarts a full dwell rather than resuming mid-countdown. Focus is
       deliberately NOT watched here: the arrows and dots live outside the track,
       and a mouse click leaves focus parked on the button, which would freeze
       the carousel for good. Keyboard scrolling pauses via the track's own
       onFocus, and pressing an arrow or dot pauses via the post-action hold. */
    <div
      className="team-carousel"
      role="region"
      aria-roledescription="carousel"
      aria-label="Meet the team"
      onMouseEnter={() => setHold('hover', true)}
      onMouseLeave={() => setHold('hover', false)}
      onTouchStart={() => setHold('touch', true)}
      onTouchEnd={() => {
        setHold('touch', false)
        hold()
      }}
    >
      <ul
        ref={trackRef}
        className="team-carousel-track"
        tabIndex={0}
        /* An auto-rotating carousel must not be a live region, or a screen
           reader interrupts on every timed move. */
        aria-live="off"
        onFocus={() => setHold('focus', true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setHold('focus', false)
        }}
      >
        {TEAM.map((member) => (
          <li key={member.id} className="team-carousel-item">
            <MemberCard member={member} />
          </li>
        ))}
      </ul>

      {/* Hidden when everything fits on one screen: there is nothing to move. */}
      {autoplay && (
        <span
          key={cycle}
          className="team-carousel-progress"
          data-paused={paused ? 'true' : undefined}
          style={{ '--cycle': `${cycleMs}ms` } as CSSProperties}
          aria-hidden="true"
        />
      )}

      {multiple && (
        <div className="team-carousel-controls">
          <button
            type="button"
            className="team-carousel-arrow"
            onClick={() => stepManually(-1)}
            aria-label="Show the previous members"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>

          <ul className="team-carousel-dots" aria-label="Carousel position">
            {Array.from({ length: dots }, (_, dot) => (
              <li key={dot}>
                <button
                  type="button"
                  className="team-carousel-dot"
                  onClick={() => jumpTo(dot)}
                  aria-current={dot === index ? 'true' : undefined}
                  aria-label={`Go to view ${dot + 1} of ${dots}`}
                />
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="team-carousel-arrow"
            onClick={() => stepManually(1)}
            aria-label="Show the next members"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

export function TeamPage({ onClose }: { onClose: () => void }) {
  useModalDismiss(onClose)

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-page"
      role="dialog"
      aria-modal="true"
      aria-labelledby="team-heading"
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(900px_520px_at_50%_-8%,rgb(168_85_247_/_0.22),transparent_62%)]" />

      <div className="relative z-10 mx-auto max-w-6xl px-4 pb-20 pt-6 md:pb-28 md:pt-8">
        <div className="mb-10 flex items-center justify-between gap-3 md:mb-14">
          {/* Same crop as the navbar badge — see the note in MoviePlatformApp.tsx. */}
          <img
            src="/team-photo.png"
            alt="AngkorCinemas"
            width={160}
            height={160}
            className="h-10 w-10 shrink-0 rounded-2xl object-cover"
          />
          <button
            type="button"
            onClick={onClose}
            className="btn-neon-ghost"
            aria-label="Close the team page"
          >
            Close
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <header className="mx-auto max-w-2xl text-center">
          <span className="kicker">Meet the Team</span>
          <h1
            id="team-heading"
            className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight md:text-5xl"
          >
            The people behind <span className="neon-text">AngkorCinemas</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-ink-soft">
            Five students turning a class project into a real movie platform — one
            layer at a time, from the database up to the pixels — with their
            instructor keeping the scope honest.
          </p>
          <hr className="neon-rule mx-auto mt-8 w-40" />
        </header>

        <section aria-labelledby="journey-heading" className="mx-auto mt-12 max-w-3xl">
          <h2
            id="journey-heading"
            className="text-center text-2xl font-bold tracking-tight"
          >
            Our Journey &amp; Vision
          </h2>
          <div className="team-journey mt-5 px-5 py-6 sm:px-8">
            <p className="text-pretty text-sm leading-relaxed text-ink-soft sm:text-base">
              This started as a coursework brief and a folder of empty files. What
              grew out of it is a platform we actually wanted to use: a live
              catalogue pulled from TMDB, a watchlist that remembers you, ratings
              and reviews that stick, and an interface that stays readable on a
              phone in a bright room. Every screen here was designed, built and
              tested by the five of us — no framework we could not explain, and no
              feature we could not defend.
            </p>
          </div>
        </section>

        <dl className="mt-10 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label} className="team-stat">
              <dt className="team-stat-label">{stat.label}</dt>
              <dd className="team-stat-value">{stat.value}</dd>
              <p className="team-stat-sub">{stat.sub}</p>
            </div>
          ))}
        </dl>

        <div className="mt-12">
          <SupervisorCard />
        </div>

        <section aria-labelledby="members-heading" className="mt-12">
          <h2
            id="members-heading"
            className="sr-only"
          >
            Team members
          </h2>
          {/* The section heading is a screen-reader landmark only. A visible one
              here duplicated "Meet the Team" forty pixels below it, which read as
              a heading hierarchy mistake rather than as structure. */}
          <TeamCarousel />
        </section>

        <p className="mt-14 text-center text-sm text-ink-muted">
          AngkorCinemas is a Movie Platform demo built for coursework.
        </p>
      </div>
    </div>
  )
}
