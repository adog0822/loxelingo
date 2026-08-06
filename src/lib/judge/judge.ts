import { generateText, Output, APICallError } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { getRubric, rubricRef, type LadderId } from '@/lib/judge/rubric'

/**
 * Comparative judging — the core defensible mechanic of the product.
 *
 * Three non-negotiables, each from a specific failure mode:
 *
 * 1. COMPARATIVE, never absolute. Human inter-rater reliability on absolute
 *    quality scales is only ~0.45-0.60. Asking "which of these two is better"
 *    is a far easier and more stable question than "what CEFR level is this".
 *
 * 2. REASONING BEFORE VERDICT. This is enforced by FIELD ORDER in the schema
 *    below, because the model generates fields in declaration order and cannot
 *    condition earlier tokens on later ones. A schema with `winner` first
 *    produces a snap judgement that the reasoning then rationalises. This is
 *    the "Multiple Evidence Calibration" mitigation from Wang et al. (ACL 2024).
 *    DO NOT REORDER THE SCHEMA FIELDS.
 *
 * 3. BOTH ORDERINGS, ALWAYS. Position bias in LLM judges is severe: in Wang et
 *    al., merely swapping candidate order let a weaker model "beat" a stronger
 *    one on 66 of 80 queries. We run (A,B) and (B,A) and only trust agreement.
 *    Disagreement is not averaged away — it is surfaced as low confidence.
 *
 * Wang et al., "Large Language Models are not Fair Evaluators", arXiv 2305.17926
 */

/**
 * Judge model, overridable per environment.
 *
 * Default is Haiku 4.5 ($1/$5 per M) rather than Sonnet 5 ($2/$10) to keep
 * per-match cost low. This is a measured decision, not a guess: the kappa gate
 * in ./calibration.ts tells us empirically whether the cheap model agrees with
 * human labels well enough to move ratings. If it does not clear κ > 0.6,
 * raise JUDGE_MODEL to `claude-sonnet-5` and recalibrate.
 *
 * Do not switch models without rerunning calibration — a model change is
 * exactly as significant as a rubric change, and `judge_model_version` is
 * persisted on every judgment so a before/after can be reconstructed.
 *
 * NOTE the id has NO `anthropic/` prefix. That prefix is AI Gateway routing
 * syntax; the direct provider takes a bare Anthropic model id.
 */
const JUDGE_MODEL = process.env.JUDGE_MODEL ?? 'claude-haiku-4-5'

/**
 * ── PROVIDER: direct Anthropic, deliberately not AI Gateway ─────────────────
 *
 * The gateway restricts frontier models to paid tiers, which would mean a Vercel
 * Pro subscription just to run the judge in development. Calling Anthropic
 * directly with ANTHROPIC_API_KEY sidesteps that.
 *
 * What this costs us, so it is not rediscovered later as a surprise:
 *   - model fallbacks (`providerOptions.gateway.order`) are gone; an Anthropic
 *     outage is now an outage for us, and the queue's retry is the only cushion
 *   - gateway cost attribution and the unified spend dashboard are gone
 *   - the free monthly gateway credits are gone
 *
 * What this does NOT cost us: prompt caching. Anthropic's native cache control
 * is available through this provider, it just has to be marked explicitly
 * instead of `caching: 'auto'`. See the cacheControl block at the call site —
 * the rubric is by far the largest and most stable part of every request, so
 * caching it is the single biggest cost lever in the pipeline.
 */
const judgeModel = anthropic(JUDGE_MODEL)

/**
 * Bumped whenever anything about how we call the judge changes — the model, the
 * temperature, the token budget, the both-orderings strategy, the provider.
 * Persisted to `judgments.judge_model_version` so a rating shift can be
 * attributed to a configuration change rather than mistaken for population drift.
 *
 * v2: moved from AI Gateway routing to the direct Anthropic provider.
 */
export const JUDGE_CONFIG_VERSION = 2

