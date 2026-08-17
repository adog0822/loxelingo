/**
 * measure-prior: measure p0 for a bank of candidate items, in stages, and write the result
 * back to `public.items`.
 *
 * Launched by `./run.mjs`. Read `./README.md` for usage and `docs/research/09-prior-filter.md`
 * for the design. The short version: `docs/research/06-model-prior.md` found that a contentless
 * explanation scores 0.885 on the current bank, so an item is only worth serving when the
 * avatar's default answer is WRONG, and p0 is what tells us which those are.
 *
 * ── WHY THIS IS A TOOL AND NOT A TEST ───────────────────────────────────────
 * `src/lib/teaching/model-prior.live.test.ts` measured 40 items in 600 calls. The generated bank
 * is thousands, which is hours of wall time and real money, so the run has to survive being
 * interrupted, has to be smoke-testable on a subset first, and has to be able to write its
 * findings somewhere durable. A vitest case is none of those things.
 *
 * ── THE ISOLATION RULE STILL HOLDS ──────────────────────────────────────────
 * Every attempt goes through `buildAttemptPrompt` then `runAttempt`, exactly as production does.
 * The answer key, the concept and the external id are read here to grade and to key results, and
 * never enter an `AttemptInput`. Correctness is `isCorrectAnswer` against
 * `parseAnswerKey(items.answer)`, the same ground truth the ladders use.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import { type Avatar, parseAvatarRow } from '@/lib/avatars'
import { choicesFromPrompt } from '@/lib/match/tasks'
import { type AnswerKey, isCorrectAnswer, parseAnswerKey } from '@/lib/teaching/answer-key'
import {
  attemptConfig,
  JudgeBudgetExhausted,
  JudgeRateLimited,
  type RunAttemptResult,
  runAttempt,
} from '@/lib/teaching/attempt'
import type { AttemptInput } from '@/lib/teaching/contract'
import {
  type Interval,
  isNearMiss,
  mayPersistPrior,
  PRIOR_CONFIRM_SAMPLES,
  PRIOR_RESCUE_SAMPLES,
  PRIOR_SCREEN_MAX_P0,
  PRIOR_SCREEN_SAMPLES,
  TEACHABLE_MAX_P0,
  wilsonInterval,
} from '@/lib/teaching/prior'
import { ATTEMPT_PROMPT_VERSION } from '@/lib/teaching/prompt'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * The VACUOUS explanation, identical to the one `model-prior.live.test.ts` used so the two runs
 * are comparable. Non-empty because `buildAttemptPrompt` rejects an empty string, and carrying
 * nothing: no rule, no hint about the domain, not even which language.
 */
const VACUOUS = 'Just do your best with this one.'

/** Held constant so avatar personality is never a variable in a measurement. Candour 0. */
const DEFAULT_AVATAR = 'vane'

const MAX_TRIES = 6

/**
 * claude-haiku-4-5 list pricing, USD per million tokens. Used only to report what a run cost and
 * to project the cost of a larger one; nothing depends on it being current.
 */
const USD_PER_MTOK_IN = 1
const USD_PER_MTOK_OUT = 5

/**
 * 1 screens, 2 decides, 3 gives a near miss a second hearing on a larger fresh draw. Each stage
 * decides on its own sample and never pools with the stage that selected it into this one.
 */
type Stage = 1 | 2 | 3

