/**
 * answer-key — is the avatar's answer the answer.
 *
 * `contract.ts`: "An avatar attempt scores against `items.answer`, which is the same ground
 * truth the closed ladders already use." So this module invents NO second notion of
 * correctness. It reads the shape that is already in `items.answer` and applies the rule that
 * shape already encodes.
 *
 * ── WHERE THE RULE CAME FROM ────────────────────────────────────────────────
 * There is no TypeScript grader in the repository yet: FORGE and RECALL reach a result through
 * the comparative judge, and `items.answer` is read by nothing in `src/`. The rule therefore
 * had to be read off the data, in `supabase/seed.sql`, where every one of the 35 closed items
 * carries exactly one of two shapes:
 *
 *   { "mode": "exact",  "primary": "書いて", "accept": ["書いて", "かいて"], "note": "..." }
 *   { "mode": "choice", "correct": "は", "note": "..." }
 *
 * and the prompt beside a `choice` item carries `options`, which `tasks.ts choicesFromPrompt`
 * already reads for the guessing floor. The rule those shapes encode is: an answer is correct
 * when it is one of the authored strings, and the `accept` array IS the tolerance mechanism.
 *
 * ── WHY THE MATCH IS THIS STRICT ────────────────────────────────────────────
 * No case folding, no punctuation stripping, no edit distance, no kana folding. Each of those
 * is a judgement about what counts as the same answer, and the seed already expresses those
 * judgements one item at a time in `accept` (書いて and かいて are both correct because someone
 * decided so and wrote it down). A normaliser here would silently overrule those decisions for
 * teaching only, and the teaching loop would then score differently from the ladder it claims
 * to share ground truth with. Case is not cosmetic in every world either: German `sie` and
 * `Sie` are different words.
 *
 * Two things are done, because without them two identical strings can compare unequal:
 *   * Unicode NFC. Canonical composition only. `NFKC` is not used: it folds half-width katakana
 *     onto full-width, which is a content decision and belongs in `accept`.
 *   * Leading and trailing whitespace is dropped.
 *
 * ── WHERE THIS SHOULD EVENTUALLY LIVE ───────────────────────────────────────
 * The moment a closed ladder grades in TypeScript, this file is the wrong home and the pair
 * must become one shared module. It is here because `src/lib/teaching/**` is the surface this
 * work owns, and a copy of the rule in two places is exactly the drift the header above warns
 * about. Move it, do not duplicate it.
 *
 * Pure: no I/O, no clock, no randomness.
 */

export class AnswerKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AnswerKeyError'
  }
}

/** Free response. Correct when the answer is `primary` or any member of `accept`. */
export interface ExactAnswerKey {
  readonly mode: 'exact'
  readonly primary: string
  readonly accept: readonly string[]
}

/** Closed item. Correct when the answer is `correct`, which is one of the prompt's options. */
export interface ChoiceAnswerKey {
  readonly mode: 'choice'
  readonly correct: string
}

export type AnswerKey = ExactAnswerKey | ChoiceAnswerKey

/**
 * The only normalisation applied to either side of the comparison. See the header for why the
 * list is this short.
 */
export function normalizeAnswer(value: string): string {
  return value.normalize('NFC').trim()
}

/**
 * Read one `items.answer` value.
 *
 * Throws rather than returning null on an unknown shape. An item whose key cannot be read is
 * an item that cannot be scored, and defaulting to "incorrect" would quietly mark every player
 * who taught it well as having failed.
 */
export function parseAnswerKey(value: unknown): AnswerKey {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AnswerKeyError(
      `items.answer must be an object, got ${value === null ? 'null' : typeof value}. An open ` +
        'DUEL brief has a null answer and cannot be a teaching task.',
    )
  }
  const row = value as Record<string, unknown>

  if (row.mode === 'exact') {
    const primary = row.primary
    if (typeof primary !== 'string' || primary.length === 0) {
      throw new AnswerKeyError('an exact answer key needs a non-empty `primary`')
    }
    const raw = row.accept
    if (raw !== undefined && !Array.isArray(raw)) {
      throw new AnswerKeyError('`accept` must be an array of strings when present')
    }
    const accept = (raw ?? []) as unknown[]
    if (accept.some((entry) => typeof entry !== 'string')) {
      throw new AnswerKeyError('`accept` must be an array of strings')
    }
    return { mode: 'exact', primary, accept: accept as readonly string[] }
  }

  if (row.mode === 'choice') {
    const correct = row.correct
    if (typeof correct !== 'string' || correct.length === 0) {
      throw new AnswerKeyError('a choice answer key needs a non-empty `correct`')
    }
    return { mode: 'choice', correct }
  }

  throw new AnswerKeyError(
    `unknown answer mode ${JSON.stringify(row.mode)}. The closed ladders use 'exact' and ` +
      "'choice'; a third mode is a content change and a change here, in that order.",
  )
}

/** Every string this key accepts, normalised. Exposed so a caller can show them after a miss. */
export function acceptedAnswers(key: AnswerKey): readonly string[] {
  const raw = key.mode === 'choice' ? [key.correct] : [key.primary, ...key.accept]
  const seen = new Set<string>()
  for (const entry of raw) seen.add(normalizeAnswer(entry))
  return [...seen]
}

/**
 * Did the avatar produce the answer.
 *
 * This boolean is the player's score for the session. Nothing about the avatar's own account
 * of itself is consulted: `AttemptResult.saidItUnderstood` is flavour, and a low-candour avatar
 * is expected to misreport it.
 */
export function isCorrectAnswer(key: AnswerKey, answer: string): boolean {
  return acceptedAnswers(key).includes(normalizeAnswer(answer))
}
