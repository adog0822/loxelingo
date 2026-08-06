/**
 * The judging job — one match, end to end: claim, judge, persist, settle.
 *
 * ## The idempotency strategy, in one sentence
 *
 * `update matches set status='judging' where id=$1 and status='awaiting_opponent'`.
 *
 * Zero rows affected means another worker won the claim and this delivery does
 * nothing. That is the WHOLE strategy at this stage, exactly as
 * `contract.ts` specifies: no advisory locks, no application-level mutex,
 * Postgres decides the winner. Vercel Queues are at-least-once, both players
 * submitting produces two enqueue attempts, and cron can double-fire — so this
 * conditional UPDATE runs on every delivery and only one of them proceeds.
 *
 * ## Failure handling — the two judge errors are NOT the same
 *
 * `JudgeRateLimited` is transient: the budget exists, the request was merely too
 * soon. The claim is released and the error is RETHROWN so the queue redelivers
 * with backoff.
 *
 * `JudgeBudgetExhausted` is not transient: the AI Gateway credit is gone and it
 * will still be gone in ten seconds and in ten minutes. Retrying burns
 * deliveries and pushes the message toward expiry for nothing. The claim is
 * released and the job returns NORMALLY, so `handleCallback` acknowledges the
 * message. The match is back in `awaiting_opponent` and a later sweep re-enqueues
 * it once budget resets.
 *
 * Every other failure releases the claim and rethrows. A match must never strand
 * in `judging`, because `judging` is the state that blocks its own retry.
 */

import {
  isTerminal,
  type JudgeJob,
  type MatchStatus,
  type SettlementOutcome,
} from '@/lib/match/contract'
import {
  JudgeBudgetExhausted,
  JudgeRateLimited,
  judgePair,
  type JudgeInput,
  type JudgeResult,
  type Verdict,
} from '@/lib/judge/judge'
import { getRubric, rubricRef, type LadderId } from '@/lib/judge/rubric'
import { assertTransition, type SeatOutcome, type SettlementInput } from '@/lib/match/settle'
import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface SeatRow {
  seat: 1 | 2
  /** null for a bot seat. NEVER forwarded to the judge. */
  userId: string | null
  isBot: boolean
}

export interface JudgeMatchRow {
  id: string
  status: MatchStatus
  worldSlug: string
  ladderSlug: LadderId
  isRated: boolean
  itemId: number | null
  /** The identical task both players received, from `matches.prompt_snapshot`. */
  task: string
  constraints: string | null
  seats: readonly SeatRow[]
}

export interface SubmissionRow {
  /** `submissions.id` — an opaque uuid. This is what the judge sees as a ref. */
  id: string
  seat: 1 | 2
  content: string
  elapsedMs: number
  submittedAt: Date
  clientTz: string | null
}

/** The subset of a stored `judgments` row settlement needs to replay from. */
export interface StoredJudgment {
  outcome: SeatOutcome
  consistent: boolean
}

/** One `judgments` insert: both orderings, the aggregate, and full provenance. */
export interface JudgmentInsert {
  matchId: string
  orderAbFavoredUserId: string | null
  orderAbVerdict: 'first' | 'second' | 'tie'
  orderAbAxisScores: unknown
  orderAbReasoning: string
  orderAbRaw: unknown
  orderBaFavoredUserId: string | null
  orderBaVerdict: 'first' | 'second' | 'tie'
  orderBaAxisScores: unknown
  orderBaReasoning: string
  orderBaRaw: unknown
  outcomeSeat1: 0 | 0.5 | 1
  verdict: 'seat1' | 'seat2' | 'draw' | 'unresolved'
  verdictSummary: string
  judgeModel: string
  judgeModelVersion: string
  judgeProvider: string | null
  rubricVersion: string
  /** The EXACT text shown to the judge, stored inline. Never a reference. */
  rubricText: string
  promptTokens: number
  completionTokens: number
  latencyMs: number
}

