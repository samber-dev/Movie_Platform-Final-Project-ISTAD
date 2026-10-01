# AngkorCinemas — Next.js

The movie platform, rebuilt on the **Next.js App Router** with **TypeScript** and **Tailwind CSS v4**, migrated from the original Vite SPA in `../Movie_Platform/web`.

## Getting started

```bash
npm run dev      # http://localhost:3000
npm run build    # production build
npm start        # serve the production build
npm run lint     # eslint
npm run typecheck
```

## Layout

| Path | What it is |
| --- | --- |
| `src/app/layout.tsx` | Root layout, metadata, and the pre-paint theme bootstrap script |
| `src/app/page.tsx` | Server component that mounts the client app |
| `src/app/globals.css` | Tailwind v4 `@theme` tokens plus every component class |
| `src/components/MoviePlatformApp.tsx` | The former `App.tsx` — navbar, hero, grid, filters, overlays |
| `src/components/admin/MovieForm.tsx` | The one form behind both add and edit, with inline validation |
| `src/components/admin/MovieManager.tsx` | Catalogue table: add, edit, delete, search, empty states |
| `src/components/admin/LeaderboardPanel.tsx` | Engagement ranking, platform totals and the recent-activity log |
| `src/components/ComingSoon.tsx` | Release calendar: month sections and one row per title |
| `src/lib/customMovieStore.ts` | Locally added titles in `localStorage`, with add/update/delete |
| `src/lib/activityStore.ts` | Append-only activity log in `localStorage`, plus leaderboard aggregation |
| `src/lib/releaseCalendar.ts` | Release-date parsing, month grouping, countdowns |
| `src/components/` | Detail views, modals, the admin dashboard, team page |
| `src/lib/tmdb.ts` | The teacher's TMDB API integration (unchanged) |
| `src/lib/authStore.ts` | Accounts, session and watchlists, plus the persisted store |
| `src/lib/useTheme.ts` | Dark/light theme as a React external store |
| `public/` | Portraits and logo assets |

## Notes on the migration

**The TMDB integration is intact.** `src/lib/tmdb.ts` is byte-for-byte the original,
teacher's key included, and every request still goes to `api.themoviedb.org` from the
browser. It is a client-side integration, not a server one: the catalogue is fetched
in effects and rendered client-side, which is why the page shell prerenders but the
grid fills in on hydration.

**Storage-backed state moved to external stores.** Accounts, the session, the guest
watchlist and the theme all live in `localStorage`, which the server cannot read. They
are exposed through `useSyncExternalStore` (`usePersistedAuth`, `useTheme`) rather than
`useState` initialisers: React renders `getServerSnapshot` into the prerendered HTML and
adopts the real snapshot on the first client render, so a signed-in visitor can never get
a hydration mismatch on the navbar. It also collapsed the old save-on-change effect —
`setPersistedAuth` now persists all three keys in the same commit as the state change.

The existing `soogood_kh_*` localStorage keys are unchanged, so existing accounts,
sessions, watchlists, ratings and reviews carry over. `admin@angkorcinemas.kh` /
`admin123` still signs in.

**Admin-authored titles are add, edit and delete.** The admin panel's Movies tab drives one
form (`admin/MovieForm.tsx`) in two modes, so validation, field limits and the URL rules
are written once. `customMovieStore` stamps `createdAt` on add and `updatedAt` on every
edit, and an edit preserves both the row's id and its original `createdAt`, which is why
the catalogue shows "edited <date>" only on rows that have actually changed.

**There is no Custom tab.** Locally added titles are merged into the Movies and All feeds
(and into search results) by the `feed` memo in `MoviePlatformApp`, so they are browsable
exactly like TMDB titles. They are appended rather than interleaved, because a local title
has no TMDB popularity and would otherwise sort to the bottom of a popularity sort. They
are excluded from Coming Soon, whose rows are grouped by a full release date that a
hand-entered year cannot supply, and they are naturally excluded from TV Shows because
they are typed as movies. The grid says how many local titles a feed contains.

**Profile settings are account data, written through the auth store.** `ProfileSettings`
edits three fields — display name, email and avatar — and each is persisted by
`saveProfile` in the same commit that renders it, rather than by a save-on-blur effect
that could lose an edit to a closed tab. Display name is optional and clamped to 2–40
characters. Email is the account's identity, so it is the one field with real
consequences: it is the session key and the login handle, and `saveProfile` rewrites
`soogood_kh_session` alongside the account so a rename cannot sign the user out. The
dialog refuses a duplicate address and the reserved admin address.

