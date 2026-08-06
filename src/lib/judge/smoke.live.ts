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

/**
 * Turn the three failure modes we actually hit into one useful line each,
 * instead of a 40-line gateway stack trace.
 */
function explain(error: unknown): string | null {
  const text = JSON.stringify(
    error,
    Object.getOwnPropertyNames(error instanceof Error ? error : {}),
  )
  const blob = `${String(error)} ${text}`

  if (/customer_verification_required|valid credit card/i.test(blob)) {
    return [
      'AI Gateway needs a card on file before it will serve any request.',
      'Add one to unlock the free monthly credits:',
      '  https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card',
    ].join('\n')
  }

  if (/RestrictedModelsError|Free tier users do not have access/i.test(blob)) {
    return [
      `Your gateway tier cannot reach ${judgeModelVersion().split('@')[0]}.`,
      'The free monthly credits do not cover frontier models. Top up:',
      '  https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dtop-up',
      '',
      'Ballpark: two calls per match at roughly 800 in / 300 out tokens each,',
      'with the rubric prefix cached on the second call, is about half a cent',
      'per match on Haiku. A small top-up covers a lot of development.',
    ].join('\n')
  }

  if (/Bad Request/i.test(blob) || /Unexpected token/i.test(blob)) {
    return [
      `${judgeModelVersion().split('@')[0]} did not honour the structured-output schema.`,
      'It returned prose or rejected the tool call.',
      '',
      'This is not a model we can substitute. The judge depends on a strict',
      'schema whose FIELD ORDER forces reasoning before the verdict, and that',
      'ordering is the position-bias mitigation, not a formatting preference.',
      'A model without reliable structured output cannot run this pipeline.',
    ].join('\n')
  }

  return null
}

export async function main() {
  console.log('model version:', judgeModelVersion())
  const started = Date.now()

  let result: Awaited<ReturnType<typeof judgePair>>
  try {
    result = await judgePair(input)
  } catch (error) {
    const explained = explain(error)
    if (explained) {
      console.error(`\n--- SMOKE TEST BLOCKED ---\n${explained}\n`)
      process.exitCode = 1
      return null
    }
    throw error
  }

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
