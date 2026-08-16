/**
 * model-prior — how much of the teaching score is the model's prior rather than the player's
 * teaching.
 *
 * `attempt.ts` states the hole this file exists to fill: "a frontier model already knows the
 * material an N5 item tests, so a perfectly isolated prompt does not by itself make the avatar
 * ignorant [...] run the attempt with an empty-but-plausible explanation across the item bank
 * and the pass rate IS the model's prior." This is that run.
 *
 * ── NOT PART OF THE SUITE ───────────────────────────────────────────────────
 * It makes 600 billed model calls, so it skips unless RUN_LIVE=1 is set. Run it explicitly:
 *
 *   RUN_LIVE=1 MODEL_PRIOR_OUT=/tmp/model-prior.json \
 *     npx vitest run --config vitest.config.mts src/lib/teaching/model-prior.live.test.ts
 *
 * ── THE THREE CONDITIONS ────────────────────────────────────────────────────
 * Every one of the 40 `ladder_slug = 'forge'` items is attempted five times under each of:
 *
 *   VACUOUS     an explanation carrying no information about the concept. `buildAttemptPrompt`
 *               rejects an empty string, so the contentless line below stands in for it. The
 *               pass rate here IS p0, the prior.
 *   GOOD        a correct, minimal explanation, one or two sentences, of the kind a real player
 *               would type. Derived from the item's own `answer.note`.
 *   MISLEADING  a confidently stated WRONG rule for that item. The most informative of the
 *               three: an avatar that still answers correctly after being taught a wrong rule
 *               is not reading the explanation at all, and the item measures nothing.
 *
 * ── THE ISOLATION RULE HOLDS HERE TOO ───────────────────────────────────────
 * The harness builds an `AttemptInput` and calls `runAttempt`, exactly as production would. The
 * note, the concept, the answer key and the external id never enter the prompt: they are read
 * from the row here, used to pick a literal from the tables below and to grade the result, and
 * that is all. Correctness is `isCorrectAnswer` against `parseAnswerKey(items.answer)`, the same
 * ground truth the ladders use.
 *
 * ONE GAP WORTH NAMING: `src/` has no row-to-`AttemptInput` mapping yet. `tasks.ts
 * choicesFromPrompt` reads the option COUNT for the guessing floor and nothing reads the option
 * STRINGS, which `AttemptInput.options` needs. `optionsFromPrompt` below is that reader, and it
 * is cross-checked against `choicesFromPrompt` on every item so the harness cannot come to hold
 * a second opinion about how many choices an item has.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { type Avatar, parseAvatarRow } from '@/lib/avatars'
import { choicesFromPrompt } from '@/lib/match/tasks'

import { type AnswerKey, isCorrectAnswer, parseAnswerKey } from './answer-key'
import { JudgeRateLimited, type RunAttemptResult, runAttempt } from './attempt'
import type { AttemptInput } from './contract'

const LIVE = process.env.RUN_LIVE === '1'

/** Held constant across every run so personality is not a variable. Candour 0. */
const AVATAR_SLUG = 'vane'

const SAMPLES = 5
const CONCURRENCY = 6
const MAX_TRIES = 6

/**
 * The VACUOUS explanation. It has to be non-empty (`buildAttemptPrompt` throws otherwise) and
 * it has to carry nothing: no rule, no hint about the domain, not even which language.
 */
const VACUOUS = 'Just do your best with this one.'

type Condition = 'vacuous' | 'good' | 'misleading'
const CONDITIONS: readonly Condition[] = ['vacuous', 'good', 'misleading']

// ---------------------------------------------------------------------------
// The explanations, one pair per item, keyed by `items.external_id`.
//
// Written as a player would type them: one or two sentences, no worked example, no answer
// spelled out where the concept permits withholding it. Where an item is a lookup rather than a
// rule (`kanji_reading`), a correct explanation necessarily contains most of the answer, and
// that is a property of the item rather than of the wording here. The report says so.
// ---------------------------------------------------------------------------

interface Explanations {
  readonly good: string
  readonly misleading: string
}