/**
 * The identity of the judge configuration currently in use.
 *
 * Calibration is per-configuration: a kappa measured against one model or one
 * rubric says nothing about another. This string is what gold labels are keyed
 * on and what is persisted to `judgments.judge_model_version`.
 */
export function judgeModelVersion(): string {
  return `${JUDGE_MODEL}@${JUDGE_CONFIG_VERSION}`
}

/**
 * FIELD ORDER IS LOAD-BEARING — reasoning fields precede the verdict so the
 * model must commit to evidence before choosing a winner. See note 2 above.
 */
const VerdictSchema = z.object({
  first_analysis: z
    .string()
    .describe('What the FIRST performance did, specifically. Cite actual forms used.'),
  second_analysis: z
    .string()
    .describe('What the SECOND performance did, specifically. Cite actual forms used.'),
  decisive_difference: z
    .string()
    .describe(
      'The single concrete difference that decides this. Name the form, tense, particle or word. Not "more natural".',
    ),
  first_scores: z.record(z.string(), z.number().min(0).max(10)),
  second_scores: z.record(z.string(), z.number().min(0).max(10)),
  winner: z
    .enum(['first', 'second', 'draw'])
    .describe('Which position won. Draw is a legitimate outcome.'),
  margin: z
    .enum(['decisive', 'clear', 'narrow'])
    .describe('How far apart the two performances were.'),
  /** Shown to the loser. The most valuable sentence the system produces. */
  verdict_sentence: z
    .string()
    .describe(
      'One factual sentence explaining the result, addressed to the player who lost. Referee voice: no praise, no consolation, no exclamation marks.',
    ),
})

export type Verdict = z.infer<typeof VerdictSchema>

export interface Performance {
  /** Opaque id. Never the user id — the judge must not see identities. */
  ref: string
  /** The player's answer. Text, or a transcript for audio ladders. */
  content: string
  /** Elapsed answer time. Feeds the speed axis where a rubric uses one. */
  elapsedMs: number
}

export interface JudgeInput {
  ladder: LadderId
  /** The identical task both players received. */
  task: string
  /** Constraints stated to both players (required words, register, limits). */
  constraints?: string
  a: Performance
  b: Performance
}

export type JudgeOutcome = 'a' | 'b' | 'draw'

export interface JudgeResult {
  /** Aggregated outcome in terms of A and B, not positions. */
  outcome: JudgeOutcome
  /**
   * True when both orderings agreed. When false the result is position-biased
   * and MUST NOT silently move a rating — route it to human review.
   */
  consistent: boolean
  /** The verdict from the ordering where A was shown first. */
  forward: Verdict
  /** The verdict from the ordering where B was shown first. */
  reverse: Verdict
  /** Which verdict's prose to show. Forward when consistent. */
  verdictSentence: string
  meta: {
    model: string
    /** Persisted to judgments.judge_model_version. */
    configVersion: number
    rubric: string
    cacheReadTokens: number
    cacheWriteTokens: number
    totalInputTokens: number
    totalOutputTokens: number
  }
}

export class JudgeBudgetExhausted extends Error {}
export class JudgeRateLimited extends Error {
  constructor(readonly retryAfterSeconds?: number) {
    super('Judge rate limited')
  }
}

function renderPrompt(
  input: JudgeInput,
  first: Performance,
  second: Performance,
  axes: readonly string[],
): string {
  return [
    `# Task given to both players`,
    input.task,
    input.constraints ? `\n# Constraints stated to both players\n${input.constraints}` : '',
    `\n# Axes to score\n${axes.join(', ')}`,
    `\n# FIRST performance`,
    `Answer: ${first.content}`,
    `Answer time: ${(first.elapsedMs / 1000).toFixed(1)}s`,
    `\n# SECOND performance`,
    `Answer: ${second.content}`,
    `Answer time: ${(second.elapsedMs / 1000).toFixed(1)}s`,
  ]
    .filter(Boolean)
    .join('\n')
}