const SAMPLES_FOR_STAGE: Record<Stage, number> = {
  1: PRIOR_SCREEN_SAMPLES,
  2: PRIOR_CONFIRM_SAMPLES,
  3: PRIOR_RESCUE_SAMPLES,
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const HELP = `
measure-prior: staged measurement of the model prior p0 across an item bank.

  node scripts/content/measure-prior/run.mjs [options]

  Stage 1 screens every candidate at n=${PRIOR_SCREEN_SAMPLES} and rejects anything at or above
  p0 ${PRIOR_SCREEN_MAX_P0}. Stage 2 re-measures survivors at n=${PRIOR_CONFIRM_SAMPLES} on a
  fresh draw. Stage 3 gives near misses another n=${PRIOR_RESCUE_SAMPLES}. An item is eligible
  when the upper bound of its 95% Wilson interval, on the deciding stage alone, sits below
  ${TEACHABLE_MAX_P0}.

  --source db|jsonl     where candidates come from (default: db)
  --file <path>         JSONL candidates, when --source jsonl
                        (default: scripts/content/generate/out/candidates.jsonl)
  --ladder <slug>       db only: which ladder to read (default: forge)
  --world <slug>        db only: restrict to one world
  --limit <n>           stop after n candidates. Use this before spending real money.
  --avatar <slug>       which avatar attempts (default: ${DEFAULT_AVATAR})
  --concurrency <n>     in-flight attempts (default: 6)
  --checkpoint <path>   resumable attempt log (default: <here>/out/checkpoint.jsonl)
  --out <path>          report JSON (default: <here>/out/report.json)
  --container <name>    psql container (default: supabase_db_loxelingo)
  --write               write measurements back to public.items (default: dry run)
  --fresh               ignore any existing checkpoint and start over
  --help
`.trimStart()

interface Options {
  source: 'db' | 'jsonl'
  file: string
  ladder: string
  world: string | null
  limit: number | null
  avatar: string
  concurrency: number
  checkpoint: string
  out: string
  container: string
  write: boolean
  fresh: boolean
}

function readOptions(): Options {
  const { values } = parseArgs({
    options: {
      source: { type: 'string', default: 'db' },
      file: { type: 'string' },
      ladder: { type: 'string', default: 'forge' },
      world: { type: 'string' },
      limit: { type: 'string' },
      avatar: { type: 'string', default: DEFAULT_AVATAR },
      concurrency: { type: 'string', default: '6' },
      checkpoint: { type: 'string' },
      out: { type: 'string' },
      container: { type: 'string', default: 'supabase_db_loxelingo' },
      write: { type: 'boolean', default: false },
      fresh: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  })

  if (values.help) {
    process.stdout.write(HELP)
    process.exit(0)
  }

  const source = values.source === 'jsonl' ? 'jsonl' : 'db'
  if (values.source !== 'db' && values.source !== 'jsonl') {
    throw new Error(`--source must be db or jsonl, got ${String(values.source)}`)
  }

  // fileURLToPath rather than `new URL(...).pathname`, which leaves `%20` in place and would
  // write the checkpoint into a directory named after the escaped path.
  const here = dirname(fileURLToPath(import.meta.url))
  return {
    source,
    file: values.file ?? 'scripts/content/generate/out/candidates.jsonl',
    ladder: values.ladder ?? 'forge',
    world: values.world ?? null,
    limit: values.limit === undefined ? null : Number(values.limit),
    avatar: values.avatar ?? DEFAULT_AVATAR,
    concurrency: Number(values.concurrency ?? '6'),
    checkpoint: values.checkpoint ?? `${here}/out/checkpoint.jsonl`,
    out: values.out ?? `${here}/out/report.json`,
    container: values.container ?? 'supabase_db_loxelingo',
    write: values.write ?? false,
    fresh: values.fresh ?? false,
  }
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

interface ItemRow {
  external_id: string
  world_slug: string
  kind: string
  prompt: unknown
  answer: unknown
}

interface Candidate {
  externalId: string
  world: string
  kind: string
  task: string
  options: readonly string[] | null
  key: AnswerKey
}

function psql(container: string, sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-t', '-A', '-c', sql],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  ).trim()
}

function psqlJson(container: string, sql: string): unknown {
  const out = psql(container, sql)
  return out.length === 0 ? null : (JSON.parse(out) as unknown)
}

const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`

function loadFromDb(opts: Options): ItemRow[] {
  const world = opts.world === null ? '' : ` and world_slug = ${quote(opts.world)}`
  const rows = psqlJson(
    opts.container,
    'select json_agg(row_to_json(t)) from (select external_id, world_slug, kind, prompt, ' +
      `answer from items where ladder_slug = ${quote(opts.ladder)}${world} and answer is not null ` +
      'order by external_id) t;',
  )
  if (!Array.isArray(rows)) throw new Error('no candidate items returned from the database')
  return rows as ItemRow[]
}

/**
 * The JSONL shape is the DB row shape: one object per line with `external_id`, `world_slug`,
 * `kind`, `prompt` and `answer`. Deliberately not a second schema, so the generator's output and
 * the item table stay describable by one sentence and this tool needs no adapter when the
 * candidates land.
 */
function loadFromJsonl(path: string): ItemRow[] {
  const text = readFileSync(path, 'utf8')
  const rows: ItemRow[] = []
  for (const [index, line] of text.split('\n').entries()) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    try {
      rows.push(JSON.parse(trimmed) as ItemRow)
    } catch (error) {
      throw new Error(`${path}:${index + 1} is not JSON: ${String(error)}`)
    }
  }
  return rows
}

function taskFromPrompt(prompt: unknown): string {
  if (prompt === null || typeof prompt !== 'object') throw new Error('prompt is not an object')
  const task = (prompt as { task?: unknown }).task
  if (typeof task !== 'string' || task.length === 0) throw new Error('prompt.task is missing')
  return task
}

function optionsFromPrompt(prompt: unknown): readonly string[] | null {
  if (prompt === null || typeof prompt !== 'object') return null
  const options = (prompt as { options?: unknown }).options
  if (!Array.isArray(options) || options.length < 2) return null
  return options.map(String)
}

function toCandidate(row: ItemRow): Candidate {
  const options = optionsFromPrompt(row.prompt)
  // Cross-checked against the reader the ladders use, so this tool cannot come to hold a second
  // opinion about how many choices an item has.
  const count = choicesFromPrompt(row.prompt)
  if ((options?.length ?? undefined) !== count) {
    throw new Error(
      `option reader disagrees with choicesFromPrompt on ${row.external_id}: ` +
        `${options?.length ?? 'none'} vs ${count ?? 'none'}`,
    )
  }
  return {
    externalId: row.external_id,
    world: row.world_slug,
    kind: row.kind,
    task: taskFromPrompt(row.prompt),
    options,
    key: parseAnswerKey(row.answer),
  }
}

function loadAvatar(container: string, slug: string): Avatar {
  const row = psqlJson(
    container,
    'select row_to_json(t) from (select slug, name, look, hook, warmth, humour, edge, patience, ' +
      `candour, drive, voice_guide, reactions, portrait_path, sort_order from avatars where ` +
      `slug = ${quote(slug)}) t;`,
  )
  if (row === null) throw new Error(`no avatar row for slug '${slug}'`)
  return parseAvatarRow(row)
}

// ---------------------------------------------------------------------------
// The checkpoint
// ---------------------------------------------------------------------------

/**
 * One line per completed attempt. Append-only, flushed as each attempt lands, so an interrupted
 * run resumes at the attempt granularity rather than the item granularity.
 *
 * `promptVersion` and `model` ride on every line because a checkpoint written under a different
 * prompt or model is not a partial result, it is a different measurement. Lines that do not
 * match the current configuration are counted and ignored rather than silently reused.
 */
interface AttemptRecord {
  stage: Stage
  externalId: string
  sample: number
  correct: boolean | null
  answer: string | null
  error: string | null
  promptVersion: number
  model: string
  inputTokens: number
  outputTokens: number
  at: string
}

const unitKey = (stage: Stage, externalId: string, sample: number): string =>
  `${stage}:${externalId}:${sample}`

interface Checkpoint {
  done: Map<string, AttemptRecord>
  stale: number
  failed: number
}

function readCheckpoint(path: string, model: string): Checkpoint {
  const done = new Map<string, AttemptRecord>()
  let stale = 0
  let failed = 0
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return { done, stale, failed }
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    const record = JSON.parse(trimmed) as AttemptRecord
    if (record.promptVersion !== ATTEMPT_PROMPT_VERSION || record.model !== model) {
      stale += 1
      continue
    }
    // An attempt that ended in an error is not a result. It is replayed on resume, because
    // scoring our own outage as a miss would depress p0 and make dead items look teachable.
    if (record.error !== null) {
      failed += 1
      continue
    }
    done.set(unitKey(record.stage, record.externalId, record.sample), record)
  }
  return { done, stale, failed }
}

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Retry rate limits and transient failures. An error is never scored as a miss. */
async function attemptWithRetry(input: AttemptInput): Promise<RunAttemptResult> {
  let lastError: unknown
  for (let attempt = 0; attempt < MAX_TRIES; attempt += 1) {
    try {
      return await runAttempt(input)
    } catch (error) {
      // A budget that is gone will not come back inside this run, and continuing would burn the
      // remaining minutes producing nothing but errors.
      if (error instanceof JudgeBudgetExhausted) throw error
      lastError = error
      if (error instanceof JudgeRateLimited) {
        const after = error.retryAfterSeconds
        await sleep(after !== undefined ? after * 1000 : 2000 * 2 ** attempt)
        continue
      }
      await sleep(1000 * 2 ** attempt)
    }
  }
  throw lastError
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

interface StageResult {
  /** Keyed by external id. */
  byItem: Map<string, ItemTally>
  attempts: number
  errors: number
  inputTokens: number
  outputTokens: number
}

interface ItemTally {
  n: number
  correct: number
  errors: number
  answers: (string | null)[]
}

const rate = (tally: ItemTally): number => (tally.n === 0 ? 0 : tally.correct / tally.n)

async function runStage(
  stage: Stage,
  candidates: readonly Candidate[],
  avatar: Avatar,
  opts: Options,
  checkpoint: Map<string, AttemptRecord>,
  model: string,
): Promise<StageResult> {
  const samples = SAMPLES_FOR_STAGE[stage]
  const units: { candidate: Candidate; sample: number }[] = []
  for (const candidate of candidates) {
    for (let sample = 0; sample < samples; sample += 1) {
      units.push({ candidate, sample })
    }
  }

  const pending = units.filter(
    ({ candidate, sample }) => !checkpoint.has(unitKey(stage, candidate.externalId, sample)),
  )
  const started = Date.now()
  let done = 0
  console.log(
    `stage ${stage}: ${candidates.length} items x ${samples} samples = ${units.length} attempts` +
      ` (${units.length - pending.length} already in the checkpoint)`,
  )

  const fresh = await runPool(
    pending.map(({ candidate, sample }) => async (): Promise<AttemptRecord> => {
      const input: AttemptInput = {
        avatar,
        traits: avatar.traits,
        explanation: VACUOUS,
        task: candidate.task,
        options: candidate.options,
        ladder: 'forge',
      }
      const base = { stage, externalId: candidate.externalId, sample }
      let record: AttemptRecord
      try {
        const result = await attemptWithRetry(input)
        record = {
          ...base,
          correct: isCorrectAnswer(candidate.key, result.answer),
          answer: result.answer,
          error: null,
          promptVersion: result.meta.promptVersion,
          model: result.meta.model,
          inputTokens: result.meta.inputTokens,
          outputTokens: result.meta.outputTokens,
          at: new Date().toISOString(),
        }
      } catch (error) {
        if (error instanceof JudgeBudgetExhausted) throw error
        record = {
          ...base,
          correct: null,
          answer: null,
          error: String(error),
          promptVersion: ATTEMPT_PROMPT_VERSION,
          model,
          inputTokens: 0,
          outputTokens: 0,
          at: new Date().toISOString(),
        }
      }
      appendFileSync(opts.checkpoint, `${JSON.stringify(record)}\n`)
      done += 1
      if (done % 25 === 0 || done === pending.length) {
        const secs = Math.round((Date.now() - started) / 1000)
        console.log(`  stage ${stage}: ${done}/${pending.length} new attempts, ${secs}s elapsed`)
      }
      return record
    }),
    opts.concurrency,
  )

  const all: AttemptRecord[] = [...fresh]
  for (const { candidate, sample } of units) {
    const previous = checkpoint.get(unitKey(stage, candidate.externalId, sample))
    if (previous) all.push(previous)
  }

  const byItem = new Map<string, ItemTally>()
  for (const candidate of candidates) {
    byItem.set(candidate.externalId, { n: 0, correct: 0, errors: 0, answers: [] })
  }
  let inputTokens = 0
  let outputTokens = 0
  let errors = 0
  for (const record of all) {
    const tally = byItem.get(record.externalId)
    if (!tally) continue
    inputTokens += record.inputTokens
    outputTokens += record.outputTokens
    if (record.error !== null) {
      tally.errors += 1
      errors += 1
      continue
    }
    tally.n += 1
    if (record.correct === true) tally.correct += 1
    tally.answers.push(record.answer)
  }

  return { byItem, attempts: all.length, errors, inputTokens, outputTokens }
}

// ---------------------------------------------------------------------------
// Writing back
// ---------------------------------------------------------------------------

interface Measurement {
  externalId: string
  p0: number
  samples: number
  interval: Interval
  /** Which stage's sample this figure is. Only 2 and 3 may grant eligibility. */
  stage: Stage
  eligible: boolean
}

function writeBack(opts: Options, measurements: readonly Measurement[], model: string): number {
  const writable = measurements.filter((m) => {
    if (mayPersistPrior(m.p0, m.samples)) return true
    // Unreachable by construction: stage-1 survivors always go on to stage 2, and stage-1
    // rejects always sit above PRIOR_SCREEN_MAX_P0, which is above the eligibility line. The
    // guard is here because the one thing this tool must never do is record an eligible-looking
    // figure from the sample that selected it.
    console.warn(
      `refusing to persist ${m.externalId}: p0 ${m.p0} at n=${m.samples} would read as eligible ` +
        `from a screening sample`,
    )
    return false
  })
  if (writable.length === 0) return 0

  const rows = writable
    .map(
      (m) =>
        `(${quote(m.externalId)}, ${m.p0}::double precision, ${m.samples}::integer, ` +
        `${ATTEMPT_PROMPT_VERSION}::integer, ${quote(model)}::text)`,
    )
    .join(',\n    ')

  const sql =
    'update public.items as i set\n' +
    '  prior_p0 = v.p0, prior_samples = v.samples, prior_prompt_version = v.prompt_version,\n' +
    '  prior_model = v.model, prior_measured_at = now()\n' +
    `from (values\n    ${rows}\n) as v(external_id, p0, samples, prompt_version, model)\n` +
    'where i.external_id = v.external_id;'

  const out = psql(opts.container, sql)
  console.log(`write-back: ${out}`)
  return writable.length
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = readOptions()
  const config = attemptConfig()
  const model = config.model

  if (config.promptVersion !== ATTEMPT_PROMPT_VERSION) {
    throw new Error('attemptConfig() and ATTEMPT_PROMPT_VERSION disagree')
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set; put it in .env.local or the environment')
  }

  mkdirSync(dirname(opts.checkpoint), { recursive: true })
  mkdirSync(dirname(opts.out), { recursive: true })
  if (opts.fresh) writeFileSync(opts.checkpoint, '')

  const rows = opts.source === 'db' ? loadFromDb(opts) : loadFromJsonl(opts.file)
  const limited = opts.limit === null ? rows : rows.slice(0, opts.limit)
  const candidates = limited.map(toCandidate)
  const avatar = loadAvatar(opts.container, opts.avatar)

  const checkpoint = readCheckpoint(opts.checkpoint, model)
  console.log(
    `measure-prior: ${candidates.length} candidates, avatar ${avatar.slug}, model ${model}, ` +
      `prompt v${ATTEMPT_PROMPT_VERSION}`,
  )
  if (checkpoint.done.size > 0 || checkpoint.stale > 0 || checkpoint.failed > 0) {
    console.log(
      `checkpoint: ${checkpoint.done.size} usable attempts, ${checkpoint.failed} errored ` +
        `(will retry), ${checkpoint.stale} from a different prompt or model (ignored)`,
    )
  }

  // ── Stage 1: screen everything at n = 5 ──────────────────────────────────
  const stage1 = await runStage(1, candidates, avatar, opts, checkpoint.done, model)

  const survivors = candidates.filter((candidate) => {
    const tally = stage1.byItem.get(candidate.externalId)!
    return tally.n > 0 && rate(tally) < PRIOR_SCREEN_MAX_P0
  })
  console.log(
    `stage 1 passed: ${survivors.length}/${candidates.length} below p0 ${PRIOR_SCREEN_MAX_P0}`,
  )

  // ── Stage 2: re-measure survivors at n = 20, on a fresh draw ─────────────
  // Fresh by construction: these are new calls to the model, keyed under stage 2, and no stage-1
  // attempt is reused. Reusing them would fold the selection back into the estimate, which is
  // the bias rather than a correction for it.
  const stage2 = await runStage(2, survivors, avatar, opts, checkpoint.done, model)

  // ── Stage 3: a second hearing for near misses, on a larger fresh draw ────
  // A near miss is an item whose observed rate cleared the line but whose interval did not. At
  // n = 20 the bar is 5 correct or fewer; at n = 30 it is 9 or fewer, so an item whose true p0
  // is really low and drew badly gets another chance rather than being discarded. Same rule
  // as before: stage 3 decides on its own sample and is never pooled with the stage 2 draw that
  // selected it, because pooling would narrow the interval by exactly the amount the selection
  // put there.
  const nearMisses = survivors.filter((candidate) => {
    const tally = stage2.byItem.get(candidate.externalId)!
    return tally.n > 0 && isNearMiss(rate(tally), tally.n)
  })
  console.log(
    `stage 2 near misses: ${nearMisses.length} items under ${TEACHABLE_MAX_P0} whose interval ` +
      `still reached it`,
  )
  const stage3 = await runStage(3, nearMisses, avatar, opts, checkpoint.done, model)
  const rescued = new Set(nearMisses.map((c) => c.externalId))

  // ── The shrinkage ────────────────────────────────────────────────────────
  const shrinkageRows = survivors.map((candidate) => {
    const first = stage1.byItem.get(candidate.externalId)!
    const second = stage2.byItem.get(candidate.externalId)!
    return { externalId: candidate.externalId, stage1P0: rate(first), stage2P0: rate(second) }
  })
  const mean = (xs: readonly number[]): number =>
    xs.length === 0 ? Number.NaN : xs.reduce((a, b) => a + b, 0) / xs.length
  const meanStage1 = mean(shrinkageRows.map((r) => r.stage1P0))
  const meanStage2 = mean(shrinkageRows.map((r) => r.stage2P0))

  const measurements: Measurement[] = []
  for (const candidate of candidates) {
    // The deciding stage is the LAST one the item reached, alone. Stage 1 only ever records a
    // rejection, and mayPersistPrior enforces that at the write.
    const third = rescued.has(candidate.externalId)
      ? stage3.byItem.get(candidate.externalId)
      : undefined
    const second = stage2.byItem.get(candidate.externalId)
    const first = stage1.byItem.get(candidate.externalId)!
    const decided = third ?? second ?? first
    const stage: Stage = third ? 3 : second ? 2 : 1
    if (decided.n === 0) continue
    const interval = wilsonInterval(decided.correct, decided.n)
    measurements.push({
      externalId: candidate.externalId,
      p0: rate(decided),
      samples: decided.n,
      interval,
      stage,
      // The rule, in one place: the evidence has to rule out a high prior, and a screening
      // sample is never allowed to be the evidence.
      eligible: stage > 1 && interval.high < TEACHABLE_MAX_P0,
    })
  }
  const eligible = measurements.filter((m) => m.eligible)

  const inputTokens = stage1.inputTokens + stage2.inputTokens + stage3.inputTokens
  const outputTokens = stage1.outputTokens + stage2.outputTokens + stage3.outputTokens
  const attempts = stage1.attempts + stage2.attempts + stage3.attempts
  const costUsd =
    (inputTokens / 1_000_000) * USD_PER_MTOK_IN + (outputTokens / 1_000_000) * USD_PER_MTOK_OUT

  const report = {
    config: {
      model,
      modelVersion: config.modelVersion,
      promptVersion: ATTEMPT_PROMPT_VERSION,
      avatar: avatar.slug,
      source: opts.source,
      screenSamples: PRIOR_SCREEN_SAMPLES,
      screenMaxP0: PRIOR_SCREEN_MAX_P0,
      confirmSamples: PRIOR_CONFIRM_SAMPLES,
      rescueSamples: PRIOR_RESCUE_SAMPLES,
      teachableMaxP0: TEACHABLE_MAX_P0,
      rule: 'wilson upper bound < teachableMaxP0, on the deciding stage alone',
    },
    counts: {
      candidates: candidates.length,
      passedStage1: survivors.length,
      eligibleAfterStage2: measurements.filter((m) => m.stage === 2 && m.eligible).length,
      nearMissesToStage3: nearMisses.length,
      eligibleAfterStage3: measurements.filter((m) => m.stage === 3 && m.eligible).length,
      eligible: eligible.length,
      attempts,
      errors: stage1.errors + stage2.errors + stage3.errors,
    },
    shrinkage: {
      meanStage1P0OfSurvivors: meanStage1,
      meanStage2P0OfSurvivors: meanStage2,
      selectionBiasGap: meanStage2 - meanStage1,
      perItem: shrinkageRows,
    },
    cost: {
      inputTokens,
      outputTokens,
      usd: costUsd,
      usdPerThousandCandidates:
        candidates.length === 0 ? null : (costUsd / candidates.length) * 1000,
    },
    measurements: measurements.map((m) => ({
      externalId: m.externalId,
      p0: m.p0,
      samples: m.samples,
      stage: m.stage,
      ciLow: m.interval.low,
      ciHigh: m.interval.high,
      eligible: m.eligible,
      /** Looked good, lacked evidence. The set stage 3 exists to re-hear. */
      nearMiss: m.p0 < TEACHABLE_MAX_P0 && m.interval.high >= TEACHABLE_MAX_P0,
    })),
  }

  writeFileSync(opts.out, `${JSON.stringify(report, null, 2)}\n`)

  console.log('')
  console.log(`candidates screened      ${candidates.length}`)
  console.log(`passed stage 1 (n=5)     ${survivors.length}`)
  console.log(`eligible after stage 2   ${report.counts.eligibleAfterStage2}`)
  console.log(`near misses to stage 3   ${nearMisses.length}`)
  console.log(`rescued by stage 3       ${report.counts.eligibleAfterStage3}`)
  console.log(`eligible in total        ${eligible.length}`)
  console.log(`errors                   ${report.counts.errors}`)
  console.log(
    shrinkageRows.length === 0
      ? 'shrinkage: nothing passed stage 1, so there is no selection gap to report'
      : `mean p0 of stage-1 survivors: ${meanStage1.toFixed(3)} in stage 1, ` +
          `${meanStage2.toFixed(3)} in stage 2 (gap ${(meanStage2 - meanStage1).toFixed(3)})`,
  )
  console.log(
    `cost: ${inputTokens} in / ${outputTokens} out = $${costUsd.toFixed(2)}` +
      (report.cost.usdPerThousandCandidates === null
        ? ''
        : `, $${report.cost.usdPerThousandCandidates.toFixed(2)} per thousand candidates`),
  )
  for (const m of eligible) {
    console.log(
      `  ELIGIBLE ${m.externalId}  p0=${m.p0.toFixed(2)} ` +
        `[${m.interval.low.toFixed(2)}, ${m.interval.high.toFixed(2)}] n=${m.samples} ` +
        `stage ${m.stage}`,
    )
  }
  // 06 found 31 of 40 items at p0 = 1.00 and only 6 with any headroom at all. A run that
  // reports most of its bank as teachable is not good news about the bank, it is a bug in the
  // measurement: a mis-parsed answer key, the wrong avatar, an explanation that is not actually
  // contentless. Say so rather than letting a happy number through.
  const eligibleShare = candidates.length === 0 ? 0 : eligible.length / candidates.length
  if (eligibleShare > 0.5) {
    console.warn(
      `WARNING: ${eligible.length}/${candidates.length} candidates read as eligible. Prior runs ` +
        `put the vacuous pass rate at 0.885, so a majority-eligible bank almost certainly means ` +
        `the measurement is broken rather than the bank being unusually good. Check the answer ` +
        `keys and the avatar before trusting this.`,
    )
  }
  console.log(`report written to ${opts.out}`)

  if (opts.write) {
    const written = writeBack(opts, measurements, model)
    console.log(`wrote ${written} measurements to public.items`)
  } else {
    console.log('dry run: pass --write to persist these to public.items')
  }
}

await main()
