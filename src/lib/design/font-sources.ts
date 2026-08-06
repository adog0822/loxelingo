/**
 * Web font sources.
 * docs/design/design-system.md §3.1, §3.2
 *
 * Pure data. No next/font import here, so this module is safe to pull
 * into client components. The next/font call lives in ./fonts.ts.
 *
 * Loading strategy:
 * - Latin faces come from Fontshare (the spec's free path: Clash Display
 *   + Satoshi). Geist Mono is self-hosted through next/font, because it
 *   is the one face in the free stack that next/font can resolve.
 * - CJK faces are loaded PER WORLD, LAZILY, on world entry. Never all
 *   three at once. A user in the Spanish world downloads zero CJK bytes.
 *   Google's CSS2 API slices Noto by unicode-range, which is the
 *   subsetting the spec asks for; the browser fetches only the slices a
 *   page actually uses.
 */

/** Origins worth a preconnect from the root layout. */
export const FONT_PRECONNECT_ORIGINS = [
  "https://api.fontshare.com",
  "https://cdn.fontshare.com",
] as const;

/** Origins only touched once a CJK world is entered. */
export const CJK_FONT_PRECONNECT_ORIGINS = [
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
  "https://cdn.jsdelivr.net",
] as const;

/**
 * Clash Display (display) + Satoshi (text). Weights limited to the ones
 * the type scale actually uses: 400/500/600 display, 400/500/700 text.
 */
export const LATIN_WEBFONT_HREF =
  "https://api.fontshare.com/v2/css?f%5B%5D=clash-display@400,500,600&f%5B%5D=satoshi@400,500,700&display=swap";

/** Which face a piece of text needs. */
export type ScriptTier = "display" | "text" | "immersion";

export interface FontSource {
  /** Stylesheet URL, or `null` when only locally installed faces apply. */
  readonly href: string | null;
  /** Human note for the report and for future self-hosting work. */
  readonly note: string;
}

/**
 * Per-world, per-tier stylesheets. Only the entry for the world being
 * rendered is ever requested.
 */
export const CJK_FONT_SOURCES: Readonly<
  Record<"ja" | "ko" | "zh", Readonly<Record<ScriptTier, FontSource>>>
> = {
  ja: {
    display: {
      href: "https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700&display=swap",
      note: "Zen Kaku Gothic New 500/700 (OFL). Real weights only; bold is never synthesised on CJK.",
    },
    text: {
      href: "https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400..700&display=swap",
      note: "Noto Sans JP variable (OFL), unicode-range sliced by the CSS2 API.",
    },
    immersion: {
      href: "https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500&display=swap",
      note: "Shippori Mincho (OFL). Immersion reading only.",
    },
  },
  ko: {
    display: {
      href: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css",
      note: "Pretendard variable, dynamic subset (OFL). Covers display and body; Hangul needs no palt.",
    },
    text: {
      href: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css",
      note: "Same sheet as display, so entering Korean is one request.",
    },
    immersion: {
      href: "https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@400;700&display=swap",
      note: "Gowun Batang (OFL). Immersion reading only.",
    },
  },
  zh: {
    display: {
      href: "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400..700&display=swap",
      note: "Alibaba PuHuiTi 3.0 is the spec's display face but has no verifiable free CDN, so it stays first in the CSS stack for locally installed or later self-hosted copies and Noto Sans SC is what actually loads.",
    },
    text: {
      href: "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400..700&display=swap",
      note: "Noto Sans SC variable (OFL), unicode-range sliced by the CSS2 API.",
    },
    immersion: {
      href: "https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/style.css",
      note: "LXGW WenKai (OFL). Immersion reading only; this sheet is large, so it is never loaded by default.",
    },
  },
} as const;
