import { describe, expect, it } from 'vitest'

import { DEFAULT_ELO, expectedCorrect, learnerK, newLearnerRating } from '@/lib/engine/elo'
import { DEFAULT_HOLDOUT_RATE } from '@/lib/engine/holdout'
import {
  CANDIDATE_POOL_LIMIT,
  choicesFromPrompt,
  difficultyWindowLogits,
  EXPECTED_CORRECT_BAND,
  idealBeta,
  MIN_DIFFICULTY_WINDOW_LOGITS,
  pickNonAdaptive,
  presentationRow,
  rankAdaptive,
  scoreCandidate,
  selectTask,
  selectionPolicyFor,
  TARGET_EXPECTED_CORRECT,
  TaskSelectionError,
  toCandidateItem,
  type CandidateItem,
  type ItemPresentationInsert,
  type TaskQueries,
  type TaskSurface,
} from './tasks'

const item = (over: Partial<CandidateItem> & { itemId: number }): CandidateItem => ({
  beta: 0,
  betaN: 10,
  timeLimitMs: 60_000,
  isCalibrated: true,
  ...over,
})

/** In-memory port. No database, no clock. */
function fakeQueries(
  candidates: readonly CandidateItem[],
  opts: { theta?: number; gamesPlayed?: number; startIndex?: number } = {},
): TaskQueries & { written: ItemPresentationInsert[] } {
  let index = opts.startIndex ?? 0
  const written: ItemPresentationInsert[] = []
  return {
    written,
    async fetchLearnerRating() {
      if (opts.theta === undefined) return null
      return { theta: opts.theta, gamesPlayed: opts.gamesPlayed ?? 0 }
    },
    async fetchCandidateItems({ excludeItemIds }) {
      return candidates.filter((c) => !excludeItemIds.includes(c.itemId))
    },
    async nextPresentationIndex() {
      return index++
    },
    async recordPresentation(row) {
      written.push(row)
      return { id: written.length }
    },
  }
}

