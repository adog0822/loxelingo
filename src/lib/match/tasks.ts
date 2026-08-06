/**
 * tasks — which item to put in front of this learner, right now.
 *
 * This module invents NO policy. It composes two existing engines:
 *
 *   * `engine/elo.ts`     — `expectedCorrect(theta, beta, choices)` gives P(correct) for a
 *                           (learner, item) pair on the logit scale. `learnerK` gives the
 *                           current dynamic-K step size, which doubles as an uncertainty
 *                           measure and is what we widen the difficulty window by.
 *   * `engine/holdout.ts` — `planPresentation()` decides, deterministically, whether this
 *                           presentation belongs to the ~5% non-adaptive holdout.
 *
 * Everything difficulty-related is pure and lives above the `TaskQueries` port, so the policy
 * is unit-testable without a database. The port is the only thing that touches Postgres.
 */

import {
  DEFAULT_ELO,
  type EloConfig,
  expectedCorrect,
  learnerK,
  type LearnerRating,
  newLearnerRating,
} from '@/lib/engine/elo'
import {
  DEFAULT_HOLDOUT_RATE,
  planPresentation,
  type PresentationKey,
  type PresentationPlan,
} from '@/lib/engine/holdout'
// Type-only: erased at build time, so this module still has no runtime dependency on
// `next/headers` and stays importable from a plain vitest process.
import type { createClient as createSupabaseServerClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Row types
//
// NOTE: these are deliberately narrow, hand-written shapes for exactly the columns this
// module reads or writes. They should be REPLACED by the generated `src/lib/db/types.ts`
// (`Database['public']['Tables'][...]['Row' | 'Insert']`) once that file exists. They are
// written here so this module does not have a build-order dependency on codegen.
// ---------------------------------------------------------------------------

/** Mirrors the CHECK on `item_presentations.selection_policy`. Keep in sync. */
export type SelectionPolicy =
  | 'adaptive'
  | 'random_holdout'
  | 'trial'
  | 'daily'
  | 'spark'
  | 'gauntlet'

/**
 * Where the item is being served. `'match'` is the only surface that runs the adaptive
 * selector, and therefore the only surface the holdout applies to — the CHECK constraint
 * `is_holdout = (selection_policy = 'random_holdout')` makes 'trial'/'daily'/'spark'/'gauntlet'
 * holdout-ineligible by construction, so we do not even evaluate the hash for them.
 */
export type TaskSurface = 'match' | 'trial' | 'daily' | 'spark' | 'gauntlet'

/** One selectable item, with its calibrated difficulty already resolved. */
export type CandidateItem = {
  itemId: number
  /**
   * Difficulty on the logit scale: `item_stats.beta` where the item has been calibrated,
   * otherwise `items.cold_start_beta` (the content-feature prior), otherwise 0 as
   * `newItemRating()` would give.
   */
  beta: number
  /** `item_stats.beta_n`. 0 means "never observed in the holdout slice". */
  betaN: number
  /**
   * Number of answer options, for closed items. Drives the guessing floor inside
   * `expectedCorrect`. Undefined / 1 = free response.
   */
  choices?: number
  timeLimitMs: number | null
  /** False when `beta` came from the cold-start prior rather than from observations. */
  isCalibrated: boolean
}

export type ItemPresentationInsert = {
  user_id: string
  item_id: number
  match_id: string | null
  card_id: number | null
  selection_policy: SelectionPolicy
  is_holdout: boolean
  user_theta_at_presentation: number
  item_beta_at_presentation: number
  predicted_p: number
}

// ---------------------------------------------------------------------------
// Difficulty targeting
// ---------------------------------------------------------------------------

/**
 * The expected-success target for adaptive selection: **0.70**.
 *
 * Why 0.70 and not 0.50, and why not 0.85:
 *
 *   * p = 0.50 maximises Fisher information for a 1PL/Rasch model, so it is the fastest
 *     possible estimator of theta. It is also the point at which half of everything we serve
 *     is an expected failure. On a rated ladder that reads as punishment, and the retention
 *     research this product is built on (first-threshold-crossing effects) says the early
 *     experience is where we can least afford it.
 *   * p = 0.70 retains 0.70*0.30 = 0.21 of the 0.25 maximum Fisher information — 84% of the
 *     information at 50% — while making roughly two in three presentations a success.
 *   * Above ~0.80 (Duolingo-style ~0.85) the information collapses and difficulty estimates
 *     stop moving, which matters here because `item_stats.beta` is calibrated from a 5% slice
 *     and cannot afford uninformative observations.
 *
 * The acceptance band is [0.50, 0.75]: 0.50 is the information-optimal edge, 0.75 is the
 * "adaptive practice" target from Papoušek, Pelánek & Stanislav (EDM 2014), the same paper
 * `elo.ts` takes its dynamic-K family from. Anything inside the band is a legitimate serve;
 * we rank by distance from 0.70 inside it.
 *
 * IMPORTANT: this is expected P(correct) on the ITEM, not P(win) against the opponent. Match
 * competitiveness is `matchmaking.ts`'s problem (rating bands), which is precisely why item
 * difficulty is allowed to sit at the comfortable end of the band without making matches easy.
 */
export const TARGET_EXPECTED_CORRECT = 0.7

/** Inclusive acceptance band around {@link TARGET_EXPECTED_CORRECT}. */
export const EXPECTED_CORRECT_BAND = { min: 0.5, max: 0.75 } as const

/**
 * Floor on the difficulty window, in logits. Without a floor, a veteran learner (K -> kFloor
 * = 0.02) would have a window so tight that a world with a small item pool serves nothing.
 */
export const MIN_DIFFICULTY_WINDOW_LOGITS = 0.5

/** How many items the port is asked for before ranking happens in memory. */
export const CANDIDATE_POOL_LIMIT = 200

export class TaskSelectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TaskSelectionError'
  }
}