const EXPLANATIONS: Record<string, Explanations> = {
  // ── en, article_choice ────────────────────────────────────────────────────
  'en-forge-article-a-university': {
    good:
      'Choose between the two by the sound the next word starts with, not by the letter it is ' +
      'written with. This one is said with a y sound at the front.',
    misleading:
      'The choice is decided by the written letter. Any word beginning with a, e, i, o or u ' +
      'takes an, with no exceptions.',
  },
  'en-forge-article-an-hour': {
    good:
      'Go by sound rather than spelling. The h at the front of this word is silent, so the word ' +
      'opens on a vowel sound.',
    misleading:
      'The rule is purely about spelling. A word written with a consonant letter at the front ' +
      'always takes a, however it happens to be pronounced.',
  },
  'en-forge-article-second-mention': {
    good:
      'A or an is for the first time you mention something. Once it has already been named the ' +
      'listener knows which one you mean, so it stops being one of many.',
    misleading:
      'English keeps the same article on a noun every time it is repeated in a passage. A noun ' +
      'introduced with a stays with a on its second mention.',
  },
  'en-forge-article-zero-everest': {
    good:
      'A single named mountain takes nothing in front of it. Ranges are the exception and do ' +
      'take an article, as in the Alps.',
    misleading:
      'Named geographical features all take the in English, so a mountain works the same way as ' +
      'a river or a sea.',
  },

  // ── en, capitalisation ───────────────────────────────────────────────────
  'en-forge-capitals-friday': {
    good:
      'English capitalises the first word of a sentence, personal names, days of the week and ' +
      'months of the year. Everything else here stays lower case.',
    misleading:
      'English capitalises the first word of a sentence and personal names only. Days and ' +
      'months stay lower case, the way they do across most of Europe.',
  },

  // ── en, countability_choice ──────────────────────────────────────────────
  'en-forge-much-luggage': {
    good:
      'This noun is a mass noun: it has no plural and you cannot count it directly. A quantity ' +
      'question about a mass noun uses much.',
    misleading:
      'This noun counts as plural in English because it stands for several separate bags, so a ' +
      'quantity question about it takes many.',
  },
  'en-forge-uncountable-advice': {
    good:
      'This noun is uncountable: no plural s, and no a or an in front of it. Put some before ' +
      'it, or count it with a piece of.',
    misleading:
      'This noun is an ordinary countable one and takes a plural s whenever there is more than ' +
      'one of them.',
  },

  // ── en, preposition_cloze ────────────────────────────────────────────────
  'en-forge-preposition-depend-on': {
    good:
      'This verb is fixed to one preposition in English and takes no other, whatever the ' +
      'equivalent verb takes in your language. The word is on.',
    misleading:
      'This verb takes of in English, matching the way the same verb works in French and in ' +
      'Spanish.',
  },
  'en-forge-preposition-on-monday': {
    good:
      'Parts of the day take in on their own, but as soon as a named day is attached in front ' +
      'the day decides it and the preposition becomes on.',
    misleading:
      'Parts of the day always take in, and putting a day name in front of one changes nothing ' +
      'about which preposition is used.',
  },

  // ── en, spelling ─────────────────────────────────────────────────────────
  'en-forge-spelling-make-ing': {
    good: 'When a verb ends in a silent e, the e is dropped before the ing is added.',
    misleading:
      'The verb is left exactly as it stands and ing goes on the end, so a final silent e stays ' +
      'where it is.',
  },
  'en-forge-spelling-plan-ing': {
    good:
      'A short verb ending in one vowel followed by one consonant doubles that final consonant ' +
      'before ing.',
    misleading:
      'English never doubles a letter before ing. You add the three letters to the verb exactly ' +
      'as it is written.',
  },
  'en-forge-spelling-study-past': {
    good:
      'When a verb ends in y with a consonant before it, the y turns into i before the ed. ' +
      'After a vowel the y stays.',
    misleading:
      'A verb ending in y keeps its y and simply takes ed on the end, the same way play does.',
  },

  // ── en, verb_form ────────────────────────────────────────────────────────
  'en-forge-participle-write': {
    good:
      'This verb has three separate forms, and the one that follows have is the third rather ' +
      'than the past simple. That third form ends in en.',
    misleading:
      'For this verb the past simple doubles as the form after have, so use the same word you ' +
      'would use for a plain past sentence.',
  },
  'en-forge-past-buy': {
    good:
      'This verb is irregular and takes no ed. Its past belongs to the ought family, alongside ' +
      'bring and think.',
    misleading: 'This verb is regular in the past, so add ed to the base form and leave the spelling alone.',
  },
  'en-forge-past-teach': {
    good:
      'Irregular, in the same aught family as catch. The ch at the end is replaced rather than ' +
      'kept, and there is no ed anywhere.',
    misleading:
      'This verb is regular in the past and just takes ed on the end, with no change to the ' +
      'letters before it.',
  },

  // ── ja, conjugation ──────────────────────────────────────────────────────
  'ja-forge-conj-hanasu-volitional': {
    good:
      'This is a godan verb, so the volitional moves its last syllable to the お row and adds ' +
      'う on the end.',
    misleading:
      'The volitional is made the same way for every verb: drop the last syllable and put よう ' +
      'in its place.',
  },
  'ja-forge-conj-iku-te': {
    good:
      'This verb is the one exception among く verbs. Instead of the usual ending it takes a ' +
      'small tsu followed by て.',
    misleading:
      'Every godan verb ending in く behaves identically in this form: replace the く with いて ' +
      'and you are done.',
  },
  'ja-forge-conj-kaku-te': {
    good: 'A godan verb ending in く drops that く and takes いて in its place.',
    misleading:
      'For a verb ending in く you keep the き stem and put て straight onto it, with no other ' +
      'change.',
  },
  'ja-forge-conj-kau-past': {
    good:
      'A godan verb ending in う takes a small tsu and た in the plain past, which is the same ' +
      'sound change the て form makes.',
    misleading:
      'A godan verb ending in う takes んだ in the plain past, the same as the む and ぶ verbs ' +
      'do.',
  },
  'ja-forge-conj-kuru-past': {
    good:
      'This verb is irregular. In the past its stem vowel changes to き and it takes a plain た ' +
      'on the end.',
    misleading:
      'This verb is regular here: keep the dictionary form as it stands and add た straight ' +
      'onto the end of it.',
  },
  'ja-forge-conj-matsu-te': {
    good:
      'A godan verb ending in つ drops that つ and takes a small tsu followed by て. The small ' +
      'tsu is a whole beat.',
    misleading:
      'A verb ending in つ makes this form by swapping the つ for て on its own, with nothing ' +
      'added in between.',
  },
  'ja-forge-conj-miru-neg': {
    good: 'This is an ichidan verb, so the plain negative drops the final る and adds ない.',
    misleading:
      'This verb is godan, so the negative moves its ending to the あ row first and then adds ' +
      'ない.',
  },
  'ja-forge-conj-nomu-potential': {
    good:
      'A godan verb makes the potential by moving its last syllable to the え row and putting ' +
      'る on the end.',
    misleading:
      'A godan verb makes the potential by moving its last syllable to the あ row and adding ' +
      'れる.',
  },
  'ja-forge-conj-oyogu-te': {
    good:
      'A godan verb ending in ぐ takes いで here. The voicing in the ぐ carries through into the ' +
      'ending.',
    misleading:
      'ぐ and く behave identically in this form. Both of them drop the last syllable and take ' +
      'いて.',
  },
  'ja-forge-conj-shizuka-past': {
    good:
      'A な-adjective is not conjugated the way an い-adjective is. Its past runs through the ' +
      'copula, so it takes だった on the end.',
    misleading:
      'A な-adjective takes the same past ending as an い-adjective, かった, put straight onto ' +
      'the stem.',
  },

  // ── ja, kanji_reading ────────────────────────────────────────────────────
  'ja-forge-kanji-densha': {
    good:
      'Both characters take their on-yomi in this word. The second one is a contracted sound ' +
      'written with a small ゃ, which counts as a single beat.',
    misleading:
      'Both characters take their kun-yomi here, so read the first as かみなり and the second as ' +
      'くるま.',
  },
  'ja-forge-kanji-gakkou': {
    good:
      'On-yomi in both halves, with a small tsu between them and a long o at the end. Four ' +
      'beats, four kana.',
    misleading:
      'Read the two on-yomi straight through with nothing between them and no long vowel at the ' +
      'end, so it comes to three kana.',
  },
  'ja-forge-kanji-hanabi': {
    good:
      'Both characters take their kun-yomi, and the second one voices inside the compound, so ' +
      'its h sound becomes a b sound.',
    misleading: 'Both characters take their on-yomi here, and nothing voices in this compound.',
  },
  'ja-forge-kanji-hitori': {
    good:
      'This is an irregular counted reading learned as a whole word rather than built from the ' +
      'two characters. It is the one for a single person, and it pairs with ふたり for two.',
    misleading:
      'Read it regularly: the number takes its on-yomi いち and the counter for people is にん, ' +
      'joined in that order.',
  },
  'ja-forge-kanji-kariru': {
    good:
      'A kun-yomi verb with okurigana. The kanji carries only the first beat and the りる that ' +
      'follows is already written in kana.',
    misleading:
      'This kanji takes its on-yomi しゃく in this word, with the kana ending left exactly as it ' +
      'is written.',
  },
  'ja-forge-kanji-kyou': {
    good:
      'The reading belongs to the pair as a whole and not to either character on its own. It is ' +
      'the everyday word for this day, two kana with a small ょ in it.',
    misleading:
      'Read each character with its on-yomi and join them: こん for the first and じつ for the ' +
      'second.',
  },
  'ja-forge-kanji-renshuu': {
    good:
      'Both characters take their on-yomi, and the second ends in a long vowel. That makes five ' +
      'kana for four beats.',
    misleading:
      'Both take their on-yomi and there is no long vowel at the end, so it comes to four kana.',
  },
  'ja-forge-kanji-taberu': {
    good:
      'Kun-yomi with okurigana: the kanji supplies a single beat and the べる after it is ' +
      'already in kana.',
    misleading:
      'This kanji takes its on-yomi しょく here, exactly as it does in the compounds for meal ' +
      'and canteen.',
  },
  'ja-forge-kanji-tegami': {
    good:
      'Both halves are kun-yomi, and the second one voices inside the compound, so its k sound ' +
      'becomes a g sound.',
    misleading:
      'Nothing voices in this compound. Read both halves exactly as they sound when they stand ' +
      'on their own.',
  },
  'ja-forge-kanji-tenki': {
    good:
      'Both characters take their on-yomi and nothing voices in this compound, so read them ' +
      'straight through.',
    misleading:
      'The second character voices inside this compound, so its reading starts on a g sound ' +
      'rather than a k sound.',
  },

  // ── ja, particle_choice ──────────────────────────────────────────────────
  'ja-forge-particle-de-library': {
    good:
      'A place where an action is carried out takes で. The other one marks where something ' +
      'merely sits or exists.',
    misleading:
      'Any place mentioned in a sentence takes に, whether something is happening there or it is ' +
      'simply where a thing is.',
  },
  'ja-forge-particle-ga-dekiru': {
    good:
      'The verb of ability does not take an ordinary object. The thing you are able to do is ' +
      'marked as the subject instead.',
    misleading:
      'The thing you are able to do is the object of the verb, so it takes the object marker ' +
      'like any other object.',
  },
  'ja-forge-particle-ni-seven': {
    good:
      'A specific clock time is a point on the timeline, and a point in time takes に.',
    misleading:
      'A time of day is treated as the setting an action takes place in, so it takes the same ' +
      'particle as a place where something happens.',
  },
  'ja-forge-particle-wa-student': {
    good:
      'Introducing yourself, you are the topic already in front of both of you rather than new ' +
      'information, so the topic marker is the one.',
    misleading:
      'A sentence that identifies who someone is presents that person as new information, so ' +
      'the subject marker is used rather than the topic marker.',
  },
  'ja-forge-particle-wo-coffee': {
    good: 'This verb is transitive and takes a direct object, and a direct object is marked with を.',
    misleading:
      'Verbs of consuming treat the thing consumed as the subject rather than the object, so it ' +
      'takes が.',
  },
}

