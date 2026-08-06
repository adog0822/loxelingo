/**
 * submit — commit a player's answer, then enqueue judging.
 *
 * Two things this module refuses to do, both because a Server Function is reachable by direct
 * POST and not only through our own UI:
 *
 *   1. **It does not trust client identity.** The seat is read from `match_participants` for
 *      the authenticated user id. A client-supplied seat is never used; it is not even in the
 *      input schema.
 *   2. **It does not trust client timing.** `submissions.elapsed_ms` is computed server-side
 *      from the seat's creation time. The client's claim is kept only as an integrity signal
 *      (`integrity_flags.client_elapsed_ms`), where a lie is evidence rather than input.
 *
 * IDEMPOTENCY, at each step (contract.ts: "safe means the SECOND run changes nothing"):
 *
 *   * **Submission row** — `submissions_one_per_seat unique (match_id, seat)`. A retry hits
 *     23505, which is caught and treated as success: we re-read the existing row and carry on.
 *     No second row, and — because submissions have no UPDATE policy — no way to overwrite the
 *     first answer with a better one on the retry.
 *   * **Queue message** — `send(JUDGE_TOPIC, ..., { idempotencyKey: judgeIdempotencyKey(matchId) })`.
 *     The key is on the MATCH, not the submission, precisely because both players submitting
 *     produces two enqueue attempts for the same work. The second is deduplicated by the queue
 *     inside the `min(retentionSeconds, 24h)` window.
 *   * **Settlement** — not this module's job. The `awaiting_opponent -> judging` claim in the
 *     judge worker is the third and final guard; a duplicate message that slips past the queue
 *     still cannot settle a match twice.
 *
 * ENQUEUE ONLY WHEN BOTH SEATS HAVE SUBMITTED. Otherwise the match stays `awaiting_opponent`
 * and no message is sent. In a ghost match seat 2 is already answered at creation, so the
 * challenger's submission is the second one and judging starts immediately; in a live or
 * direct-challenge match the first submitter simply leaves.
 */

import { send } from '@vercel/queue'
import { z } from 'zod'

import {
  JUDGE_TOPIC,
  judgeIdempotencyKey,
  type JudgeJob,
  type MatchStatus,
} from '@/lib/match/contract'
import type { SupabaseLike } from '@/lib/match/tasks'

// ---------------------------------------------------------------------------
// Row types
//
// NOTE: hand-written narrow shapes for exactly the columns this module touches. REPLACE with
// the generated `src/lib/db/types.ts` once it exists.
// ---------------------------------------------------------------------------

export type SeatRow = {
  matchId: string
  seat: 1 | 2
  userId: string | null
  isBot: boolean
  /** When the seat was created — the server's start-of-clock for this player. */
  createdAt: string
  submittedAt: string | null
}

export type MatchRow = {
  id: string
  status: MatchStatus
  timeLimitMs: number | null
}

export type SubmissionInsert = {
  match_id: string
  user_id: string
  seat: 1 | 2
  content: string | null
  media_path: string | null
  selected_option: string | null
  elapsed_ms: number
  paste_detected: boolean
  keystroke_features: KeystrokeFeatures | null
  client_tz: string | null
  integrity_flags: IntegrityFlags
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

/**
 * Keystroke aggregates, not a keylog.
 *
 * Only bounded numeric summaries are accepted. `keystroke_features` is `jsonb` with no size
 * limit at the database level, so the schema is the size limit: an unvalidated jsonb column
 * reachable by direct POST is a free write-amplification primitive.
 */
export const KeystrokeFeaturesSchema = z
  .object({
    keyCount: z.number().int().min(0).max(100_000).optional(),
    backspaceCount: z.number().int().min(0).max(100_000).optional(),
    meanInterKeyMs: z.number().min(0).max(600_000).optional(),
    stdInterKeyMs: z.number().min(0).max(600_000).optional(),
    /** Longest gap with no typing. A long pause is not proof of anything; it is a feature. */
    maxPauseMs: z.number().int().min(0).max(3_600_000).optional(),
    /** Number of discrete insertion bursts. */
    burstCount: z.number().int().min(0).max(10_000).optional(),
  })
  .strict()

export type KeystrokeFeatures = z.infer<typeof KeystrokeFeaturesSchema>

export const MAX_CONTENT_CHARS = 4_000

export const SubmitInputSchema = z
  .object({
    matchId: z.uuid(),
    /** DUEL / FORGE free text. */
    content: z.string().max(MAX_CONTENT_CHARS).optional(),
    /** RECALL / FORGE closed answers. */
    selectedOption: z.string().max(200).optional(),
    /**
     * The client's own stopwatch. RECORDED, NEVER USED as the elapsed time. It exists so the
     * gap between it and the server's measurement becomes a signal.
     */
    clientElapsedMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).optional(),
    /**
     * Only the client can observe a paste event, so this is necessarily client-reported. It is
     * therefore treated as a one-way signal: it can flag, it can never clear, and per the
     * schema comment it is scored, never surfaced as an accusation.
     */
    pasteDetected: z.boolean().optional(),
    keystrokeFeatures: KeystrokeFeaturesSchema.optional(),
    /** IANA zone. Validated against the runtime's own zone table, not a regex. */
    clientTz: z.string().max(64).optional(),
  })
  .strict()
  .refine(
    (v) => (v.content?.trim().length ?? 0) > 0 || (v.selectedOption?.length ?? 0) > 0,
    { message: 'a submission must carry content or a selected option' },
  )

