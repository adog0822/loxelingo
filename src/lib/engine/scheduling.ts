/**
 * scheduling — a thin, pure wrapper over `ts-fsrs` (5.4.1 = FSRS-6, 21 parameters).
 *
 * Implements `docs/research/03-learning-libs.md` §2, §4.7 and §6.
 *
 * Three jobs and no others:
 *   1. build a scheduler with a validated `request_retention` (§2.7 — the knob is called
 *      `request_retention` in ts-fsrs, NOT `desired_retention`; that spelling belongs to
 *      `fsrs-rs`/`fsrs-browser`);
 *   2. apply one grade and return the new card state;
 *   3. produce the append-only `review_log` row that §4.7's table expects.
 *
 * Deliberately absent: `delta_t`. §4.3 is unambiguous that `delta_t` is a calendar-day
 * difference under the user's IANA zone and day-cutoff hour, both of which can change
 * retroactively, so it must be derived at training time from absolute instants. We persist the
 * instant, the zone and the cutoff; `delta-t.ts` derives the rest. (`elapsed_days` below is
 * ts-fsrs's own pre-review scalar, kept because §4.7 lists it, and it is audit-only.)
 *
 * Pure apart from the caller-supplied `now`: no I/O, no database, no `Date.now()`.
 */

import {
  createEmptyCard,
  default_w,
  forgetting_curve,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card,
  type FSRSParameters,
  type Grade,
  type FSRS,
} from 'ts-fsrs';

export { Rating, State };
export type { Card, Grade };

/** §2.2: FSRS-6 has 21 parameters. Verified three independent ways in §2.2. */
export const FSRS6_PARAM_COUNT = 21;

/** §2.7 verified default. */
export const DEFAULT_REQUEST_RETENTION = 0.9;

/**
 * §2.7 measured a 39x interval swing across `request_retention` 0.70 -> 0.97, so a client
 * sending 0.5 would effectively disable review. Validate server-side, always.
 */
export const REQUEST_RETENTION_RANGE = { min: 0.7, max: 0.98 } as const;

export class SchedulingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchedulingError';
  }
}

export type SchedulerOptions = {
  /** The single user-facing knob. Clamped to `REQUEST_RETENTION_RANGE`. */
  requestRetention?: number;
  /** 21 floats from `fsrs_params.w`; defaults to ts-fsrs's FSRS-6 defaults. */
  w?: readonly number[];
  enableFuzz?: boolean;
  enableShortTerm?: boolean;
  maximumInterval?: number;
  learningSteps?: FSRSParameters['learning_steps'];
  relearningSteps?: FSRSParameters['relearning_steps'];
};

/** Reject out-of-range retention loudly rather than silently clamping a hostile input. */
export function assertRequestRetention(value: number): number {
  if (!Number.isFinite(value) || value < REQUEST_RETENTION_RANGE.min || value > REQUEST_RETENTION_RANGE.max) {
    throw new SchedulingError(
      `request_retention must be within [${REQUEST_RETENTION_RANGE.min}, ${REQUEST_RETENTION_RANGE.max}], got ${value}`,
    );
  }
  return value;
}

/** Reject a `w` array that isn't FSRS-6 shaped before it reaches the scheduler. */
export function assertParameterVector(w: readonly number[]): readonly number[] {
  if (w.length !== FSRS6_PARAM_COUNT) {
    throw new SchedulingError(`FSRS-6 requires exactly ${FSRS6_PARAM_COUNT} parameters, got ${w.length}`);
  }
  for (let i = 0; i < w.length; i++) {
    if (!Number.isFinite(w[i])) throw new SchedulingError(`FSRS parameter w[${i}] is not finite: ${w[i]}`);
  }
  return w;
}

/** Fully-resolved FSRS parameters, suitable for persisting alongside the reviews they produced. */
export function resolveParameters(opts: SchedulerOptions = {}): FSRSParameters {
  return generatorParameters({
    request_retention: assertRequestRetention(opts.requestRetention ?? DEFAULT_REQUEST_RETENTION),
    w: assertParameterVector(opts.w ?? default_w),
    // §6: fuzz on, so cohorts of cards created together don't pile onto one review day.
    enable_fuzz: opts.enableFuzz ?? true,
    enable_short_term: opts.enableShortTerm ?? true,
    maximum_interval: opts.maximumInterval ?? 36500,
    learning_steps: opts.learningSteps ?? ['1m', '10m'],
    relearning_steps: opts.relearningSteps ?? ['10m'],
  });
}