export interface JudgeStore {
  /**
   * THE CLAIM. `awaiting_opponent -> judging`, conditional. False means zero rows
   * were affected: another worker won, or the match is no longer claimable.
   */
  claimForJudging(matchId: string): Promise<boolean>
  /**
   * `judging -> awaiting_opponent`, itself conditional on the status still being
   * `judging` so it is safe to call unconditionally in a failure path.
   */
  releaseClaim(matchId: string): Promise<void>
  loadMatch(matchId: string): Promise<JudgeMatchRow | null>
  loadSubmissions(matchId: string): Promise<readonly SubmissionRow[]>
  loadCurrentJudgment(matchId: string): Promise<StoredJudgment | null>
  insertJudgment(row: JudgmentInsert): Promise<void>
}

export class UnknownMatch extends Error {
  constructor(readonly matchId: string) {
    super(`No match ${matchId}. Nothing to judge; retrying cannot help.`)
    this.name = 'UnknownMatch'
  }
}

export interface JudgeRunnerDeps {
  store: JudgeStore
  /** Defaults to the real `judgePair`. Injected so tests never reach an LLM. */
  judge?: (input: JudgeInput) => Promise<JudgeResult>
  settle: (input: SettlementInput) => Promise<SettlementOutcome>
  /** Wall clock, used only for latency measurement — never for `settledAt`. */
  clock?: () => number
  logger?: Pick<typeof console, 'warn' | 'error' | 'info'>
}

export type JudgeJobResult =
  | { deferred: false; outcome: SettlementOutcome }
  /** Budget is gone. Acknowledge the message; retrying is pointless. */
  | { deferred: true; reason: 'judge_budget_exhausted' }

// ---------------------------------------------------------------------------
// The job
// ---------------------------------------------------------------------------