export type SubmitInput = z.infer<typeof SubmitInputSchema>

/**
 * Is this a zone the runtime actually knows?
 *
 * `client_tz` is not decoration: `review_log.tz` is the IANA zone that `delta-t` recomputes
 * calendar-day differences under, and a garbage zone there silently corrupts FSRS training
 * data that cannot be backfilled. A regex would accept 'Foo/Bar'; the constructor does not.
 */
export function isValidIanaTimeZone(tz: string): boolean {
  if (tz.length === 0 || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Integrity signals — pure
// ---------------------------------------------------------------------------

export type IntegrityFlags = {
  /** The client's own stopwatch reading, kept for comparison. Never used as elapsed_ms. */
  client_elapsed_ms?: number
  /** server elapsed - client elapsed. Large positive = the client under-reported its time. */
  client_elapsed_delta_ms?: number
  /** Server elapsed exceeded the item's time limit. */
  over_time_limit?: boolean
  late_by_ms?: number
  /** Characters per second implied by the SERVER clock. */
  chars_per_second?: number
  /** Typing rate no human sustains — the server-side complement to client paste detection. */
  implausible_typing_rate?: boolean
  /** The client said it saw a paste. One-way: recorded, never cleared. */
  paste_detected_client?: boolean
  /** The client sent an unparseable time zone; it was dropped rather than stored. */
  invalid_client_tz?: boolean
}

/**
 * Sustained typing rate ceiling, characters per second.
 *
 * Elite transcription typing tops out around 210 WPM ~ 17.5 cps in Latin script and much lower
 * in CJK input methods. 25 cps sustained over a whole answer is not typing. This is the
 * server's independent check: a client that simply omits `pasteDetected` still trips it.
 */
export const IMPLAUSIBLE_CHARS_PER_SECOND = 25

/** Grace on the time limit, for network and render latency. */
export const TIME_LIMIT_GRACE_MS = 2_000

export function serverElapsedMs(seatCreatedAt: string, now: Date): number {
  const started = Date.parse(seatCreatedAt)
  if (!Number.isFinite(started)) return 0
  return Math.max(0, now.getTime() - started)
}

export function deriveIntegrityFlags(args: {
  serverElapsedMs: number
  clientElapsedMs?: number
  timeLimitMs: number | null
  contentLength: number
  pasteDetected?: boolean
  clientTzWasInvalid?: boolean
}): IntegrityFlags {
  const flags: IntegrityFlags = {}

  if (args.clientElapsedMs !== undefined) {
    flags.client_elapsed_ms = args.clientElapsedMs
    flags.client_elapsed_delta_ms = args.serverElapsedMs - args.clientElapsedMs
  }

  if (args.timeLimitMs !== null && args.timeLimitMs > 0) {
    const allowed = args.timeLimitMs + TIME_LIMIT_GRACE_MS
    if (args.serverElapsedMs > allowed) {
      flags.over_time_limit = true
      flags.late_by_ms = args.serverElapsedMs - args.timeLimitMs
    }
  }

  if (args.serverElapsedMs > 0 && args.contentLength > 0) {
    const cps = args.contentLength / (args.serverElapsedMs / 1000)
    flags.chars_per_second = Math.round(cps * 100) / 100
    if (cps > IMPLAUSIBLE_CHARS_PER_SECOND) flags.implausible_typing_rate = true
  }

  if (args.pasteDetected) flags.paste_detected_client = true
  if (args.clientTzWasInvalid) flags.invalid_client_tz = true

  return flags
}

/**
 * Enqueue only when BOTH seats have submitted.
 *
 * Pure so the rule is testable without a queue or a database. `seats` is every row of
 * `match_participants` for the match; a seat counts as submitted when a submission row exists
 * for it, not when `submitted_at` happens to be set — the timestamp is bookkeeping, the
 * submission row is the fact.
 */
export function shouldEnqueue(seats: readonly { seat: 1 | 2; hasSubmission: boolean }[]): boolean {
  const distinct = new Set(seats.map((s) => s.seat))
  return distinct.size === 2 && seats.every((s) => s.hasSubmission)
}

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

export type SubmitErrorCode =
  | 'invalid_input'
  | 'not_a_participant'
  | 'match_not_open'
  | 'enqueue_failed'

export class SubmitError extends Error {
  constructor(
    readonly code: SubmitErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'SubmitError'
  }
}

export type SubmitResult =
  | {
      ok: true
      submissionId: string
      seat: 1 | 2
      /** True when the row already existed: this call was a retry and changed nothing. */
      deduped: boolean
      /** True when this call reached the queue (whether or not the queue deduped it). */
      enqueued: boolean
      messageId: string | null
      matchStatus: 'awaiting_opponent' | 'queued_for_judging'
      integrityFlags: IntegrityFlags
    }
  | { ok: false; code: SubmitErrorCode; message: string }

/**
 * Retention on the judging message.
 *
 * The queue's deduplication window is `min(retentionSeconds, 24h)`, so setting retention
 * explicitly is the same thing as setting the dedup window. 24h is chosen to match the cap:
 * anything shorter would let a slow retry past the guard, and anything longer buys nothing.
 */
export const JUDGE_RETENTION_SECONDS = 86_400

export interface SubmitQueries {
  /** The match, or null. */
  fetchMatch(matchId: string): Promise<MatchRow | null>
  /** Every seat of the match, with whether it already has a submission row. */
  fetchSeats(matchId: string): Promise<(SeatRow & { hasSubmission: boolean })[]>
  /**
   * Insert the submission. MUST translate a `submissions_one_per_seat` unique violation
   * (SQLSTATE 23505) into `{ deduped: true }` plus the existing row, never an error.
   */
  insertSubmission(
    row: SubmissionInsert,
  ): Promise<{ id: string; deduped: boolean }>
  /** Best-effort bookkeeping. Never the source of truth for "has this seat submitted". */
  markSeatSubmitted(matchId: string, seat: 1 | 2, at: Date): Promise<void>
}

export type SubmitDeps = {
  queries: SubmitQueries
  /** Injected so tests never touch Vercel Queues. */
  send?: typeof send
  now?: () => Date
}

/**
 * Commit `userId`'s answer to `matchId`, then enqueue judging if the match is now complete.
 *
 * `userId` MUST come from the verified session (`@/lib/auth/session`.getUserId), never from
 * the request body — which is why it is a separate parameter from `raw`.
 */
export async function submitAnswer(
  userId: string,
  raw: unknown,
  deps: SubmitDeps,
): Promise<SubmitResult> {
  const { queries, send: sendMessage = send, now = () => new Date() } = deps

  const parsed = SubmitInputSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, code: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'invalid' }
  }
  const input = parsed.data

  const match = await queries.fetchMatch(input.matchId)
  if (!match) {
    // Deliberately the same answer as "you are not in this match": a probe must not be able to
    // distinguish a match that does not exist from one that exists without them.
    return { ok: false, code: 'not_a_participant', message: 'no such match for this user' }
  }
  if (match.status !== 'awaiting_opponent') {
    return {
      ok: false,
      code: 'match_not_open',
      message: `match is '${match.status}'; answers are final once judging has begun`,
    }
  }

  const seats = await queries.fetchSeats(input.matchId)
  // Identity and seat both come from the DATABASE. The client never names its own seat.
  const mine = seats.find((s) => s.userId === userId && !s.isBot)
  if (!mine) {
    return { ok: false, code: 'not_a_participant', message: 'no such match for this user' }
  }

  const at = now()
  const elapsed = serverElapsedMs(mine.createdAt, at)
  const content = input.content?.trim() ?? null
  const tzValid = input.clientTz === undefined || isValidIanaTimeZone(input.clientTz)

  const integrityFlags = deriveIntegrityFlags({
    serverElapsedMs: elapsed,
    clientElapsedMs: input.clientElapsedMs,
    timeLimitMs: match.timeLimitMs,
    contentLength: content?.length ?? 0,
    pasteDetected: input.pasteDetected,
    clientTzWasInvalid: input.clientTz !== undefined && !tzValid,
  })

  const { id, deduped } = await queries.insertSubmission({
    match_id: input.matchId,
    user_id: userId,
    seat: mine.seat,
    content,
    // RECALL is playback-only by design: there is no recording upload path, so this module
    // never accepts a media path from a client.
    media_path: null,
    selected_option: input.selectedOption ?? null,
    // SERVER clock. The client's number lives in integrity_flags.
    elapsed_ms: elapsed,
    paste_detected: input.pasteDetected === true,
    keystroke_features: input.keystrokeFeatures ?? null,
    client_tz: tzValid ? input.clientTz ?? null : null,
    integrity_flags: integrityFlags,
  })

  if (!deduped) await queries.markSeatSubmitted(input.matchId, mine.seat, at)

  // Re-read rather than reasoning from the local write: the opponent may have submitted
  // between our seat read and our insert, and "both have submitted" must be true of the
  // database, not of what this request happened to see.
  const after = await queries.fetchSeats(input.matchId)
  const seatStates = after.map((s) => ({
    seat: s.seat,
    hasSubmission: s.hasSubmission || s.seat === mine.seat,
  }))

  if (!shouldEnqueue(seatStates)) {
    return {
      ok: true,
      submissionId: id,
      seat: mine.seat,
      deduped,
      enqueued: false,
      messageId: null,
      matchStatus: 'awaiting_opponent',
      integrityFlags,
    }
  }

  // Both seats in. Enqueue — including on a retry, because the key makes a redundant send
  // free and a send that failed the first time is exactly what a retry must repair.
  const job: JudgeJob = { matchId: input.matchId }
  try {
    const { messageId } = await sendMessage<JudgeJob>(JUDGE_TOPIC, job, {
      idempotencyKey: judgeIdempotencyKey(input.matchId),
      retentionSeconds: JUDGE_RETENTION_SECONDS,
    })
    return {
      ok: true,
      submissionId: id,
      seat: mine.seat,
      deduped,
      enqueued: true,
      messageId,
      matchStatus: 'queued_for_judging',
      integrityFlags,
    }
  } catch (err) {
    // The answer is committed and final; only the enqueue failed. Report it so the caller can
    // retry the whole call (which will dedupe the row and re-send under the same key) and so a
    // sweeper can pick the match up. Never roll the submission back — that would let a player
    // re-answer by forcing an enqueue failure.
    return {
      ok: false,
      code: 'enqueue_failed',
      message: err instanceof Error ? err.message : 'enqueue failed',
    }
  }
}