const logit = (p: number): number => Math.log(p / (1 - p))

/**
 * The difficulty that would produce exactly `target` expected success for this learner.
 *
 * Inverts `expectedCorrect`. For free response `p = sigmoid(theta - beta)`, so
 * `beta = theta - logit(p)`. For a k-choice item the guessing floor `g = 1/k` shifts it:
 * `p = g + (1-g)*sigmoid(theta - beta)` => `beta = theta - logit((p - g) / (1 - g))`.
 *
 * A target at or below the guessing floor is unreachable (you cannot make a 4-choice item
 * hard enough to drop below 25% expected success), so it is clamped just above the floor.
 */
export function idealBeta(
  theta: number,
  target: number = TARGET_EXPECTED_CORRECT,
  choices?: number,
): number {
  if (!(target > 0 && target < 1)) {
    throw new TaskSelectionError(`target expected success must be in (0, 1), got ${target}`)
  }
  if (choices === undefined || choices <= 1) return theta - logit(target)

  const guess = 1 / choices
  const raw = (target - guess) / (1 - guess)
  // Clamp strictly inside (0, 1): at raw <= 0 the target is below the guessing floor.
  const inner = Math.min(Math.max(raw, 1e-6), 1 - 1e-6)
  return theta - logit(inner)
}

/**
 * Half-width of the difficulty window, in logits, for this learner.
 *
 * Reuses `learnerK` rather than inventing an uncertainty measure: K(n) = a/(1 + b*n) IS the
 * engine's uncertainty statistic (`user_ratings.uncertainty` stores exactly this value). A
 * brand-new account (K = 1.0) gets a full-logit window because we do not yet know its theta;
 * a 200-game account (K = 0.09) is narrowed to the floor.
 */
export function difficultyWindowLogits(
  rating: LearnerRating,
  cfg: EloConfig = DEFAULT_ELO,
): number {
  return Math.max(learnerK(rating, cfg), MIN_DIFFICULTY_WINDOW_LOGITS)
}

export type ScoredCandidate = {
  item: CandidateItem
  /** Pre-serve predicted P(correct). Written to `item_presentations.predicted_p`. */
  predictedP: number
  /** |predictedP - TARGET_EXPECTED_CORRECT|. The ranking key. */
  distance: number
  /** Whether `predictedP` falls inside {@link EXPECTED_CORRECT_BAND}. */
  inBand: boolean
  /** Whether `beta` is inside the learner's difficulty window. */
  inWindow: boolean
}

export function scoreCandidate(
  rating: LearnerRating,
  item: CandidateItem,
  cfg: EloConfig = DEFAULT_ELO,
): ScoredCandidate {
  const predictedP = expectedCorrect(rating.theta, item.beta, item.choices)
  const wanted = idealBeta(rating.theta, TARGET_EXPECTED_CORRECT, item.choices)
  return {
    item,
    predictedP,
    distance: Math.abs(predictedP - TARGET_EXPECTED_CORRECT),
    inBand: predictedP >= EXPECTED_CORRECT_BAND.min && predictedP <= EXPECTED_CORRECT_BAND.max,
    inWindow: Math.abs(item.beta - wanted) <= difficultyWindowLogits(rating, cfg),
  }
}

