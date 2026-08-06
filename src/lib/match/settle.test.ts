import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DAY_CUTOFF_HOUR,
  FALLBACK_TZ,
  IllegalMatchTransition,
  assertTransition,
  createSupabaseSettleStore,
  nextRating,
  resultToGrade,
  seatResult,
  seatScore,
  settleMatch,
  type ParticipantPatch,
  type SettleStore,
  type SettlementInput,
} from '@/lib/match/settle'
import { DEFAULT_ELO, toDisplayScale, updateLearnerOnly } from '@/lib/engine/elo'
import { Rating, toCardState, newCard, type CardState, type ReviewLogRow } from '@/lib/engine/scheduling'
import { JudgeNotCalibrated, type CalibrationReport } from '@/lib/judge/calibration'

// ---------------------------------------------------------------------------
// Fake store. Records every write so a test can assert on what did NOT happen,
// which is the interesting half of settlement.
// ---------------------------------------------------------------------------

interface FakeOptions {
  claimable?: boolean
  ratings?: Record<string, { theta: number; n: number }>
  reviewLogCollides?: boolean
}

/**
 * A judge that clears the kappa gate.
 *
 * settleMatch now FAILS CLOSED: a rated match with no calibration report throws
 * rather than silently moving a rating. Every rated-path test therefore has to
 * state which judge it is settling under. That these tests previously passed
 * without one is exactly the bug the fail-closed change fixes.
 */
const PASSING = {
  calibration: {
    n: 200,
    kappa: 0.82,
    rawAgreement: 0.9,
    expectedAgreement: 0.44,
    interpretation: 'strong',
    passesGate: true,
    judgeDistribution: { a: 95, b: 95, draw: 10 },
    humanDistribution: { a: 96, b: 94, draw: 10 },
  },
} as const

function fakeStore(opts: FakeOptions = {}) {
  const claimable = opts.claimable ?? true
  const ratings = opts.ratings ?? {}

  const calls = {
    claims: 0,
    participants: [] as { seat: 1 | 2; patch: ParticipantPatch }[],
    ratingWrites: [] as {
      userId: string
      theta: number
      n: number
      uncertainty: number
    }[],
    reviewLogs: [] as ReviewLogRow[],
    cardWrites: [] as { cardId: string; card: CardState }[],
    readOrder: [] as string[],
  }

  const store: SettleStore = {
    async claimSettlement() {
      calls.claims += 1
      return claimable
    },
    async setParticipantResult(_matchId, seat, patch) {
      calls.participants.push({ seat, patch })
    },
    async readRating(userId) {
      calls.readOrder.push(`read:${userId}`)
      return ratings[userId] ?? null
    },
    async writeRating(userId, _w, _l, next, uncertainty) {
      calls.readOrder.push(`write:${userId}`)
      calls.ratingWrites.push({ userId, theta: next.theta, n: next.n, uncertainty })
    },
    async ensureCard(userId) {
      return { cardId: `card-${userId}`, card: toCardState(newCard(new Date('2026-01-01'))) }
    },
    async writeCard(cardId, card) {
      calls.cardWrites.push({ cardId, card })
    },
    async readActiveFsrsParams() {
      return null
    },
    async appendReviewLog(row) {
      calls.reviewLogs.push(row)
      return { inserted: !opts.reviewLogCollides }
    },
  }

  return { store, calls }
}

const SETTLED_AT = new Date('2026-08-05T12:00:00.000Z')

