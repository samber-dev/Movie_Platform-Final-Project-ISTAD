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
| `src/components/` | Detail views, modals, the release calendar, admin panel, team page |
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

**Images use plain `<img>`.** Posters, backdrops and portraits are all sized by whatever
TMDB returns, so `next/image` could not reserve space for them up front; the lint rule is
turned off in `eslint.config.mjs` with that reasoning recorded.

**No flash of the wrong theme.** `layout.tsx` carries an inline script that reads the
theme key and applies it to `<html>` before first paint, replacing the script that used
to live in Vite's `index.html`. `<html>` carries `suppressHydrationWarning` because that
script mutates its `class` and `style` before React hydrates.
# Movie_Platform-Final-Project-ISTAD