/**
 * Rank candidates for ADAPTIVE selection.
 *
 * Preference order:
 *   1. inside the difficulty window AND inside the expected-success band,
 *   2. inside the band but outside the window,
 *   3. everything else,
 * and within each tier, nearest to the 0.70 target. Ties break on lower `betaN` — an
 * under-observed item is worth more information than a well-measured one, and this is the
 * only place a tie-break is free.
 *
 * Never returns an empty ranking for a non-empty pool: we always serve something. Refusing to
 * serve because nothing is ideal is strictly worse than serving the closest item.
 */
export function rankAdaptive(
  rating: LearnerRating,
  candidates: readonly CandidateItem[],
  cfg: EloConfig = DEFAULT_ELO,
): ScoredCandidate[] {
  const tier = (c: ScoredCandidate): number => (c.inBand && c.inWindow ? 0 : c.inBand ? 1 : 2)

  return candidates
    .map((item) => scoreCandidate(rating, item, cfg))
    .sort(
      (a, b) =>
        tier(a) - tier(b) ||
        a.distance - b.distance ||
        a.item.betaN - b.item.betaN ||
        a.item.itemId - b.item.itemId,
    )
}

/**
 * Pick uniformly at random, WITHOUT consulting difficulty or ability.
 *
 * This is the whole point of the holdout (`holdout.ts` module docs): a "random" pick that
 * still filters by difficulty is not a holdout and will not fix Elo convergence. So this
 * function deliberately does not receive the learner's rating at all.
 */
export function pickNonAdaptive(
  candidates: readonly CandidateItem[],
  rng: () => number = Math.random,
): CandidateItem {
  if (candidates.length === 0) {
    throw new TaskSelectionError('pickNonAdaptive called with an empty candidate pool')
  }
  const i = Math.min(Math.floor(rng() * candidates.length), candidates.length - 1)
  return candidates[i]!
}

/**
 * The `(selection_policy, is_holdout)` pair, guaranteed consistent with the CHECK constraint
 * `item_presentations_holdout_matches_policy`: `is_holdout = (selection_policy = 'random_holdout')`.
 *
 * Returning the pair from ONE function is the point — two independently computed fields is
 * exactly how a pair like this drifts apart and starts poisoning item calibration.
 */
export function selectionPolicyFor(
  surface: TaskSurface,
  plan: PresentationPlan,
): { selectionPolicy: SelectionPolicy; isHoldout: boolean } {
  if (surface !== 'match') {
    // Non-match surfaces carry their own policy label and are never holdout: the CHECK
    // constraint reserves `is_holdout` for 'random_holdout' alone.
    return { selectionPolicy: surface, isHoldout: false }
  }
  return plan.isHoldout
    ? { selectionPolicy: 'random_holdout', isHoldout: true }
    : { selectionPolicy: 'adaptive', isHoldout: false }
}

/** Build the `item_presentations` row. Throws rather than letting the DB CHECK catch a drift. */
export function presentationRow(args: {
  userId: string
  matchId: string | null
  cardId: number | null
  selectionPolicy: SelectionPolicy
  isHoldout: boolean
  item: CandidateItem
  learnerTheta: number
  predictedP: number
}): ItemPresentationInsert {
  const expected = args.selectionPolicy === 'random_holdout'
  if (args.isHoldout !== expected) {
    throw new TaskSelectionError(
      `selection_policy='${args.selectionPolicy}' and is_holdout=${args.isHoldout} violate ` +
        `item_presentations_holdout_matches_policy. Build the pair with selectionPolicyFor().`,
    )
  }
  return {
    user_id: args.userId,
    item_id: args.item.itemId,
    match_id: args.matchId,
    card_id: args.cardId,
    selection_policy: args.selectionPolicy,
    is_holdout: args.isHoldout,
    user_theta_at_presentation: args.learnerTheta,
    item_beta_at_presentation: args.item.beta,
    predicted_p: args.predictedP,
  }
}

// ---------------------------------------------------------------------------
// Selection, end to end
// ---------------------------------------------------------------------------

export type SelectTaskInput = {
  userId: string
  worldSlug: string
  ladderSlug: string
  surface?: TaskSurface
  /** Items to keep out of the pool (already seen this session, already in an open match). */
  excludeItemIds?: readonly number[]
  matchId?: string | null
  cardId?: number | null
}

export type TaskSelection = {
  item: CandidateItem
  /** From `holdout.planPresentation`. `mode` is 'random' exactly when this is a holdout serve. */
  plan: PresentationPlan
  selectionPolicy: SelectionPolicy
  isHoldout: boolean
  predictedP: number
  learner: LearnerRating
  presentationIndex: number
  /** The row written to `item_presentations`, returned so callers can log it. */
  presentation: ItemPresentationInsert
  presentationId: number
}

