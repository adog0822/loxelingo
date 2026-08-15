/**
 * traits — the avatar trait vector: six axes, a fixed point budget, and the derivations that
 * turn points into observable behaviour.
 *
 * Mirrors `public.avatars` in supabase/migrations/20260815100430_avatars.sql. The database owns
 * the invariants (`avatars_trait_budget`, `avatars_trait_silhouette`); this module owns the
 * meaning, so prompt construction reads a vector rather than a paragraph of characterisation.
 *
 * WHY SIX AXES, AND WHY THESE. Four of them are the Big-Five / HEXACO factors that survive
 * contact with dialogue: `warmth` is the trust-and-affection half of Big-Five agreeableness,
 * `patience` is HEXACO agreeableness (tolerance, forgiveness, anger management), `edge` is the
 * antagonism pole those two models keep splitting between them, `candour` is HEXACO's
 * honesty-humility, `drive` is the assertive half of extraversion. `humour` belongs to neither
 * model and is added anyway: it is the axis a reader detects in one line, and the two comic
 * axes have to be separable, because SILLY is high humour with low edge and CUTTING is low
 * humour with high edge. One "funny" score cannot tell those two characters apart.
 * Conscientiousness and openness are left out: neither changes how a character reacts to being
 * taught badly, and that is the only thing this vector exists to decide.
 *
 * WHY THE NAMED TRAITS ARE NOT AXES. "Grumpy", "troll" and "impatient" are REGIONS of this
 * space, not dimensions of it, and `COMPOSITE_READINGS` below computes them from the six. A
 * basis whose members are already composites cannot express a character who is grumpy but
 * tender, or funny but never at your expense, which is exactly the range the cast needs.
 *
 * Pure: no I/O, no clock, no randomness.
 */

/** The axes, in the order every readout uses. Matches the column order in the migration. */
export const TRAIT_AXES = [
  'warmth',
  'humour',
  'edge',
  'patience',
  'candour',
  'drive',
] as const;

export type TraitAxis = (typeof TRAIT_AXES)[number];

/** Points available on a single axis: 0..5 inclusive. */
export const TRAIT_MAX = 5;

/**
 * Every avatar spends exactly this many of a possible 30.
 *
 * This is the whole design. A character is a set of tradeoffs, so three 5s leave 3 points to
 * cover the other three axes. MUST MATCH `avatars_trait_budget` in
 * supabase/migrations/20260815100430_avatars.sql, which asserts the same number at migration
 * time by inserting an 18-point row and a 17-point row and requiring the second to fail.
 */
export const TRAIT_POINT_BUDGET = 18;

/**
 * Minimum gap between an avatar's strongest and weakest axis.
 *
 * A 3 everywhere sums to 18 and is nobody. MUST MATCH `avatars_trait_silhouette`.
 */
export const TRAIT_MIN_SILHOUETTE = 3;

/** Points across the six axes. Always sums to TRAIT_POINT_BUDGET. */
export type TraitVector = Readonly<Record<TraitAxis, number>>;

/** Coarse reading of a single axis. Behaviour tables are keyed by band, not by raw points. */
export type TraitBand = 'low' | 'mid' | 'high';

export class AvatarTraitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AvatarTraitError';
  }
}

/**
 * 0-1 low, 2-3 mid, 4-5 high.
 *
 * Three bands rather than six because a behaviour table with six rows per axis is six chances
 * to write the same sentence twice. The numbers still carry: `MEASURE` below reads raw points.
 */
export function band(points: number): TraitBand {
  if (points <= 1) return 'low';
  if (points <= 3) return 'mid';
  return 'high';
}

/** Total points spent. */
export function traitTotal(v: TraitVector): number {
  return TRAIT_AXES.reduce((sum, axis) => sum + v[axis], 0);
}

/** Gap between the strongest and the weakest axis. The character's silhouette. */
export function traitSpread(v: TraitVector): number {
  const values = TRAIT_AXES.map((axis) => v[axis]);
  return Math.max(...values) - Math.min(...values);
}

/** The axis with the most points. Ties break on TRAIT_AXES order, so the result is stable. */
export function strongestAxis(v: TraitVector): TraitAxis {
  return TRAIT_AXES.reduce((best, axis) => (v[axis] > v[best] ? axis : best), TRAIT_AXES[0]);
}

/** The axis with the fewest points. Ties break on TRAIT_AXES order. */
export function weakestAxis(v: TraitVector): TraitAxis {
  return TRAIT_AXES.reduce((worst, axis) => (v[axis] < v[worst] ? axis : worst), TRAIT_AXES[0]);
}