/**
 * Items whose task text ENUMERATES the permitted answers even though `items.prompt` carries no
 * `options` array. "Write a or an" is a two-way choice and "Write at, on or in" is a three-way
 * one, so their guessing floor is not zero and p0 must be read against it. Everything absent
 * from this map and from `prompt.options` is open response, floor treated as 0.
 */
const CONSTRAINED_FREE_RESPONSE: Record<string, number> = {
  'en-forge-article-a-university': 2,
  'en-forge-article-an-hour': 2,
  'en-forge-preposition-on-monday': 3,
}

// ---------------------------------------------------------------------------
// Environment and database, both read through the same psql the brief specifies. No new
// dependency is added for either.
// ---------------------------------------------------------------------------

/** Parse `.env.local` by hand. `dotenv` is not a dependency of this repo, transitive or direct. */
function loadEnvLocal(path = '.env.local'): void {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

if (LIVE) loadEnvLocal()

function psqlJson(sql: string): unknown {
  const out = execFileSync(
    'docker',
    ['exec', '-i', 'supabase_db_loxelingo', 'psql', '-U', 'postgres', '-t', '-A', '-c', sql],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  ).trim()
  return out.length === 0 ? null : (JSON.parse(out) as unknown)
}

interface ItemRow {
  id: number
  external_id: string
  world_slug: string
  kind: string
  prompt: unknown
  answer: unknown
}

function loadForgeItems(): ItemRow[] {
  const rows = psqlJson(
    'select json_agg(row_to_json(t)) from (select id, external_id, world_slug, kind, prompt, ' +
      "answer from items where ladder_slug = 'forge' order by external_id) t;",
  )
  if (!Array.isArray(rows)) throw new Error('no forge items returned')
  return rows as ItemRow[]
}

function loadAvatar(slug: string): Avatar {
  const row = psqlJson(
    'select row_to_json(t) from (select slug, name, look, hook, warmth, humour, edge, patience, ' +
      `candour, drive, voice_guide, reactions, portrait_path, sort_order from avatars where ` +
      `slug = '${slug}') t;`,
  )
  if (row === null) throw new Error(`no avatar row for slug '${slug}'`)
  return parseAvatarRow(row)
}

// ---------------------------------------------------------------------------
// Reading the item row into an `AttemptInput`
// ---------------------------------------------------------------------------

function taskFromPrompt(prompt: unknown): string {
  if (prompt === null || typeof prompt !== 'object') throw new Error('items.prompt is not an object')
  const task = (prompt as { task?: unknown }).task
  if (typeof task !== 'string' || task.length === 0) throw new Error('items.prompt.task is missing')
  return task
}

/**
 * The option STRINGS. `tasks.ts choicesFromPrompt` reads the same array for its length only, and
 * every call site below asserts the two agree.
 */
function optionsFromPrompt(prompt: unknown): readonly string[] | null {
  if (prompt === null || typeof prompt !== 'object') return null
  const options = (prompt as { options?: unknown }).options
  if (!Array.isArray(options) || options.length < 2) return null
  return options.map(String)
}

interface Task {
  externalId: string
  world: string
  kind: string
  task: string
  options: readonly string[] | null
  /** P(correct) from a blind guess, by construction. 0 where the answer space is open. */
  floor: number
  key: AnswerKey
  explanations: Explanations
}

function toTask(row: ItemRow): Task {
  const options = optionsFromPrompt(row.prompt)
  const count = choicesFromPrompt(row.prompt)
  if ((options?.length ?? undefined) !== count) {
    throw new Error(
      `option reader disagrees with choicesFromPrompt on ${row.external_id}: ` +
        `${options?.length ?? 'none'} vs ${count ?? 'none'}`,
    )
  }
  const explanations = EXPLANATIONS[row.external_id]
  if (!explanations) throw new Error(`no authored explanations for ${row.external_id}`)

  const enumerated = CONSTRAINED_FREE_RESPONSE[row.external_id]
  const k = options?.length ?? enumerated
  return {
    externalId: row.external_id,
    world: row.world_slug,
    kind: row.kind,
    task: taskFromPrompt(row.prompt),
    options,
    floor: k === undefined ? 0 : 1 / k,
    key: parseAnswerKey(row.answer),
    explanations,
  }
}

function explanationFor(task: Task, condition: Condition): string {
  if (condition === 'vacuous') return VACUOUS
  return condition === 'good' ? task.explanations.good : task.explanations.misleading
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Retry rate limits and transient API failures. An error is never scored as a miss. */
async function attemptWithRetry(input: AttemptInput): Promise<RunAttemptResult> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
    try {
      return await runAttempt(input)
    } catch (error) {
      lastError = error
      if (error instanceof JudgeRateLimited) {
        const after = error.retryAfterSeconds
        await sleep(after !== undefined ? after * 1000 : 2000 * 2 ** attempt)
        continue
      }
      // Overloads and 5xx from the provider are transient in exactly the same way.
      await sleep(1000 * 2 ** attempt)
    }
  }
  throw lastError
}

