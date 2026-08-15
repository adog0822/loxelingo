/**
 * elo — two-sided dynamic-K Elo for learner ability and item difficulty.
 *
 * Implements `docs/research/03-learning-libs.md` §7.2–§7.3 and `02-ml-and-naming.md` §(d)/§(g).
 *
 * ## Formulation chosen (and why)
 *
 * Two-sided Rasch/1PL update on the **logit** scale (not the 400-point chess scale), per
 * Pelánek (2016), "Applications of the Elo rating system in adaptive educational systems",
 * *Computers & Education*, doi:10.1016/j.compedu.2016.03.017:
 *
 * ```
 * P(correct_si = 1) = 1 / (1 + exp(-(theta_s - d_i)))
 * theta_s := theta_s + K * (correct_si - P)
 * d_i     := d_i     - K * (correct_si - P)          // same observation, opposite sign
 * ```
 *
 * with theta and d both initialised to 0 (stated explicitly in that paper), and the
 * multiple-choice variant `P = 1/k + (1 - 1/k) / (1 + exp(-(theta - d)))`.
 *
 * The step size is the **uncertainty-decaying** family from Papoušek, Pelánek & Stanislav
 * (2014), "Adaptive Practice of Facts in Domains with Varied Prior Knowledge", EDM 2014,
 * pp. 6–13:
 *
 * ```
 * U(n) = a / (1 + b * n)          a = 1, b = 0.05     (their grid search; the paper says the
 *                                                      exact choice of a, b "is not important")
 * ```
 *
 * `n` is the 0-indexed observation count **for that entity**, so K is strictly decreasing in
 * `n`. This is the "Elo-as-Glicko-lite" recommendation: it carries Glicko-2's uncertainty
 * benefit without rating periods, which §(g) shows are the wrong shape for a bursty learning
 * app (RD inflation gives returning learners rating whiplash).
 *
 * Deliberately NOT shipped in v1: the sign-trend adaptive K of Vermeiren et al. (2025),
 * *UMUAI* 36(1):4, doi:10.1007/s11257-025-09439-z, in which K can rise as well as fall
 * (alpha = 0.2, K_start = 0.5, M = 5, clamped to [0.2, 1] for learners and [0.001, 1] for
 * items). §7.2 recommends the decaying form for v1 and holds the adaptive form in reserve for
 * the one failure it fixes: a returning learner whose ability jumped after K had decayed.
 * The `kFloor` below is the cheap partial mitigation (§7.3 note 3).
 *
 * Validated in §7.3 by simulation: dynamic K beats every constant K tested on held-out log
 * loss (0.4869 vs 0.4904 / 0.5079 / 0.5444 for K = 0.05 / 0.2 / 0.5).
 *
 * Pure: no I/O, no clock, no randomness. `n` must be persisted per entity — it is what makes
 * K decay.
 */

export const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));

/** Learner-skill ability. `theta` on the logit scale; `n` = observations seen. */
export type LearnerRating = {
  theta: number;
  n: number;
};

/** Item difficulty. `beta` on the logit scale; `n` = observations seen. */
export type ItemRating = {
  beta: number;
  n: number;
};

export type EloConfig = {
  /** Learner numerator of `K(n) = a / (1 + b*n)`. */
  aUser: number;
  /** Learner decay of `K(n) = a / (1 + b*n)`. */
  bUser: number;
  /** Item numerator. Use a smaller `a` for items primed from content features. */
  aItem: number;
  /** Item decay. */
  bItem: number;
  /**
   * Lower clamp on K (§7.3 note 3). Without it an item calibrated a year ago can never
   * respond to a changed population, because `K(n) -> 0`.
   */
  kFloor: number;
  /**
   * Number of answer options for a multiple-choice presentation, or 1/undefined for
   * free-response. Drives the guessing floor in `expectedCorrect`.
   */
  choices?: number;
};

export const DEFAULT_ELO: EloConfig = {
  // K: 1.000 at n=0, 0.500 at n=20, 0.091 at n=200.
  aUser: 1.0,
  bUser: 0.05,
  aItem: 1.0,
  bItem: 0.05,
  kFloor: 0.02,
};

/** Both sides start at 0 (Pelánek 2016). */
export const newLearnerRating = (theta = 0, n = 0): LearnerRating => ({ theta, n });