export function makeScheduler(opts: SchedulerOptions = {}): FSRS {
  return fsrs(resolveParameters(opts));
}

/** A brand-new card. §2.4: `last_review` is absent (not null) until the first review. */
export const newCard = (now: Date): Card => createEmptyCard(now);

/**
 * The persistable card columns. §2.4 flags `learning_steps` and `scheduled_days` as the two
 * fields that are easy to miss and that the scheduler loses its place without.
 */
export type CardState = {
  due: Date;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: State;
  last_review: Date | null;
};

export const toCardState = (card: Card): CardState => ({
  due: card.due,
  stability: card.stability,
  difficulty: card.difficulty,
  scheduled_days: card.scheduled_days,
  learning_steps: card.learning_steps,
  reps: card.reps,
  lapses: card.lapses,
  state: card.state,
  last_review: card.last_review ?? null,
});

/**
 * Rehydrate a stored card into the shape `ts-fsrs` wants.
 *
 * `Card.elapsed_days` is required by the interface but is deprecated and removed in 6.0.0 (§2.4);
 * the scheduler derives the real elapsed time from `last_review` and `now`, so 0 is the correct
 * value to supply here. Do not add a column for it.
 */
export function fromCardState(stored: CardState): Card {
  return {
    due: stored.due,
    stability: stored.stability,
    difficulty: stored.difficulty,
    elapsed_days: 0,
    scheduled_days: stored.scheduled_days,
    learning_steps: stored.learning_steps,
    reps: stored.reps,
    lapses: stored.lapses,
    state: stored.state,
    ...(stored.last_review ? { last_review: stored.last_review } : {}),
  };
}

export type ReviewContext = {
  cardId: string;
  userId: string;
  /** Milliseconds the learner spent answering. §4.2's `review_duration`. */
  durationMs: number;
  /** IANA zone in effect AT REVIEW TIME (§4.3). */
  tz: string;
  /** Anki's "next day starts at" (§4.3). */
  dayCutoffHour: number;
  /** FK into `fsrs_params`; §4.7 explains why every review row needs it. */
  paramsId: string | null;
  isManual?: boolean;
  isCram?: boolean;
};

/**
 * Exactly the columns of §4.7's `review_log` table, minus `id`/`created_at` (database-assigned).
 *
 * There is intentionally no `delta_t` field. See the module docstring.
 */
export type ReviewLogRow = {
  user_id: string;
  card_id: string;

  // the five canonical FSRS columns (§4.2)
  review_time: Date;
  review_rating: number;
  review_state: number;
  review_duration: number;

  // needed to compute delta_t correctly at training time (§4.3)
  tz: string;
  day_cutoff_hour: number;

  // derived pre-review state, for serving + debugging; NOT training input (§4.1)
  state_before: number;
  stability_before: number | null;
  difficulty_before: number | null;
  scheduled_days_before: number;
  learning_steps_before: number;
  due_before: Date;

  // provenance
  fsrs_version: string;
  params_id: string | null;
  request_retention: number;

  // flags so §4.5's training filters can be reconstructed
  is_manual: boolean;
  is_cram: boolean;
  /** ts-fsrs's own pre-review elapsed scalar. Audit only — never used as `delta_t`. */
  elapsed_days: number;
};

export type GradeResult = {
  card: CardState;
  reviewLogRow: ReviewLogRow;
};

/**
 * Apply one grade. Returns the new card state AND the append-only log row.
 *
 * §2.5, verified by execution: `ReviewLog` is the **PRE**-review snapshot — `log.stability`,
 * `log.difficulty` and `log.state` are the values *before* the update, and the post-review
 * state is in `RecordLogItem.card`. This is exactly the right shape for reconstructing training
 * data, and it is the opposite of what the field names suggest.
 */
