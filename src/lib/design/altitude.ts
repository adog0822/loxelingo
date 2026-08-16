/**
 * The altitude system.
 * docs/design/design-system.md §5
 *
 * A single scalar drives the whole environment:
 *
 *   --altitude: clamp(0, rating / 8800, 1)
 *
 * Continuous scalar, discrete named thresholds. Continuous means every
 * single match visibly moves the sky, so progress is always felt.
 * Discrete means the standing is always sayable, which is the point of
 * the brand.
 *
 * Pure functions only. No React, no DOM. The provider that writes these
 * values onto the world root lives in
 * src/components/ui/altitude-provider.tsx.
 */

/** Rating at which altitude 0 sits. */
export const ALTITUDE_FLOOR_RATING = 0;

/** Rating span from altitude 0 to altitude 1. */
export const ALTITUDE_SPAN_RATING = 8800;

/** Rating at which altitude 1 is reached. */
export const ALTITUDE_CEILING_RATING = ALTITUDE_FLOOR_RATING + ALTITUDE_SPAN_RATING;

export type BandId =
  | "valley-floor"
  | "treeline"
  | "ridge"
  | "above-the-deck"
  | "long-light"
  | "exosphere"
  | "meridian";

/** Ambient star density at a band. Not a count: a rendering instruction. */
export type StarDensity = "none" | "faint" | "upper" | "full" | "dense" | "hard" | "void";

/** Where the cloud deck sits relative to the viewer. */
export type DeckPosition = "ceiling" | "above" | "level" | "below" | "far-below" | "trace" | "gone";

export interface Band {
  readonly id: BandId;
  /** 1-based, matches the table in §5.2. Also written to --band-index. */
  readonly index: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  /** The sayable name. This is the thing a user tells a friend. */
  readonly name: string;
  /** Inclusive lower rating bound. */
  readonly floor: number;
  /** Exclusive upper rating bound. `null` on the open top band. */
  readonly ceiling: number | null;
  /** Reference haze opacity at the band, from §5.2. */
  readonly haze: number;
  /** Fraction of the frame the celestial body occupies. 0 = not visible. */
  readonly bodyFrame: number;
  readonly stars: StarDensity;
  readonly deck: DeckPosition;
  /** Rose-gold rim light on UI edges appears at Ridge for the first time. */
  readonly rim: boolean;
  /** One line describing the UI change, for design QA and copy. */
  readonly note: string;
}

/**
 * Band boundaries at 1000 / 1800 / 2800 / 4400 / 6400 / 8800: gaps of
 * 800, 1000, 1600, 2000, 2400. Deliberately tight early, because first
 * threshold crossings are the highest-leverage retention events.
 *
 * (The comment said 900 / 1100 / 1300 / 1550 / 1800 / 2100, the values these
 * floors carried before the display scale moved to 0-10,000. The floors below
 * were restated then and the sentence describing them was not.)
 */
export const BANDS: readonly Band[] = [
  {
    id: "valley-floor",
    index: 1,
    name: "Valley Floor",
    floor: Number.NEGATIVE_INFINITY,
    ceiling: 1000,
    haze: 0.92,
    bodyFrame: 0,
    stars: "none",
    deck: "ceiling",
    rim: false,
    note: "The only warm light in frame is the river below and your own earned items.",
  },
  {
    id: "treeline",
    index: 2,
    name: "Treeline",
    floor: 1000,
    ceiling: 1800,
    haze: 0.76,
    bodyFrame: 0,
    stars: "faint",
    deck: "above",
    rim: false,
    note: "Horizon resolves as a soft band. First gold edge on surfaces.",
  },
  {
    id: "ridge",
    index: 3,
    name: "Ridge",
    floor: 1800,
    ceiling: 2800,
    haze: 0.58,
    bodyFrame: 0.08,
    stars: "upper",
    deck: "level",
    rim: true,
    note: "Rose-gold rim light appears on UI edges for the first time.",
  },
  {
    id: "above-the-deck",
    index: 4,
    name: "Above the Deck",
    floor: 2800,
    ceiling: 4400,
    haze: 0.38,
    bodyFrame: 0.18,
    stars: "full",
    deck: "below",
    rim: true,
    note: "The cloud deck is below you. Full-screen crossing sequence. Permanent horizon line is drawn.",
  },
  {
    id: "long-light",
    index: 5,
    name: "The Long Light",
    floor: 4400,
    ceiling: 6400,
    haze: 0.22,
    bodyFrame: 0.3,
    stars: "dense",
    deck: "far-below",
    rim: true,
    note: "Rim light becomes directional. Surfaces cast a faint gradient away from the body.",
  },
  {
    id: "exosphere",
    index: 6,
    name: "Exosphere",
    floor: 6400,
    ceiling: 8800,
    haze: 0.1,
    bodyFrame: 0.48,
    stars: "hard",
    deck: "trace",
    rim: true,
    note: "Sky is void. Type gains one weight step in headers.",
  },
  {
    id: "meridian",
    index: 7,
    name: "Meridian",
    floor: 8800,
    ceiling: null,
    haze: 0.02,
    bodyFrame: 0.7,
    stars: "void",
    deck: "gone",
    rim: true,
    note: "Light is hard and directional. UI edges catch it on one side only.",
  },
] as const;

