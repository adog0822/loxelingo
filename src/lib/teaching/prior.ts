/**
 * prior: the measured model prior on an item, and the rule that decides whether an item may be
 * served for teaching.
 *
 * `docs/research/06-model-prior.md` is the finding this module exists to answer. With a
 * contentless explanation the avatar answered correctly on 177 of 200 attempts, and 31 of the 40
 * forge items returned the right answer on every single vacuous attempt. An item like that cannot
 * be failed by a player, so the `taught` boolean it produces is a constant rather than a score.
 *
 * ── WHY p0 IS STORED DATA RATHER THAN A DERIVED NUMBER ──────────────────────
 * p0 is a property of an (item, prompt, model) triple, not of the item alone. The same six items
 * measured 0.333, then 0.567, then 0.400 across `ATTEMPT_PROMPT_VERSION` 2, 3 and 4. So the
 * figure has to be stored with the version and the model beside it, and
 * `supabase/migrations/20260816120000_item_prior.sql` makes that group all-present-or-all-absent.
 *
 * ── WHY ELIGIBILITY IS A CONFIDENCE BOUND AND NOT A POINT ESTIMATE ──────────
 * This is the load-bearing decision in the file. `docs/research/07-injection.md` re-measured the
 * same six items three times and found that a five-sample rate does not identify an item:
 * `ja-forge-conj-shizuka-past` came back 0/5, then 5/5, then 3/5. A point-estimate rule would
 * have called it a perfect discriminator, then dead, then marginal, on the same item and the
 * same model. Pinning a true p0 to ±0.1 needs on the order of 100 samples per item, which across
 * thousands of candidates is not affordable.
 *
 * So the rule does not try to know p0. It asks whether the EVIDENCE RULES OUT a high p0:
 *
 *   eligible  <=>  the upper bound of the 95 percent Wilson interval sits below 0.5
 *
 * That is achievable at n = 20 (4 correct out of 20 gives an upper bound of 0.416, which clears;
 * 9 out of 20 gives 0.658, which does not), it makes the sample count a tuning knob rather than a
 * correctness question, and above all it fails in the safe direction. An item near the line is
 * refused for want of evidence instead of admitted on a coin flip, and admitting a secretly-easy
 * item is the failure that destroys the mechanic, since it puts a constant back on the scored
 * surface where a score should be.
 *
 * ── WHY TWO STAGES, AND A THIRD FOR NEAR MISSES ─────────────────────────────
 * Screening thousands of candidates at n=5 and keeping everything that looks low selects partly
 * for luck. An item whose TRUE p0 is 0.9 shows 2 or fewer correct out of 5 about 0.86 percent of
 * the time, and because most items are high-p0 those false positives land in exactly the pool
 * that gets kept. So stage 1 screens at n=5 against a deliberately generous threshold and is
 * allowed to REJECT but never to accept, and stage 2 re-measures survivors on a fresh n=20 draw.
 *
 * Each stage decides on its own fresh sample and never pools with the stage that selected it.
 * Pooling would fold the selection back into the estimate, which is the bias rather than a
 * correction for it, and under a bound-based rule it would show up as an interval that is
 * narrower than the evidence supports, which is the one direction the rule must not err in.
 *
 * Pure: no I/O, no clock, no randomness. `scripts/content/measure-prior/` is the runner that
 * uses it, and `prior-sql.test.ts` pins the thresholds below against the SQL that mirrors them.
 */

/**
 * An item is eligible for teaching only while the UPPER bound of its interval is below this.
 * Read the header: the comparison is against the bound, not the point estimate.
 *
 * Mirrored by `public.teachable_max_p0()` in the migration, because Postgres cannot call
 * TypeScript. `prior-sql.test.ts` fails on a one-sided edit.
 */
export const TEACHABLE_MAX_P0 = 0.5

/** Stage 1: attempts per candidate while screening. Coarse on purpose, and cheap. */
export const PRIOR_SCREEN_SAMPLES = 5

/**
 * Stage 1 rejects anything at or above this OBSERVED rate. Deliberately well above the
 * eligibility line: the screen is a filter on cost, not a verdict. An item whose true p0 is 0.25
 * still shows 3 or more correct out of 5 about 10 percent of the time, so a tighter screen would
 * throw away one promising item in ten before it was ever measured properly.
 */
export const PRIOR_SCREEN_MAX_P0 = 0.6

/**
 * Stage 2: attempts per survivor, on a fresh draw. At n = 20 an item needs 5 or fewer correct
 * for its interval to clear the line, so this is the sample size at which the bound-based rule
 * becomes usable at all.
 */