export function gradeReview(
  stored: Card,
  grade: Grade,
  now: Date,
  ctx: ReviewContext,
  scheduler: FSRS = makeScheduler(),
): GradeResult {
  if (grade !== Rating.Again && grade !== Rating.Hard && grade !== Rating.Good && grade !== Rating.Easy) {
    throw new SchedulingError(`grade must be 1..4 (Again..Easy); Rating.Manual is not gradeable. Got ${grade}`);
  }
  const { card, log } = scheduler.next(stored, now, grade);

  return {
    card: toCardState(card),
    reviewLogRow: {
      user_id: ctx.userId,
      card_id: ctx.cardId,

      review_time: log.review,
      review_rating: log.rating,
      review_state: log.state, // state BEFORE this review
      review_duration: Math.max(0, Math.round(ctx.durationMs)),

      tz: ctx.tz,
      day_cutoff_hour: ctx.dayCutoffHour,

      state_before: log.state,
      // §6: an explicit New check, because stability 0 is falsy and `|| null` would be a bug.
      stability_before: log.state === State.New ? null : log.stability,
      difficulty_before: log.state === State.New ? null : log.difficulty,
      scheduled_days_before: log.scheduled_days,
      learning_steps_before: log.learning_steps,
      due_before: log.due,

      fsrs_version: 'FSRS-6',
      params_id: ctx.paramsId,
      request_retention: scheduler.parameters.request_retention,

      is_manual: ctx.isManual ?? false,
      is_cram: ctx.isCram ?? false,
      elapsed_days: log.elapsed_days,
    },
  };
}

export type PreviewOption = {
  rating: Grade;
  label: string;
  due: Date;
  intervalDays: number;
};

/**
 * All four outcomes without committing — for rendering "1d / 3d / 8d / 20d" on the answer
 * buttons. §2.6: `repeat()` returns an object keyed '1'..'4' that is also iterable in
 * Again -> Easy order.
 */
export function previewAll(stored: Card, now: Date, scheduler: FSRS = makeScheduler()): PreviewOption[] {
  const preview = scheduler.repeat(stored, now);
  const grades: Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];
  return grades.map((g) => ({
    rating: g,
    label: Rating[g],
    due: preview[g].card.due,
    intervalDays: preview[g].card.scheduled_days,
  }));
}

/** `P(recall)` right now, for surfacing "you're at 93% on this card". */
export const retrievability = (card: Card, now: Date, scheduler: FSRS = makeScheduler()): number =>
  scheduler.get_retrievability(card, now, false);

/**
 * The FSRS-6 forgetting curve, `R(t, S) = (1 + factor * t / S) ^ decay` with `decay = -w20`.
 *
 * §2.8(a): the ts-fsrs TSDoc claims a `9*S` denominator. **It is wrong** — that is a leftover
 * from FSRS-4.5. The shipped source has no `9`, and `R(S, S) === 0.9` exactly, which is the
 * definition of stability. Trust the source, not the comments.
 */
export const recallProbability = (w: readonly number[], elapsedDays: number, stability: number): number =>
  forgetting_curve(w as number[], elapsedDays, stability);

/**
 * Mean binary cross-entropy of predicted recall vs observed (`rating > 1`).
 *
 * §5.3/§6: `fsrs-browser` does not expose `evaluate()`, so this is the substitute used to gate
 * promotion of newly-optimized parameters. Score on a **time-based** held-out slice (the most
 * recent ~20% of reviews), never a random one — `srs-benchmark` uses `TimeSeriesSplit`
 * precisely so the model is never shown future information.
 */
export function logLoss(
  samples: readonly { w: readonly number[]; elapsedDays: number; stability: number; recalled: boolean }[],
): number {
  if (samples.length === 0) throw new SchedulingError('logLoss requires at least one sample');
  const eps = 1e-15;
  let sum = 0;
  for (const s of samples) {
    const raw = recallProbability(s.w, s.elapsedDays, s.stability);
    const p = Math.min(1 - eps, Math.max(eps, raw));
    sum += -(s.recalled ? Math.log(p) : Math.log(1 - p));
  }
  return sum / samples.length;
}
