/**
 * The match pipeline contract.
 *
 * submit -> queue -> fetch opponent -> judge -> store verdict -> settle
 *
 * Every stage runs at-least-once. Vercel Queues guarantee at-least-once
 * delivery, cron can double-fire, and a client can retry a submission. So each
 * stage must be safe to run twice, and "safe" here means the SECOND run changes
 * nothing — not that it merely does not crash. A rating applied twice is a
 * corrupted ladder and is not recoverable from logs.
 *
 * The idempotency strategy is a single-writer state machine on
 * `matches.status`, claimed by conditional UPDATE. No advisory locks, no
 * application-level mutex: Postgres decides the winner.
 */

/** Mirrors the CHECK constraint on `matches.status`. Keep in sync. */
export type MatchStatus =
  | 'awaiting_opponent'
  | 'judging'
  | 'complete'
  | 'abandoned'
  | 'void'

/** Mirrors the CHECK constraint on `match_participants.result`. */
export type ParticipantResult = 'pending' | 'win' | 'loss' | 'draw' | 'void'

/** Mirrors the CHECK constraint on `matches.source`. */
export type MatchSource = 'ghost' | 'direct_challenge' | 'live'

/**
 * The only legal transitions. Anything else is a bug, not a retry.
 *
 * `awaiting_opponent -> judging` is the claim: exactly one worker wins it.
 * `judging -> awaiting_opponent` exists so a transient judge failure releases
 * the match instead of stranding it in `judging` forever.
 */
export const LEGAL_TRANSITIONS: Readonly<Record<MatchStatus, readonly MatchStatus[]>> = {
  awaiting_opponent: ['judging', 'abandoned', 'void'],
  judging: ['complete', 'awaiting_opponent', 'void'],
  complete: [],
  abandoned: [],
  void: [],
}

export function isLegalTransition(from: MatchStatus, to: MatchStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to)
}

/** Terminal statuses. A worker seeing one of these must return without acting. */
export function isTerminal(status: MatchStatus): boolean {
  return LEGAL_TRANSITIONS[status].length === 0
}

/**
 * Queue topic. One topic, one consumer group.
 *
 * NOTE: multiple route files subscribed to the same topic become SEPARATE
 * consumer groups, each receiving its own copy of every message. Exactly one
 * route may subscribe to this.
 */
export const JUDGE_TOPIC = 'judge-match'

/**
 * Idempotency key for enqueueing a judging job.
 *
 * Keyed on the match, not the submission: both players submitting produces two
 * enqueue attempts for the same work, and the second must be deduplicated by
 * the queue rather than becoming a second judging run.
 */
export function judgeIdempotencyKey(matchId: string): string {
  return `judge:${matchId}`
}

export interface JudgeJob {
  matchId: string
}

/**
 * Settlement invariants. Enforced in code AND leaned on in the schema.
 *
 * 1. A match settles at most once. Guarded by the `awaiting_opponent -> judging`
 *    claim plus the unique current-judgment constraint.
 * 2. Ratings move ONLY when the judgment is position-consistent. An inconsistent
 *    judgment is position bias, not a result, and must reach a human instead of
 *    a ladder.
 * 3. Ratings move ONLY when `matches.is_rated` is true. Unrated modes (the
 *    Daily, Gauntlet) run the identical pipeline and settle without touching
 *    `user_ratings`.
 * 4. `theta_before` / `rating_before` are written at settlement from the value
 *    read inside the same transaction, never from a value the client supplied.
 * 5. `review_log` rows are append-only and unique on (card_id, review_time), so
 *    a replayed settlement collides rather than duplicating training data.
 */
export const SETTLEMENT_INVARIANTS = {
  settlesOnce: true,
  requiresConsistentJudgment: true,
  respectsIsRated: true,
  readsRatingServerSide: true,
  reviewLogAppendOnly: true,
} as const

/** Why a match reached a terminal state without a rating change. */
export type NoSettleReason =
  | 'already_complete'
  | 'claim_lost'
  | 'opponent_not_submitted'
  | 'position_inconsistent'
  | 'unrated_match'
  | 'bot_opponent_unrated'

export interface SettlementOutcome {
  matchId: string
  settled: boolean
  reason?: NoSettleReason
  /** Present only when settled and rated. */
  ratingChanges?: readonly {
    userId: string
    seat: 1 | 2
    thetaBefore: number
    thetaAfter: number
    result: ParticipantResult
  }[]
}