/**
 * A fresh item rating.
 *
 * §7.3 note 1: prime `beta` from item content (Zipf rank, length, CEFR level of constituent
 * lexemes — Duolingo's EMNLP 2021 approach) rather than 0, and give the prior a small
 * pseudo-count so the first few observations don't instantly wash it out.
 */
export const newItemRating = (beta = 0, pseudoCount = 0): ItemRating => ({ beta, n: pseudoCount });

/** Pseudo-count §7.3 suggests when `beta` came from a content-feature difficulty model. */
export const CONTENT_PRIOR_PSEUDO_COUNT = 5;

/**
 * `K(n) = max(kFloor, a / (1 + b*n))` — strictly decreasing in `n` until it hits the floor.
 */
export function kFactor(n: number, a: number, b: number, kFloor = 0): number {
  if (!Number.isFinite(n) || n < 0) throw new RangeError(`Elo observation count must be >= 0, got ${n}`);
  return Math.max(kFloor, a / (1 + b * n));
}

export const learnerK = (rating: LearnerRating, cfg: EloConfig = DEFAULT_ELO): number =>
  kFactor(rating.n, cfg.aUser, cfg.bUser, cfg.kFloor);

export const itemK = (rating: ItemRating, cfg: EloConfig = DEFAULT_ELO): number =>
  kFactor(rating.n, cfg.aItem, cfg.bItem, cfg.kFloor);

/**
 * `P(correct)` for this learner on this item.
 *
 * With `choices = k > 1` this is Pelánek's multiple-choice variant
 * `1/k + (1 - 1/k) * sigmoid(theta - beta)`, which puts a guessing floor at `1/k`.
 */
export function expectedCorrect(theta: number, beta: number, choices?: number): number {
  const base = sigmoid(theta - beta);
  if (choices === undefined || choices <= 1) return base;
  const guess = 1 / choices;
  return guess + (1 - guess) * base;
}

export type EloUpdate = {
  user: LearnerRating;
  item: ItemRating;
  /** Pre-update predicted P(correct). Log this: it is the calibration signal. */
  predicted: number;
  /** |observed - predicted|. Useful for flagging mis-calibrated items. */
  surprise: number;
};

/**
 * One observation updates BOTH sides. Pure: returns new values, mutates nothing.
 *
 * The sign asymmetry is the whole model — a correct answer raises the learner's ability *and
 * lowers the item's difficulty*, because the same observation is evidence about both.
 */
export function eloUpdate(
  user: LearnerRating,
  item: ItemRating,
  correct: boolean,
  cfg: EloConfig = DEFAULT_ELO,
): EloUpdate {
  const p = expectedCorrect(user.theta, item.beta, cfg.choices);
  const err = (correct ? 1 : 0) - p;

  return {
    user: { theta: user.theta + learnerK(user, cfg) * err, n: user.n + 1 },
    item: { beta: item.beta - itemK(item, cfg) * err, n: item.n + 1 },
    predicted: p,
    surprise: Math.abs(err),
  };
}

/**
 * Learner-only update: ability moves, item difficulty is held fixed.
 *
 * Use this on **adaptively selected** presentations. §(d)/§7.3 note 2: adaptive selection
 * inflates the variance of item ratings and they never converge, so item difficulty must be
 * calibrated from the randomized holdout slice only (see `holdout.ts`). Learner ability is
 * fine to update on every presentation — it is the item side that the feedback loop corrupts.
 */
export function updateLearnerOnly(
  user: LearnerRating,
  item: ItemRating,
  correct: boolean,
  cfg: EloConfig = DEFAULT_ELO,
): { user: LearnerRating; predicted: number; surprise: number } {
  const p = expectedCorrect(user.theta, item.beta, cfg.choices);
  const err = (correct ? 1 : 0) - p;
  return {
    user: { theta: user.theta + learnerK(user, cfg) * err, n: user.n + 1 },
    predicted: p,
    surprise: Math.abs(err),
  };
}

/**
 * Item-only update: difficulty moves, learner ability is held fixed.
 *
 * This is the item-difficulty Elo that `holdout.ts` drives from the non-adaptive slice.
 */
export function updateItemOnly(
  user: LearnerRating,
  item: ItemRating,
  correct: boolean,
  cfg: EloConfig = DEFAULT_ELO,
): { item: ItemRating; predicted: number; surprise: number } {
  const p = expectedCorrect(user.theta, item.beta, cfg.choices);
  const err = (correct ? 1 : 0) - p;
  return {
    item: { beta: item.beta - itemK(item, cfg) * err, n: item.n + 1 },
    predicted: p,
    surprise: Math.abs(err),
  };
}