describe('difficulty targeting', () => {
  it('targets 0.70 expected success, inside the documented [0.50, 0.75] band', () => {
    expect(TARGET_EXPECTED_CORRECT).toBe(0.7)
    expect(TARGET_EXPECTED_CORRECT).toBeGreaterThanOrEqual(EXPECTED_CORRECT_BAND.min)
    expect(TARGET_EXPECTED_CORRECT).toBeLessThanOrEqual(EXPECTED_CORRECT_BAND.max)
  })

  it('idealBeta is the exact inverse of expectedCorrect (free response)', () => {
    for (const theta of [-2, -0.5, 0, 0.75, 3]) {
      for (const target of [0.5, 0.6, 0.7, 0.75]) {
        const beta = idealBeta(theta, target)
        expect(expectedCorrect(theta, beta)).toBeCloseTo(target, 12)
      }
    }
  })

  it('idealBeta is the exact inverse under a multiple-choice guessing floor', () => {
    for (const choices of [2, 3, 4, 5]) {
      const beta = idealBeta(0.4, TARGET_EXPECTED_CORRECT, choices)
      expect(expectedCorrect(0.4, beta, choices)).toBeCloseTo(TARGET_EXPECTED_CORRECT, 12)
    }
  })

  it('idealBeta clamps a target that sits below the guessing floor', () => {
    // A 2-choice item cannot have expected success below 0.5, so 0.3 is unreachable.
    const beta = idealBeta(0, 0.3, 2)
    expect(Number.isFinite(beta)).toBe(true)
    expect(expectedCorrect(0, beta, 2)).toBeGreaterThan(0.49)
  })

  it('idealBeta rejects a target outside (0, 1)', () => {
    expect(() => idealBeta(0, 0)).toThrow(TaskSelectionError)
    expect(() => idealBeta(0, 1)).toThrow(TaskSelectionError)
  })

  it('the difficulty window is learnerK, floored — wide for a new account, tight for a veteran', () => {
    const fresh = newLearnerRating(0, 0)
    const veteran = newLearnerRating(0, 500)
    expect(difficultyWindowLogits(fresh)).toBeCloseTo(learnerK(fresh, DEFAULT_ELO), 12)
    expect(difficultyWindowLogits(fresh)).toBeGreaterThan(difficultyWindowLogits(veteran))
    // The veteran is on the floor, not on K (which has decayed to 0.038).
    expect(difficultyWindowLogits(veteran)).toBe(MIN_DIFFICULTY_WINDOW_LOGITS)
  })

  it('scoreCandidate reports predicted P and band membership', () => {
    const learner = newLearnerRating(1.0, 50)
    const exact = item({ itemId: 1, beta: idealBeta(1.0) })
    const scored = scoreCandidate(learner, exact)
    expect(scored.predictedP).toBeCloseTo(TARGET_EXPECTED_CORRECT, 12)
    expect(scored.distance).toBeCloseTo(0, 12)
    expect(scored.inBand).toBe(true)
    expect(scored.inWindow).toBe(true)

    const brutal = scoreCandidate(learner, item({ itemId: 2, beta: 5 }))
    expect(brutal.inBand).toBe(false)
    expect(brutal.predictedP).toBeLessThan(0.1)
  })

  it('rankAdaptive puts the item nearest the 0.70 target first', () => {
    const learner = newLearnerRating(0.5, 40)
    const ranked = rankAdaptive(learner, [
      item({ itemId: 1, beta: idealBeta(0.5) - 3 }), // far too easy
      item({ itemId: 2, beta: idealBeta(0.5) + 3 }), // far too hard
      item({ itemId: 3, beta: idealBeta(0.5) }), // exactly on target
      item({ itemId: 4, beta: idealBeta(0.5) + 0.2 }),
    ])
    expect(ranked[0]!.item.itemId).toBe(3)
    expect(ranked[1]!.item.itemId).toBe(4)
    expect(ranked.map((r) => r.item.itemId)).toHaveLength(4)
  })

  it('rankAdaptive prefers in-band+in-window over in-band-only', () => {
    // A veteran: window is the 0.5-logit floor, so a band-satisfying item 2 logits away from
    // the ideal is still out of window and must lose to a nearer one.
    const learner = newLearnerRating(0, 500)
    const ranked = rankAdaptive(learner, [
      item({ itemId: 1, beta: idealBeta(0, EXPECTED_CORRECT_BAND.max) }),
      item({ itemId: 2, beta: idealBeta(0) + 0.1 }),
    ])
    expect(ranked[0]!.item.itemId).toBe(2)
    expect(ranked[0]!.inWindow).toBe(true)
  })

  it('rankAdaptive breaks ties toward the less-observed item', () => {
    const learner = newLearnerRating(0, 10)
    const beta = idealBeta(0)
    const ranked = rankAdaptive(learner, [
      item({ itemId: 1, beta, betaN: 900 }),
      item({ itemId: 2, beta, betaN: 3 }),
    ])
    expect(ranked[0]!.item.itemId).toBe(2)
  })

  it('rankAdaptive never refuses to serve: a hopeless pool is still ranked', () => {
    const learner = newLearnerRating(0, 0)
    const ranked = rankAdaptive(learner, [item({ itemId: 1, beta: 9 }), item({ itemId: 2, beta: 7 })])
    expect(ranked).toHaveLength(2)
    expect(ranked[0]!.item.itemId).toBe(2) // the nearer of two bad options
    expect(ranked[0]!.inBand).toBe(false)
  })
})

describe('non-adaptive holdout pick', () => {
  it('samples uniformly and does not consult difficulty', () => {
    const pool = [
      item({ itemId: 1, beta: -5 }),
      item({ itemId: 2, beta: 0 }),
      item({ itemId: 3, beta: 5 }),
      item({ itemId: 4, beta: 12 }),
    ]
    const counts = new Map<number, number>()
    const n = 4000
    let seed = 1
    const rng = () => {
      // xorshift, deterministic
      seed ^= seed << 13
      seed ^= seed >>> 17
      seed ^= seed << 5
      return ((seed >>> 0) % 1_000_000) / 1_000_000
    }
    for (let i = 0; i < n; i++) {
      const picked = pickNonAdaptive(pool, rng)
      counts.set(picked.itemId, (counts.get(picked.itemId) ?? 0) + 1)
    }
    expect(counts.size).toBe(4)
    for (const c of counts.values()) {
      expect(c / n).toBeGreaterThan(0.2)
      expect(c / n).toBeLessThan(0.3)
    }
  })

  it('never returns an out-of-range index at rng() = 1', () => {
    const pool = [item({ itemId: 1 }), item({ itemId: 2 })]
    expect(pickNonAdaptive(pool, () => 0.999999999).itemId).toBe(2)
    expect(pickNonAdaptive(pool, () => 1).itemId).toBe(2)
  })

  it('throws on an empty pool rather than returning undefined', () => {
    expect(() => pickNonAdaptive([], () => 0)).toThrow(TaskSelectionError)
  })
})