/** The only database surface this module has. Inject a fake in tests. */
export interface TaskQueries {
  /** `user_ratings` for (user, world, ladder). Null when the learner has never played it. */
  fetchLearnerRating(
    userId: string,
    worldSlug: string,
    ladderSlug: string,
  ): Promise<{ theta: number; gamesPlayed: number } | null>

  /** Active items for (world, ladder), each with its resolved difficulty. */
  fetchCandidateItems(args: {
    worldSlug: string
    ladderSlug: string
    excludeItemIds: readonly number[]
    limit: number
  }): Promise<CandidateItem[]>

  /**
   * A per-user presentation counter that is STABLE across retries of the same presentation.
   * `holdout.PresentationKey.presentationIndex` requires this: if the index moves between
   * retries, the same presentation can flip between adaptive and holdout.
   */
  nextPresentationIndex(userId: string): Promise<number>

  recordPresentation(row: ItemPresentationInsert): Promise<{ id: number }>
}

export type SelectTaskDeps = {
  queries: TaskQueries
  /** Per-deployment holdout seed. Changing it reshuffles the entire holdout mask. */
  holdoutSeed?: string
  holdoutRate?: number
  eloConfig?: EloConfig
  /** Only consulted on the non-adaptive holdout path. Injected so tests are deterministic. */
  rng?: () => number
}

/** Default holdout seed. Set `LOXELINGO_HOLDOUT_SEED` in every environment. */
export const DEFAULT_HOLDOUT_SEED = 'loxelingo-holdout-v1'

export async function selectTask(
  input: SelectTaskInput,
  deps: SelectTaskDeps,
): Promise<TaskSelection> {
  const {
    queries,
    holdoutSeed = process.env.LOXELINGO_HOLDOUT_SEED ?? DEFAULT_HOLDOUT_SEED,
    holdoutRate = DEFAULT_HOLDOUT_RATE,
    eloConfig = DEFAULT_ELO,
    rng = Math.random,
  } = deps
  const surface = input.surface ?? 'match'

  const stored = await queries.fetchLearnerRating(
    input.userId,
    input.worldSlug,
    input.ladderSlug,
  )
  // A learner with no row starts at theta 0, n 0 — `newLearnerRating`'s documented default
  // (Pelánek 2016: both sides start at 0). `games_played` is the `n` that decays K.
  const learner = newLearnerRating(stored?.theta ?? 0, stored?.gamesPlayed ?? 0)

  const candidates = await queries.fetchCandidateItems({
    worldSlug: input.worldSlug,
    ladderSlug: input.ladderSlug,
    excludeItemIds: input.excludeItemIds ?? [],
    limit: CANDIDATE_POOL_LIMIT,
  })
  if (candidates.length === 0) {
    throw new TaskSelectionError(
      `no active items for world='${input.worldSlug}' ladder='${input.ladderSlug}'`,
    )
  }

  const presentationIndex = await queries.nextPresentationIndex(input.userId)

  // The holdout decision must be made BEFORE the item is chosen, because on the holdout path
  // the item is chosen without reference to difficulty. `itemId` therefore cannot be part of
  // the key on the deciding call; we key on a stable per-user slot instead.
  const key: PresentationKey = {
    seed: holdoutSeed,
    userId: input.userId,
    itemId: `${input.worldSlug}/${input.ladderSlug}`,
    presentationIndex,
  }
  const plan = surface === 'match' ? planPresentation(key, holdoutRate) : ADAPTIVE_PLAN

  const item =
    plan.mode === 'random'
      ? pickNonAdaptive(candidates, rng)
      : rankAdaptive(learner, candidates, eloConfig)[0]!.item

  const predictedP = expectedCorrect(learner.theta, item.beta, item.choices)
  const { selectionPolicy, isHoldout } = selectionPolicyFor(surface, plan)

  const row = presentationRow({
    userId: input.userId,
    matchId: input.matchId ?? null,
    cardId: input.cardId ?? null,
    selectionPolicy,
    isHoldout,
    item,
    learnerTheta: learner.theta,
    predictedP,
  })
  const { id } = await queries.recordPresentation(row)

  return {
    item,
    plan,
    selectionPolicy,
    isHoldout,
    predictedP,
    learner,
    presentationIndex,
    presentation: row,
    presentationId: id,
  }
}

/** Non-match surfaces never hit the holdout hash; this is the plan they get. */
const ADAPTIVE_PLAN: PresentationPlan = {
  mode: 'adaptive',
  isHoldout: false,
  calibratesItemDifficulty: false,
  calibratesLearnerAbility: true,
}