export const PRIOR_CONFIRM_SAMPLES = 20

/**
 * Stage 3: a fresh, larger draw for near misses, meaning items whose observed rate was under the
 * line but whose interval still reached it. At n = 30 the bar loosens from 5/20 (0.25) to 9/30
 * (0.30), so a truly low-p0 item that drew unluckily at stage 2 gets a second hearing rather
 * than being discarded. Those are the items most likely to be real, and they are also the ones a
 * point-estimate rule would have accepted wrongly.
 */
export const PRIOR_RESCUE_SAMPLES = 30

/** Two-sided 95 percent normal quantile. Mirrored as a literal in the migration's `wilson_bound`. */
export const PRIOR_WILSON_Z = 1.959963984540054

export interface Interval {
  readonly low: number
  readonly high: number
}

/**
 * Wilson score interval on a binomial proportion.
 *
 * Chosen over the normal approximation because that one is worst exactly where this bank lives:
 * at 0 correct out of 20 it returns [0, 0], claiming certainty from a sample that carries none.
 * Wilson returns [0, 0.161] there, which is the honest statement and, under the rule above, the
 * difference between an item being admitted and being admitted for a reason.
 */
export function wilsonInterval(correct: number, n: number, z: number = PRIOR_WILSON_Z): Interval {
  if (!Number.isInteger(correct) || !Number.isInteger(n)) {
    throw new RangeError('wilsonInterval takes integer counts')
  }
  if (n <= 0) throw new RangeError('wilsonInterval needs at least one sample')
  if (correct < 0 || correct > n) throw new RangeError('correct must lie in [0, n]')

  const p = correct / n
  const z2 = z * z
  const denominator = 1 + z2 / n
  const centre = p + z2 / (2 * n)
  const halfWidth = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))
  return {
    low: clamp01((centre - halfWidth) / denominator),
    high: clamp01((centre + halfWidth) / denominator),
  }
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x))

/**
 * The interval implied by a stored `(prior_p0, prior_samples)` pair.
 *
 * The database keeps the bounds as generated columns so the two can never disagree; this is the
 * same arithmetic for callers holding a measurement in memory. Rounding is exact in practice
 * because p0 was computed as correct/samples in the first place.
 */
export function intervalFromRate(p0: number, samples: number): Interval {
  return wilsonInterval(Math.round(p0 * samples), samples)
}

/** The measured-prior group as it is stored on `public.items`. All present, or all absent. */
export interface MeasuredPrior {
  readonly priorP0: number
  readonly priorSamples: number
  readonly priorPromptVersion: number
  readonly priorModel: string
  /** `items.prior_p0_ci_upper`. The number the eligibility rule actually reads. */
  readonly priorP0CiUpper: number
}

/**
 * Eligibility, as one expression rather than as a convention repeated at each call site.
 *
 * `currentPromptVersion` is a parameter rather than an import so that this stays pure and so
 * that a caller measuring against an older prompt has to say so out loud. Production passes
 * `ATTEMPT_PROMPT_VERSION`, which is frozen at 4.
 */
export function isTeachable(
  prior: MeasuredPrior | null | undefined,
  currentPromptVersion: number,
): boolean {
  if (!prior) return false
  return (
    prior.priorP0CiUpper < TEACHABLE_MAX_P0 && prior.priorPromptVersion === currentPromptVersion
  )
}

/**
 * The one write rule that keeps a screening sample from ever granting eligibility.
 *
 * A stage-1 figure may be persisted, because recording that an item is dead is useful and n=5 is
 * plenty to establish "the evidence does not rule out a high p0". What it may never do is record
 * a figure that would READ as eligible. This is not hypothetical: 0 correct out of 5 has a Wilson
 * upper bound of 0.434, comfortably under the line, so without this guard a single lucky screen
 * would admit an item on five samples.
 */
export function mayPersistPrior(p0: number, samples: number): boolean {
  if (samples >= PRIOR_CONFIRM_SAMPLES) return true
  return intervalFromRate(p0, samples).high >= TEACHABLE_MAX_P0
}

/**
 * A near miss: the observed rate cleared the line but the interval did not. These are the items
 * stage 3 re-measures, and the ones a point-estimate rule would have wrongly accepted.
 */
export function isNearMiss(p0: number, samples: number): boolean {
  return p0 < TEACHABLE_MAX_P0 && intervalFromRate(p0, samples).high >= TEACHABLE_MAX_P0
}
