/**
 * Queue retry policy for the judging consumer.
 *
 * This lives OUTSIDE the route module deliberately. Next 16 validates that a
 * route file exports only known route entries (`GET`, `POST`, `maxDuration`,
 * ...), and any extra export fails the generated route-type check with
 * "Property 'retry' is incompatible with index signature". The policy is also
 * pure and worth unit-testing on its own, which a route module makes awkward.
 */
import type { MessageMetadata, RetryDirective } from '@vercel/queue'
import { JUDGE_TOPIC } from '@/lib/match/contract'
import { JudgeNotCalibrated } from '@/lib/judge/calibration'
import { JudgeRateLimited } from '@/lib/judge/judge'
import { IllegalMatchTransition } from '@/lib/match/settle'
import { UnknownMatch } from '@/lib/match/judge-runner'

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
