import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AngkorCinemas",
  description:
    "Discover movies, trending hits and top picks curated for Cambodia, powered by the TMDB API.",
  applicationName: "AngkorCinemas",
  icons: {
    // The project already ships a real 48x46 mark in favicon.svg; it was unused
    // while this pointed at MovieLogo.png, a 1444x1089 photo that cost 794 KB
    // just to render at 16-32px.
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Apply the stored theme before first paint so the page never flashes the wrong
 * palette. Mirrors src/lib/useTheme.ts, and must stay in sync with it.
 */
const themeBootstrap = `
;(function () {
  try {
    var t = localStorage.getItem('soogood_kh_theme') === 'light' ? 'light' : 'dark'
    document.documentElement.classList.toggle('light', t === 'light')
    document.documentElement.style.colorScheme = t
    var meta = document.getElementById('theme-color')
    if (meta) meta.setAttribute('content', t === 'light' ? '#f4f1ea' : '#05060b')
  } catch (e) {
    document.documentElement.style.colorScheme = 'dark'
  }
})()
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // The bootstrap script above mutates `class` and `style` on <html> before
    // React hydrates, so the attribute mismatch is expected and intentional.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Page background per theme, so the mobile browser chrome matches the app.
          Kept in sync by src/lib/useTheme.ts; it follows the in-app toggle, not
          the OS setting, so it cannot be a media-scoped pair. It is declared
          here rather than through the `viewport.themeColor` export because
          useTheme.ts looks the element up by id at runtime.
        */}
        <meta name="theme-color" id="theme-color" content="#05060b" />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