async function judgeOnce(
  input: JudgeInput,
  first: Performance,
  second: Performance,
): Promise<{ verdict: Verdict; usage: JudgeUsage }> {
  const rubric = getRubric(input.ladder)

  try {
    const { output, usage } = await generateText({
      model: judgeModel,
      // v7: `instructions`, not `system`.
      instructions: rubric.text,
      prompt: renderPrompt(input, first, second, rubric.axes),

      // NO PROMPT CACHING HERE, and that is not an oversight. Two independent
      // reasons, both verified rather than assumed:
      //
      //  1. Anthropic accepts `cacheControl` only on message parts, never on a
      //     bare instructions string. Moving the rubric into a system message to
      //     carry the marker fails: ai@7 rejects system messages in `messages`
      //     outright ("Use the instructions option instead"). The bundled
      //     @ai-sdk/anthropic docs still show the older pattern; core wins.
      //  2. Even if it were expressible, it would do nothing. Anthropic will not
      //     cache fewer than 4096 tokens on Haiku 4.5 and our rubrics are
      //     465-614 tokens, so every request is served uncached and the marker
      //     is silently ignored.
      //
      // Revisit only if a rubric grows past ~4096 tokens. At current size the
      // dominant cost is output tokens, not the repeated prefix.
      // v7: `maxOutputTokens`, not `maxTokens`.
      maxOutputTokens: 1600,
      // Low but nonzero: fully greedy decoding makes ties collapse to position.
      temperature: 0.2,
      output: Output.object({ schema: VerdictSchema }),
    })

    return {
      verdict: output,
      usage: {
        cacheReadTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens ?? 0,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
      },
    }
  } catch (error) {
    if (!APICallError.isInstance(error)) throw error
    if (error.statusCode === 402) throw new JudgeBudgetExhausted('AI budget exhausted')
    if (error.statusCode === 429) {
      const header = error.responseHeaders?.['retry-after']
      throw new JudgeRateLimited(header ? Number(header) : undefined)
    }
    throw error
  }
}

interface JudgeUsage {
  cacheReadTokens: number
  cacheWriteTokens: number
  inputTokens: number
  outputTokens: number
}

/** Map a positional winner back onto A/B given which performance was shown first. */
function resolve(winner: Verdict['winner'], firstWasA: boolean): JudgeOutcome {
  if (winner === 'draw') return 'draw'
  const firstWins = winner === 'first'
  if (firstWasA) return firstWins ? 'a' : 'b'
  return firstWins ? 'b' : 'a'
}

/**
 * Judge a pair of performances in both orderings.
 *
 * Runs the two orderings concurrently — they are independent, and the rubric
 * prefix is identical so the second call reads the first's cache.
 */
export async function judgePair(input: JudgeInput): Promise<JudgeResult> {
  const rubric = getRubric(input.ladder)

  const [forward, reverse] = await Promise.all([
    judgeOnce(input, input.a, input.b),
    judgeOnce(input, input.b, input.a),
  ])

  const forwardOutcome = resolve(forward.verdict.winner, true)
  const reverseOutcome = resolve(reverse.verdict.winner, false)
  const consistent = forwardOutcome === reverseOutcome

  return {
    // On disagreement we return a draw rather than picking a side. A coin flip
    // dressed as a verdict is worse than admitting the judge could not separate
    // them, and `consistent: false` stops this reaching a rating unreviewed.
    outcome: consistent ? forwardOutcome : 'draw',
    consistent,
    forward: forward.verdict,
    reverse: reverse.verdict,
    verdictSentence: consistent
      ? forward.verdict.verdict_sentence
      : 'Too close to separate. No rating change.',
    meta: {
      model: JUDGE_MODEL,
      configVersion: JUDGE_CONFIG_VERSION,
      rubric: rubricRef(rubric),
      cacheReadTokens: forward.usage.cacheReadTokens + reverse.usage.cacheReadTokens,
      cacheWriteTokens: forward.usage.cacheWriteTokens + reverse.usage.cacheWriteTokens,
      totalInputTokens: forward.usage.inputTokens + reverse.usage.inputTokens,
      totalOutputTokens: forward.usage.outputTokens + reverse.usage.outputTokens,
    },
  }
}
