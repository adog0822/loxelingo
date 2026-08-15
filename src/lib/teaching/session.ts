/**
 * session — settle one teaching session: grade the attempt, move the stage, move the rating.
 *
 * The back half of the loop, and the analogue of `src/lib/match/settle.ts`. Like that module
 * it takes a result that has ALREADY been produced rather than producing one: `runAttempt`
 * does the model call, and this applies the outcome. Two consequences worth stating, because
 * both are the reason for the split:
 *
 *   * the whole of this file is testable with no network and no Postgres, and
 *   * the answer key reaches THIS function and never reaches `buildAttemptPrompt`. The two
 *     halves of the mechanic are separate functions with disjoint inputs, so there is no
 *     single place holding both the key and the prompt.
 *
 * ── THE TWO TRACKS ──────────────────────────────────────────────────────────
 * Teaching moves `user_avatars.theta`, the per-pairing number that says what the AVATAR can
 * do. It does not touch `user_ratings`, the player's PvP rating. Deliberately separate: one
 * records what you can perform under a clock against another human, the other records what
 * you could explain well enough that somebody else could do it. Collapsing them would let a
 * strong player's ladder standing be topped up by teaching, and would let a patient teacher's
 * standing be read as duelling strength.
 *
 * The rating maths is `updateLearnerOnly` from `src/lib/engine/elo.ts`, unmodified, with the
 * pairing's `lessons_taught` as the observation count that decays K. No new rating maths is
 * derived here: the avatar is a learner and the task is an item, which is the shape that
 * export already has.
 *
 * ── THE KAPPA GATE ──────────────────────────────────────────────────────────
 * `TEACHING_RESPECTS_CALIBRATION_GATE`. Teaching is a SECOND scored surface reading the same
 * ladder machinery, so it inherits the gate rather than working around it. The gate is
 * evaluated by calling `assertJudgeCalibrated`, the same function the match loop calls; the
 * threshold is not restated here and cannot drift from it.
 *
 * Where this differs from `settleMatch`: that function THROWS when a rated match reaches
 * settlement without a report, because a match that cannot be rated should not silently
 * complete. A teaching session with a frozen rating is still a complete, useful session: the
 * avatar attempted, the player saw the specific failure, the stage moved. So the gate returns
 * `noSettleReason: 'not_calibrated'` and withholds exactly one write, the one to `theta`.
 * Fail-closed is preserved: an ABSENT report is a failed gate, not a skipped one.
 *
 * ── WHAT STILL MOVES WHILE THE GATE HOLDS ───────────────────────────────────
 * The stage, and `lessons_taught`. The contract types this: `thetaBefore` and `thetaAfter` are
 * `number | null` and documented as null while ratings are frozen, while `stageBefore` and
 * `stageAfter` are not nullable. The stage is feedback and the theta is the rating.
 * `lessons_taught` has to move with it, because `user_avatars_untaught_pairing_sits_at_origin`
 * requires a pairing at stage 1 with zero lessons and the stage is no longer at 1. The cost is
 * that K decays by one observation that did not move theta, which is a rounding error against
 * the alternative of a progress bar that lies.
 */
import {
  DEFAULT_ELO,
  type EloConfig,
  type LearnerRating,
  learnerK,
  updateLearnerOnly,
} from '@/lib/engine/elo'
import { assertJudgeCalibrated, type CalibrationReport } from '@/lib/judge/calibration'
import type { LadderId } from '@/lib/judge/rubric'
import type { WorldId } from '@/lib/design/worlds'
import { createClient } from '@supabase/supabase-js'
import {
  type AttemptResult,
  type NoSettleReason,
  type Stage,
  type TeachingOutcome,
  TEACHING_RESPECTS_CALIBRATION_GATE,
} from './contract'
import { type AnswerKey, isCorrectAnswer } from './answer-key'
import { applyTeachingResult, stageFromDb, stageToDb } from './stage'

export class TeachingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TeachingError'
  }
}

/**
 * One pairing's teaching progress, as `user_avatars` holds it.
 *
 * `net` is the counter `./stage.ts` documents; `stage` is derivable from it and is read
 * anyway, so a row whose two columns disagree is caught here rather than trusted.
 */
export interface TeachingPairing {
  stage: Stage
  net: number
  /** The AVATAR's ability, logit scale. NOT the player's `user_ratings.theta`. */
  theta: number
  /** `lessons_taught`. The observation count that decays K. */
  lessonsTaught: number
}

export interface TeachingSessionInput {
  /**
   * Deterministic for a given session. It is the primary key of the append-only row and the
   * first half of the replay guard, so it must be derived from the session rather than
   * generated per attempt: a retry that mints a fresh id records the same teaching twice.
   */
  sessionId: string
  userId: string
  world: WorldId
  avatarSlug: string
  ladder: LadderId
  /** `items.id` of the task the avatar attempted. */
  itemId: number
  /** `concepts.id` of what was taught. Recorded, never prompted with. */
  conceptId: number | null
  /** Exactly what the player wrote. Stored verbatim, for the same reason it is prompted verbatim. */
  explanation: string
  /** The task's difficulty, logit scale: `item_stats.beta`, else `items.cold_start_beta`, else 0. */
  itemBeta: number
  /** Option count for a closed task. Drives the guessing floor inside `expectedCorrect`. */
  choices?: number
  /**
   * The settlement instant. MUST be deterministic for a given session; it is the second half
   * of the replay guard and `teaching_sessions` is unique on (pairing, item, taught_at).
   */
  taughtAt: Date
}