Avatars never leave the browser. `fileToAvatarDataUrl` decodes the file with
`createImageBitmap`, centre-crops it to a square, draws it to a 256px canvas and
re-encodes as JPEG, because the store only accepts `data:image/jpeg` URLs and a
lossy pass keeps a portrait well under the 48 KB budget that `normalizeAvatar` enforces
on read. A 600×400 upload lands around 3 KB; the cap is what keeps an account small
enough for `localStorage`. The dialog distinguishes `undefined` ("leave what is stored
alone") from `''` ("remove it"), so an untouched photo survives a save that only changes
the name.

**Coming Soon is a month-at-a-time calendar grid.** `releaseCalendar` turns TMDB's full
release dates into `buildMonthGrid`, which emits whole Sunday-to-Saturday weeks padded
with the neighbouring months' days, so every row holds exactly seven cells and the grid
can never drift out of alignment. Only one month is mounted at a time behind previous and
next controls, which keeps the DOM small; titles with no full date are listed after the
last month. A day cell body is a fixed-height scrolling region rather than an unbounded
one — a release-heavy day would otherwise stretch its entire week row and the month would
stop reading as a grid. Two posters show per day, with the rest behind a `+N more`.

**The Leaderboard tab reports recorded activity, not analytics.** `activityStore` is an
append-only log in `localStorage`, capped at the most recent 300 events, written through
`recordActivity` at the point of action: sign-in and registration, watchlist changes,
catalogue CRUD, reviews, ratings, JSON export, profile changes and account deletion.
Profile edits are member activity, not administration, so `ADMIN_KINDS` is an explicit
list rather than a `startsWith('admin')` check that would sweep them in. Ranking counts
engagement first and admin actions only as a tie-breaker, so the admin who maintains the
catalogue does not permanently top a board of members. Guest activity is bucketed under
one label rather than dropped. `useActorEmail` reads the session from the auth store
instead of threading an `actor` prop down to the review form and star rating, which are
several levels below the shell that holds it. The panel states that its figures cover one
browser, because there is no server that could know otherwise.

## Responsive behaviour

Three breakpoints decide the navbar layout, and the bar is sized so its zones can never
overlap or push the page wider than the window:

| Width | Navigation | Search | Account |
| --- | --- | --- | --- |
| `< lg` | Hamburger opens a full-width drawer | Elastic, fills the bar | Avatar only; Admin and Sign Out live in the drawer |
| `lg` – `xl` | All five destinations inline at 13px | Elastic | Icon-only Admin and Sign Out beside the avatar |
| `>= xl` | All five inline at 14px | Elastic, capped | Admin, Sign Out and avatar with labels |

The search is the only `flex-1` zone with `min-w-0`, so it absorbs whatever the brand and
the link row do not claim and is the single thing that shrinks.

The admin dashboard uses a fixed `sm:w-56` rail on the left holding its three sections —
Leaderboard, Movies, Users — which becomes a horizontal section bar on mobile. Switching
sections remounts the body under `key={tab}`, which replays the 260ms
`.admin-section-enter` fade-and-rise; that is why a half-typed form is discarded on a
section change. The transition is disabled under `prefers-reduced-motion`.

**The supervisor sits above the carousel, not in it.** `SupervisorCard` is a
separate component from `MemberCard` because the two answer different questions:
who supervised the work, and who did it. Forcing it through `MemberCard` would mean
stubbing a quote, a focus list and social links that do not apply to the
relationship, and it would put the teacher in a peer row of contributors. On
`md` and up it is a two-column card — photo left, text right — with the photo
column fixed at 20rem so the picture does not resize with the copy.

The member carousel auto-advances on its own, so a reviewer can scan all five
without clicking. The track is a real horizontal scroll box rather than a
`transform`-shifted strip, so touch swipe, keyboard scrolling and the timed
advance all drive one `scrollLeft` and cannot fight each other; a jump would
otherwise be indistinguishable from a scroll-snap fighting the animation. The
timer is a self-rearming `setTimeout` chain rather than a `setInterval`, because
an interval keeps firing on a fixed grid and after a pause the first move lands
anywhere between 0ms and a full dwell — the carousel lurches the instant you look
away. Hover, focus and touch each park it independently, and any manual action
re-arms a full dwell. Under `prefers-reduced-motion` autoplay is off entirely and
the dwell bar is not rendered, rather than being merely slowed.

**The team photos are sized from the files, not from guesses.** Each `TeamMember`
carries `width`/`height`, and the photo plate takes its aspect ratio from them. When
these disagree with the actual file, the backing ends up wider than the picture and
`object-fit: contain` letterboxes the photo inside its own plate — measured at 163px
and 178px of dead bar down each side for Roth and Rothna, whose photos had been
replaced with near-square files while the metadata still claimed 16:9. The numbers are
the real pixel dimensions, and the suite reads each image's `naturalWidth` and
`naturalHeight` and fails on any disagreement, so swapping a photo file without
updating its metadata fails the build rather than shipping grey bars.

The plate is sized width-first (`width: min(100%, band × ratio)`, with the height
derived by `aspect-ratio`) rather than `height: 100%`. Both measure zero dead bar, but
the height-first form makes a near-square photo at the full 24rem band wider than its
own card, and flex `stretch` resolves that by growing the card to 370px against 357px
for its neighbours — trading uniform photo height for ragged card width.

The Coming Soon calendar keeps all seven weekday columns at every width rather than
collapsing into a list. At 375px each cell is 49px wide, which is enough for a
poster thumbnail and a clamped title; the countdown badge is hidden below `sm`,
because the day number and the badge together do not fit, and the countdown survives
as the badge's tooltip. "Today" is already carried by the filled date pill.

**Images use plain `<img>`.** Posters, backdrops and portraits are all sized by whatever
TMDB returns, so `next/image` could not reserve space for them up front; the lint rule is
turned off in `eslint.config.mjs` with that reasoning recorded.

**No flash of the wrong theme.** `layout.tsx` carries an inline script that reads the
theme key and applies it to `<html>` before first paint, replacing the script that used
to live in Vite's `index.html`. `<html>` carries `suppressHydrationWarning` because that
script mutates its `class` and `style` before React hydrates.
# Movie_Platform-Final-Project-ISTAD
