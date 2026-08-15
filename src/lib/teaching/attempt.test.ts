import { APICallError, type generateText } from 'ai'
import { describe, expect, it } from 'vitest'

import type { Avatar, TraitVector } from '@/lib/avatars'
import { JudgeBudgetExhausted, JudgeRateLimited } from '@/lib/judge/judge'
import { runAttempt, TEACHING_CONFIG_VERSION, teachingModelVersion } from './attempt'
import type { AttemptInput } from './contract'
import { ATTEMPT_PROMPT_VERSION, buildAttemptPrompt } from './prompt'

const TRAITS: TraitVector = { warmth: 3, humour: 5, edge: 4, patience: 1, candour: 0, drive: 5 }

const VANE: Avatar = {
  slug: 'vane',
  name: 'Vane',
  look: 'A described face, forty characters or more, written out so the fixture is legal.',
  hook: 'I hold one line here so the row is shaped like a real character.',
  traits: TRAITS,
  voice: {
    speaks: ['Short sentences.', 'Present tense.', 'One idea per turn.'],
    never: ['Never quotes anyone.', 'Never uses a title.', 'Never repeats a question.'],
  },
  reactions: {
    taught_well: 'The authored line for a lesson that landed.',
    taught_badly: 'The authored line for a lesson that did not land.',
    player_slow: 'The authored line for a silence.',
    player_quit: 'The authored line for a walk-off.',
  },
  portraitPath: null,
  sortOrder: 5,
}

const INPUT: AttemptInput = {
  avatar: VANE,
  traits: TRAITS,
  explanation: 'ぐ verbs take いで. The voicing carries into the ending.',
  task: 'Write the て form of 泳ぐ (およぐ).',
  options: null,
  ladder: 'forge',
}

const OUTPUT = {
  followed: 'The rule for ぐ, and the voicing.',
  working: 'Applied it to 泳ぐ.',
  answer: '泳いで',
  said_it_understood: true,
  remark: 'I had that one before you finished.',
}

/** The seam. Records what the runner asked for, and returns what it is told to. */
function fakeGenerate(result: unknown, calls: Record<string, unknown>[] = []) {
  return {
    calls,
    generate: (async (args: Record<string, unknown>) => {
      calls.push(args)
      if (result instanceof Error) throw result
      return { output: result, usage: { inputTokens: 900, outputTokens: 60 } }
    }) as unknown as typeof generateText,
  }
}

function apiError(statusCode: number, headers?: Record<string, string>): APICallError {
  return new APICallError({
    message: `status ${statusCode}`,
    url: 'https://api.anthropic.com/v1/messages',
    requestBodyValues: {},
    statusCode,
    responseHeaders: headers,
  })
}

/** The JSON schema the provider is actually handed, resolved off the recorded call. */
async function jsonSchema(
  call: Record<string, unknown>,
): Promise<{ properties: Record<string, Record<string, unknown>> }> {
  const output = call.output as { responseFormat: Promise<{ schema: unknown }> }
  const format = await output.responseFormat
  return format.schema as { properties: Record<string, Record<string, unknown>> }
}

