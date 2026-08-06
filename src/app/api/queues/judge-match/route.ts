/**
 * Queue consumer for the `judge-match` topic.
 *
 * ============================================================================
 * THIS IS THE ONLY ROUTE FILE THAT MAY SUBSCRIBE TO `JUDGE_TOPIC`.
 *
 * Vercel Queues derive a consumer group per route file. Two route files
 * subscribed to the same topic are two consumer groups, and each group receives
 * its OWN COPY of every message — so a second subscriber does not share load, it
 * doubles the judging work and hands two workers a copy of the same match. The
 * `matches.status` claim would stop the second copy from double-settling, but it
 * would still burn two extra LLM calls per match. `contract.ts` states this rule
 * next to `JUDGE_TOPIC`; if you are about to add another route for this topic,
 * add a handler branch here instead.
 * ============================================================================
 *
 * Runtime notes:
 *   - `maxDuration = 300`. Judging is two sequential-ish LLM calls plus a
 *     settlement write; the default function timeout is not enough.
 *   - There is deliberately NO `export const runtime = 'edge'`. The Edge runtime
 *     caps execution at ~25s, which two judge calls will exceed routinely.
 */

import { handleCallback, type MessageMetadata, type RetryDirective } from '@vercel/queue'
import { JUDGE_TOPIC, type JudgeJob } from '@/lib/match/contract'
import { JudgeRateLimited, judgeModelVersion } from '@/lib/judge/judge'
import { JudgeNotCalibrated } from '@/lib/judge/calibration'
import {
  createSupabaseGoldSetStore,
  resolveCalibrationGate,
  type GoldSetStore,
} from '@/lib/judge/gold-set'
import { createServiceRoleClient } from '@/lib/supabase/server'
import {
  UnknownMatch,
  createSupabaseJudgeStore,
  runJudgeJob,
  type JudgeStore,
} from '@/lib/match/judge-runner'
import {
  IllegalMatchTransition,
  createSupabaseSettleStore,
  settleMatch,
  type SettleStore,
} from '@/lib/match/settle'

export const maxDuration = 300

/**
 * Message lock duration. Must comfortably exceed `maxDuration`: if the lock
 * expires while this function is still running, the queue hands the same message
 * to a second worker, and the whole point of the `status='judging'` claim is not
 * to have to rely on that claim as a race backstop. 600s is double the function
 * ceiling and well under the SDK's 3600s maximum.
 */
const VISIBILITY_TIMEOUT_SECONDS = 600

/**
 * Deliveries after which the message is a poison pill and gets dropped.
 * `deliveryCount` starts at 1, so this permits ~5 attempts.
 */
export const MAX_DELIVERIES = 5

/** Backoff ceiling, in seconds. */
const MAX_BACKOFF_SECONDS = 300

/**
 * Errors where redelivery cannot possibly change the outcome. All of them leave
 * the match released back to `awaiting_opponent` by the runner, so acknowledging
 * loses the message but not the match.
 */
function isPermanent(error: unknown): boolean {
  return (
    error instanceof UnknownMatch ||
    // A transition that isn't in LEGAL_TRANSITIONS is a bug. Retrying a bug just
    // reproduces it four more times.
    error instanceof IllegalMatchTransition ||
    // Ratings are frozen until kappa clears the gate. That is a human action.
    error instanceof JudgeNotCalibrated
  )
}

/**
 * Retry policy.
 *
 * Exponential backoff on transient failures, an immediate drop on permanent
 * ones, and a hard stop after `MAX_DELIVERIES` so a message that fails forever
 * does not occupy a consumer forever. Every drop is logged with the match id,
 * because an acknowledged failure is otherwise completely silent.
 *
 * Note what is NOT here: `JudgeBudgetExhausted` never reaches this function.
 * The runner catches it, releases the match and returns normally, so the message
 * is acknowledged on the success path — retrying before the AI budget resets is
 * pointless, and the distinction from `JudgeRateLimited` (which IS rethrown, and
 * lands here) is the whole reason the two are separate error classes.
 */
export function retry(error: unknown, metadata: MessageMetadata): RetryDirective | void {
  const { deliveryCount, messageId } = metadata

  if (isPermanent(error)) {
    console.error(
      `[${JUDGE_TOPIC}] dropping message ${messageId} after delivery ${deliveryCount}: permanent failure`,
      error,
    )
    return { acknowledge: true }
  }

  if (deliveryCount >= MAX_DELIVERIES) {
    console.error(
      `[${JUDGE_TOPIC}] dropping poison message ${messageId} after ${deliveryCount} deliveries.`,
      error,
    )
    return { acknowledge: true }
  }

  // The judge told us how long to wait; honour it, but never go below the
  // backoff we would have chosen anyway.
  const backoff = Math.min(MAX_BACKOFF_SECONDS, 2 ** deliveryCount * 5)
  const afterSeconds =
    error instanceof JudgeRateLimited && error.retryAfterSeconds
      ? Math.min(MAX_BACKOFF_SECONDS, Math.max(backoff, error.retryAfterSeconds))
      : backoff

  console.warn(
    `[${JUDGE_TOPIC}] retrying message ${messageId} (delivery ${deliveryCount}) in ${afterSeconds}s`,
    error,
  )
  return { afterSeconds }
}

// Built once per lambda instance rather than per message.
let judgeStore: JudgeStore | undefined
let settleStore: SettleStore | undefined
let goldStore: GoldSetStore | undefined

async function handler(job: JudgeJob, metadata: MessageMetadata): Promise<void> {
  judgeStore ??= createSupabaseJudgeStore()
  settleStore ??= createSupabaseSettleStore()
  goldStore ??= createSupabaseGoldSetStore(createServiceRoleClient())

  /**
   * ARM THE KAPPA GATE.
   *
   * `settleMatch` fails closed: a rated match with no calibration report throws
   * rather than quietly moving a rating. So this must resolve on every job.
   * The report itself is cached per judge configuration with a TTL, so this is
   * not a per-match query.
   */
  const gate = await resolveCalibrationGate(goldStore, judgeModelVersion())

  if (gate.status === 'uncalibrated_unrated') {
    // Loud on purpose. Playing without a calibrated judge is a deliberate
    // pre-launch state, and it should never become invisible background noise.
    console.warn(
      `[${JUDGE_TOPIC}] JUDGE UNCALIBRATED — judging match ${job.matchId} but moving NO ratings. ${gate.reason}`,
    )
  }

  const settleOptions =
    gate.status === 'calibrated'
      ? { calibration: gate.report }
      : { forceUnrated: { reason: gate.reason } }

  const result = await runJudgeJob(job, {
    store: judgeStore,
    settle: (input) => settleMatch(input, settleStore!, settleOptions),
  })

  if (result.deferred) {
    console.error(
      `[${JUDGE_TOPIC}] match ${job.matchId} deferred (${result.reason}); message acknowledged, match released.`,
    )
    return
  }

  const { outcome } = result
  console.info(
    `[${JUDGE_TOPIC}] match ${job.matchId} delivery ${metadata.deliveryCount}: ` +
      (outcome.settled
        ? `settled, ${outcome.ratingChanges?.length ?? 0} rating change(s)`
        : `no rating change (${outcome.reason})`),
  )
}

export const POST = handleCallback<JudgeJob>(handler, {
  visibilityTimeoutSeconds: VISIBILITY_TIMEOUT_SECONDS,
  retry,
})
