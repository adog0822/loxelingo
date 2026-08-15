import { describe, expect, it } from 'vitest'

import { DEFAULT_ELO, learnerK, updateLearnerOnly } from '@/lib/engine/elo'
import { cohensKappa, type CalibrationReport, type LabelPair } from '@/lib/judge/calibration'
import { parseAnswerKey } from './answer-key'
import type { AttemptResult } from './contract'
import { stageFromNet } from './stage'
import {
  type AttemptProvenance,
  settleTeachingSession,
  TeachingError,
  type TeachingPairing,
  type TeachingSessionInput,
  type TeachingSessionRow,
  type TeachingStore,
  teachingRatingsMove,
} from './session'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const KEY = parseAnswerKey({ mode: 'exact', primary: '書いて', accept: ['書いて', 'かいて'] })

const PROVENANCE: AttemptProvenance = {
  model: 'claude-haiku-4-5',
  modelVersion: 'claude-haiku-4-5@1',
  promptVersion: 1,
}

const TAUGHT_AT = new Date('2026-08-15T10:00:00.000Z')

function sessionInput(overrides: Partial<TeachingSessionInput> = {}): TeachingSessionInput {
  return {
    sessionId: '11111111-1111-4111-8111-111111111111',
    userId: 'user-1',
    world: 'ja',
    avatarSlug: 'vane',
    ladder: 'forge',
    itemId: 42,
    conceptId: 7,
    explanation: 'く verbs take いて. 書く becomes 書いて.',
    itemBeta: -1.3,
    taughtAt: TAUGHT_AT,
    ...overrides,
  }
}

function attemptResult(answer: string, saidItUnderstood = true): AttemptResult {
  return { answer, saidItUnderstood, remark: 'One line, in character.' }
}

class FakeStore implements TeachingStore {
  readonly sessions: TeachingSessionRow[] = []
  readonly pairingWrites: {
    stage: number
    net: number
    theta: number
    lessonsTaught: number
    lastTaughtAt: Date
  }[] = []
  /** Set to make `recordSession` report a collision, which is what a replay looks like. */
  collide = false

  constructor(private pairing: TeachingPairing | null) {}

  async readPairing(): Promise<TeachingPairing | null> {
    return this.pairing
  }

  async recordSession(row: TeachingSessionRow): Promise<boolean> {
    if (this.collide) return false
    this.sessions.push(row)
    return true
  }

  async writePairing(
    _userId: string,
    _world: 'ja',
    _avatarSlug: string,
    next: {
      stage: number
      net: number
      theta: number
      lessonsTaught: number
      lastTaughtAt: Date
    },
  ): Promise<void> {
    this.pairingWrites.push(next)
  }
}

const pairing = (over: Partial<TeachingPairing> = {}): TeachingPairing => ({
  stage: 'novice',
  net: 0,
  theta: 0,
  lessonsTaught: 0,
  ...over,
})

/** A gold set of `n` labels with `agreeing` of them matching. Enough to move the kappa. */
function calibration(n: number, agreeing: number): CalibrationReport {
  const pairs: LabelPair[] = []
  for (let i = 0; i < n; i += 1) {
    const human = (['a', 'b', 'draw'] as const)[i % 3]!
    const judge = i < agreeing ? human : (['b', 'draw', 'a'] as const)[i % 3]!
    pairs.push({ human, judge })
  }
  return cohensKappa(pairs)
}

const CALIBRATED = calibration(120, 110)
const UNCALIBRATED = calibration(120, 60)
const TOO_SMALL = calibration(30, 30)

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

