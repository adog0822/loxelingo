import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { STAGES, type Stage } from './contract'
import {
  applyTeachingResult,
  assertNet,
  NET_MAX,
  netAtStageFloor,
  StageError,
  stageFromDb,
  stageFromNet,
  stageProgress,
  stageToDb,
  STEPS_PER_STAGE,
} from './stage'

const MIGRATION = join(process.cwd(), 'supabase/migrations/20260815112234_teaching_loop.sql')

/**
 * The stage rule is expressed twice — once here, once as CHECK constraints in Postgres —
 * because Postgres cannot call TypeScript. Same arrangement as display-scale.test.ts, and for
 * the same reason: a one-sided edit would let a pairing's `stage` and `teaching_net` describe
 * two different ladders, and the disagreement would surface as a progress bar that jumps.
 */
describe('the rule is the same rule in both places', () => {
  const sql = readFileSync(MIGRATION, 'utf8')

  it('pins the division against the migration', () => {
    expect(STEPS_PER_STAGE).toBe(3)
    expect(sql).toContain(`check (stage = 1 + teaching_net / ${STEPS_PER_STAGE})`)
    expect(sql).toContain(
      `stage_before = 1 + net_before / ${STEPS_PER_STAGE} and stage_after = 1 + net_after / ${STEPS_PER_STAGE}`,
    )
  })

  it('pins the cap against the migration', () => {
    expect(NET_MAX).toBe(17)
    expect(sql).toContain(`check (teaching_net between 0 and ${NET_MAX})`)
    expect(sql).toContain(
      `net_after = least(${NET_MAX}, greatest(0, net_before + case when was_correct then 1 else -1 end))`,
    )
  })

  it('agrees with the SQL expression at every reachable counter', () => {
    // `1 + net / 3` in Postgres is integer division on smallints, which is what
    // Math.floor(net / 3) is here. Walk every value the CHECK allows.
    for (let net = 0; net <= NET_MAX; net += 1) {
      expect(stageToDb(stageFromNet(net))).toBe(1 + Math.floor(net / STEPS_PER_STAGE))
    }
  })

  it('puts the cap at the top of the last stage and not inside it', () => {
    expect(stageFromNet(NET_MAX)).toBe('expert')
    expect(1 + Math.floor((NET_MAX + 1) / STEPS_PER_STAGE)).toBe(STAGES.length + 1)
  })
})

describe('the counter reads as six stages of three', () => {
  it('spends exactly three steps in each stage', () => {
    const counts = new Map<Stage, number>()
    for (let net = 0; net <= NET_MAX; net += 1) {
      const stage = stageFromNet(net)
      counts.set(stage, (counts.get(stage) ?? 0) + 1)
    }
    expect([...counts.keys()]).toEqual([...STAGES])
    for (const stage of STAGES) expect(counts.get(stage)).toBe(STEPS_PER_STAGE)
  })

  it('reads back as a progress bar the player can be shown', () => {
    expect(stageProgress(0)).toEqual({ progress: 0, of: 3 })
    expect(stageProgress(2)).toEqual({ progress: 2, of: 3 })
    expect(stageProgress(3)).toEqual({ progress: 0, of: 3 })
  })

  it('places a stage floor where the stage begins', () => {
    for (const stage of STAGES) {
      expect(stageFromNet(netAtStageFloor(stage))).toBe(stage)
      expect(stageProgress(netAtStageFloor(stage)).progress).toBe(0)
    }
  })

  it('refuses a counter outside the range the CHECK allows', () => {
    expect(() => assertNet(-1)).toThrow(StageError)
    expect(() => assertNet(NET_MAX + 1)).toThrow(StageError)
    expect(() => assertNet(1.5)).toThrow(StageError)
  })

  it('round-trips the smallint the column stores', () => {
    for (const stage of STAGES) expect(stageFromDb(stageToDb(stage))).toBe(stage)
    expect(() => stageFromDb(0)).toThrow(StageError)
    expect(() => stageFromDb(7)).toThrow(StageError)
  })
})

describe('three that land move a stage', () => {
  it('promotes on the third success and not the second', () => {
    let net = 0
    const first = applyTeachingResult(net, true)
    expect(first.direction).toBe('held')
    net = first.netAfter
    const second = applyTeachingResult(net, true)
    expect(second.direction).toBe('held')
    net = second.netAfter
    const third = applyTeachingResult(net, true)
    expect(third.direction).toBe('up')
    expect(third.stageAfter).toBe('apprentice')
  })

  it('reaches Expert in fifteen and no fewer', () => {
    let net = 0
    for (let i = 0; i < 14; i += 1) net = applyTeachingResult(net, true).netAfter
    expect(stageFromNet(net)).toBe('adept')
    net = applyTeachingResult(net, true).netAfter
    expect(stageFromNet(net)).toBe('expert')
  })
})

describe('one that misses takes back one of the three', () => {
  it('costs exactly one step, never the stage, from mid-stage', () => {
    // The whole argument against a streak: a player two thirds of the way up loses one third,
    // not everything.
    const move = applyTeachingResult(5, false)
    expect(move.netAfter).toBe(4)
    expect(move.direction).toBe('held')
    expect(move.stageAfter).toBe(move.stageBefore)
  })

  it('demotes only on a boundary, and lands at the top of the stage below', () => {
    const move = applyTeachingResult(6, false)
    expect(move.direction).toBe('down')
    expect(move.stageBefore).toBe('journeyman')
    expect(move.stageAfter).toBe('apprentice')
    // The soft landing: one success takes it straight back.
    expect(applyTeachingResult(move.netAfter, true).stageAfter).toBe('journeyman')
  })

  it('never drops more than one stage from one session', () => {
    for (let net = 0; net <= NET_MAX; net += 1) {
      const move = applyTeachingResult(net, false)
      const dropped = STAGES.indexOf(move.stageBefore) - STAGES.indexOf(move.stageAfter)
      expect(dropped).toBeLessThanOrEqual(1)
      expect(dropped).toBeGreaterThanOrEqual(0)
    }
  })

  it('takes three consecutive misses to cost a stage', () => {
    let net = 8 // journeyman, two of three banked
    for (const expected of ['held', 'held', 'down'] as const) {
      const move = applyTeachingResult(net, false)
      expect(move.direction).toBe(expected)
      net = move.netAfter
    }
  })

  it('holds the floor at Novice', () => {
    const move = applyTeachingResult(0, false)
    expect(move.netAfter).toBe(0)
    expect(move.stageAfter).toBe('novice')
    expect(move.direction).toBe('held')
  })

  it('holds Expert rather than banking past it', () => {
    // Without the cap an Expert could miss thirty times and still read as Expert.
    const move = applyTeachingResult(NET_MAX, true)
    expect(move.netAfter).toBe(NET_MAX)
    expect(move.stageAfter).toBe('expert')
    let net = NET_MAX
    for (let i = 0; i < 3; i += 1) net = applyTeachingResult(net, false).netAfter
    expect(stageFromNet(net)).toBe('adept')
  })

  it('is not a streak: one miss among successes costs one step, not the run', () => {
    let streaky = 0
    for (const taught of [true, true, false, true, true, true]) {
      streaky = applyTeachingResult(streaky, taught).netAfter
    }
    // Five landed, one missed: net 4, one stage up with one banked. A streak rule would have
    // reset on the miss and left this player two thirds of the way through stage 1.
    expect(streaky).toBe(4)
    expect(stageFromNet(streaky)).toBe('apprentice')
  })
})