const BANDS_BY_ID: Record<BandId, Band> = BANDS.reduce(
  (acc, band) => {
    acc[band.id] = band;
    return acc;
  },
  {} as Record<BandId, Band>,
);

export function bandById(id: BandId): Band {
  return BANDS_BY_ID[id];
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * The scalar. `clamp(0, rating / 8800, 1)`.
 */
export function altitudeFromRating(rating: number): number {
  return clamp01((rating - ALTITUDE_FLOOR_RATING) / ALTITUDE_SPAN_RATING);
}

/** Inverse, for band-boundary rules that need to place a line in the sky. */
export function ratingFromAltitude(altitude: number): number {
  return ALTITUDE_FLOOR_RATING + clamp01(altitude) * ALTITUDE_SPAN_RATING;
}

export function bandForRating(rating: number): Band {
  for (let i = BANDS.length - 1; i >= 0; i -= 1) {
    if (rating >= BANDS[i].floor) return BANDS[i];
  }
  return BANDS[0];
}

/** The band above the current one, or `null` at Meridian. */
export function nextBand(rating: number): Band | null {
  const current = bandForRating(rating);
  return current.index === 7 ? null : BANDS[current.index];
}

/**
 * Rating points to the next band boundary, or `null` at Meridian.
 * Used for the ladder's band-boundary labels and for push copy that is
 * a fact about the world rather than a countdown of your failure:
 * "You are 40 points from Ridge."
 */
export function pointsToNextBand(rating: number): number | null {
  const upcoming = nextBand(rating);
  if (upcoming === null) return null;
  return Math.max(0, Math.ceil(upcoming.floor - rating));
}

/**
 * Every visual quantity derived from the scalar, mirroring the calc()
 * chain in src/styles/tokens.css. CSS drives the DOM; this exists for
 * canvas and WebGL surfaces (star field, orrery, share render) which
 * cannot read a custom property.
 */
export interface DerivedAltitude {
  /** Haze opacity. 0.94 at the floor, 0.02 at the ceiling. */
  readonly haze: number;
  /** Celestial body size as a fraction of viewport height. */
  readonly bodyScale: number;
  /** Body vertical offset as a percentage of its own box. */
  readonly bodyYPercent: number;
  /** Cloud deck vertical offset as a percentage. */
  readonly deckYPercent: number;
  /** Star field opacity. */
  readonly starOpacity: number;
  /** Rim-light strength. Zero below altitude 0.25. */
  readonly rim: number;
}

export function derivedAltitude(altitude: number): DerivedAltitude {
  const a = clamp01(altitude);
  return {
    haze: 0.94 - a * 0.92,
    bodyScale: 0.04 + a * 0.68,
    bodyYPercent: 112 - a * 74,
    deckYPercent: 96 - a * 62,
    starOpacity: a,
    rim: Math.max(0, a - 0.25) * 1.1,
  };
}

export interface AltitudeState {
  /** The rating the sky is rendering. `null` for an unstarted world. */
  readonly rating: number | null;
  readonly altitude: number;
  readonly band: Band;
  /** CSS custom properties to write on the world root. */
  readonly customProperties: Readonly<Record<string, string>>;
  /** Data attributes to write alongside them, for band-gated CSS. */
  readonly dataAttributes: Readonly<Record<string, string>>;
}

/**
 * Rating to band plus the exact CSS custom property values.
 *
 * Only `--altitude` and `--band-index` are written: every other
 * quantity is a calc() of `--altitude` in tokens.css, so the browser
 * interpolates the whole environment from one registered property with
 * no per-frame JavaScript.
 */
export function altitudeStateForRating(rating: number | null): AltitudeState {
  const effective = rating ?? ALTITUDE_FLOOR_RATING;
  const altitude = altitudeFromRating(effective);
  const band = bandForRating(effective);
  return {
    rating,
    altitude,
    band,
    customProperties: {
      "--altitude": String(altitude),
      "--band-index": String(band.index),
    },
    dataAttributes: {
      "data-band": band.id,
    },
  };
}

/**
 * Ratings are independent per world per ladder (DUEL / RECALL / FORGE).
 * The sky renders the MAXIMUM of the three for that world, because the
 * sky is the world's, not the ladder's. Tilting in DUEL therefore does
 * not visibly darken your sky.
 *
 * Returns `null` when the world is unstarted, which is what makes the
 * absence of a number the invitation.
 */
export function skyRatingForWorld(
  ladderRatings: Iterable<number | null | undefined>,
): number | null {
  let max: number | null = null;
  for (const value of ladderRatings) {
    if (value === null || value === undefined || Number.isNaN(value)) continue;
    if (max === null || value > max) max = value;
  }
  return max;
}

/** `skyRatingForWorld` composed with `altitudeStateForRating`. */
export function skyAltitudeForWorld(
  ladderRatings: Iterable<number | null | undefined>,
): AltitudeState {
  return altitudeStateForRating(skyRatingForWorld(ladderRatings));
}
