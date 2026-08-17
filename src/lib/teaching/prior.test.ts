import { describe, expect, it } from 'vitest'

import {
  intervalFromRate,
  isNearMiss,
  isTeachable,
  mayPersistPrior,
  PRIOR_CONFIRM_SAMPLES,
  PRIOR_RESCUE_SAMPLES,
  PRIOR_SCREEN_MAX_P0,
  PRIOR_SCREEN_SAMPLES,
  TEACHABLE_MAX_P0,
  wilsonInterval,
} from './prior'

describe('wilsonInterval', () => {
  it('brackets the estimate', () => {
    const { low, high } = wilsonInterval(9, 20)
    expect(low).toBeLessThan(0.45)
    expect(high).toBeGreaterThan(0.45)
  })

  it('does not claim certainty at 0 out of n, which is where the normal approximation fails', () => {
    // p ± z·sqrt(p(1-p)/n) collapses to [0, 0] here. Wilson does not, and the whole reason
    // eligibility reads the bound is that the degenerate cases are common on this bank: 06 found
    // an item at 0 correct across all five vacuous attempts, and 07 watched that same item come
    // back 5/5 at the next prompt version.
    const { low, high } = wilsonInterval(0, 20)
    expect(low).toBe(0)
    expect(high).toBeCloseTo(0.1611, 4)
  })

  it('does not claim certainty at n out of n either', () => {
    const { low, high } = wilsonInterval(20, 20)
    expect(low).toBeCloseTo(0.8389, 4)
    expect(high).toBe(1)
  })

  it('is symmetric under relabelling correct and incorrect', () => {
    const a = wilsonInterval(6, 20)
    const b = wilsonInterval(14, 20)
    expect(a.low).toBeCloseTo(1 - b.high, 12)
    expect(a.high).toBeCloseTo(1 - b.low, 12)
  })

  it('narrows as samples grow, which is the argument for stages 2 and 3', () => {
    const screen = wilsonInterval(1, PRIOR_SCREEN_SAMPLES)
    const confirm = wilsonInterval(4, PRIOR_CONFIRM_SAMPLES)
    const rescue = wilsonInterval(6, PRIOR_RESCUE_SAMPLES)
    expect(confirm.high - confirm.low).toBeLessThan(screen.high - screen.low)
    expect(rescue.high - rescue.low).toBeLessThan(confirm.high - confirm.low)
  })

  it('stays inside [0, 1]', () => {
    for (let n = 1; n <= 40; n += 1) {
      for (let k = 0; k <= n; k += 1) {
        const { low, high } = wilsonInterval(k, n)
        expect(low).toBeGreaterThanOrEqual(0)
        expect(high).toBeLessThanOrEqual(1)
        expect(low).toBeLessThanOrEqual(high)
      }
    }
  })

  it('rejects counts it cannot interpret', () => {
    expect(() => wilsonInterval(0, 0)).toThrow(RangeError)
    expect(() => wilsonInterval(3, 2)).toThrow(RangeError)
    expect(() => wilsonInterval(-1, 5)).toThrow(RangeError)
    expect(() => wilsonInterval(1.5, 5)).toThrow(RangeError)
  })
})

describe('intervalFromRate', () => {
  it('round-trips a stored rate back to the counts it came from', () => {
    for (const n of [PRIOR_SCREEN_SAMPLES, PRIOR_CONFIRM_SAMPLES, PRIOR_RESCUE_SAMPLES]) {
      for (let k = 0; k <= n; k += 1) {
        expect(intervalFromRate(k / n, n)).toEqual(wilsonInterval(k, n))
      }
    }
  })
})

describe('the sample sizes each stage decides on', () => {
  it('makes n = 20 the point where a clean item can clear the line', () => {
    // 5 or fewer correct out of 20 clears; 6 does not. This is what makes the bound rule
    // reachable at stage 2 rather than a rule nothing can ever satisfy.
    expect(wilsonInterval(5, PRIOR_CONFIRM_SAMPLES).high).toBeLessThan(TEACHABLE_MAX_P0)
    expect(wilsonInterval(6, PRIOR_CONFIRM_SAMPLES).high).toBeGreaterThan(TEACHABLE_MAX_P0)
  })

  it('loosens the bar at n = 30, which is what stage 3 buys a near miss', () => {
    // 0.25 of the sample at n=20 against 0.30 at n=30. An item whose true p0 is really low
    // and drew badly at stage 2 gets a second hearing instead of being discarded.
    expect(wilsonInterval(9, PRIOR_RESCUE_SAMPLES).high).toBeLessThan(TEACHABLE_MAX_P0)
    expect(wilsonInterval(10, PRIOR_RESCUE_SAMPLES).high).toBeGreaterThan(TEACHABLE_MAX_P0)
    expect(9 / PRIOR_RESCUE_SAMPLES).toBeGreaterThan(5 / PRIOR_CONFIRM_SAMPLES)
  })

  it('cannot be satisfied at all by a screening sample', () => {
    // Not because the interval is wide, but because mayPersistPrior refuses to record it. The
    // bound alone would happily admit 0/5, which is the trap.
    expect(wilsonInterval(0, PRIOR_SCREEN_SAMPLES).high).toBeLessThan(TEACHABLE_MAX_P0)
    expect(mayPersistPrior(0, PRIOR_SCREEN_SAMPLES)).toBe(false)
  })
})

