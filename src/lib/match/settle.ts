/**
 * Settlement — the back half of the match pipeline: apply a stored verdict.
 *
 * This module is where a rating actually moves, which makes it the highest-stakes
 * code in the project. `src/lib/match/contract.ts` is the authority; every
 * invariant in `SETTLEMENT_INVARIANTS` is enforced here, and the constant is read
 * at runtime rather than paraphrased in a comment so the two cannot drift.
 *
 * ## Idempotency, in order of the layers
 *
 * 1. The SETTLEMENT CLAIM: `update matches set status='complete' where id=$1 and
 *    status='judging'`. Zero rows affected means another worker already settled
 *    this match, and we return without touching a rating. Postgres picks the
 *    winner; there is no advisory lock and no application mutex.
 * 2. `review_log` is unique on `(card_id, review_time)` and `review_time` is the
 *    DETERMINISTIC `settledAt` the caller derived from the submissions — never
 *    `Date.now()`. A replayed settlement therefore collides on that index instead
 *    of appending a second row of training data. If `settledAt` were a wall clock
 *    read, the unique index would be decorative.
 * 3. The card advance is skipped whenever the `review_log` insert collided, so a
 *    replay cannot move FSRS state twice either.
 *
 * The claim is taken BEFORE any rating write. A crash between the claim and the
 * rating write leaves a complete match whose rating did not move — recoverable
 * from the judgment row. The opposite order risks applying a rating twice, and
 * the contract is explicit that "a rating applied twice is a corrupted ladder and
 * is not recoverable from logs".
 *
 * ## No math is re-derived here
 *
 * Rating movement comes from `src/lib/engine/elo.ts` exports only, and
 * `review_log` rows come from `src/lib/engine/scheduling.ts`'s `gradeReview`
 * record builder. Nothing in this file reimplements either.
 */

import {
  SETTLEMENT_INVARIANTS,
  isLegalTransition,
  type MatchStatus,
  type NoSettleReason,
  type ParticipantResult,
  type SettlementOutcome,
} from '@/lib/match/contract'
import {
  DEFAULT_ELO,
  expectedCorrect,
  learnerK,
  newLearnerRating,
  toDisplayScale,
  updateLearnerOnly,
  type EloConfig,
  type LearnerRating,
} from '@/lib/engine/elo'
import {
  Rating,
  fromCardState,
  gradeReview,
  makeScheduler,
  newCard,
  toCardState,
  type CardState,
  type Grade,
  type ReviewLogRow,
} from '@/lib/engine/scheduling'
import {
  assertJudgeCalibrated,
  JudgeNotCalibrated,
  type CalibrationReport,
} from '@/lib/judge/calibration'
import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

export class IllegalMatchTransition extends Error {
  constructor(
    readonly from: MatchStatus,
    readonly to: MatchStatus,
  ) {
    super(`Illegal match transition ${from} -> ${to}. This is a bug, not a retry.`)
    this.name = 'IllegalMatchTransition'
  }
}

/**
 * Validate before EVERY status write. `isLegalTransition` returning false means a
 * code path invented a transition, which must fail loudly rather than be retried.
 */