/** One append-only `teaching_sessions` row. Built here, written by the store. */
export interface TeachingSessionRow {
  id: string
  userId: string
  worldSlug: WorldId
  avatarSlug: string
  ladderSlug: LadderId
  conceptId: number | null
  itemId: number
  explanation: string
  attemptAnswer: string
  attemptSaidUnderstood: boolean
  attemptRemark: string
  wasCorrect: boolean
  stageBefore: number
  stageAfter: number
  netBefore: number
  netAfter: number
  /** Null exactly when the gate withheld the rating write. */
  thetaBefore: number | null
  thetaAfter: number | null
  noSettleReason: NoSettleReason | null
  teachingModel: string
  teachingModelVersion: string
  attemptConfigVersion: number
  taughtAt: Date
}

export interface TeachingStore {
  readPairing(
    userId: string,
    world: WorldId,
    avatarSlug: string,
  ): Promise<TeachingPairing | null>

  /**
   * THE CLAIM. Append-only insert. Returns false when the row already existed, which is the
   * expected and correct outcome of a replay rather than an error to surface.
   */
  recordSession(row: TeachingSessionRow): Promise<boolean>

  writePairing(
    userId: string,
    world: WorldId,
    avatarSlug: string,
    next: {
      stage: number
      net: number
      theta: number
      lessonsTaught: number
      lastTaughtAt: Date
    },
  ): Promise<void>
}

export interface SettleTeachingOptions {
  /**
   * Cohen's kappa for the ACTIVE attempt configuration. Absent means frozen: a gate that
   * vanishes when unconfigured is not a gate. See `settleMatch` for the same note.
   */
  calibration?: CalibrationReport
  eloConfig?: EloConfig
}

/** The model provenance carried onto the session row. From `attemptConfig()`. */
export interface AttemptProvenance {
  model: string
  modelVersion: string
  promptVersion: number
}

/** True when the active configuration may move `user_avatars.theta`. */
export function teachingRatingsMove(calibration?: CalibrationReport): boolean {
  if (!TEACHING_RESPECTS_CALIBRATION_GATE) return true
  if (!calibration) return false
  try {
    assertJudgeCalibrated(calibration)
    return true
  } catch {
    return false
  }
}

const noSettle = (
  sessionId: string,
  reason: NoSettleReason,
  stage: Stage,
  taught: boolean,
): TeachingOutcome => ({
  sessionId,
  taught,
  stageBefore: stage,
  stageAfter: stage,
  thetaBefore: null,
  thetaAfter: null,
  noSettleReason: reason,
})

/**
 * Apply one attempt.
 *
 * `attempt` is null when no attempt was produced: the model call failed, or was never made.
 * That is `attempt_failed`, and it settles nothing. An outage is not a miss, and charging a
 * player a third of a stage for one would be indistinguishable, session by session, from
 * having taught badly.
 */
