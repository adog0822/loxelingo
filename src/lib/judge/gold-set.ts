import {
  cohensKappa,
  MIN_GOLD_SET,
  type CalibrationReport,
  type Label,
  type LabelPair,
} from '@/lib/judge/calibration'

/**
 * Feeds the kappa gate.
 *
 * `calibration.ts` computes the number and `settle.ts` refuses to move ratings
 * without it, but neither knows how to obtain human labels. This module is that
 * seam. Without it the gate is present and unarmed, which is worse than having
 * no gate at all: the code reads as if ratings are protected when they are not.
 *
 * COST: calibration is a full-table comparison, not something to run per match.
 * The report is cached in module scope with a TTL. On a Fluid Compute instance
 * this cache is shared across concurrent invocations and survives between them,
 * so the real query rate is roughly once per TTL per warm instance.
 */

export interface GoldLabelRow {
  matchId: string
  /** The human's verdict, in terms of seat 1 vs seat 2. */
  humanLabel: Label
  /** The judge's stored aggregate verdict for the same match. */
  judgeLabel: Label
  /** Rubric ref the judge actually used, e.g. "duel@1". */
  rubricRef: string
  /** Model + config version the judge actually used, e.g. "anthropic/claude-haiku-4.5@1". */
  judgeModelVersion: string
}

export interface GoldSetStore {
  /**
   * Labelled matches whose judgment was produced by the CURRENT judge
   * configuration. Labels from a previous model or rubric describe a different
   * system and must not be counted — that is the whole reason those two columns
   * are persisted on every judgment.
   */
  loadGoldLabels(filter: {
    rubricRef?: string
    judgeModelVersion: string
  }): Promise<readonly GoldLabelRow[]>
}

export class CalibrationUnavailable extends Error {}

const TTL_MS = 5 * 60 * 1000

interface CacheEntry {
  report: CalibrationReport
  expiresAt: number
}

const cache = new Map<string, CacheEntry>()

/** Test seam. */
export function clearCalibrationCache(): void {
  cache.clear()
}

/**
 * Build (or return a cached) calibration report for a judge configuration.
 *
 * Throws `CalibrationUnavailable` when there is not enough labelled data. It
 * throws rather than returning a permissive default deliberately: a calibration
 * function that returns "fine" when it has no evidence is how an unmeasured
 * judge ends up moving real ratings.
 */
export async function getCalibrationReport(
  store: GoldSetStore,
  judgeModelVersion: string,
  options: { rubricRef?: string; now?: number } = {},
): Promise<CalibrationReport> {
  const now = options.now ?? Date.now()
  const key = `${judgeModelVersion}::${options.rubricRef ?? '*'}`

  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) return cached.report

  const rows = await store.loadGoldLabels({
    judgeModelVersion,
    rubricRef: options.rubricRef,
  })

  if (rows.length < MIN_GOLD_SET) {
    throw new CalibrationUnavailable(
      `Only ${rows.length} gold labels for ${key}; ${MIN_GOLD_SET} required. ` +
        `Label more matches, or set JUDGE_CALIBRATION_BYPASS to run unrated.`,
    )
  }

  const pairs: LabelPair[] = rows.map((row) => ({
    human: row.humanLabel,
    judge: row.judgeLabel,
  }))

  const report = cohensKappa(pairs)
  cache.set(key, { report, expiresAt: now + TTL_MS })
  return report
}

/**
 * Bootstrapping escape hatch.
 *
 * There is a genuine chicken-and-egg problem: 100 labelled matches cannot exist
 * before any match has been played, so a strict gate blocks the very first
 * player. The resolution is NOT to weaken the gate. It is to keep playing and
 * stop rating: matches are judged and stored as normal, and `is_rated` is forced
 * false, so no unvalidated verdict ever touches a ladder. The judgments produced
 * during this period are exactly the corpus you then label.
 *
 * Requires an explicit env var so this can never be the accidental default, and
 * the caller is expected to log loudly every time it is used.
 */
export function calibrationBypassEnabled(): boolean {
  return process.env.JUDGE_CALIBRATION_BYPASS === 'true'
}

export type CalibrationGate =
  | { status: 'calibrated'; report: CalibrationReport }
  /** Play proceeds, ratings do not move. */
  | { status: 'uncalibrated_unrated'; reason: string }

/**
 * Resolve the gate for a judging run.
 *
 * Returns `uncalibrated_unrated` instead of throwing when the bypass is on, so
 * the pipeline degrades to "judge and show a verdict, but change no rating"
 * rather than failing the match outright. A player still gets their result; the
 * ladder stays clean.
 */
export async function resolveCalibrationGate(
  store: GoldSetStore,
  judgeModelVersion: string,
  options: { rubricRef?: string; now?: number } = {},
): Promise<CalibrationGate> {
  try {
    const report = await getCalibrationReport(store, judgeModelVersion, options)
    return { status: 'calibrated', report }
  } catch (error) {
    if (!(error instanceof CalibrationUnavailable)) throw error
    if (!calibrationBypassEnabled()) throw error
    return { status: 'uncalibrated_unrated', reason: error.message }
  }
}

/**
 * Supabase-backed store.
 *
 * Reads `judge_gold_labels` joined to `judgments`, restricted to the current
 * judge configuration. A lazy factory so importing this module never requires
 * database credentials — the unit tests inject a fake store instead.
 */
/**
 * Structural shape of the one query this module runs.
 *
 * Deliberately not `SupabaseClient`: importing the generated database types here
 * makes the type instantiation explode (TS2589) and would couple the calibration
 * logic to the schema. `PromiseLike` rather than `Promise` because PostgREST
 * builders are thenables, not real Promises.
 */
interface GoldSetQueryClient {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => PromiseLike<{ data: unknown[] | null; error: unknown }>
    }
  }
}

export function createSupabaseGoldSetStore(client: unknown): GoldSetStore {
  /**
   * One documented cast, contained here.
   *
   * Structurally checking a real `SupabaseClient` against `GoldSetQueryClient`
   * makes tsc give up with TS2589 (type instantiation excessively deep) — the
   * generated schema types are large and PostgREST's builder is heavily
   * generic. Narrowing once at the boundary keeps the rest of this module
   * honestly typed and keeps the schema types out of the calibration logic.
   */
  const db = client as GoldSetQueryClient

  return {
    async loadGoldLabels({ judgeModelVersion }) {
      const { data, error } = await db
        .from('judge_gold_labels')
        .select(
          'match_id, human_label, judgments!inner(verdict, judge_model_version, rubric_version)',
        )
        .eq('judgments.judge_model_version', judgeModelVersion)

      if (error) {
        throw new CalibrationUnavailable(
          `Could not load gold labels: ${JSON.stringify(error)}`,
        )
      }

      return (data ?? []).map(toGoldLabelRow)
    },
  }
}

function toGoldLabelRow(raw: unknown): GoldLabelRow {
  const row = raw as {
    match_id: string
    human_label: Label
    judgments: {
      verdict: Label
      judge_model_version: string
      rubric_version: string
    }
  }
  return {
    matchId: row.match_id,
    humanLabel: row.human_label,
    judgeLabel: row.judgments.verdict,
    rubricRef: row.judgments.rubric_version,
    judgeModelVersion: row.judgments.judge_model_version,
  }
}
