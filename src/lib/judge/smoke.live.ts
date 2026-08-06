/**
 * Live smoke test for the judging pipeline. NOT part of the test suite —
 * it makes real, billed API calls. Run explicitly:
 *
 *   set -a; source .env.local; set +a; npx vitest run --config vitest.config.mts src/lib/judge/smoke.live.ts
 *
 * What it proves that no unit test can: that the gateway auth works, that the
 * model honours the structured-output schema, that reasoning genuinely precedes
 * the verdict, that both orderings agree, and that prompt caching engages on the
 * rubric prefix.
 */
import { judgePair, judgeModelVersion, type JudgeInput } from './judge'

const input: JudgeInput = {
  ladder: 'duel',
  task: 'Say that he forgot his homework, in a way that conveys the speaker finds it regrettable or exasperating. Japanese. Under 15 characters.',
  constraints: 'Must be a complete sentence. Plain form.',
  a: {
    // Grammatically correct, but flat: no regret conveyed. Should lose.
    ref: 'perf-a',
    content: '彼は宿題を忘れた。',
    elapsedMs: 8200,
  },
  b: {
    // Uses 〜てしまった, which carries exactly the regret the task asks for.
    ref: 'perf-b',
    content: '彼は宿題を忘れてしまった。',
    elapsedMs: 11400,
  },
}

export async function main() {
  console.log('model version:', judgeModelVersion())
  const started = Date.now()
  const result = await judgePair(input)
  const elapsed = Date.now() - started

  console.log('\n--- RESULT ---')
  console.log('outcome           :', result.outcome, '(expected: b)')
  console.log('consistent        :', result.consistent, '(expected: true)')
  console.log('verdict sentence  :', result.verdictSentence)
  console.log('\n--- FORWARD ORDERING (a shown first) ---')
  console.log('decisive          :', result.forward.decisive_difference)
  console.log('winner            :', result.forward.winner, '| margin:', result.forward.margin)
  console.log('\n--- REVERSE ORDERING (b shown first) ---')
  console.log('winner            :', result.reverse.winner)
  console.log('\n--- META ---')
  console.log('rubric            :', result.meta.rubric)
  console.log('cache read tokens :', result.meta.cacheReadTokens)
  console.log('cache write tokens:', result.meta.cacheWriteTokens)
  console.log('input tokens      :', result.meta.totalInputTokens)
  console.log('output tokens     :', result.meta.totalOutputTokens)
  console.log('wall clock ms     :', elapsed)

  return result
}