/**
 * How far apart two characters are, in points that would have to move.
 *
 * Both vectors sum to the budget, so the signed differences cancel and the L1 distance is
 * always even: it is exactly twice the number of points to move to turn one into the other.
 * supabase/seeds/50-avatars.sql asserts a floor of 8 across the cast, which is four points.
 */
export function traitDistance(a: TraitVector, b: TraitVector): number {
  return TRAIT_AXES.reduce((sum, axis) => sum + Math.abs(a[axis] - b[axis]), 0);
}

/**
 * Throws unless the vector is one the database would have accepted.
 *
 * The same three rules as `avatars_trait_budget`, `avatars_trait_silhouette` and the per-column
 * range checks. Written here as well because a vector reaching prompt construction may have
 * come from a fixture or a tuning script rather than from a row.
 */
export function assertTraitVector(v: TraitVector): void {
  for (const axis of TRAIT_AXES) {
    const points = v[axis];
    if (!Number.isInteger(points) || points < 0 || points > TRAIT_MAX) {
      throw new AvatarTraitError(
        `${axis} is ${String(points)}: every axis takes a whole number of points from 0 to ${TRAIT_MAX}`,
      );
    }
  }
  const total = traitTotal(v);
  if (total !== TRAIT_POINT_BUDGET) {
    throw new AvatarTraitError(
      `this vector spends ${total} points and the budget is exactly ${TRAIT_POINT_BUDGET}: a character is a set of tradeoffs`,
    );
  }
  const spread = traitSpread(v);
  if (spread < TRAIT_MIN_SILHOUETTE) {
    throw new AvatarTraitError(
      `strongest and weakest axis are ${spread} apart and the floor is ${TRAIT_MIN_SILHOUETTE}: a flat build sums to ${TRAIT_POINT_BUDGET} and is nobody`,
    );
  }
}

/**
 * The named traits, computed from the axes.
 *
 * This map is the argument for the basis. The product owner named humour, grumpiness, roasting
 * and impatience; only one of those is a dimension. The rest are places you can stand in this
 * space, and a character can be near one without being defined by it.
 */
export const COMPOSITE_READINGS = {
  /** Impatience is not an axis. It is the other end of one. */
  impatient: (v: TraitVector) => TRAIT_MAX - v.patience >= 4,
  /** Low attention to the player, wit aimed at them, short fuse. */
  grumpy: (v: TraitVector) => v.warmth <= 1 && v.edge >= 4 && v.patience <= 2,
  /** Roasts: aims the wit, has the jokes to aim, and is not softening it on the way. */
  roasts: (v: TraitVector) => v.edge >= 4 && v.humour >= 3 && v.warmth <= 3,
  /** Says the thing nobody wants said, including about itself. */
  blunt: (v: TraitVector) => v.candour >= 4 && v.warmth <= 2,
  /** Will perform an answer it never understood. The axis with the sharpest consequence. */
  bluffs: (v: TraitVector) => v.candour <= 1,
  /** Funny, and never at the player's expense. */
  gentleComic: (v: TraitVector) => v.humour >= 3 && v.edge <= 1,
} as const satisfies Record<string, (v: TraitVector) => boolean>;

export type CompositeReading = keyof typeof COMPOSITE_READINGS;

/** Every named reading this vector satisfies, in declaration order. */
export function compositeReadings(v: TraitVector): CompositeReading[] {
  return (Object.keys(COMPOSITE_READINGS) as CompositeReading[]).filter((key) =>
    COMPOSITE_READINGS[key](v),
  );
}

/**
 * The numbers a prompt can state outright, each derived from exactly one axis.
 *
 * One axis each on purpose: a model given "keep replies to 3 sentences" follows it, and a
 * number that came from a blend of three axes cannot be explained to whoever tunes it next.
 */
export interface TraitMeasure {
  /** Turns between jokes. Null when the character does not make them. */
  jokeEveryNTurns: number | null;
  /** Sentence ceiling for one reply. Impatience is the thing that shortens a character. */
  sentenceCeiling: number;
  /** Turns between unprompted requests for the next thing. Null when it never asks. */
  asksForMoreEveryNTurns: number | null;
}

export function traitMeasure(v: TraitVector): TraitMeasure {
  return {
    jokeEveryNTurns: v.humour === 0 ? null : TRAIT_MAX + 1 - v.humour,
    sentenceCeiling: Math.max(2, v.patience + 1),
    asksForMoreEveryNTurns: v.drive === 0 ? null : TRAIT_MAX + 1 - v.drive,
  };
}