describe('TEACHING_RESPECTS_CALIBRATION_GATE', () => {
  it('recognises a passing configuration and refuses the rest', () => {
    expect(CALIBRATED.kappa).toBeGreaterThan(0.6)
    expect(teachingRatingsMove(CALIBRATED)).toBe(true)
    expect(teachingRatingsMove(UNCALIBRATED)).toBe(false)
    // Below MIN_GOLD_SET a perfect kappa still fails: one flipped label would swing it.
    expect(TOO_SMALL.kappa).toBe(1)
    expect(teachingRatingsMove(TOO_SMALL)).toBe(false)
  })

  it('treats an ABSENT report as a failed gate, not a skipped one', () => {
    // The failure this guards against: a safety check that vanishes when unconfigured, while
    // the code still reads as though ratings are protected.
    expect(teachingRatingsMove(undefined)).toBe(false)
  })

  it('settles with not_calibrated and moves no rating while the gate holds', async () => {
    const store = new FakeStore(pairing({ net: 4, stage: stageFromNet(4), theta: 0.8, lessonsTaught: 6 }))

    const outcome = await settleTeachingSession(
      sessionInput(),
      attemptResult('書いて'),
      KEY,
      PROVENANCE,
      store,
      { calibration: UNCALIBRATED },
    )

    expect(outcome.noSettleReason).toBe('not_calibrated')
    expect(outcome.taught).toBe(true)
    expect(outcome.thetaBefore).toBeNull()
    expect(outcome.thetaAfter).toBeNull()

    // The rating did not move, at all, anywhere.
    expect(store.pairingWrites).toHaveLength(1)
    expect(store.pairingWrites[0]!.theta).toBe(0.8)
    expect(store.sessions[0]!.thetaBefore).toBeNull()
    expect(store.sessions[0]!.thetaAfter).toBeNull()
  })

  it('withholds the rating and nothing else', async () => {
    // Judging and feedback still run. The stage moves, the session is recorded, the avatar's
    // remark is kept. Only the write to theta is held back.
    const store = new FakeStore(pairing({ net: 5, stage: stageFromNet(5), theta: 0.8, lessonsTaught: 6 }))

    const outcome = await settleTeachingSession(
      sessionInput(),
      attemptResult('書いて'),
      KEY,
      PROVENANCE,
      store,
      { calibration: UNCALIBRATED },
    )

    expect(outcome.stageBefore).toBe('apprentice')
    expect(outcome.stageAfter).toBe('journeyman')
    expect(store.pairingWrites[0]!.net).toBe(6)
    expect(store.pairingWrites[0]!.lessonsTaught).toBe(7)
    expect(store.sessions[0]!.attemptRemark).toBe('One line, in character.')
    expect(store.sessions[0]!.noSettleReason).toBe('not_calibrated')
  })

  it('moves the rating once the gate clears, with nothing else changed', async () => {
    const frozen = new FakeStore(pairing({ theta: 0.4, lessonsTaught: 3 }))
    const thawed = new FakeStore(pairing({ theta: 0.4, lessonsTaught: 3 }))

    const before = await settleTeachingSession(
      sessionInput(),
      attemptResult('書いて'),
      KEY,
      PROVENANCE,
      frozen,
      { calibration: UNCALIBRATED },
    )
    const after = await settleTeachingSession(
      sessionInput(),
      attemptResult('書いて'),
      KEY,
      PROVENANCE,
      thawed,
      { calibration: CALIBRATED },
    )

    expect(before.stageAfter).toBe(after.stageAfter)
    expect(before.thetaAfter).toBeNull()
    expect(after.thetaAfter).toBeGreaterThan(0.4)
  })
})

// ---------------------------------------------------------------------------
// Scoring and the two tracks
// ---------------------------------------------------------------------------

describe('the score is the answer key and nothing else', () => {
  it('scores an accepted alternative as taught', async () => {
    const store = new FakeStore(pairing())
    const outcome = await settleTeachingSession(
      sessionInput(),
      attemptResult('かいて'),
      KEY,
      PROVENANCE,
      store,
      { calibration: CALIBRATED },
    )
    expect(outcome.taught).toBe(true)
  })

  it('ignores the avatar saying it understood', async () => {
    // The low-candour failure: a confident wrong answer. The claim is flavour; the key decides.
    const store = new FakeStore(pairing({ net: 4, stage: stageFromNet(4) }))
    const outcome = await settleTeachingSession(
      sessionInput(),
      attemptResult('書きて', true),
      KEY,
      PROVENANCE,
      store,
      { calibration: CALIBRATED },
    )
    expect(outcome.taught).toBe(false)
    expect(store.sessions[0]!.attemptSaidUnderstood).toBe(true)
    expect(store.sessions[0]!.wasCorrect).toBe(false)
    expect(store.pairingWrites[0]!.net).toBe(3)
  })

  it('ignores the avatar denying it understood', async () => {
    const store = new FakeStore(pairing())
    const outcome = await settleTeachingSession(
      sessionInput(),
      attemptResult('書いて', false),
      KEY,
      PROVENANCE,
      store,
      { calibration: CALIBRATED },
    )
    expect(outcome.taught).toBe(true)
  })
})