export async function runJudgeJob(
  job: JudgeJob,
  deps: JudgeRunnerDeps,
): Promise<JudgeJobResult> {
  const { store, settle } = deps
  const judge = deps.judge ?? judgePair
  const clock = deps.clock ?? (() => Date.now())
  const log = deps.logger ?? console

  // -----------------------------------------------------------------------
  // 1. The claim. This is the first thing that happens and it is a WRITE, so
  //    two concurrent deliveries cannot both read "claimable" and both proceed.
  // -----------------------------------------------------------------------
  assertTransition('awaiting_opponent', 'judging')
  const claimed = await store.claimForJudging(job.matchId)

  if (!claimed) {
    // Zero rows. Find out why — but only to report it; we act either way by
    // returning, never by trying again.
    const current = await store.loadMatch(job.matchId)
    if (!current) throw new UnknownMatch(job.matchId)
    if (isTerminal(current.status)) {
      return { deferred: false, outcome: no(job.matchId, 'already_complete') }
    }
    return { deferred: false, outcome: no(job.matchId, 'claim_lost') }
  }

  // From here the claim is held and EVERY exit path must release it or hand the
  // match to settlement, which moves it to `complete`.
  try {
    const match = await store.loadMatch(job.matchId)
    if (!match) throw new UnknownMatch(job.matchId)

    const submissions = await store.loadSubmissions(job.matchId)
    const first = submissions.find((s) => s.seat === 1)
    const second = submissions.find((s) => s.seat === 2)

    if (!first || !second) {
      // Not an error: the second player simply has not answered yet. Put the
      // match back so the next submission's enqueue can claim it.
      await release(store, job.matchId)
      return { deferred: false, outcome: no(job.matchId, 'opponent_not_submitted') }
    }

    // Deterministic and derived only from append-only rows, so a replay produces
    // the identical instant. `review_log`'s unique (card_id, review_time) index
    // depends on this being stable — a `Date.now()` here would silently turn that
    // index into decoration.
    const settledAt = new Date(
      Math.max(first.submittedAt.getTime(), second.submittedAt.getTime()),
    )

    const seatRefs = [1, 2].map((n) => {
      const seat = match.seats.find((s) => s.seat === n)
      if (!seat) throw new Error(`Match ${job.matchId} is missing seat ${n}.`)
      return {
        seat: seat.seat,
        userId: seat.userId,
        isBot: seat.isBot,
        tz: (seat.seat === 1 ? first : second).clientTz,
      }
    })

    const toSettlement = (outcome: SeatOutcome, consistent: boolean): SettlementInput => ({
      matchId: match.id,
      worldSlug: match.worldSlug,
      ladderSlug: match.ladderSlug,
      isRated: match.isRated,
      consistent,
      outcome,
      itemId: match.itemId,
      settledAt,
      seats: seatRefs,
    })

    // -------------------------------------------------------------------
    // 2. A judgment may already exist: a previous delivery judged, then failed
    //    before settling and released the claim. Two LLM calls are expensive and
    //    non-deterministic, so replay from the stored verdict rather than
    //    re-judging — which also guarantees the rating applied matches the
    //    judgment on record.
    // -------------------------------------------------------------------
    const existing = await store.loadCurrentJudgment(job.matchId)
    if (existing) {
      log.info?.(`[judge-match] replaying stored judgment for match ${job.matchId}`)
      const outcome = await settle(toSettlement(existing.outcome, existing.consistent))
      return { deferred: false, outcome }
    }

    // -------------------------------------------------------------------
    // 3. Judge. Both orderings, run by `judgePair` exactly as it exists.
    //    The judge receives submission ids as refs and NEVER a user id.
    // -------------------------------------------------------------------
    const startedAt = clock()
    let result: JudgeResult
    try {
      result = await judge({
        ladder: match.ladderSlug,
        task: match.task,
        constraints: match.constraints ?? undefined,
        a: { ref: first.id, content: first.content, elapsedMs: first.elapsedMs },
        b: { ref: second.id, content: second.content, elapsedMs: second.elapsedMs },
      })
    } catch (error) {
      if (error instanceof JudgeRateLimited) {
        // TRANSIENT. Release and rethrow so the queue redelivers with backoff.
        await release(store, job.matchId)
        throw error
      }
      if (error instanceof JudgeBudgetExhausted) {
        // NOT TRANSIENT. Release and return normally so handleCallback ACKs the
        // message: redelivering before the budget resets accomplishes nothing
        // except consuming the message's retention window.
        log.error?.(
          `[judge-match] AI budget exhausted; releasing match ${job.matchId} and acknowledging.`,
        )
        await release(store, job.matchId)
        return { deferred: true, reason: 'judge_budget_exhausted' }
      }
      throw error
    }
    const latencyMs = clock() - startedAt

    // -------------------------------------------------------------------
    // 4. Persist the judgment: both orderings with their own reasoning and axis
    //    scores, the aggregate, the model, the model version, and the rubric
    //    version plus its exact text.
    // -------------------------------------------------------------------
    await store.insertJudgment(
      buildJudgmentInsert(match, result, latencyMs, {
        seat1UserId: seatRefs[0].userId,
        seat2UserId: seatRefs[1].userId,
      }),
    )

    // -------------------------------------------------------------------
    // 5. Settle. Ownership of `matches.status` passes to settlement here.
    // -------------------------------------------------------------------
    const outcome = await settle(toSettlement(result.outcome, result.consistent))
    return { deferred: false, outcome }
  } catch (error) {
    // A match stranded in `judging` can never be retried, because `judging` is
    // exactly the status the claim predicate excludes. Release is conditional on
    // the status still being `judging`, so this is a no-op once settlement has
    // already moved it to `complete`.
    await release(store, job.matchId).catch((releaseError) => {
      log.error?.(`[judge-match] failed to release claim on ${job.matchId}`, releaseError)
    })
    throw error
  }
}

async function release(store: JudgeStore, matchId: string): Promise<void> {
  assertTransition('judging', 'awaiting_opponent')
  await store.releaseClaim(matchId)
}

const no = (
  matchId: string,
  reason: NonNullable<SettlementOutcome['reason']>,
): SettlementOutcome => ({ matchId, settled: false, reason })

// ---------------------------------------------------------------------------
// judgments row construction
// ---------------------------------------------------------------------------

/** The judge's positional verdict, in the vocabulary the CHECK constraint allows. */
const positional = (winner: Verdict['winner']): 'first' | 'second' | 'tie' =>
  winner === 'draw' ? 'tie' : winner

/** Who a positional verdict favoured, given which seat was shown first. */
function favoured(
  winner: Verdict['winner'],
  firstSeatUserId: string | null,
  secondSeatUserId: string | null,
): string | null {
  if (winner === 'draw') return null
  return winner === 'first' ? firstSeatUserId : secondSeatUserId
}