interface Sample {
  externalId: string
  world: string
  kind: string
  condition: Condition
  sample: number
  correct: boolean | null
  answer: string | null
  saidItUnderstood: boolean | null
  error: string | null
}

async function runPool<T>(jobs: readonly (() => Promise<T>)[], width: number): Promise<T[]> {
  const results = new Array<T>(jobs.length)
  let next = 0
  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next
      next += 1
      if (i >= jobs.length) return
      results[i] = await jobs[i]!()
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, jobs.length) }, worker))
  return results
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

interface Cell {
  n: number
  correct: number
  errors: number
}

const rate = (cell: Cell): number => (cell.n === 0 ? 0 : cell.correct / cell.n)

function tally(samples: readonly Sample[]): Cell {
  return {
    n: samples.filter((s) => s.correct !== null).length,
    correct: samples.filter((s) => s.correct === true).length,
    errors: samples.filter((s) => s.error !== null).length,
  }
}

describe.skipIf(!LIVE)('model prior on the forge item bank', () => {
  it(
    'measures p0, p_good and p_misleading for every forge item',
    async () => {
      const avatar = loadAvatar(AVATAR_SLUG)
      const tasks = loadForgeItems().map(toTask)
      expect(tasks).toHaveLength(40)

      const units: { task: Task; condition: Condition; sample: number }[] = []
      for (const task of tasks) {
        for (const condition of CONDITIONS) {
          for (let sample = 0; sample < SAMPLES; sample += 1) {
            units.push({ task, condition, sample })
          }
        }
      }

      const started = Date.now()
      let done = 0
      const samples = await runPool(
        units.map(({ task, condition, sample }) => async (): Promise<Sample> => {
          const input: AttemptInput = {
            avatar,
            traits: avatar.traits,
            explanation: explanationFor(task, condition),
            task: task.task,
            options: task.options,
            ladder: 'forge',
          }
          const base = {
            externalId: task.externalId,
            world: task.world,
            kind: task.kind,
            condition,
            sample,
          }
          try {
            const result = await attemptWithRetry(input)
            return {
              ...base,
              correct: isCorrectAnswer(task.key, result.answer),
              answer: result.answer,
              saidItUnderstood: result.saidItUnderstood,
              error: null,
            }
          } catch (error) {
            return {
              ...base,
              correct: null,
              answer: null,
              saidItUnderstood: null,
              error: String(error),
            }
          } finally {
            done += 1
            if (done % 30 === 0) {
              const secs = Math.round((Date.now() - started) / 1000)
              console.log(`  ${done}/${units.length} attempts, ${secs}s elapsed`)
            }
          }
        }),
        CONCURRENCY,
      )

      const byItem = tasks.map((task) => {
        const mine = samples.filter((s) => s.externalId === task.externalId)
        const cell = (condition: Condition): Cell =>
          tally(mine.filter((s) => s.condition === condition))
        return {
          externalId: task.externalId,
          world: task.world,
          kind: task.kind,
          floor: task.floor,
          options: task.options?.length ?? null,
          p0: rate(cell('vacuous')),
          pGood: rate(cell('good')),
          pMisleading: rate(cell('misleading')),
          vacuous: cell('vacuous'),
          good: cell('good'),
          misleading: cell('misleading'),
          vacuousAnswers: mine.filter((s) => s.condition === 'vacuous').map((s) => s.answer),
          misleadingAnswers: mine.filter((s) => s.condition === 'misleading').map((s) => s.answer),
        }
      })

      const report = {
        avatar: avatar.slug,
        samples: SAMPLES,
        items: tasks.length,
        attempts: samples.length,
        errors: samples.filter((s) => s.error !== null).length,
        elapsedMs: Date.now() - started,
        byItem,
        samplesRaw: samples,
      }

      const out = process.env.MODEL_PRIOR_OUT
      if (out) writeFileSync(out, JSON.stringify(report, null, 2))
      console.log(JSON.stringify({ ...report, samplesRaw: undefined }, null, 2))

      // The one hard assertion: the run completed. Every number above is a measurement and the
      // whole point of taking it is that we do not know what it will be.
      expect(report.attempts).toBe(tasks.length * CONDITIONS.length * SAMPLES)
    },
    60 * 60 * 1000,
  )
})