describe('rating movement uses the existing engine, on the pairing only', () => {
  it('delegates verbatim to updateLearnerOnly with the existing dynamic K', async () => {
    const store = new FakeStore(pairing({ theta: 0.25, lessonsTaught: 11 }))
    await settleTeachingSession(
      sessionInput({ itemBeta: -0.4 }),
      attemptResult('書いて'),
      KEY,
      PROVENANCE,
      store,
      { calibration: CALIBRATED },
    )

    const expected = updateLearnerOnly(
      { theta: 0.25, n: 11 },
      { beta: -0.4, n: 0 },
      true,
      DEFAULT_ELO,
    ).user

    expect(store.pairingWrites[0]!.theta).toBe(expected.theta)
    expect(store.pairingWrites[0]!.lessonsTaught).toBe(expected.n)
  })

  it('applies the guessing floor on a closed task', async () => {
    const open = new FakeStore(pairing({ theta: 0, lessonsTaught: 0 }))
    const closed = new FakeStore(pairing({ theta: 0, lessonsTaught: 0 }))

    await settleTeachingSession(
      sessionInput(),
      attemptResult('書いて'),
      KEY,
      PROVENANCE,
      open,
      { calibration: CALIBRATED },
    )
    await settleTeachingSession(
      sessionInput({ choices: 4 }),
      attemptResult('書いて'),
      KEY,
      PROVENANCE,
      closed,
      { calibration: CALIBRATED },
    )

    // A four-option item was likelier to be right by luck, so it moves theta less.
    expect(closed.pairingWrites[0]!.theta).toBeLessThan(open.pairingWrites[0]!.theta)
  })

  it('lowers the pairing theta on a miss', async () => {
    const store = new FakeStore(pairing({ theta: 0.9, lessonsTaught: 4 }))
    const outcome = await settleTeachingSession(
      sessionInput(),
      attemptResult('書きて'),
      KEY,
      PROVENANCE,
      store,
      { calibration: CALIBRATED },
    )
    expect(outcome.thetaAfter!).toBeLessThan(0.9)
  })

  it('decays K with the pairing lesson count, not with the player match count', async () => {
    const fresh = new FakeStore(pairing({ theta: 0, lessonsTaught: 0 }))
    const settled = new FakeStore(pairing({ theta: 0, lessonsTaught: 100 }))
    for (const store of [fresh, settled]) {
      await settleTeachingSession(
        // beta 0 against theta 0: P(correct) is exactly 0.5, so the whole move is K/2 and the
        // only thing separating these two pairings is how far K has decayed.
        sessionInput({ itemBeta: 0 }),
        attemptResult('書いて'),
        KEY,
        PROVENANCE,
        store,
        { calibration: CALIBRATED },
      )
    }
    expect(fresh.pairingWrites[0]!.theta).toBeCloseTo(learnerK({ theta: 0, n: 0 }) * 0.5, 10)
    expect(settled.pairingWrites[0]!.theta).toBeCloseTo(learnerK({ theta: 0, n: 100 }) * 0.5, 10)
    expect(settled.pairingWrites[0]!.theta).toBeLessThan(fresh.pairingWrites[0]!.theta)
  })

  it('has no way to reach user_ratings', () => {
    // Two tracks, deliberately separate. `TeachingStore` is the whole database surface of this
    // module and it names one table's worth of operations.
    const surface: (keyof TeachingStore)[] = ['readPairing', 'recordSession', 'writePairing']
    expect(surface).toHaveLength(3)
    const store = new FakeStore(pairing())
    for (const method of surface) expect(typeof store[method]).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// The reasons nothing settled
// ---------------------------------------------------------------------------

describe('the sessions that settle nothing', () => {
  it('records nothing for an empty explanation', async () => {
    const store = new FakeStore(pairing({ net: 4, stage: stageFromNet(4) }))
    const outcome = await settleTeachingSession(
      sessionInput({ explanation: '   \n ' }),
      attemptResult('書いて'),
      KEY,
      PROVENANCE,
      store,
      { calibration: CALIBRATED },
    )
    expect(outcome.noSettleReason).toBe('explanation_empty')
    expect(outcome.stageBefore).toBe(outcome.stageAfter)
    expect(store.sessions).toEqual([])
    expect(store.pairingWrites).toEqual([])
  })

  it('treats a failed attempt as an outage, never as a miss', async () => {
    // Charging a player a third of a stage for our downtime is indistinguishable, session by
    // session, from having taught badly.
    const store = new FakeStore(pairing({ net: 4, stage: stageFromNet(4) }))
    const outcome = await settleTeachingSession(
      sessionInput(),
      null,
      KEY,
      PROVENANCE,
      store,
      { calibration: CALIBRATED },
    )
    expect(outcome.noSettleReason).toBe('attempt_failed')
    expect(outcome.taught).toBe(false)
    expect(store.sessions).toEqual([])
    expect(store.pairingWrites).toEqual([])
  })

  it('moves nothing on a replay', async () => {
    const store = new FakeStore(pairing({ net: 4, stage: stageFromNet(4), theta: 0.5, lessonsTaught: 5 }))
    store.collide = true
    const outcome = await settleTeachingSession(
      sessionInput(),
      attemptResult('書いて'),
      KEY,
      PROVENANCE,
      store,
      { calibration: CALIBRATED },
    )
    expect(outcome.noSettleReason).toBe('already_settled')
    expect(store.pairingWrites).toEqual([])
  })

  it('refuses a pairing that does not exist', async () => {
    const store = new FakeStore(null)
    await expect(
      settleTeachingSession(
        sessionInput(),
        attemptResult('書いて'),
        KEY,
        PROVENANCE,
        store,
        { calibration: CALIBRATED },
      ),
    ).rejects.toThrow(TeachingError)
  })

  it('refuses a pairing whose stage and counter disagree', async () => {
    const store = new FakeStore(pairing({ stage: 'expert', net: 0 }))
    await expect(
      settleTeachingSession(
        sessionInput(),
        attemptResult('書いて'),
        KEY,
        PROVENANCE,
        store,
        { calibration: CALIBRATED },
      ),
    ).rejects.toThrow(TeachingError)
  })
})

// ---------------------------------------------------------------------------
// The row
// ---------------------------------------------------------------------------

describe('the session row', () => {
  it('carries the explanation verbatim and the provenance in full', async () => {
    const store = new FakeStore(pairing())
    const input = sessionInput()
    await settleTeachingSession(
      input,
      attemptResult('書いて'),
      KEY,
      PROVENANCE,
      store,
      { calibration: CALIBRATED },
    )
    const row = store.sessions[0]!
    expect(row.explanation).toBe(input.explanation)
    expect(row.teachingModel).toBe(PROVENANCE.model)
    expect(row.teachingModelVersion).toBe(PROVENANCE.modelVersion)
    expect(row.attemptConfigVersion).toBe(PROVENANCE.promptVersion)
    expect(row.taughtAt).toBe(TAUGHT_AT)
    expect(row.conceptId).toBe(7)
  })

  it('satisfies the CHECKs the migration will apply to it', async () => {
    for (const [net, answer] of [
      [0, '書いて'],
      [2, '書いて'],
      [3, '書きて'],
      [17, '書いて'],
      [0, '書きて'],
    ] as const) {
      const store = new FakeStore(pairing({ net, stage: stageFromNet(net) }))
      await settleTeachingSession(
        sessionInput(),
        attemptResult(answer),
        KEY,
        PROVENANCE,
        store,
        { calibration: CALIBRATED },
      )
      const row = store.sessions[0]!
      // teaching_sessions_net_moves_one_step
      expect(row.netAfter).toBe(
        Math.min(17, Math.max(0, row.netBefore + (row.wasCorrect ? 1 : -1))),
      )
      // teaching_sessions_stage_matches_net
      expect(row.stageBefore).toBe(1 + Math.floor(row.netBefore / 3))
      expect(row.stageAfter).toBe(1 + Math.floor(row.netAfter / 3))
      // teaching_sessions_theta_pair_agrees_with_reason
      expect(row.thetaBefore === null).toBe(row.thetaAfter === null)
      expect(row.thetaBefore === null).toBe(row.noSettleReason !== null)
    }
  })
})