// ---------------------------------------------------------------------------
// Postgres port
// ---------------------------------------------------------------------------

/**
 * `items`, `item_stats` and `item_presentations` deliberately have no client INSERT/SELECT
 * policies (items carries `answer`; a client-writable `item_presentations` could manufacture
 * holdout rows and poison item difficulty). So this port MUST be handed a SERVICE-ROLE client.
 *
 * `src/lib/supabase/server.ts` returns the publishable-key client, which is the right type but
 * the wrong key. A `createServiceRoleClient()` factory belongs next to it; see the report.
 */
export type SupabaseLike = Awaited<ReturnType<typeof createSupabaseServerClient>>

export function createTaskQueries(db: SupabaseLike): TaskQueries {
  return {
    async fetchLearnerRating(userId, worldSlug, ladderSlug) {
      const { data, error } = await db
        .from('user_ratings')
        .select('theta, games_played')
        .eq('user_id', userId)
        .eq('world_slug', worldSlug)
        .eq('ladder_slug', ladderSlug)
        .maybeSingle()
      if (error) throw new TaskSelectionError(`user_ratings read failed: ${error.message}`)
      if (!data) return null
      return { theta: data.theta as number, gamesPlayed: data.games_played as number }
    },

    async fetchCandidateItems({ worldSlug, ladderSlug, excludeItemIds, limit }) {
      let q = db
        .from('items')
        .select(
          'id, time_limit_ms, cold_start_beta, prompt, item_stats(beta, beta_n, irt_b)',
        )
        .eq('world_slug', worldSlug)
        .eq('ladder_slug', ladderSlug)
        .eq('is_active', true)
        .limit(limit)
      if (excludeItemIds.length > 0) q = q.not('id', 'in', `(${excludeItemIds.join(',')})`)

      const { data, error } = await q
      if (error) throw new TaskSelectionError(`items read failed: ${error.message}`)

      // Cast: without generated DB types PostgREST's inferred row shape is a guess, and its
      // guess about embedded resources (one-to-one vs array) is wrong here.
      return ((data ?? []) as unknown as ItemWithStatsRow[]).map(toCandidateItem)
    },

    async nextPresentationIndex(userId) {
      // count(*) of this user's presentations. Monotone, and stable within one request; it is
      // NOT stable across a retry that already wrote a presentation row, which is why
      // `selectTask` writes the row exactly once per call and callers retry the whole match
      // creation rather than just the selection.
      const { count, error } = await db
        .from('item_presentations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
      if (error) {
        throw new TaskSelectionError(`item_presentations count failed: ${error.message}`)
      }
      return count ?? 0
    },

    async recordPresentation(row) {
      const { data, error } = await db
        .from('item_presentations')
        .insert(row)
        .select('id')
        .single()
      if (error) {
        throw new TaskSelectionError(`item_presentations insert failed: ${error.message}`)
      }
      return { id: data.id as number }
    },
  }
}

/** Shape of one embedded `items`+`item_stats` row. Replace with the generated types. */
type ItemWithStatsRow = {
  id: number
  time_limit_ms: number | null
  cold_start_beta: number | null
  prompt: unknown
  item_stats: { beta: number; beta_n: number; irt_b: number | null } | null
}

/**
 * Difficulty resolution order:
 *   1. `item_stats.beta` when the item has any observations (`beta_n > 0`),
 *   2. `items.cold_start_beta` — the content-feature prior,
 *   3. 0, which is `newItemRating()`'s default (Pelánek 2016: both sides start at 0).
 */
export function toCandidateItem(row: ItemWithStatsRow): CandidateItem {
  const stats = Array.isArray(row.item_stats) ? row.item_stats[0] ?? null : row.item_stats
  const calibrated = (stats?.beta_n ?? 0) > 0
  return {
    itemId: row.id,
    beta: calibrated ? stats!.beta : row.cold_start_beta ?? 0,
    betaN: stats?.beta_n ?? 0,
    choices: choicesFromPrompt(row.prompt),
    timeLimitMs: row.time_limit_ms,
    isCalibrated: calibrated,
  }
}

/**
 * Option count for a closed item, read out of `items.prompt`. Free-response items return
 * undefined, which `expectedCorrect` treats as "no guessing floor".
 */
export function choicesFromPrompt(prompt: unknown): number | undefined {
  if (prompt === null || typeof prompt !== 'object') return undefined
  const options = (prompt as { options?: unknown }).options
  if (!Array.isArray(options) || options.length < 2) return undefined
  return options.length
}