/**
 * Presentation-scale conversion, for display only.
 *
 * The 400/base-10 apparatus of chess Elo is a presentation convention (§7.3); all internal
 * math stays on the logit scale so it composes with Bradley-Terry and the logistic knowledge
 * tracer.
 *
 * ── SINGLE SOURCE OF TRUTH ──────────────────────────────────────────────────
 * These two constants are duplicated in exactly one other place: the
 * `generated always as (...)` expressions for `user_ratings.rating` and
 * `user_ratings.peak_rating` in
 * `supabase/migrations/20260805104120_identity_and_progression.sql`.
 * Postgres cannot call TypeScript, so the formula must be written twice.
 * CHANGE BOTH TOGETHER, or the same player shows one rating in the UI and a
 * different one from the database. `display-scale.test.ts` pins the constants
 * so a one-sided edit fails the suite.
 *
 * Why plain `init + scale * logit` and not the strict Elo change of base
 * (`logit / ln(10) * 400`): the base-10 division is only meaningful if you want
 * "400 points = 10x odds" to hold literally. We are inventing this scale
 * anyway, and dropping the division makes the SQL and the TypeScript textually
 * identical, which permanently removes a whole class of divergence bug. The
 * cost is that 400 display points is one logit rather than one decade of odds.
 *
 * Why init = 900 and not the conventional 1500: 900 is the floor of the
 * "Treeline" altitude band (src/lib/design/altitude.ts). A fresh player must
 * start at the bottom of the visible climb. At init 1500 a brand-new account
 * would spawn inside "Above the Deck" — the band the design system calls the
 * biggest moment — handing every user the payoff before their first match and
 * leaving three bands reachable only by losing. Starting at Treeline also puts
 * the first threshold crossing (Ridge, 1100) about half a logit away, and first
 * crossings are the highest-leverage retention events in a rating system.
 */
/**
 * ── THE 0–10,000 SCALE, AND WHY THE WIDE RANGE IS SAFE ──────────────────────
 *
 * A fresh account displays 1000. The summit sits near 10,000.
 *
 *   display = 1000 + 1250 * theta
 *
 * Chess tops out near 3000, which makes the top of a ladder feel like a number
 * rather than a summit. The span here is chosen so the distance from a first
 * match to the top reads as a real climb.
 *
 * WHY 1250 PER LOGIT. A learner population is genuinely wide: absolute beginner
 * to native is roughly 7 logits of ability, far wider than the spread among
 * chess players, who are all already chess players. Mapping that onto 0–10,000:
 *
 *   theta  0.0  ->  1000   a new account
 *   theta  0.64 ->  1800   Ridge, the first threshold crossing
 *   theta  7.2  -> 10,000  the summit
 *   theta -0.8  ->     0   the floor; you can fall, and not far
 *
 * WHY THE SWINGS DO NOT GET WORSE, which is the objection to a wide scale.
 * A match moves theta by at most K, and `learnerK` starts at aUser = 1.0, so a
 * first match can move 1250 points. That looks enormous until it is taken as a
 * share of the range:
 *
 *   before   400 points against a 900–2100 practical range   ~33% of the span
 *   after   1250 points against a 1000–10,000 range          ~12.5% of the span
 *
 * The number moves in larger steps and the ladder is proportionally CALMER,
 * because K decays with games played while the span stays fixed. A settled
 * player at n = 100 has K ≈ 0.167, or about 210 points.
 *
 * ── SINGLE SOURCE OF TRUTH ──────────────────────────────────────────────────
 * These two constants are duplicated in exactly one other place: the
 * `generated always as (...)` expressions on `user_ratings.rating` and
 * `peak_rating`. Postgres cannot call TypeScript, so the formula is written
 * twice. CHANGE BOTH TOGETHER. `display-scale.test.ts` reads the migration file
 * and fails on a one-sided edit, which exists because this code once carried
 * three inconsistent formulas at once and the same player showed different
 * ratings on different screens.
 */
export const DISPLAY_INIT = 1000;
export const DISPLAY_SCALE = 1250;

export const toDisplayScale = (
  logit: number,
  scale = DISPLAY_SCALE,
  init = DISPLAY_INIT,
): number => init + scale * logit;

export const fromDisplayScale = (
  display: number,
  scale = DISPLAY_SCALE,
  init = DISPLAY_INIT,
): number => (display - init) / scale;