function input(overrides: Partial<SettlementInput> = {}): SettlementInput {
  return {
    matchId: 'match-1',
    worldSlug: 'ja',
    ladderSlug: 'duel',
    isRated: true,
    consistent: true,
    outcome: 'a',
    itemId: 42,
    settledAt: SETTLED_AT,
    seats: [
      { seat: 1, userId: 'u1', isBot: false, tz: 'America/New_York' },
      { seat: 2, userId: 'u2', isBot: false, tz: null },
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------

describe('result mapping', () => {
  it('maps a seat outcome onto per-seat results', () => {
    expect(seatResult('a', 1)).toBe('win')
    expect(seatResult('a', 2)).toBe('loss')
    expect(seatResult('b', 1)).toBe('loss')
    expect(seatResult('b', 2)).toBe('win')
    expect(seatResult('draw', 1)).toBe('draw')
    expect(seatResult('draw', 2)).toBe('draw')
  })

  it('scores a draw as half a win plus half a loss', () => {
    expect(seatScore('win')).toBe(1)
    expect(seatScore('loss')).toBe(0)
    expect(seatScore('draw')).toBe(0.5)
  })

  it('never produces Rating.Easy from a match result', () => {
    expect(resultToGrade('win')).toBe(Rating.Good)
    expect(resultToGrade('draw')).toBe(Rating.Hard)
    expect(resultToGrade('loss')).toBe(Rating.Again)
    for (const r of ['win', 'loss', 'draw'] as const) {
      expect(resultToGrade(r)).not.toBe(Rating.Easy)
    }
  })
})

describe('nextRating', () => {
  it('is byte-identical to updateLearnerOnly at score 1 and score 0', () => {
    const me = { theta: 0.3, n: 7 }
    const opponentTheta = -0.2

    for (const [score, correct] of [
      [1, true],
      [0, false],
    ] as const) {
      expect(nextRating(me, opponentTheta, score)).toEqual(
        updateLearnerOnly(me, { beta: opponentTheta, n: 0 }, correct, DEFAULT_ELO).user,
      )
    }
  })

  it('puts a draw strictly between the win and the loss', () => {
    const me = { theta: 0, n: 0 }
    const loss = nextRating(me, 0, 0).theta
    const draw = nextRating(me, 0, 0.5).theta
    const win = nextRating(me, 0, 1).theta
    expect(loss).toBeLessThan(draw)
    expect(draw).toBeLessThan(win)
    // Even odds, drawn: the observation carries no information.
    expect(draw).toBeCloseTo(0, 12)
  })

  it('increments the observation count on a draw, so K keeps decaying', () => {
    expect(nextRating({ theta: 0, n: 4 }, 0, 0.5).n).toBe(5)
  })
})

describe('transitions', () => {
  it('accepts every transition in LEGAL_TRANSITIONS', () => {
    expect(() => assertTransition('awaiting_opponent', 'judging')).not.toThrow()
    expect(() => assertTransition('judging', 'complete')).not.toThrow()
    expect(() => assertTransition('judging', 'awaiting_opponent')).not.toThrow()
  })

  it('throws on an illegal transition rather than treating it as a retry', () => {
    expect(() => assertTransition('complete', 'judging')).toThrow(IllegalMatchTransition)
    expect(() => assertTransition('awaiting_opponent', 'complete')).toThrow(IllegalMatchTransition)
    expect(() => assertTransition('void', 'complete')).toThrow(IllegalMatchTransition)
  })
})

describe('settleMatch — invariant 2: position consistency', () => {
  it('voids both seats and moves no rating when the orderings disagreed', async () => {
    const { store, calls } = fakeStore()
    const outcome = await settleMatch(input({ consistent: false }), store, PASSING)

    expect(outcome).toEqual({
      matchId: 'match-1',
      settled: false,
      reason: 'position_inconsistent',
    })
    expect(calls.ratingWrites).toEqual([])
    expect(calls.reviewLogs).toEqual([])
    expect(calls.participants.map((p) => p.patch.result)).toEqual(['void', 'void'])
    // No theta is recorded either: there is no result to attribute it to.
    expect(calls.participants.every((p) => p.patch.thetaAfter === undefined)).toBe(true)
  })

  it('still reaches a terminal state, so the match is not retried forever', async () => {
    const { store, calls } = fakeStore()
    await settleMatch(input({ consistent: false }), store, PASSING)
    expect(calls.claims).toBe(1)
  })
})

describe('settleMatch — invariant 3: is_rated', () => {
  it('settles an unrated match without touching user_ratings', async () => {
    const { store, calls } = fakeStore({ ratings: { u1: { theta: 0.5, n: 3 } } })
    const outcome = await settleMatch(input({ isRated: false }), store, PASSING)

    expect(outcome).toEqual({ matchId: 'match-1', settled: false, reason: 'unrated_match' })
    expect(calls.ratingWrites).toEqual([])
    // The result is still recorded — an unrated mode is a real match.
    expect(calls.participants.map((p) => p.patch.result)).toEqual(['win', 'loss'])
    // theta_after === theta_before, so the GENERATED rating_delta evaluates to 0.
    const seat1 = calls.participants.find((p) => p.seat === 1)!.patch
    expect(seat1.thetaBefore).toBe(0.5)
    expect(seat1.thetaAfter).toBe(0.5)
    expect(seat1.ratingAfter! - seat1.ratingBefore!).toBe(0)
  })

  it('still writes review_log for an unrated match — the log is the asset', async () => {
    const { store, calls } = fakeStore()
    await settleMatch(input({ isRated: false }), store, PASSING)
    expect(calls.reviewLogs).toHaveLength(2)
  })

  it('moves no rating when a seat is a labelled bot', async () => {
    const { store, calls } = fakeStore()
    const outcome = await settleMatch(
      input({
        seats: [
          { seat: 1, userId: 'u1', isBot: false, tz: null },
          { seat: 2, userId: null, isBot: true, tz: null },
        ],
      }),
      store,
      PASSING,
    )
    expect(outcome.reason).toBe('bot_opponent_unrated')
    expect(calls.ratingWrites).toEqual([])
    // The bot seat gets a result and nothing else: no rating, no card, no review.
    expect(calls.participants.find((p) => p.seat === 2)!.patch).toEqual({ result: 'loss' })
    expect(calls.reviewLogs).toHaveLength(1)
  })
})

describe('settleMatch — invariant 4: server-side theta', () => {
  it('reads both pre-match thetas before writing either', async () => {
    const { store, calls } = fakeStore({
      ratings: { u1: { theta: 0.4, n: 10 }, u2: { theta: -0.1, n: 2 } },
    })
    await settleMatch(input(), store, PASSING)

    // Both reads must precede both writes, or seat 2 would be staked against
    // seat 1's POST-match theta.
    expect(calls.readOrder).toEqual(['read:u1', 'read:u2', 'write:u1', 'write:u2'])
  })

  it('stakes each seat against the opponent PRE-match theta', async () => {
    const { store, calls } = fakeStore({
      ratings: { u1: { theta: 0.4, n: 10 }, u2: { theta: -0.1, n: 2 } },
    })
    await settleMatch(input({ outcome: 'a' }), store, PASSING)

    const expectedSeat1 = nextRating({ theta: 0.4, n: 10 }, -0.1, 1)
    const expectedSeat2 = nextRating({ theta: -0.1, n: 2 }, 0.4, 0)
    expect(calls.ratingWrites[0]).toMatchObject({ userId: 'u1', theta: expectedSeat1.theta })
    expect(calls.ratingWrites[1]).toMatchObject({ userId: 'u2', theta: expectedSeat2.theta })
  })

  it('defaults an unseen player to the fresh learner rating, not to zero games', async () => {
    const { store, calls } = fakeStore()
    await settleMatch(input(), store, PASSING)
    // theta 0 / n 0 -> first observation carries the full K of 1.0.
    expect(calls.participants.find((p) => p.seat === 1)!.patch.thetaBefore).toBe(0)
    expect(calls.ratingWrites[0].n).toBe(1)
    expect(calls.ratingWrites[0].uncertainty).toBeCloseTo(1 / 1.05, 12)
  })

  it('writes rating_before/rating_after on the display scale and never rating_delta', async () => {
    const { store, calls } = fakeStore({ ratings: { u1: { theta: 0.25, n: 1 } } })
    await settleMatch(input(), store, PASSING)

    const seat1 = calls.participants.find((p) => p.seat === 1)!.patch
    expect(seat1.ratingBefore).toBe(toDisplayScale(0.25))
    expect(seat1.ratingAfter).toBe(toDisplayScale(seat1.thetaAfter!))
    expect(Object.keys(seat1)).not.toContain('ratingDelta')
    expect(Object.keys(seat1)).not.toContain('rating_delta')
  })

  it('has no way to accept a client-supplied theta', () => {
    // Structural, not behavioural: SettlementInput carries no rating field, so a
    // client value cannot reach the Elo update even by accident.
    expect(Object.keys(input())).not.toContain('thetaBefore')
    expect(Object.keys(input())).not.toContain('rating')
  })
})

describe('settleMatch — invariant 1: settles at most once', () => {
  it('is a no-op when the settlement claim finds zero rows', async () => {
    const { store, calls } = fakeStore({ claimable: false })
    const outcome = await settleMatch(input(), store, PASSING)

    expect(outcome).toEqual({
      matchId: 'match-1',
      settled: false,
      reason: 'already_complete',
    })
    expect(calls.ratingWrites).toEqual([])
    expect(calls.participants).toEqual([])
    expect(calls.reviewLogs).toEqual([])
  })

  it('takes the claim BEFORE reading a rating, so a loser reads nothing', async () => {
    const { store, calls } = fakeStore({ claimable: false })
    await settleMatch(input(), store, PASSING)
    expect(calls.readOrder).toEqual([])
  })
})

describe('settleMatch — invariant 5: review_log is append-only', () => {
  it('stamps review_time with the deterministic settledAt, not a clock', async () => {
    const { store, calls } = fakeStore()
    await settleMatch(input(), store, PASSING)
    for (const row of calls.reviewLogs) {
      expect(row.review_time.toISOString()).toBe(SETTLED_AT.toISOString())
    }
  })

  it('does not advance the card when the (card_id, review_time) insert collides', async () => {
    const { store, calls } = fakeStore({ reviewLogCollides: true })
    await settleMatch(input(), store, PASSING)
    expect(calls.reviewLogs).toHaveLength(2)
    // Collision means this settlement already ran. FSRS state must not move again.
    expect(calls.cardWrites).toEqual([])
  })

  it('advances the card exactly once per seat on a first run', async () => {
    const { store, calls } = fakeStore()
    await settleMatch(input(), store, PASSING)
    expect(calls.cardWrites.map((c) => c.cardId)).toEqual(['card-u1', 'card-u2'])
  })

  it('carries the submission timezone, falling back only when it is absent', async () => {
    const { store, calls } = fakeStore()
    await settleMatch(input(), store, PASSING)
    expect(calls.reviewLogs[0].tz).toBe('America/New_York')
    expect(calls.reviewLogs[1].tz).toBe(FALLBACK_TZ)
    expect(calls.reviewLogs[0].day_cutoff_hour).toBe(DEFAULT_DAY_CUTOFF_HOUR)
  })

  it('grades the winner and the loser differently', async () => {
    const { store, calls } = fakeStore()
    await settleMatch(input({ outcome: 'a' }), store, PASSING)
    expect(calls.reviewLogs[0].review_rating).toBe(Rating.Good)
    expect(calls.reviewLogs[1].review_rating).toBe(Rating.Again)
  })

  it('writes no review row when the match has no item', async () => {
    const { store, calls } = fakeStore()
    await settleMatch(input({ itemId: null }), store, PASSING)
    expect(calls.reviewLogs).toEqual([])
  })
})

describe('settleMatch — the kappa gate', () => {
  const uncalibrated: CalibrationReport = {
    n: 200,
    kappa: 0.31,
    rawAgreement: 0.92,
    expectedAgreement: 0.88,
    interpretation: 'rubric_ambiguous',
    passesGate: false,
    judgeDistribution: { a: 190, b: 5, draw: 5 },
    humanDistribution: { a: 180, b: 10, draw: 10 },
  }

  it('refuses to settle a rated match under an uncalibrated judge', async () => {
    const { store, calls } = fakeStore()
    await expect(settleMatch(input(), store, { calibration: uncalibrated })).rejects.toThrow(
      JudgeNotCalibrated,
    )
    // Thrown BEFORE the claim, so the match stays retryable once kappa clears.
    expect(calls.claims).toBe(0)
  })

  it('lets an unrated match through the gate — no rating can move anyway', async () => {
    const { store } = fakeStore()
    const outcome = await settleMatch(input({ isRated: false }), store, {
      calibration: uncalibrated,
    })
    expect(outcome.reason).toBe('unrated_match')
  })
})

describe('settleMatch — the happy path', () => {
  it('returns the rating changes for both seats', async () => {
    const { store } = fakeStore({
      ratings: { u1: { theta: 0.1, n: 5 }, u2: { theta: 0.1, n: 5 } },
    })
    const outcome = await settleMatch(input({ outcome: 'b' }), store, PASSING)

    expect(outcome.settled).toBe(true)
    expect(outcome.reason).toBeUndefined()
    expect(outcome.ratingChanges).toHaveLength(2)
    const [s1, s2] = outcome.ratingChanges!
    expect(s1).toMatchObject({ userId: 'u1', seat: 1, result: 'loss', thetaBefore: 0.1 })
    expect(s2).toMatchObject({ userId: 'u2', seat: 2, result: 'win', thetaBefore: 0.1 })
    // Evenly matched: the winner gains exactly what the loser drops.
    expect(s2.thetaAfter - s2.thetaBefore).toBeCloseTo(s1.thetaBefore - s1.thetaAfter, 12)
  })

  it('moves no rating on a draw between evenly matched players', async () => {
    const { store, calls } = fakeStore({
      ratings: { u1: { theta: 0.2, n: 3 }, u2: { theta: 0.2, n: 3 } },
    })
    await settleMatch(input({ outcome: 'draw' }), store, PASSING)
    expect(calls.ratingWrites[0].theta).toBeCloseTo(0.2, 12)
    expect(calls.ratingWrites[1].theta).toBeCloseTo(0.2, 12)
    expect(calls.participants.map((p) => p.patch.result)).toEqual(['draw', 'draw'])
  })

  it('rejects a match that is missing a seat', async () => {
    const { store } = fakeStore()
    await expect(
      settleMatch(input({ seats: [{ seat: 1, userId: 'u1', isBot: false, tz: null }] }), store, PASSING),
    ).rejects.toThrow(/missing seat 2/)
  })
})

describe('the Supabase adapter', () => {
  it('is only constructed on demand, so importing this module needs no env', () => {
    expect(typeof createSupabaseSettleStore).toBe('function')
  })
})