describe('isTeachable', () => {
  const measured = {
    priorP0: 0.2,
    priorSamples: PRIOR_CONFIRM_SAMPLES,
    priorPromptVersion: 4,
    priorModel: 'claude-haiku-4-5',
    priorP0CiUpper: wilsonInterval(4, PRIOR_CONFIRM_SAMPLES).high,
  }

  it('accepts a measurement whose upper bound clears the line', () => {
    expect(measured.priorP0CiUpper).toBeCloseTo(0.416, 3)
    expect(isTeachable(measured, 4)).toBe(true)
  })

  it('refuses an unmeasured item', () => {
    expect(isTeachable(null, 4)).toBe(false)
    expect(isTeachable(undefined, 4)).toBe(false)
  })

  it('refuses a low point estimate whose interval still reaches the line', () => {
    // 9 of 20 is p0 = 0.45. A point-estimate rule admits it; this one does not, because the
    // evidence is equally consistent with a p0 of 0.65.
    const nearMiss = {
      ...measured,
      priorP0: 0.45,
      priorP0CiUpper: wilsonInterval(9, PRIOR_CONFIRM_SAMPLES).high,
    }
    expect(nearMiss.priorP0).toBeLessThan(TEACHABLE_MAX_P0)
    expect(isTeachable(nearMiss, 4)).toBe(false)
  })

  it('refuses a measurement taken under a different prompt', () => {
    // 07 measured the same six items at 0.333, 0.567 and 0.400 across versions 2, 3 and 4. A p0
    // outlives the prompt that produced it only as a historical record.
    expect(isTeachable(measured, 5)).toBe(false)
    expect(isTeachable({ ...measured, priorPromptVersion: 3 }, 4)).toBe(false)
  })

  it('is strict at the threshold', () => {
    expect(isTeachable({ ...measured, priorP0CiUpper: TEACHABLE_MAX_P0 }, 4)).toBe(false)
    expect(isTeachable({ ...measured, priorP0CiUpper: TEACHABLE_MAX_P0 - 1e-9 }, 4)).toBe(true)
  })
})

describe('mayPersistPrior', () => {
  it('lets a stage-1 screen record a rejection', () => {
    // Every stage-1 reject sits at or above PRIOR_SCREEN_MAX_P0, so its interval reaches well
    // past the line and writing it at n=5 records "dead" without ever reading as eligible.
    expect(mayPersistPrior(PRIOR_SCREEN_MAX_P0, PRIOR_SCREEN_SAMPLES)).toBe(true)
    expect(mayPersistPrior(1.0, PRIOR_SCREEN_SAMPLES)).toBe(true)
  })

  it('refuses to record an eligible-looking figure from a screening sample', () => {
    // The selection-bias guard as code, and not hypothetical: 0 of 5 has an upper bound of
    // 0.434, so the bound alone would admit an item on one lucky draw.
    expect(wilsonInterval(0, PRIOR_SCREEN_SAMPLES).high).toBeLessThan(TEACHABLE_MAX_P0)
    expect(mayPersistPrior(0, PRIOR_SCREEN_SAMPLES)).toBe(false)
    // 1 of 5 is already outside the trap: its upper bound is 0.624, so persisting it records a
    // rejection. At n=5 only a clean sweep can look eligible, which is exactly the lucky draw.
    expect(wilsonInterval(1, PRIOR_SCREEN_SAMPLES).high).toBeGreaterThan(TEACHABLE_MAX_P0)
    expect(mayPersistPrior(0.2, PRIOR_SCREEN_SAMPLES)).toBe(true)
  })

  it('lets a confirmation-sized measurement record anything', () => {
    expect(mayPersistPrior(0.0, PRIOR_CONFIRM_SAMPLES)).toBe(true)
    expect(mayPersistPrior(0.45, PRIOR_CONFIRM_SAMPLES)).toBe(true)
    expect(mayPersistPrior(0.1, PRIOR_RESCUE_SAMPLES)).toBe(true)
  })
})

describe('isNearMiss', () => {
  it('picks out the items stage 3 exists for', () => {
    // Observed under the line, interval over it. 6 through 9 correct out of 20.
    expect(isNearMiss(6 / 20, 20)).toBe(true)
    expect(isNearMiss(9 / 20, 20)).toBe(true)
  })

  it('excludes items that already cleared', () => {
    expect(isNearMiss(5 / 20, 20)).toBe(false)
  })

  it('excludes items whose observed rate is at or above the line', () => {
    // A near miss is an item that looked good and lacked evidence, not one that looked bad. An
    // item at 13 of 20 has an interval spanning 0.5 too, and re-measuring it would be spending
    // 30 more calls on something the sample already argues against.
    expect(isNearMiss(10 / 20, 20)).toBe(false)
    expect(isNearMiss(13 / 20, 20)).toBe(false)
  })
})

describe('the staged thresholds', () => {
  it('screens more generously than it accepts', () => {
    // A screen at the eligibility line would discard, at n=5, items whose true p0 is really
    // low: a 0.25 item shows 3 or more correct out of 5 about 10 percent of the time.
    expect(PRIOR_SCREEN_MAX_P0).toBeGreaterThan(TEACHABLE_MAX_P0)
  })

  it('grows the sample at every stage', () => {
    expect(PRIOR_CONFIRM_SAMPLES).toBeGreaterThan(PRIOR_SCREEN_SAMPLES)
    expect(PRIOR_RESCUE_SAMPLES).toBeGreaterThan(PRIOR_CONFIRM_SAMPLES)
  })
})
