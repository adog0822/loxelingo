/**
 * Numeral formatting.
 * docs/design/design-system.md §3.5
 *
 * Ratings are rendered with a thin-space thousands separator (1 588),
 * not a comma, and localized. Delta is always signed and always
 * adjacent. Pure functions, no React.
 */

/** U+2009 THIN SPACE. */
export const THIN_SPACE = " ";

const ratingFormatters = new Map<string, Intl.NumberFormat>();

function ratingFormatter(locale: string): Intl.NumberFormat {
  let formatter = ratingFormatters.get(locale);
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(locale, {
      useGrouping: true,
      maximumFractionDigits: 0,
    });
    ratingFormatters.set(locale, formatter);
  }
  return formatter;
}

/**
 * `1588` becomes `1 588` with a thin space, in whatever grouping the
 * locale uses. Localised grouping is preserved; only the separator
 * glyph is replaced.
 */
export function formatRating(value: number, locale = "en-US"): string {
  return ratingFormatter(locale)
    .formatToParts(Math.round(value))
    .map((part) => (part.type === "group" ? THIN_SPACE : part.value))
    .join("");
}

/** `+14` / `-14`. Always signed, per §3.5. */
export function formatDelta(value: number, locale = "en-US"): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "−" : "+"; // U+2212 MINUS SIGN, not a hyphen
  return `${sign}${formatRating(Math.abs(rounded), locale)}`;
}

/** Rank column. Mono, tabular, no grouping games. */
export function formatRank(rank: number, locale = "en-US"): string {
  return formatRating(rank, locale);
}

/**
 * `mm:ss` for the match timer. Mono, tabular, and static: the numerals
 * never animate.
 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Whole seconds remaining, for the static numeral that appears at 5s. */
export function formatSeconds(ms: number): string {
  return String(Math.max(0, Math.ceil(ms / 1000)));
}

/**
 * Widest of a set of formatted numerals, used to reserve width so a
 * count-up cannot shift layout even across a digit-count boundary
 * (999 to 1 000).
 */
export function widestNumeral(...values: string[]): string {
  let widest = "";
  for (const value of values) {
    if (value.length > widest.length) widest = value;
  }
  return widest;
}