export function assertTransition(from: MatchStatus, to: MatchStatus): void {
  if (!isLegalTransition(from, to)) throw new IllegalMatchTransition(from, to)
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

/** Aggregated judge outcome expressed in seats: `'a'` is seat 1, `'b'` is seat 2. */
export type SeatOutcome = 'a' | 'b' | 'draw'

export interface SeatRef {
  seat: 1 | 2
  /** null for a bot seat. A bot seat has no rating and no FSRS card. */
  userId: string | null
  isBot: boolean
  /**
   * IANA zone captured on this seat's submission. `review_log.tz` is NOT NULL and
   * must be the zone in effect AT REVIEW TIME, so it comes off the submission and
   * not off the profile's current zone.
   */
  tz: string | null
}

/**
 * Everything settlement needs, and deliberately nothing more.
 *
 * There is NO `thetaBefore` field, and there never may be one. Invariant 4:
 * `theta_before` is read server-side inside the settlement path from
 * `SettleStore.readRating`. A client-supplied rating is not an input to this
 * module at any depth.
 */
export interface SettlementInput {
  matchId: string
  worldSlug: string
  ladderSlug: string
  /** `matches.is_rated`. Read from the row, not from the request. */
  isRated: boolean
  /** True only when both position orderings agreed. */
  consistent: boolean
  outcome: SeatOutcome
  /** `matches.item_id`. Null means there is no card to log a review against. */
  itemId: number | null
  /**
   * The settlement instant. MUST be deterministic for a given match — the caller
   * derives it from the submissions (which are append-only), never from a clock.
   * This is what makes the `review_log` unique index a real replay guard.
   */
  settledAt: Date
  seats: readonly SeatRef[]
}

export interface ParticipantPatch {
  result: ParticipantResult
  thetaBefore?: number
  thetaAfter?: number
  ratingBefore?: number
  ratingAfter?: number
}

/**
 * The database port. Every method is one statement; the adapter lives at the
 * bottom of this file so the logic above is unit-testable with no Postgres.
 */
export interface SettleStore {
  /**
   * The settlement claim: `judging -> complete`, conditional on the current
   * status still being `judging`. Returns false when zero rows were affected.
   */
  claimSettlement(matchId: string, resolvedAt: Date): Promise<boolean>

  setParticipantResult(matchId: string, seat: 1 | 2, patch: ParticipantPatch): Promise<void>

  /** Invariant 4: the ONLY source of `theta_before`. */
  readRating(
    userId: string,
    worldSlug: string,
    ladderSlug: string,
  ): Promise<LearnerRating | null>

  writeRating(
    userId: string,
    worldSlug: string,
    ladderSlug: string,
    next: LearnerRating,
    uncertainty: number,
    playedAt: Date,
  ): Promise<void>

  /** Upserts an empty FSRS card when the user has never seen this item. */
  ensureCard(
    userId: string,
    itemId: number,
    createdAt: Date,
  ): Promise<{ cardId: string; card: CardState }>

  writeCard(cardId: string, card: CardState): Promise<void>

  /** Provenance for `review_log.params_id`. Null falls back to the global default. */
  readActiveFsrsParams(
    userId: string,
  ): Promise<{ id: string; w: readonly number[]; requestRetention?: number } | null>

  /**
   * Append-only. Returns `{ inserted: false }` when the unique
   * `(card_id, review_time)` index rejected the row — i.e. this is a replay.
   */
  appendReviewLog(row: ReviewLogRow): Promise<{ inserted: boolean }>
}

export interface SettleOptions {
  eloConfig?: EloConfig
  /**
   * Cohen's kappa for the ACTIVE judge configuration. When supplied and the match
   * would move a rating, `assertJudgeCalibrated` runs first and a failing gate
   * throws `JudgeNotCalibrated` before anything is claimed or written.
   */
  calibration?: CalibrationReport
  /**
   * Judge and settle, but move no rating.
   *
   * The bootstrapping escape hatch: 100 gold labels cannot exist before any
   * match has been played, so a strict gate would block the very first player.
   * The resolution is to keep playing and stop rating, never to weaken the gate.
   * Set from `resolveCalibrationGate()` when it returns `uncalibrated_unrated`.
   */
  forceUnrated?: { reason: string }
  /** `card.day_cutoff_hour` equivalent. Matches the schema default. */
  dayCutoffHour?: number
  requestRetention?: number
}

/** Matches `review_log.day_cutoff_hour`'s schema default. */
export const DEFAULT_DAY_CUTOFF_HOUR = 4
/** `review_log.tz` is NOT NULL; a submission without a client zone falls back here. */
export const FALLBACK_TZ = 'UTC'

// ---------------------------------------------------------------------------
// Result mapping
// ---------------------------------------------------------------------------

export function seatResult(outcome: SeatOutcome, seat: 1 | 2): ParticipantResult {
  if (outcome === 'draw') return 'draw'
  const seatWon = (outcome === 'a' && seat === 1) || (outcome === 'b' && seat === 2)
  return seatWon ? 'win' : 'loss'
}

/**
 * Chatbot Arena convention, and the same convention `judgments.outcome_seat1`
 * encodes: a draw is half a win plus half a loss.
 */
export function seatScore(result: ParticipantResult): number {
  if (result === 'win') return 1
  if (result === 'loss') return 0
  return 0.5
}

/**
 * A match result as an FSRS grade.
 *
 * `Rating.Easy` is deliberately unreachable: winning a comparative match against
 * another human is evidence of relative quality, never evidence that recall was
 * effortless, and Easy inflates the interval hard.
 */
export function resultToGrade(result: ParticipantResult): Grade {
  if (result === 'win') return Rating.Good
  if (result === 'draw') return Rating.Hard
  return Rating.Again
}

/**
 * One seat's new ability.
 *
 * Win and loss delegate verbatim to `updateLearnerOnly` — the existing export —
 * with the OPPONENT'S pre-match theta standing in as the difficulty term, which
 * is the two-sided Rasch update from `elo.ts` applied head-to-head.
 *
 * A draw is the one case that export cannot express: its signature takes
 * `correct: boolean`, and a draw is a score of 0.5. So the half-credit case is
 * composed from the two exports `updateLearnerOnly` is itself built from,
 * `learnerK` and `expectedCorrect`, with 0.5 substituted for the observation.
 * `settle.test.ts` pins this against `updateLearnerOnly` at scores 0 and 1, so the
 * two can never drift.
 */
export function nextRating(
  rating: LearnerRating,
  opponentTheta: number,
  score: number,
  cfg: EloConfig = DEFAULT_ELO,
): LearnerRating {
  if (score === 1 || score === 0) {
    return updateLearnerOnly(rating, { beta: opponentTheta, n: 0 }, score === 1, cfg).user
  }
  const predicted = expectedCorrect(rating.theta, opponentTheta, cfg.choices)
  return {
    theta: rating.theta + learnerK(rating, cfg) * (score - predicted),
    n: rating.n + 1,
  }
}

// ---------------------------------------------------------------------------
// Settlement
// ---------------------------------------------------------------------------

function seatOf(seats: readonly SeatRef[], seat: 1 | 2): SeatRef {
  const found = seats.find((s) => s.seat === seat)
  if (!found) throw new Error(`Match is missing seat ${seat}; cannot settle.`)
  return found
}

const noSettle = (matchId: string, reason: NoSettleReason): SettlementOutcome => ({
  matchId,
  settled: false,
  reason,
})

/**
 * Apply a verdict.
 *
 * `settled: true` means AND ONLY MEANS that a rating moved. Every terminal
 * outcome that did not move a rating carries a `NoSettleReason` explaining why,
 * which is exactly what `NoSettleReason`'s doc comment defines it as.
 */
export async function settleMatch(
  input: SettlementInput,
  store: SettleStore,
  opts: SettleOptions = {},
): Promise<SettlementOutcome> {
  const cfg = opts.eloConfig ?? DEFAULT_ELO
  const seat1 = seatOf(input.seats, 1)
  const seat2 = seatOf(input.seats, 2)

  // -----------------------------------------------------------------------
  // Invariant 2 — ratings move ONLY on a position-consistent judgment.
  //
  // Disagreement between the two orderings is position bias, not a result. The
  // judgment row has already been written by the caller with
  // `verdict='unresolved'` and the generated `position_disagreement` flag set, so
  // it is queryable for human review. Here the match simply reaches `complete`
  // with both seats voided and no rating touched.
  // -----------------------------------------------------------------------
  if (SETTLEMENT_INVARIANTS.requiresConsistentJudgment && !input.consistent) {
    assertTransition('judging', 'complete')
    if (!(await store.claimSettlement(input.matchId, input.settledAt))) {
      return noSettle(input.matchId, 'already_complete')
    }
    await store.setParticipantResult(input.matchId, 1, { result: 'void' })
    await store.setParticipantResult(input.matchId, 2, { result: 'void' })
    return noSettle(input.matchId, 'position_inconsistent')
  }

  const results: Record<1 | 2, ParticipantResult> = {
    1: seatResult(input.outcome, 1),
    2: seatResult(input.outcome, 2),
  }

  // A labelled bot seat never moves a ladder: there is no opponent rating to
  // stake against. Checked before `is_rated` because it is the stronger reason.
  const hasBot = seat1.isBot || seat2.isBot
  // Invariant 3 — unrated modes (the Daily, Gauntlet) run this identical path and
  // settle without ever reaching `user_ratings`.
  const ratingsMove =
    !hasBot &&
    !opts.forceUnrated &&
    (SETTLEMENT_INVARIANTS.respectsIsRated ? input.isRated : true)

  // THE KAPPA GATE — FAIL CLOSED.
  //
  // Before the claim, so a frozen judge configuration cannot even mark the match
  // complete. Deliberately throws — see `calibration.ts`.
  //
  // The absence of a report is treated as a FAILED gate, not a skipped one. The
  // earlier form of this line was `if (ratingsMove && opts.calibration)`, which
  // meant an unwired caller silently moved ratings with no calibration at all —
  // a safety check that vanishes when unconfigured, while the code still reads
  // as though ratings are protected. If you genuinely want to play before a gold
  // set exists, pass `forceUnrated`: matches still judge and still show a
  // verdict, and the ladder stays clean. See `judge/gold-set.ts`.
  if (ratingsMove) {
    if (!opts.calibration) {
      throw new JudgeNotCalibrated(
        'A rated match reached settlement with no calibration report. Ratings are ' +
          'frozen until the judge clears the kappa gate. Supply `calibration`, or ' +
          'pass `forceUnrated` to judge without moving ratings.',
      )
    }
    assertJudgeCalibrated(opts.calibration)
  }

  // -----------------------------------------------------------------------
  // Invariant 1 — the settlement claim. Exactly one worker gets past this line.
  // -----------------------------------------------------------------------
  assertTransition('judging', 'complete')
  if (!(await store.claimSettlement(input.matchId, input.settledAt))) {
    return noSettle(input.matchId, 'already_complete')
  }

  // -----------------------------------------------------------------------
  // Invariant 4 — theta_before is read here, server-side, and BOTH seats are read
  // before either is written so seat 2's update cannot see seat 1's new value.
  // -----------------------------------------------------------------------
  const before = new Map<1 | 2, LearnerRating>()
  for (const seat of [seat1, seat2]) {
    if (!seat.userId) continue
    const stored = await store.readRating(seat.userId, input.worldSlug, input.ladderSlug)
    before.set(seat.seat, stored ?? newLearnerRating())
  }

  const ratingChanges: {
    userId: string
    seat: 1 | 2
    thetaBefore: number
    thetaAfter: number
    result: ParticipantResult
  }[] = []

  for (const seat of [seat1, seat2]) {
    const result = results[seat.seat]

    if (!seat.userId) {
      // Bot seat: a result for the record, nothing else. No rating, no card.
      await store.setParticipantResult(input.matchId, seat.seat, { result })
      continue
    }

    const rating = before.get(seat.seat)!

    if (!ratingsMove) {
      // theta_after === theta_before, so the GENERATED `rating_delta` column
      // evaluates to exactly 0 — an explicit "this match moved nothing" audit row
      // rather than a null nobody can interpret later.
      await store.setParticipantResult(input.matchId, seat.seat, {
        result,
        thetaBefore: rating.theta,
        thetaAfter: rating.theta,
        ratingBefore: toDisplayScale(rating.theta),
        ratingAfter: toDisplayScale(rating.theta),
      })
      continue
    }

    const opponentSeat: 1 | 2 = seat.seat === 1 ? 2 : 1
    const opponent = before.get(opponentSeat)
    if (!opponent) {
      throw new Error(
        `Rated match ${input.matchId} seat ${seat.seat} has no opponent rating to stake against.`,
      )
    }

    const next = nextRating(rating, opponent.theta, seatScore(result), cfg)

    await store.writeRating(
      seat.userId,
      input.worldSlug,
      input.ladderSlug,
      next,
      // `uncertainty` on user_ratings IS the current dynamic-K step size.
      learnerK(next, cfg),
      input.settledAt,
    )
    await store.setParticipantResult(input.matchId, seat.seat, {
      result,
      thetaBefore: rating.theta,
      thetaAfter: next.theta,
      ratingBefore: toDisplayScale(rating.theta),
      ratingAfter: toDisplayScale(next.theta),
      // `rating_delta` is GENERATED ALWAYS AS (rating_after - rating_before).
      // Never written here; Postgres owns it.
    })

    ratingChanges.push({
      userId: seat.userId,
      seat: seat.seat,
      thetaBefore: rating.theta,
      thetaAfter: next.theta,
      result,
    })
  }

  // -----------------------------------------------------------------------
  // Invariant 5 — review_log. Written for every human seat regardless of
  // `is_rated`: an unrated mode is still practice, and the log is the asset.
  // -----------------------------------------------------------------------
  if (input.itemId !== null) {
    for (const seat of [seat1, seat2]) {
      if (!seat.userId) continue
      await appendReview(input, store, seat, results[seat.seat], opts)
    }
  }

  if (!ratingsMove) {
    return noSettle(input.matchId, hasBot ? 'bot_opponent_unrated' : 'unrated_match')
  }

  return { matchId: input.matchId, settled: true, ratingChanges }
}

/**
 * One `review_log` row, built by `scheduling.ts`'s `gradeReview` record builder.
 *
 * The row shape is never hand-rolled here; `gradeReview` owns it, including the
 * pre-review-snapshot semantics of ts-fsrs's `ReviewLog` that the field names
 * actively mislead about.
 */
async function appendReview(
  input: SettlementInput,
  store: SettleStore,
  seat: SeatRef,
  result: ParticipantResult,
  opts: SettleOptions,
): Promise<void> {
  const userId = seat.userId!
  const itemId = input.itemId!

  const params = await store.readActiveFsrsParams(userId)
  const scheduler = makeScheduler({
    w: params?.w,
    requestRetention: opts.requestRetention ?? params?.requestRetention,
  })

  const existing = await store.ensureCard(userId, itemId, input.settledAt)

  const { card, reviewLogRow } = gradeReview(
    fromCardState(existing.card),
    resultToGrade(result),
    // `settledAt`, not a clock: `review_time` is the replay-collision key.
    input.settledAt,
    {
      cardId: existing.cardId,
      userId,
      durationMs: 0,
      tz: seat.tz ?? FALLBACK_TZ,
      dayCutoffHour: opts.dayCutoffHour ?? DEFAULT_DAY_CUTOFF_HOUR,
      paramsId: params?.id ?? null,
    },
    scheduler,
  )

  const { inserted } = await store.appendReviewLog(reviewLogRow)
  // A collision on (card_id, review_time) means this settlement already ran.
  // Skipping the card advance is what keeps FSRS state from moving twice.
  if (inserted) await store.writeCard(existing.cardId, card)
}

// ---------------------------------------------------------------------------
// Supabase adapter
//
// Constructed lazily so importing this module never requires env vars — the unit
// tests drive `settleMatch` against a fake `SettleStore` and never reach here.
// ---------------------------------------------------------------------------

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = '23505'

export function createSupabaseSettleStore(): SettleStore {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  )

  return {
    async claimSettlement(matchId, resolvedAt) {
      const { data, error } = await db
        .from('matches')
        .update({ status: 'complete', resolved_at: resolvedAt.toISOString() })
        .eq('id', matchId)
        // THE CLAIM. Without this predicate the update is not idempotent.
        .eq('status', 'judging')
        .select('id')
      if (error) throw error
      return (data?.length ?? 0) > 0
    },

    async setParticipantResult(matchId, seat, patch) {
      const { error } = await db
        .from('match_participants')
        .update({
          result: patch.result,
          theta_before: patch.thetaBefore ?? null,
          theta_after: patch.thetaAfter ?? null,
          rating_before: patch.ratingBefore ?? null,
          rating_after: patch.ratingAfter ?? null,
          // rating_delta is GENERATED. Writing it is an error, not an option.
        })
        .eq('match_id', matchId)
        .eq('seat', seat)
      if (error) throw error
    },

    async readRating(userId, worldSlug, ladderSlug) {
      const { data, error } = await db
        .from('user_ratings')
        .select('theta, games_played')
        .eq('user_id', userId)
        .eq('world_slug', worldSlug)
        .eq('ladder_slug', ladderSlug)
        .maybeSingle()
      if (error) throw error
      return data ? { theta: data.theta as number, n: data.games_played as number } : null
    },

    async writeRating(userId, worldSlug, ladderSlug, next, uncertainty, playedAt) {
      const { error } = await db.from('user_ratings').upsert(
        {
          user_id: userId,
          world_slug: worldSlug,
          ladder_slug: ladderSlug,
          theta: next.theta,
          games_played: next.n,
          uncertainty,
          last_played_at: playedAt.toISOString(),
          // `rating` and `peak_rating` are GENERATED; `peak_theta` is raised by the
          // enforce_peak_monotonic trigger. None of the three are written here.
        },
        { onConflict: 'user_id,world_slug,ladder_slug' },
      )
      if (error) throw error
    },

    async ensureCard(userId, itemId, createdAt) {
      const { data, error } = await db
        .from('card')
        .select('id, due, stability, difficulty, scheduled_days, learning_steps, reps, lapses, state, last_review')
        .eq('user_id', userId)
        .eq('item_id', itemId)
        .maybeSingle()
      if (error) throw error

      if (data) {
        return {
          cardId: String(data.id),
          card: {
            due: new Date(data.due as string),
            stability: data.stability as number,
            difficulty: data.difficulty as number,
            scheduled_days: data.scheduled_days as number,
            learning_steps: data.learning_steps as number,
            reps: data.reps as number,
            lapses: data.lapses as number,
            state: data.state as CardState['state'],
            last_review: data.last_review ? new Date(data.last_review as string) : null,
          },
        }
      }

      const fresh = toCardState(newCard(createdAt))
      const { data: created, error: insertError } = await db
        .from('card')
        .upsert(
          { user_id: userId, item_id: itemId, ...serializeCard(fresh) },
          { onConflict: 'user_id,item_id' },
        )
        .select('id')
        .single()
      if (insertError) throw insertError
      return { cardId: String(created.id), card: fresh }
    },

    async writeCard(cardId, card) {
      const { error } = await db.from('card').update(serializeCard(card)).eq('id', cardId)
      if (error) throw error
    },

    async readActiveFsrsParams(userId) {
      // The user's own active set if one has been trained, else the global default.
      const { data, error } = await db
        .from('fsrs_params')
        .select('id, w, user_id')
        .eq('is_active', true)
        .or(`user_id.eq.${userId},user_id.is.null`)
        // A non-null user_id sorts first under `nullsFirst: false`, so the
        // per-user set wins over the global default.
        .order('user_id', { ascending: false, nullsFirst: false })
        .limit(1)
      if (error) throw error
      const row = data?.[0]
      if (!row) return null
      // `request_retention` is deliberately absent: `fsrs_params` stores `w` but
      // not the retention target, so `makeScheduler` applies its validated
      // default. Do not invent a value here.
      return { id: String(row.id), w: row.w as number[] }
    },

    async appendReviewLog(row) {
      const { error } = await db.from('review_log').insert({
        user_id: row.user_id,
        card_id: Number(row.card_id),
        review_time: row.review_time.toISOString(),
        review_rating: row.review_rating,
        review_state: row.review_state,
        review_duration: row.review_duration,
        tz: row.tz,
        day_cutoff_hour: row.day_cutoff_hour,
        state_before: row.state_before,
        stability_before: row.stability_before,
        difficulty_before: row.difficulty_before,
        scheduled_days_before: row.scheduled_days_before,
        learning_steps_before: row.learning_steps_before,
        due_before: row.due_before.toISOString(),
        fsrs_version: row.fsrs_version,
        params_id: row.params_id === null ? null : Number(row.params_id),
        request_retention: row.request_retention,
        is_manual: row.is_manual,
        is_cram: row.is_cram,
        elapsed_days: row.elapsed_days,
      })
      // The unique (card_id, review_time) index IS the replay guard. A collision
      // is the expected, correct outcome of a replay — not an error to surface.
      if (error) {
        if (error.code === UNIQUE_VIOLATION) return { inserted: false }
        throw error
      }
      return { inserted: true }
    },
  }
}

function serializeCard(card: CardState) {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  }
}