const reasoningOf = (v: Verdict): string =>
  [
    `FIRST: ${v.first_analysis}`,
    `SECOND: ${v.second_analysis}`,
    `DECISIVE: ${v.decisive_difference}`,
    `MARGIN: ${v.margin}`,
  ].join('\n\n')

export function buildJudgmentInsert(
  match: Pick<JudgeMatchRow, 'id' | 'ladderSlug'>,
  result: JudgeResult,
  latencyMs: number,
  users: { seat1UserId: string | null; seat2UserId: string | null },
): JudgmentInsert {
  const rubric = getRubric(match.ladderSlug)
  // `meta.model` is a gateway slug like "anthropic/claude-haiku-4.5". The
  // provider prefix is split off so `judge_provider` is queryable on its own.
  const slug = result.meta.model
  const slash = slug.indexOf('/')
  const provider = slash > 0 ? slug.slice(0, slash) : null
  const model = slash > 0 ? slug.slice(slash + 1) : slug

  const outcomeSeat1 = result.outcome === 'a' ? 1 : result.outcome === 'b' ? 0 : 0.5

  return {
    matchId: match.id,

    // Forward run: A (seat 1) shown first, B (seat 2) second.
    orderAbFavoredUserId: favoured(result.forward.winner, users.seat1UserId, users.seat2UserId),
    orderAbVerdict: positional(result.forward.winner),
    orderAbAxisScores: {
      seat1: result.forward.first_scores,
      seat2: result.forward.second_scores,
    },
    orderAbReasoning: reasoningOf(result.forward),
    orderAbRaw: result.forward,

    // Reverse run: B (seat 2) shown FIRST, A (seat 1) second. The positional
    // labels invert here; getting this backwards would make
    // `position_disagreement` report the exact opposite of the truth.
    orderBaFavoredUserId: favoured(result.reverse.winner, users.seat2UserId, users.seat1UserId),
    orderBaVerdict: positional(result.reverse.winner),
    orderBaAxisScores: {
      seat2: result.reverse.first_scores,
      seat1: result.reverse.second_scores,
    },
    orderBaReasoning: reasoningOf(result.reverse),
    orderBaRaw: result.reverse,

    outcomeSeat1,
    // An inconsistent pair is not a draw, it is an unresolved judgment. Recording
    // it as 'draw' would hide position bias inside a legitimate-looking result.
    verdict: !result.consistent
      ? 'unresolved'
      : result.outcome === 'a'
        ? 'seat1'
        : result.outcome === 'b'
          ? 'seat2'
          : 'draw',
    verdictSummary: result.verdictSentence,

    judgeModel: model,
    // `JUDGE_CONFIG_VERSION`, surfaced by judgePair as `meta.configVersion` and
    // documented there as the value for this exact column. It is bumped on ANY
    // change to how the judge is called — model, temperature, token budget — so a
    // rating shift can be attributed to a configuration change rather than
    // mistaken for population drift. `JUDGE_MODEL` is env-overridable, which is
    // precisely why the model slug alone would not be a sufficient version.
    judgeModelVersion: `${slug}@${result.meta.configVersion}`,
    judgeProvider: provider,

    rubricVersion: result.meta.rubric,
    // Stored inline from the same `getRubric` the judge called, so an edit to a
    // rubric can never retroactively change what this judgment meant.
    rubricText: rubric.text,

    promptTokens: result.meta.totalInputTokens,
    completionTokens: result.meta.totalOutputTokens,
    latencyMs,
  }
}

/** Sanity check that `rubricRef` still names the version we persist. */
export const rubricVersionOf = (ladder: LadderId): string => rubricRef(getRubric(ladder))

// ---------------------------------------------------------------------------
// Supabase adapter
// ---------------------------------------------------------------------------

