/**
 * The teaching loop contract.
 *
 * learn -> teach -> the avatar attempts -> settle
 *
 * This is the product's core mechanic and its scoring model, so the rules below
 * are structural rather than advisory.
 *
 * ── WHY THE AVATAR ATTEMPTS ─────────────────────────────────────────────────
 * "Scored on whether the avatar can now do the thing" is taken literally. After
 * the player explains a concept, the avatar is handed a REAL task from the item
 * bank and tries it. Whether it succeeds is the player's score.
 *
 * The alternative was asking a model to rate teaching quality directly. That was
 * rejected: it is subjective, it has no answer key to calibrate against, and the
 * kappa gate we already run would have nothing to measure agreement about. An
 * avatar attempt scores against `items.answer`, which is the same ground truth
 * the closed ladders already use.
 *
 * A second benefit falls out. A bad explanation produces a SPECIFIC failure, so
 * the player sees how they taught badly rather than being told that they did.
 * Personality shapes that: an avatar low in candour performs a confident wrong
 * answer, and one high in candour says which sentence it stopped at.
 *
 * ── THE ISOLATION RULE, WHICH IS THE WHOLE MECHANIC ─────────────────────────
 * The attempt prompt may contain ONLY:
 *   1. the avatar's personality (traits, voice guide, situation stance)
 *   2. the player's explanation, verbatim
 *   3. the task to attempt
 *
 * It may NEVER contain the answer key, the source segment the player learned
 * from, the concept name or id, worked examples, or any earlier attempt at this
 * concept. A model that sees any of those succeeds without being taught, the
 * score stops measuring teaching, and nothing errors: the loop keeps running and
 * every player looks like a good teacher.
 *
 * `AttemptInput` is shaped so the forbidden fields have nowhere to live. Do not
 * widen it. `buildAttemptPrompt` takes exactly this and nothing else.
 */
import type { Avatar, TraitVector } from '@/lib/avatars'
import type { LadderId } from '@/lib/judge/rubric'
import type { WorldId } from '@/lib/design/worlds'

/** Six stages, Novice to Expert. Progression is per (user, world, avatar). */
export const STAGES = [
  'novice',
  'apprentice',
  'journeyman',
  'practitioner',
  'adept',
  'expert',
] as const
export type Stage = (typeof STAGES)[number]

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage)
}

/**
 * What the player is handed to learn. Short by design: the brief calls for two
 * to five minutes, and the loop's pressure comes from teaching rather than from
 * volume.
 */
export interface LearnSegment {
  conceptId: string
  world: WorldId
  /** The pattern shown in use before it is named. */
  examples: readonly string[]
  /** The minimum viable explanation. One or two sentences. */
  note: string
}

/**
 * Everything the avatar is allowed to know when it attempts.
 *
 * Deliberately NOT `{ segment, item, explanation }`. The forbidden material has
 * no field here, so a leak requires editing this type, which is a reviewable act
 * rather than an accident.
 */
export interface AttemptInput {
  avatar: Avatar
  traits: TraitVector
  /** Exactly what the player wrote. Never summarised, never corrected. */
  explanation: string
  /** The task, with no answer and no concept label. */
  task: string
  /** Closed-answer options when the task has them. */
  options: readonly string[] | null
  ladder: LadderId
}

export interface AttemptResult {
  /** What the avatar produced. Scored against the item's answer key. */
  answer: string
  /**
   * The avatar's own account of how well it followed the explanation. This is
   * FLAVOUR AND FEEDBACK, never score. A low-candour avatar is expected to
   * misreport it, which is the point of that axis.
   */
  saidItUnderstood: boolean
  /** One line in character, shown to the player after the verdict. */
  remark: string
}

/** Why a session produced no rating movement. */
export type NoSettleReason =
  | 'not_calibrated'
  | 'explanation_empty'
  | 'attempt_failed'
  | 'already_settled'

export interface TeachingOutcome {
  sessionId: string
  /** True when the avatar's answer matched the key. */
  taught: boolean
  stageBefore: Stage
  stageAfter: Stage
  /** Null while the kappa gate holds ratings frozen. */
  thetaBefore: number | null
  thetaAfter: number | null
  noSettleReason: NoSettleReason | null
}

/**
 * Ratings stay frozen until the judge is calibrated, exactly as the match loop
 * does. Teaching introduces a SECOND scored surface, so it inherits the gate
 * rather than working around it: an uncalibrated scorer writing to a progression
 * ladder corrupts it silently and unrecoverably.
 */
export const TEACHING_RESPECTS_CALIBRATION_GATE = true