describe('the attempt runner', () => {
  it('sends exactly what buildAttemptPrompt produced, in one slot', async () => {
    // One string, not split across `instructions` and `prompt`. A second slot is a second
    // place forbidden material could be added, and the isolation rule holds only while there
    // is exactly one.
    const { generate, calls } = fakeGenerate(OUTPUT)
    await runAttempt(INPUT, { generate })

    expect(calls).toHaveLength(1)
    expect(calls[0]!.prompt).toBe(buildAttemptPrompt(INPUT))
    expect(calls[0]!.instructions).toBeUndefined()
    expect(calls[0]!.messages).toBeUndefined()
  })

  it('returns the AttemptResult the contract names, and keeps the reasoning aside', async () => {
    const { generate } = fakeGenerate(OUTPUT)
    const result = await runAttempt(INPUT, { generate })

    expect(result.answer).toBe('泳いで')
    expect(result.saidItUnderstood).toBe(true)
    expect(result.remark).toBe('I had that one before you finished.')
    expect(result.reasoning).toEqual({
      followed: OUTPUT.followed,
      working: OUTPUT.working,
    })
  })

  it('carries the provenance a session row has to record', async () => {
    const { generate } = fakeGenerate(OUTPUT)
    const result = await runAttempt(INPUT, { generate })

    expect(result.meta.modelVersion).toBe(teachingModelVersion())
    expect(result.meta.modelVersion).toContain(`@${TEACHING_CONFIG_VERSION}`)
    expect(result.meta.promptVersion).toBe(ATTEMPT_PROMPT_VERSION)
    expect(result.meta.inputTokens).toBe(900)
    expect(result.meta.outputTokens).toBe(60)
  })

  it('puts the reasoning fields before the answer in the schema', async () => {
    // FIELD ORDER IS LOAD-BEARING: the model generates in declaration order and cannot
    // condition earlier tokens on later ones. An answer emitted first turns the reasoning into
    // a justification, which reads as competent whatever the answer was.
    const { generate, calls } = fakeGenerate(OUTPUT)
    await runAttempt(INPUT, { generate })

    // Read off the wire format rather than the zod object, because the wire format is what the
    // model actually sees and therefore what fixes the generation order.
    const { properties } = await jsonSchema(calls[0]!)
    expect(Object.keys(properties)).toEqual([
      'followed',
      'working',
      'answer',
      'said_it_understood',
      'remark',
    ])
  })

  it('constrains a closed task to its options', async () => {
    const { generate, calls } = fakeGenerate({ ...OUTPUT, answer: 'は' })
    await runAttempt({ ...INPUT, options: ['は', 'が', 'を', 'に'] }, { generate })

    const { properties } = await jsonSchema(calls[0]!)
    expect(properties.answer).toMatchObject({ enum: ['は', 'が', 'を', 'に'] })
  })

  it('leaves a free-response answer unconstrained', async () => {
    const { generate, calls } = fakeGenerate(OUTPUT)
    await runAttempt(INPUT, { generate })

    const { properties } = await jsonSchema(calls[0]!)
    expect(properties.answer).toMatchObject({ type: 'string' })
    expect(properties.answer).not.toHaveProperty('enum')
  })
})

describe('it fails the way the judge fails', () => {
  it('maps 402 to JudgeBudgetExhausted', async () => {
    const { generate } = fakeGenerate(apiError(402))
    await expect(runAttempt(INPUT, { generate })).rejects.toBeInstanceOf(JudgeBudgetExhausted)
  })

  it('maps 429 to JudgeRateLimited, with the retry hint', async () => {
    const { generate } = fakeGenerate(apiError(429, { 'retry-after': '30' }))
    await expect(runAttempt(INPUT, { generate })).rejects.toMatchObject({
      retryAfterSeconds: 30,
    })
    const { generate: bare } = fakeGenerate(apiError(429))
    await expect(runAttempt(INPUT, { generate: bare })).rejects.toBeInstanceOf(JudgeRateLimited)
  })

  it('lets every other failure through untouched', async () => {
    // An attempt that failed for an unknown reason must not be settled as a miss. That would
    // charge the player a third of a stage for our outage.
    const { generate } = fakeGenerate(apiError(500))
    await expect(runAttempt(INPUT, { generate })).rejects.toBeInstanceOf(APICallError)

    const { generate: broken } = fakeGenerate(new TypeError('socket closed'))
    await expect(runAttempt(INPUT, { generate: broken })).rejects.toBeInstanceOf(TypeError)
  })

  it('refuses to call the model at all for an empty explanation', async () => {
    const { generate, calls } = fakeGenerate(OUTPUT)
    await expect(runAttempt({ ...INPUT, explanation: '  ' }, { generate })).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })
})
