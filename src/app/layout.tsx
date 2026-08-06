import type { Metadata, Viewport } from "next";

import {
  FONT_PRECONNECT_ORIGINS,
  LATIN_WEBFONT_HREF,
  monoFont,
} from "@/lib/design/fonts";

import "./globals.css";

export const metadata: Metadata = {
  title: "LoxeLingo",
  description: "A competitive ladder for language. Your rating is a place you stand.",
};

export const viewport: Viewport = {
  // Night is the default and Dusk is a whole-app user preference, never a
  // per-section flip, so the browser chrome matches the canvas either way.
  themeColor: "#0D1226",
};

/**
 * Root layout.
 *
 * Fonts: Geist Mono is self-hosted through next/font. Clash Display and
 * Satoshi come from Fontshare, because next/font cannot resolve them and
 * adding woff2 binaries to the repo is a separate decision. Swapping to
 * self-hosted is a change to src/lib/design/font-sources.ts plus a
 * next/font/local call; nothing else in the system moves, because every
 * consumer reads a family through a custom property.
 *
 * CJK faces are deliberately absent from this file. They load per world,
 * lazily, through <ScriptText> / <WorldFonts>. A user in the Spanish world
 * downloads zero CJK bytes.
 *
 * `lang="en"` here is the chrome's language. World content never inherits
 * it: every CJK element gets its own `lang` from the world registry,
 * because `lang="ja"` and `lang="zh-Hans"` select different glyph shapes
 * for the same codepoints.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="night" className={monoFont.variable}>
      <body className="min-h-[100dvh] antialiased">
        {FONT_PRECONNECT_ORIGINS.map((origin) => (
          <link key={origin} rel="preconnect" href={origin} crossOrigin="anonymous" />
        ))}
        <link rel="stylesheet" href={LATIN_WEBFONT_HREF} precedence="loxe-latin-fonts" />

        {children}

        {/* Fixed grain. pointer-events: none, never on a scrolling
            container, removed under prefers-contrast: more. */}
        <div data-grain="" aria-hidden="true" />
      </body>
    </html>
  );
}