describe('selection_policy / is_holdout pairing (CHECK item_presentations_holdout_matches_policy)', () => {
  const plan = (isHoldout: boolean) => ({
    mode: isHoldout ? ('random' as const) : ('adaptive' as const),
    isHoldout,
    calibratesItemDifficulty: isHoldout,
    calibratesLearnerAbility: true,
  })

  it('is_holdout is true exactly when the policy is random_holdout', () => {
    const surfaces: TaskSurface[] = ['match', 'trial', 'daily', 'spark', 'gauntlet']
    for (const surface of surfaces) {
      for (const holdout of [true, false]) {
        const pair = selectionPolicyFor(surface, plan(holdout))
        expect(pair.isHoldout).toBe(pair.selectionPolicy === 'random_holdout')
      }
    }
  })

  it('only the match surface can produce a holdout', () => {
    expect(selectionPolicyFor('match', plan(true))).toEqual({
      selectionPolicy: 'random_holdout',
      isHoldout: true,
    })
    expect(selectionPolicyFor('trial', plan(true))).toEqual({
      selectionPolicy: 'trial',
      isHoldout: false,
    })
    expect(selectionPolicyFor('daily', plan(true)).isHoldout).toBe(false)
  })

  it('presentationRow refuses to build a row the CHECK constraint would reject', () => {
    const args = {
      userId: 'u1',
      matchId: null,
      cardId: null,
      item: item({ itemId: 7 }),
      learnerTheta: 0,
      predictedP: 0.7,
    }
    expect(() =>
      presentationRow({ ...args, selectionPolicy: 'adaptive', isHoldout: true }),
    ).toThrow(TaskSelectionError)
    expect(() =>
      presentationRow({ ...args, selectionPolicy: 'random_holdout', isHoldout: false }),
    ).toThrow(TaskSelectionError)
    expect(
      presentationRow({ ...args, selectionPolicy: 'random_holdout', isHoldout: true }).is_holdout,
    ).toBe(true)
  })
})