// ---------------------------------------------------------------------------
// Postgres port
// ---------------------------------------------------------------------------

/** Unique violation. `submissions_one_per_seat` is the one we expect. */
const PG_UNIQUE_VIOLATION = '23505'

export function createSubmitQueries(db: SupabaseLike): SubmitQueries {
  return {
    async fetchMatch(matchId) {
      const { data, error } = await db
        .from('matches')
        .select('id, status, time_limit_ms')
        .eq('id', matchId)
        .maybeSingle()
      if (error) throw new SubmitError('invalid_input', `matches read failed: ${error.message}`)
      if (!data) return null
      return {
        id: data.id as string,
        status: data.status as MatchStatus,
        timeLimitMs: data.time_limit_ms as number | null,
      }
    },

    async fetchSeats(matchId) {
      const { data, error } = await db
        .from('match_participants')
        .select('match_id, seat, user_id, is_bot, created_at, submitted_at')
        .eq('match_id', matchId)
      if (error) {
        throw new SubmitError('invalid_input', `seat read failed: ${error.message}`)
      }
      const { data: subs, error: subErr } = await db
        .from('submissions')
        .select('seat')
        .eq('match_id', matchId)
      if (subErr) {
        throw new SubmitError('invalid_input', `submission read failed: ${subErr.message}`)
      }
      const submitted = new Set((subs ?? []).map((s: { seat: number }) => s.seat))

      return (data ?? []).map(
        (r: {
          match_id: string
          seat: number
          user_id: string | null
          is_bot: boolean
          created_at: string
          submitted_at: string | null
        }) => ({
          matchId: r.match_id,
          seat: r.seat as 1 | 2,
          userId: r.user_id,
          isBot: r.is_bot,
          createdAt: r.created_at,
          submittedAt: r.submitted_at,
          hasSubmission: submitted.has(r.seat),
        }),
      )
    },

    async insertSubmission(row) {
      const { data, error } = await db.from('submissions').insert(row).select('id').single()
      if (!error) return { id: data.id as string, deduped: false }

      if (error.code !== PG_UNIQUE_VIOLATION) {
        throw new SubmitError('invalid_input', `submission insert failed: ${error.message}`)
      }
      // `submissions_one_per_seat unique (match_id, seat)` fired: this seat has already
      // answered. That is the retry path, and it is a SUCCESS — the first answer stands.
      const { data: existing, error: readErr } = await db
        .from('submissions')
        .select('id')
        .eq('match_id', row.match_id)
        .eq('seat', row.seat)
        .single()
      if (readErr) {
        throw new SubmitError('invalid_input', `submission re-read failed: ${readErr.message}`)
      }
      return { id: existing.id as string, deduped: true }
    },

    async markSeatSubmitted(matchId, seat, at) {
      // `is('submitted_at', null)` so a retry cannot rewrite the original timestamp.
      await db
        .from('match_participants')
        .update({ submitted_at: at.toISOString() })
        .eq('match_id', matchId)
        .eq('seat', seat)
        .is('submitted_at', null)
    },
  }
}