export async function settleTeachingSession(
  input: TeachingSessionInput,
  attempt: AttemptResult | null,
  answerKey: AnswerKey,
  provenance: AttemptProvenance,
  store: TeachingStore,
  opts: SettleTeachingOptions = {},
): Promise<TeachingOutcome> {
  const cfg = opts.eloConfig ?? DEFAULT_ELO

  const pairing = await store.readPairing(input.userId, input.world, input.avatarSlug)
  if (!pairing) {
    throw new TeachingError(
      `no pairing for user ${input.userId} in world ${input.world} with avatar ` +
        `${input.avatarSlug}. A pairing is created by the server action that chooses an ` +
        'avatar, which is where origin_theta is read from user_ratings.',
    )
  }

  if (!input.explanation.trim()) {
    return noSettle(input.sessionId, 'explanation_empty', pairing.stage, false)
  }
  if (!attempt) {
    return noSettle(input.sessionId, 'attempt_failed', pairing.stage, false)
  }

  // The score. `attempt.saidItUnderstood` is not consulted and never will be: a low-candour
  // avatar is expected to misreport it, and that is the axis, not a defect.
  const taught = isCorrectAnswer(answerKey, attempt.answer)

  const move = applyTeachingResult(pairing.net, taught)
  if (move.stageBefore !== pairing.stage) {
    throw new TeachingError(
      `user_avatars row for ${input.avatarSlug} has stage ${pairing.stage} and teaching_net ` +
        `${pairing.net}, which reads as ${move.stageBefore}. The user_avatars_stage_matches_net ` +
        'CHECK should have made this unreachable.',
    )
  }

  const ratingsMove = teachingRatingsMove(opts.calibration)

  const before: LearnerRating = { theta: pairing.theta, n: pairing.lessonsTaught }
  const after = ratingsMove
    ? updateLearnerOnly(before, { beta: input.itemBeta, n: 0 }, taught, {
        ...cfg,
        choices: input.choices,
      }).user
    : { theta: before.theta, n: before.n + 1 }

  const reason: NoSettleReason | null = ratingsMove ? null : 'not_calibrated'

  const row: TeachingSessionRow = {
    id: input.sessionId,
    userId: input.userId,
    worldSlug: input.world,
    avatarSlug: input.avatarSlug,
    ladderSlug: input.ladder,
    conceptId: input.conceptId,
    itemId: input.itemId,
    explanation: input.explanation,
    attemptAnswer: attempt.answer,
    attemptSaidUnderstood: attempt.saidItUnderstood,
    attemptRemark: attempt.remark,
    wasCorrect: taught,
    stageBefore: stageToDb(move.stageBefore),
    stageAfter: stageToDb(move.stageAfter),
    netBefore: move.netBefore,
    netAfter: move.netAfter,
    thetaBefore: ratingsMove ? before.theta : null,
    thetaAfter: ratingsMove ? after.theta : null,
    noSettleReason: reason,
    teachingModel: provenance.model,
    teachingModelVersion: provenance.modelVersion,
    attemptConfigVersion: provenance.promptVersion,
    taughtAt: input.taughtAt,
  }

  // The claim comes BEFORE the pairing write, on the same reasoning as `settleMatch`: a crash
  // between the two leaves a recorded session whose pairing did not move, which is
  // reconstructible from the row. The opposite order can apply one teaching twice, and a
  // doubled stage step is not recoverable from anything.
  if (!(await store.recordSession(row))) {
    return noSettle(input.sessionId, 'already_settled', pairing.stage, taught)
  }

  await store.writePairing(input.userId, input.world, input.avatarSlug, {
    stage: stageToDb(move.stageAfter),
    net: move.netAfter,
    theta: after.theta,
    lessonsTaught: after.n,
    lastTaughtAt: input.taughtAt,
  })

  return {
    sessionId: input.sessionId,
    taught,
    stageBefore: move.stageBefore,
    stageAfter: move.stageAfter,
    thetaBefore: row.thetaBefore,
    thetaAfter: row.thetaAfter,
    noSettleReason: reason,
  }
}

/** The step size the pairing now moves at. Mirrors `user_ratings.uncertainty`. */
export const pairingUncertainty = (
  pairing: TeachingPairing,
  cfg: EloConfig = DEFAULT_ELO,
): number => learnerK({ theta: pairing.theta, n: pairing.lessonsTaught }, cfg)

// ---------------------------------------------------------------------------
// Supabase adapter
//
// Constructed lazily so importing this module never requires env vars. `user_avatars` and
// `teaching_sessions` have no client write path at all, so this MUST be a service-role client.
// ---------------------------------------------------------------------------

/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = '23505'

export function createSupabaseTeachingStore(): TeachingStore {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  )

  return {
    async readPairing(userId, world, avatarSlug) {
      const { data, error } = await db
        .from('user_avatars')
        .select('stage, teaching_net, theta, lessons_taught')
        .eq('user_id', userId)
        .eq('world_slug', world)
        .eq('avatar_slug', avatarSlug)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      return {
        stage: stageFromDb(data.stage as number),
        net: data.teaching_net as number,
        theta: data.theta as number,
        lessonsTaught: data.lessons_taught as number,
      }
    },

    async recordSession(row) {
      const { error } = await db.from('teaching_sessions').insert({
        id: row.id,
        user_id: row.userId,
        world_slug: row.worldSlug,
        avatar_slug: row.avatarSlug,
        ladder_slug: row.ladderSlug,
        concept_id: row.conceptId,
        item_id: row.itemId,
        explanation: row.explanation,
        attempt_answer: row.attemptAnswer,
        attempt_said_understood: row.attemptSaidUnderstood,
        attempt_remark: row.attemptRemark,
        was_correct: row.wasCorrect,
        stage_before: row.stageBefore,
        stage_after: row.stageAfter,
        net_before: row.netBefore,
        net_after: row.netAfter,
        theta_before: row.thetaBefore,
        theta_after: row.thetaAfter,
        no_settle_reason: row.noSettleReason,
        teaching_model: row.teachingModel,
        teaching_model_version: row.teachingModelVersion,
        attempt_config_version: row.attemptConfigVersion,
        taught_at: row.taughtAt.toISOString(),
      })
      // A collision on the primary key or on the (pairing, item, taught_at) index means this
      // session already settled. That is the replay path, and it is a success.
      if (error) {
        if (error.code === UNIQUE_VIOLATION) return false
        throw error
      }
      return true
    },

    async writePairing(userId, world, avatarSlug, next) {
      const { error } = await db
        .from('user_avatars')
        .update({
          stage: next.stage,
          teaching_net: next.net,
          theta: next.theta,
          lessons_taught: next.lessonsTaught,
          last_taught_at: next.lastTaughtAt.toISOString(),
        })
        .eq('user_id', userId)
        .eq('world_slug', world)
        .eq('avatar_slug', avatarSlug)
      if (error) throw error
    },
  }
}