describe('selectTask', () => {
  const pool = [
    item({ itemId: 1, beta: -4 }),
    item({ itemId: 2, beta: -0.85 }), // ~= idealBeta(0) = -0.847
    item({ itemId: 3, beta: 2 }),
    item({ itemId: 4, beta: 6 }),
  ]
  const input = { userId: 'u1', worldSlug: 'ja', ladderSlug: 'duel' }

  it('serves the difficulty-matched item on the adaptive path', async () => {
    const q = fakeQueries(pool, { theta: 0, gamesPlayed: 30 })
    // presentationIndex 0 for this seed/user is adaptive (asserted by the holdout-rate test).
    const sel = await selectTask(input, { queries: q, holdoutSeed: 'test-seed' })
    expect(sel.isHoldout).toBe(false)
    expect(sel.selectionPolicy).toBe('adaptive')
    expect(sel.item.itemId).toBe(2)
    expect(sel.predictedP).toBeGreaterThan(EXPECTED_CORRECT_BAND.min)
    expect(sel.predictedP).toBeLessThanOrEqual(EXPECTED_CORRECT_BAND.max)
  })

  it('writes an item_presentations row with a consistent policy pair and the snapshots', async () => {
    const q = fakeQueries(pool, { theta: 0.25, gamesPlayed: 5 })
    const sel = await selectTask({ ...input, matchId: 'm-1', cardId: 42 }, {
      queries: q,
      holdoutSeed: 'test-seed',
    })
    expect(q.written).toHaveLength(1)
    const row = q.written[0]!
    expect(row.is_holdout).toBe(row.selection_policy === 'random_holdout')
    expect(row.user_id).toBe('u1')
    expect(row.match_id).toBe('m-1')
    expect(row.card_id).toBe(42)
    expect(row.user_theta_at_presentation).toBe(0.25)
    expect(row.item_beta_at_presentation).toBe(sel.item.beta)
    expect(row.predicted_p).toBeCloseTo(sel.predictedP, 12)
  })

  it('treats a learner with no user_ratings row as theta 0, n 0', async () => {
    const q = fakeQueries(pool)
    const sel = await selectTask(input, { queries: q, holdoutSeed: 'test-seed' })
    expect(sel.learner).toEqual(newLearnerRating(0, 0))
  })

  it('honours excludeItemIds', async () => {
    const q = fakeQueries(pool, { theta: 0, gamesPlayed: 30 })
    const sel = await selectTask({ ...input, excludeItemIds: [2] }, {
      queries: q,
      holdoutSeed: 'test-seed',
      holdoutRate: 0,
    })
    expect(sel.item.itemId).not.toBe(2)
  })

  it('throws rather than serving nothing when the pool is empty', async () => {
    await expect(selectTask(input, { queries: fakeQueries([]) })).rejects.toThrow(
      TaskSelectionError,
    )
  })

  it('holds out ~5% of match presentations over many draws, always correctly labeled', async () => {
    const draws = 4000
    const q = fakeQueries(pool, { theta: 0, gamesPlayed: 20 })
    let holdouts = 0
    for (let i = 0; i < draws; i++) {
      const sel = await selectTask(input, { queries: q, holdoutSeed: 'rate-seed', rng: () => 0.5 })
      if (sel.isHoldout) {
        holdouts++
        expect(sel.selectionPolicy).toBe('random_holdout')
        expect(sel.plan.mode).toBe('random')
        expect(sel.plan.calibratesItemDifficulty).toBe(true)
      } else {
        expect(sel.selectionPolicy).toBe('adaptive')
        expect(sel.plan.calibratesItemDifficulty).toBe(false)
      }
    }
    const rate = holdouts / draws
    expect(rate).toBeGreaterThan(DEFAULT_HOLDOUT_RATE - 0.015)
    expect(rate).toBeLessThan(DEFAULT_HOLDOUT_RATE + 0.015)
    // Every row written agrees with the CHECK constraint.
    expect(q.written.every((r) => r.is_holdout === (r.selection_policy === 'random_holdout'))).toBe(
      true,
    )
  })

  it('the holdout serve ignores difficulty entirely', async () => {
    const q = fakeQueries(pool, { theta: 0, gamesPlayed: 20 })
    // rate 1 forces the holdout path; rng pins the uniform pick to the LAST item, which the
    // adaptive path would never choose (beta 6 against theta 0).
    const sel = await selectTask(input, {
      queries: q,
      holdoutSeed: 'test-seed',
      holdoutRate: 1,
      rng: () => 0.99,
    })
    expect(sel.isHoldout).toBe(true)
    expect(sel.item.itemId).toBe(4)
    expect(sel.predictedP).toBeLessThan(0.01)
  })

  it('never applies the holdout to a non-match surface, even at rate 1', async () => {
    const q = fakeQueries(pool, { theta: 0, gamesPlayed: 20 })
    for (const surface of ['trial', 'daily', 'spark', 'gauntlet'] as const) {
      const sel = await selectTask({ ...input, surface }, {
        queries: q,
        holdoutSeed: 'test-seed',
        holdoutRate: 1,
      })
      expect(sel.isHoldout).toBe(false)
      expect(sel.selectionPolicy).toBe(surface)
    }
  })

  it('asks the port for a bounded candidate pool', async () => {
    let seenLimit = -1
    const q = fakeQueries(pool, { theta: 0 })
    const spy: TaskQueries = {
      ...q,
      async fetchCandidateItems(args) {
        seenLimit = args.limit
        return q.fetchCandidateItems(args)
      },
    }
    await selectTask(input, { queries: spy, holdoutSeed: 'test-seed' })
    expect(seenLimit).toBe(CANDIDATE_POOL_LIMIT)
  })
})

describe('row mapping', () => {
  it('prefers calibrated beta, falls back to the cold-start prior, then to 0', () => {
    expect(
      toCandidateItem({
        id: 1,
        time_limit_ms: 1000,
        cold_start_beta: -2,
        prompt: null,
        item_stats: { beta: 0.4, beta_n: 12, irt_b: null },
      }),
    ).toMatchObject({ beta: 0.4, betaN: 12, isCalibrated: true })

    expect(
      toCandidateItem({
        id: 2,
        time_limit_ms: null,
        cold_start_beta: -2,
        prompt: null,
        item_stats: { beta: 99, beta_n: 0, irt_b: null },
      }),
    ).toMatchObject({ beta: -2, betaN: 0, isCalibrated: false })

    expect(
      toCandidateItem({
        id: 3,
        time_limit_ms: null,
        cold_start_beta: null,
        prompt: null,
        item_stats: null,
      }),
    ).toMatchObject({ beta: 0, betaN: 0, isCalibrated: false })
  })

  it('reads the option count out of the prompt, or undefined for free response', () => {
    expect(choicesFromPrompt({ options: ['a', 'b', 'c', 'd'] })).toBe(4)
    expect(choicesFromPrompt({ options: ['a'] })).toBeUndefined()
    expect(choicesFromPrompt({ text: 'write something' })).toBeUndefined()
    expect(choicesFromPrompt(null)).toBeUndefined()
    expect(choicesFromPrompt('nope')).toBeUndefined()
  })
})
