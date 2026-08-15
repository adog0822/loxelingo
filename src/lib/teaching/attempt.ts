/**
 * attempt — run the attempt prompt against a model and parse an `AttemptResult`.
 *
 * The other half of the mechanic. `./prompt.ts` decides what the avatar may know; this decides
 * what comes back and in what order. It follows `src/lib/judge/judge.ts` closely, because the
 * two are the same kind of thing: a model call whose output moves a rating.
 *
 * ── WHAT IS TAKEN FROM THE JUDGE, AND WHY ───────────────────────────────────
 *
 * 1. STRUCTURED OUTPUT, WITH FIELD ORDER LOAD-BEARING. The model generates fields in
 *    declaration order and cannot condition earlier tokens on later ones, so `followed` and
 *    `working` precede `answer`. An avatar that emits the answer first and then describes how
 *    it followed the explanation is writing a justification, not attempting a task, and the
 *    justification would read as competent whatever the answer was. DO NOT REORDER.
 *
 *    `said_it_understood` and `remark` come LAST, after the answer, and that is also
 *    deliberate. They are the avatar's account of itself, and an account given before the
 *    attempt is a prediction rather than a report.
 *
 * 2. THE SAME ERROR CLASSES. `JudgeBudgetExhausted` and `JudgeRateLimited` are reused rather
 *    than mirrored. A caller draining a queue has to decide "retry later" or "stop", and one
 *    taxonomy answers that for both scored surfaces. Two parallel hierarchies means the first
 *    retry handler written against one of them silently fails to catch the other.
 *
 * 3. THE SAME ENV VAR PATTERN AND A CONFIG VERSION. `TEACHING_MODEL` overrides the default,
 *    and `teachingModelVersion()` is persisted on every session row, so a change in how often
 *    avatars succeed can be attributed to a model swap instead of read as drift in players.
 *
 * ── WHAT IS DELIBERATELY DIFFERENT ──────────────────────────────────────────
 * The judge runs both orderings and trusts only agreement, because comparative judging has
 * severe position bias. There are no positions here: there is one avatar, one task and an
 * answer key. Correctness is decided by `./answer-key.ts` against `items.answer`, not by the
 * model, so there is nothing for a second run to disagree about.
 */
import { generateText, Output, APICallError } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { JudgeBudgetExhausted, JudgeRateLimited } from '@/lib/judge/judge'
import type { AttemptInput, AttemptResult } from './contract'
import { ATTEMPT_PROMPT_VERSION, buildAttemptPrompt } from './prompt'

/**
 * The attempting model, overridable per environment. Same pattern and same default as
 * `JUDGE_MODEL`: Haiku 4.5, direct Anthropic provider, no `anthropic/` gateway prefix.
 *
 * A note that belongs on the record rather than in a later post-mortem: a frontier model
 * already knows the material an N5 item tests, so a perfectly isolated prompt does not by
 * itself make the avatar ignorant. The prompt says so in as many words ("Where you have not
 * been taught something, you do not have it", from `buildAvatarPrompt`), and that instruction
 * is the only thing holding the floor down. How well it holds is measurable and unmeasured:
 * run the attempt with an empty-but-plausible explanation across the item bank and the pass
 * rate IS the model's prior. See docs/design/teaching.md.
 */
const TEACHING_MODEL = process.env.TEACHING_MODEL ?? 'claude-haiku-4-5'

const teachingModel = anthropic(TEACHING_MODEL)

/**
 * Bumped whenever anything about how the attempt is run changes: the model, the temperature,
 * the token budget, the output schema, the provider. Persisted to
 * `teaching_sessions.teaching_model_version`.
 */
export const TEACHING_CONFIG_VERSION = 1

/** The identity of the attempt configuration in use. Persisted on every session. */
export function teachingModelVersion(): string {
  return `${TEACHING_MODEL}@${TEACHING_CONFIG_VERSION}`
}

/** Reported alongside the model version so a prompt edit is attributable too. */
export const attemptConfig = () => ({
  model: TEACHING_MODEL,
  modelVersion: teachingModelVersion(),
  promptVersion: ATTEMPT_PROMPT_VERSION,
})

/**
 * Low but nonzero, matching the judge. A scored surface should not be noisy, and fully greedy
 * decoding makes a model that is unsure repeat one canned form regardless of what it was told.
 */
const TEMPERATURE = 0.2
const MAX_OUTPUT_TOKENS = 800

/**
 * FIELD ORDER IS LOAD-BEARING. See note 1 in the header. Answers are constrained to the
 * option list when the task has one, so a closed item cannot be missed on formatting.
 */
function attemptSchema(options: readonly string[] | null) {
  const answer =
    options === null
      ? z
          .string()
          .describe('The answer to the task and nothing else. No working, no restatement.')
      : z
          .enum(options as [string, ...string[]])
          .describe('Exactly one of the given options, copied character for character.')

  return z.object({
    followed: z
      .string()
      .describe(
        'What the explanation actually gave you, in your own words, and the point at which it ' +
          'stopped giving you anything. Quote the part you used.',
      ),
    working: z
      .string()
      .describe('How you applied that to this task. Name the step you were least sure of.'),
    answer,
    said_it_understood: z
      .boolean()
      .describe(
        'Whether you would tell the player you followed the explanation. Your account of ' +
          'yourself, in character, which is not the same thing as whether you did.',
      ),
    remark: z
      .string()
      .describe(
        'One line, in character, shown to the player after the result. Referee house rules ' +
          'apply: no exclamation marks, no dashes, no praise.',
      ),
  })
}

export interface RunAttemptResult extends AttemptResult {
  /** Kept for the session row and for reading a bad run later. Never shown to a player. */
  reasoning: { followed: string; working: string }
  meta: {
    model: string
    modelVersion: string
    /** `ATTEMPT_PROMPT_VERSION`. Persisted so a prompt edit is attributable. */
    promptVersion: number
    inputTokens: number
    outputTokens: number
  }
}

export interface RunAttemptOptions {
  /** Test seam. Defaults to the module's configured Anthropic call. */
  generate?: typeof generateText
}

/**
 * Attempt one task, in character, from one explanation.
 *
 * Throws `JudgeBudgetExhausted` on 402 and `JudgeRateLimited` on 429, exactly as the judge
 * does. Every other API error propagates: an attempt that failed for an unknown reason must
 * not be settled as a miss, because that would charge the player for our outage.
 */
export async function runAttempt(
  input: AttemptInput,
  opts: RunAttemptOptions = {},
): Promise<RunAttemptResult> {
  const generate = opts.generate ?? generateText

  try {
    const { output, usage } = await generate({
      model: teachingModel,
      // The whole prompt, as one string, straight from `buildAttemptPrompt`. It is NOT split
      // across `instructions` and `prompt`: a second slot is a second place forbidden material
      // could be added, and the isolation rule holds only while there is exactly one.
      prompt: buildAttemptPrompt(input),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      temperature: TEMPERATURE,
      output: Output.object({ schema: attemptSchema(input.options) }),
    })

    return {
      answer: output.answer,
      saidItUnderstood: output.said_it_understood,
      remark: output.remark,
      reasoning: { followed: output.followed, working: output.working },
      meta: {
        model: TEACHING_MODEL,
        modelVersion: teachingModelVersion(),
        promptVersion: ATTEMPT_PROMPT_VERSION,
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

export { JudgeBudgetExhausted, JudgeRateLimited }