export function createSupabaseJudgeStore(): JudgeStore {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  )

  return {
    async claimForJudging(matchId) {
      const { data, error } = await db
        .from('matches')
        .update({ status: 'judging' })
        .eq('id', matchId)
        // THE CLAIM PREDICATE. Removing this removes the entire idempotency
        // guarantee of the judging stage.
        .eq('status', 'awaiting_opponent')
        .select('id')
      if (error) throw error
      return (data?.length ?? 0) > 0
    },

    async releaseClaim(matchId) {
      const { error } = await db
        .from('matches')
        .update({ status: 'awaiting_opponent' })
        .eq('id', matchId)
        // Conditional, so releasing a match that settlement already completed is
        // a zero-row no-op rather than an illegal complete -> awaiting_opponent.
        .eq('status', 'judging')
      if (error) throw error
    },

    async loadMatch(matchId) {
      const { data, error } = await db
        .from('matches')
        .select(
          'id, status, world_slug, ladder_slug, is_rated, item_id, prompt_snapshot, constraint_text, match_participants(seat, user_id, is_bot)',
        )
        .eq('id', matchId)
        .maybeSingle()
      if (error) throw error
      if (!data) return null

      const snapshot = (data.prompt_snapshot ?? {}) as Record<string, unknown>
      const task = typeof snapshot.task === 'string' ? snapshot.task : String(snapshot.prompt ?? '')

      return {
        id: data.id as string,
        status: data.status as MatchStatus,
        worldSlug: data.world_slug as string,
        ladderSlug: data.ladder_slug as LadderId,
        isRated: data.is_rated as boolean,
        itemId: (data.item_id as number | null) ?? null,
        task,
        constraints: (data.constraint_text as string | null) ?? null,
        seats: (data.match_participants as { seat: number; user_id: string | null; is_bot: boolean }[]).map(
          (p) => ({ seat: p.seat as 1 | 2, userId: p.user_id, isBot: p.is_bot }),
        ),
      }
    },

    async loadSubmissions(matchId) {
      const { data, error } = await db
        .from('submissions')
        .select('id, seat, content, selected_option, elapsed_ms, submitted_at, client_tz')
        .eq('match_id', matchId)
      if (error) throw error
      return (data ?? []).map((row) => ({
        id: row.id as string,
        seat: row.seat as 1 | 2,
        // RECALL/FORGE answer with a closed option rather than free text.
        content: (row.content as string | null) ?? (row.selected_option as string | null) ?? '',
        elapsedMs: (row.elapsed_ms as number | null) ?? 0,
        submittedAt: new Date(row.submitted_at as string),
        clientTz: (row.client_tz as string | null) ?? null,
      }))
    },

    async loadCurrentJudgment(matchId) {
      const { data, error } = await db
        .from('judgments')
        .select('verdict')
        .eq('match_id', matchId)
        .eq('is_current', true)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const verdict = data.verdict as JudgmentInsert['verdict']
      return {
        outcome: verdict === 'seat1' ? 'a' : verdict === 'seat2' ? 'b' : 'draw',
        consistent: verdict !== 'unresolved',
      }
    },

    async insertJudgment(row) {
      const { error } = await db.from('judgments').insert({
        match_id: row.matchId,
        order_ab_favored_user_id: row.orderAbFavoredUserId,
        order_ab_verdict: row.orderAbVerdict,
        order_ab_axis_scores: row.orderAbAxisScores,
        order_ab_reasoning: row.orderAbReasoning,
        order_ab_raw: row.orderAbRaw,
        order_ba_favored_user_id: row.orderBaFavoredUserId,
        order_ba_verdict: row.orderBaVerdict,
        order_ba_axis_scores: row.orderBaAxisScores,
        order_ba_reasoning: row.orderBaReasoning,
        order_ba_raw: row.orderBaRaw,
        outcome_seat1: row.outcomeSeat1,
        verdict: row.verdict,
        verdict_summary: row.verdictSummary,
        judge_model: row.judgeModel,
        judge_model_version: row.judgeModelVersion,
        judge_provider: row.judgeProvider,
        rubric_version: row.rubricVersion,
        rubric_text: row.rubricText,
        prompt_tokens: row.promptTokens,
        completion_tokens: row.completionTokens,
        latency_ms: row.latencyMs,
        is_current: true,
        // position_disagreement and rubric_hash are GENERATED. Never written.
      })
      if (error) throw error
    },
  }
}
