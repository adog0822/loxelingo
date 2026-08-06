import { Geist_Mono } from "next/font/google";

/**
 * The one face in the spec's free stack that next/font can resolve, so
 * it is the one face that gets real self-hosting, zero layout shift and
 * no third-party request.
 *
 * The variable name is deliberately NOT in Tailwind's `--font-*`
 * namespace. `@theme inline` resolves at parse time, so a `--font-mono`
 * that references `--font-mono` is a silent self-reference that breaks
 * font loading. `--ff-geist-mono` cannot collide.
 */
export const monoFont = Geist_Mono({
  subsets: ["latin"],
  variable: "--ff-geist-mono",
  display: "swap",
});

/** Class names the root <html> element must carry. */
export const fontRootClassName = monoFont.variable;

export {
  LATIN_WEBFONT_HREF,
  FONT_PRECONNECT_ORIGINS,
  CJK_FONT_PRECONNECT_ORIGINS,
} from "./font-sources";
