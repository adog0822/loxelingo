import { Archivo, Geist_Mono } from "next/font/google";

/**
 * Archivo carries BOTH the display and the text role.
 *
 * WHY IT REPLACED Clash Display + Satoshi, measured rather than preferred:
 *   - Clash Display's free release ships NO tabular figure set. Digit advances
 *     measured against the exact stylesheet the app loaded: `0` = 70.40,
 *     `1` = 33.20, a 2.12x ratio, and `font-variant-numeric: tabular-nums`
 *     produced byte-identical output. The design system simultaneously requires
 *     ratings in the display face with tnum and calls a width-shifting rating
 *     "a layout bug and a credibility bug". Both could not be true. A rating
 *     counting 1588 -> 1599 moved ~27px.
 *   - Weight 600 does not exist in the free Clash release, so --t-display-1 and
 *     --t-display-2 were never renderable as specified. We were shipping a
 *     fallback and calling it the design.
 *
 * WHAT ARCHIVO BUYS BEYOND CORRECT FIGURES:
 *   - A `wdth` 62-125 axis. At wdth 112 it IS a Breit: the spec's Söhne and
 *     Söhne Breit pairing collapses into one OFL file, and the width axis
 *     becomes the typographic expression of the two-zone dial (the world is
 *     wide and atmospheric; the instrument is narrow and precise), which the
 *     system previously expressed only in motion and density.
 *   - SIL OFL, so free for commercial use with no per-pageview metering.
 *   - It is on Google Fonts, so next/font SELF-HOSTS it. That deletes a
 *     render-blocking third-party stylesheet and two preconnects from the
 *     critical path, and removes the FOUT the Fontshare <link> could cause.
 */
export const displayFont = Archivo({
  subsets: ["latin"],
  // Not in Tailwind's `--font-*` namespace: `@theme inline` resolves at parse
  // time, so a `--font-display` that references `--font-display` is a silent
  // self-reference that breaks font loading entirely.
  variable: "--ff-archivo",
  display: "swap",
  // `wght` is the default axis and is included automatically. `wdth` is what
  // makes the two-zone split expressible.
  axes: ["wdth"],
});

/**
 * Mono is reserved for timers, ranks and ids — never for ratings. Ratings use
 * the display face with tabular figures, so authority comes from width and
 * weight rather than from looking like code.
 */
export const monoFont = Geist_Mono({
  subsets: ["latin"],
  variable: "--ff-geist-mono",
  display: "swap",
});

/** Class names the root <html> element must carry. */
export const fontRootClassName = `${displayFont.variable} ${monoFont.variable}`;

export {
  FONT_PRECONNECT_ORIGINS,
  CJK_FONT_PRECONNECT_ORIGINS,
} from "./font-sources";
