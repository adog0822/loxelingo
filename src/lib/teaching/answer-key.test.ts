import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  acceptedAnswers,
  AnswerKeyError,
  isCorrectAnswer,
  normalizeAnswer,
  parseAnswerKey,
} from './answer-key'

/**
 * The teaching loop scores against `items.answer`, which is the ground truth the closed
 * ladders already use. So the first job of this suite is to prove the parser reads the shapes
 * that are actually IN the content, rather than a shape somebody imagined.
 */
const SEED = join(process.cwd(), 'supabase/seed.sql')

describe('it reads the shapes the content actually carries', () => {
  const sql = readFileSync(SEED, 'utf8')

  /** Every `items.answer` literal in the seed, pulled out of its dollar quotes. */
  const keys = [...sql.matchAll(/\$j\$(\{"mode":[\s\S]*?\})\$j\$/g)].map((match) =>
    JSON.parse(match[1]!.replace(/\s*\n\s*/g, ' ')),
  )

  it('found both modes in the seed', () => {
    expect(keys.length).toBeGreaterThan(30)
    const modes = new Set(keys.map((key) => key.mode))
    expect([...modes].sort()).toEqual(['choice', 'exact'])
  })

  it('parses every one of them', () => {
    for (const key of keys) {
      const parsed = parseAnswerKey(key)
      expect(acceptedAnswers(parsed).length).toBeGreaterThan(0)
    }
  })

  it('marks the authored answer correct for every seeded item', () => {
    for (const key of keys) {
      const parsed = parseAnswerKey(key)
      const authored = parsed.mode === 'choice' ? parsed.correct : parsed.primary
      expect(isCorrectAnswer(parsed, authored)).toBe(true)
    }
  })

  it('honours every alternative the content author wrote down', () => {
    // 書いて and かいて are both correct because somebody decided so and put it in `accept`.
    // That array IS the tolerance mechanism, which is why this module adds none of its own.
    const withAlternatives = keys.filter(
      (key) => key.mode === 'exact' && key.accept.length > 1,
    )
    expect(withAlternatives.length).toBeGreaterThan(5)
    for (const key of withAlternatives) {
      const parsed = parseAnswerKey(key)
      for (const alternative of key.accept) {
        expect(isCorrectAnswer(parsed, alternative)).toBe(true)
      }
    }
  })
})

describe('exact answers', () => {
  const key = parseAnswerKey({
    mode: 'exact',
    primary: '書いて',
    accept: ['書いて', 'かいて'],
    note: 'ignored',
  })

  it('accepts the primary and every alternative, and nothing else', () => {
    expect(isCorrectAnswer(key, '書いて')).toBe(true)
    expect(isCorrectAnswer(key, 'かいて')).toBe(true)
    expect(isCorrectAnswer(key, '書きて')).toBe(false)
    expect(isCorrectAnswer(key, '')).toBe(false)
  })

  it('forgives whitespace around the answer and nothing inside it', () => {
    expect(isCorrectAnswer(key, '  書いて \n')).toBe(true)
    expect(isCorrectAnswer(key, '書 いて')).toBe(false)
  })

  it('refuses to fold anything the content author did not fold', () => {
    // No case folding: German `sie` and `Sie` are different words, and a normaliser here would
    // overrule the seed's per-item judgements for teaching only. An item that wants both
    // spellings says so in `accept`.
    const german = parseAnswerKey({ mode: 'exact', primary: 'Sie', accept: ['Sie'] })
    expect(isCorrectAnswer(german, 'sie')).toBe(false)
    expect(isCorrectAnswer(german, 'Sie')).toBe(true)

    // No punctuation stripping either.
    expect(isCorrectAnswer(key, '書いて。')).toBe(false)
  })

  it('compares composed and decomposed forms as the same string', () => {
    // The only normalisation, and it exists because without it two identical-looking strings
    // compare unequal for reasons no content author can see.
    const decomposed = 'か' + '゙' + 'っこう' // か + combining dakuten
    expect(normalizeAnswer(decomposed)).toBe('がっこう')
    const gakkou = parseAnswerKey({ mode: 'exact', primary: 'がっこう', accept: ['がっこう'] })
    expect(isCorrectAnswer(gakkou, decomposed)).toBe(true)
  })

  it('de-duplicates the accepted set', () => {
    expect(acceptedAnswers(key)).toEqual(['書いて', 'かいて'])
  })
})

describe('choice answers', () => {
  const key = parseAnswerKey({ mode: 'choice', correct: 'は', note: 'ignored' })

  it('accepts the correct option alone', () => {
    expect(isCorrectAnswer(key, 'は')).toBe(true)
    expect(isCorrectAnswer(key, 'が')).toBe(false)
  })

  it('accepts it with the whitespace a model tends to add', () => {
    expect(isCorrectAnswer(key, ' は')).toBe(true)
  })
})

describe('a key it cannot read is an error, not a miss', () => {
  it('refuses a null answer', () => {
    // An open DUEL brief has a null answer. Scoring it as incorrect would mark every player
    // who taught it well as having failed, silently.
    expect(() => parseAnswerKey(null)).toThrow(AnswerKeyError)
  })

  it('refuses an unknown mode', () => {
    expect(() => parseAnswerKey({ mode: 'fuzzy', primary: 'x' })).toThrow(AnswerKeyError)
  })

  it('refuses a malformed key of a known mode', () => {
    expect(() => parseAnswerKey({ mode: 'exact', accept: ['x'] })).toThrow(AnswerKeyError)
    expect(() => parseAnswerKey({ mode: 'exact', primary: 'x', accept: 'x' })).toThrow(
      AnswerKeyError,
    )
    expect(() => parseAnswerKey({ mode: 'exact', primary: 'x', accept: [1] })).toThrow(
      AnswerKeyError,
    )
    expect(() => parseAnswerKey({ mode: 'choice' })).toThrow(AnswerKeyError)
  })

  it('accepts an exact key with no alternatives at all', () => {
    const bare = parseAnswerKey({ mode: 'exact', primary: 'ねこ' })
    expect(acceptedAnswers(bare)).toEqual(['ねこ'])
  })
})
