/**
 * stage — Novice to Expert, and the rule that moves an avatar between them.
 *
 * ── THE RULE ────────────────────────────────────────────────────────────────
 *
 *   Three teachings that land move the avatar up a stage.
 *   One that misses takes back one of the three.
 *
 * That is the whole of it, and it is the whole of it on purpose: it has to be legible from a
 * progress bar with no manual attached. A player at "2 of 3" who then misses is at "1 of 3",
 * and nobody has to be told what happened.
 *
 * Mechanically there is ONE stored number, `net`, and the stage is a function of it:
 *
 *   net   := clamp(net + (taught ? +1 : -1), 0, NET_MAX)
 *   stage := 1 + floor(net / STEPS_PER_STAGE)
 *
 * ── WHY A COUNTER AND NOT A STREAK ──────────────────────────────────────────
 * A streak rule ("three in a row") is the obvious version and it is the one that punishes a
 * bad session hardest: a player two thirds of the way up loses everything to a single miss,
 * and the loop stops being about teaching and starts being about not risking the streak. It
 * also makes the honest move, teaching a concept you are shaky on, the expensive one. A
 * counter costs a miss exactly one third of a stage step, every time, wherever it lands.
 *
 * ── WHY REGRESSION EXISTS AT ALL, AND WHY IT IS GENTLE ──────────────────────
 * A stage that only ever rises is a record of how much a player has done, not of what their
 * avatar can do, and the contract is explicit that the avatar's ability is the score. So the
 * number falls. Three consecutive misses cost one stage, and never more than one at a time,
 * because `net` moves by one per session and a stage is three of those.
 *
 * The landing is deliberately soft. Dropping out of stage 3 puts the avatar at net 2, which is
 * the TOP of stage 2, so a single success returns it. A player who has a bad evening loses a
 * step and can take it straight back; a player who has stopped being able to explain the
 * material keeps falling.
 *
 * ── WHY net IS CAPPED ───────────────────────────────────────────────────────
 * Without `NET_MAX`, an avatar at Expert with forty successes banked could miss thirty times
 * and still read as Expert, and the top stage would stop meaning anything. The cap puts a
 * stage-6 avatar at most two successes above the stage-6 threshold, which is exactly where
 * every other stage sits. Expert is held, not owned.
 *
 * ── ON A FAILED ATTEMPT ─────────────────────────────────────────────────────
 * `net` falls by one, floored at 0. The stage falls only if that crosses a boundary. The
 * session is still recorded, the avatar still says its line, and `theta` still moves down
 * through `updateLearnerOnly` (see ./session.ts). Nothing is reset and nothing is lost beyond
 * the one step.
 *
 * ── WHERE THE NUMBER LIVES ──────────────────────────────────────────────────
 * `user_avatars.stage` already exists (smallint, 1..6). `user_avatars.teaching_net` is added
 * by the teaching_loop migration, along with a CHECK asserting `stage = 1 + teaching_net / 3`,
 * so the two cannot disagree in the database either. That CHECK and `stageFromNet` below are
 * the same expression written twice, because Postgres cannot call TypeScript; `stage.test.ts`
 * reads the migration and fails on a one-sided edit.
 *
 * Pure: no I/O, no clock, no randomness.
 */
import { STAGES, type Stage, stageIndex } from './contract'

/** Successes needed to move one stage. Also the denominator a progress readout shows. */
export const STEPS_PER_STAGE = 3

/**
 * Ceiling on the stored counter: the top of stage 6, and no higher.
 * `STEPS_PER_STAGE * STAGES.length - 1` = 17.
 */
export const NET_MAX = STEPS_PER_STAGE * STAGES.length - 1

export class StageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StageError'
  }
}

export function assertNet(net: number): void {
  if (!Number.isInteger(net) || net < 0 || net > NET_MAX) {
    throw new StageError(`teaching_net is ${String(net)}: a whole number from 0 to ${NET_MAX}`)
  }
}

/**
 * The stage this counter reads as.
 *
 * MUST MATCH the `user_avatars_stage_matches_net` CHECK in the teaching_loop migration.
 */
export function stageFromNet(net: number): Stage {
  assertNet(net)
  return STAGES[Math.floor(net / STEPS_PER_STAGE)]!
}

/** The counter an avatar sitting at the bottom of `stage` has. Used when a pairing begins. */
export function netAtStageFloor(stage: Stage): number {
  return stageIndex(stage) * STEPS_PER_STAGE
}

/**
 * `user_avatars.stage` is a smallint from 1 to 6 and `Stage` is a name. These two functions are
 * the only place the two representations meet, so nothing else has to remember the offset.
 */
export function stageToDb(stage: Stage): number {
  return stageIndex(stage) + 1
}

export function stageFromDb(value: number): Stage {
  const stage = STAGES[value - 1]
  if (!stage) {
    throw new StageError(
      `user_avatars.stage is ${String(value)} and the CHECK allows 1 to ${STAGES.length}`,
    )
  }
  return stage
}

/** How far into the current stage, as the player sees it: `progress` of `STEPS_PER_STAGE`. */
export function stageProgress(net: number): { progress: number; of: number } {
  assertNet(net)
  return { progress: net % STEPS_PER_STAGE, of: STEPS_PER_STAGE }
}

export interface StageMove {
  netBefore: number
  netAfter: number
  stageBefore: Stage
  stageAfter: Stage
  /** 'up', 'down' or 'held'. What the player is told happened. */
  direction: 'up' | 'down' | 'held'
}

/**
 * Apply one session's result.
 *
 * `taught` is the graded outcome: whether the avatar produced the answer. Nothing else feeds
 * this, and in particular `AttemptResult.saidItUnderstood` does not, because a low-candour
 * avatar is expected to misreport it and a progression ladder that could be talked up is not
 * a ladder.
 */
export function applyTeachingResult(net: number, taught: boolean): StageMove {
  assertNet(net)
  const stageBefore = stageFromNet(net)
  const netAfter = Math.min(NET_MAX, Math.max(0, net + (taught ? 1 : -1)))
  const stageAfter = stageFromNet(netAfter)
  const delta = stageIndex(stageAfter) - stageIndex(stageBefore)
  return {
    netBefore: net,
    netAfter,
    stageBefore,
    stageAfter,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'held',
  }
}
