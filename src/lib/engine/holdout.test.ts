import { describe, expect, it } from 'vitest';

import { newItemRating, sigmoid, type LearnerRating } from './elo';
import {
  calibrateItemDifficulty,
  DEFAULT_HOLDOUT_RATE,
  fnv1a32,
  hashToUnitInterval,
  HoldoutError,
  isHoldout,
  observedHoldoutRate,
  planPresentation,
  selectHoldoutOutcomes,
  type PresentationKey,
  type PresentationOutcome,
} from './holdout';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const key = (over: Partial<PresentationKey> = {}): PresentationKey => ({
  seed: 'seed-v1',
  userId: 'user-1',
  itemId: 'item-1',
  presentationIndex: 0,
  ...over,
});

const manyKeys = (n: number, seed = 'seed-v1'): PresentationKey[] =>
  Array.from({ length: n }, (_, i) => key({ seed, presentationIndex: i, itemId: `item-${i % 137}` }));

describe('hash primitives', () => {
  it('fnv1a32 is stable and 32-bit', () => {
    const h = fnv1a32('loxelingo');
    expect(h).toBe(fnv1a32('loxelingo'));
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });

  it('hashToUnitInterval lands in [0, 1) and is well spread over sequential keys', () => {
    const values = Array.from({ length: 20_000 }, (_, i) => hashToUnitInterval(`k${i}`));
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    // Ten equal buckets should each get roughly a tenth. This is what a raw FNV would fail.
    const buckets = new Array<number>(10).fill(0);
    for (const v of values) buckets[Math.floor(v * 10)]++;
    for (const count of buckets) {
      expect(count).toBeGreaterThan(values.length / 10 * 0.85);
      expect(count).toBeLessThan((values.length / 10) * 1.15);
    }
  });
});

describe('isHoldout — deterministic given a seed', () => {
  it('defaults to the ~5% rate from §(d)/§7.3', () => {
    expect(DEFAULT_HOLDOUT_RATE).toBe(0.05);
  });

  it('returns the same answer every time for the same key', () => {
    const k = key({ presentationIndex: 42 });
    const first = isHoldout(k);
    for (let i = 0; i < 100; i++) expect(isHoldout(k)).toBe(first);
  });

  it('is idempotent under retry — the same presentation cannot flip', () => {
    const k = key({ presentationIndex: 7 });
    const plans = Array.from({ length: 5 }, () => planPresentation(k));
    expect(new Set(plans.map((p) => p.mode)).size).toBe(1);
  });

  it('produces close to the configured rate over many presentations', () => {
    const keys = manyKeys(40_000);
    const rate = observedHoldoutRate(keys, 0.05);
    expect(rate).toBeGreaterThan(0.045);
    expect(rate).toBeLessThan(0.055);
  });

  it('honours other rates', () => {
    const keys = manyKeys(20_000);
    expect(observedHoldoutRate(keys, 0.2)).toBeGreaterThan(0.19);
    expect(observedHoldoutRate(keys, 0.2)).toBeLessThan(0.21);
    expect(observedHoldoutRate(keys, 0)).toBe(0);
    expect(observedHoldoutRate(keys, 1)).toBe(1);
  });

  it('reshuffles the whole mask when the seed changes', () => {
    const a = manyKeys(2000, 'seed-v1').map((k) => isHoldout(k));
    const b = manyKeys(2000, 'seed-v2').map((k) => isHoldout(k));
    expect(a).not.toEqual(b);
    // ...but the marginal rate is preserved.
    const rateA = a.filter(Boolean).length / a.length;
    const rateB = b.filter(Boolean).length / b.length;
    expect(Math.abs(rateA - rateB)).toBeLessThan(0.03);
  });

  it('rejects a rate outside [0, 1]', () => {
    expect(() => isHoldout(key(), -0.1)).toThrow(HoldoutError);
    expect(() => isHoldout(key(), 1.1)).toThrow(HoldoutError);
  });
});

describe('planPresentation', () => {
  it('marks holdout presentations as randomly selected and difficulty-calibrating', () => {
    const plan = planPresentation(key(), 1);
    expect(plan).toEqual({
      mode: 'random',
      isHoldout: true,
      calibratesItemDifficulty: true,
      calibratesLearnerAbility: true,
    });
  });

  it('marks non-holdout presentations as adaptive and NOT difficulty-calibrating', () => {
    const plan = planPresentation(key(), 0);
    expect(plan).toEqual({
      mode: 'adaptive',
      isHoldout: false,
      calibratesItemDifficulty: false,
      calibratesLearnerAbility: true,
    });
  });

  it('always allows learner-ability calibration — it is the item side the loop corrupts', () => {
    for (const rate of [0, 0.05, 0.5, 1]) {
      expect(planPresentation(key({ presentationIndex: 3 }), rate).calibratesLearnerAbility).toBe(true);
    }
  });
});

describe('calibrateItemDifficulty', () => {
  const outcome = (index: number, learner: LearnerRating, correct: boolean): PresentationOutcome => ({
    key: key({ presentationIndex: index }),
    learner,
    correct,
  });

  it('refuses an adaptive presentation rather than silently corrupting the estimate', () => {
    const adaptive = outcome(0, { theta: 0, n: 100 }, true);
    // Rate 0 makes every presentation adaptive.
    expect(() => calibrateItemDifficulty(newItemRating(), [adaptive], { rate: 0 })).toThrow(HoldoutError);
    expect(() => calibrateItemDifficulty(newItemRating(), [adaptive], { rate: 0 })).toThrow(/holdout slice only/);
  });

  it('accepts a holdout presentation', () => {
    const holdout = outcome(0, { theta: 0, n: 100 }, true);
    const { item, used } = calibrateItemDifficulty(newItemRating(), [holdout], { rate: 1 });
    expect(used).toBe(1);
    expect(item.beta).toBeLessThan(0);
    expect(item.n).toBe(1);
  });

  it('recovers true item difficulty from the holdout slice alone', () => {
    const rng = mulberry32(2024);
    const trueBeta = 0.6;
    const thetas = [-1.5, -0.5, 0.5, 1.5];

    // Simulate a long stream of presentations; only ~5% are holdout, and only those may
    // calibrate difficulty.
    const stream: PresentationOutcome[] = [];
    for (let i = 0; i < 60_000; i++) {
      const theta = thetas[i % thetas.length];
      stream.push({
        key: key({ presentationIndex: i, itemId: 'item-1', userId: `user-${i % 50}` }),
        learner: { theta, n: 10_000 },
        correct: rng() < sigmoid(theta - trueBeta),
      });
    }

    const holdout = selectHoldoutOutcomes(stream);
    expect(holdout.length).toBeGreaterThan(2000);
    expect(holdout.length).toBeLessThan(4000);

    const { item, used } = calibrateItemDifficulty(newItemRating(), holdout);
    expect(used).toBe(holdout.length);
    expect(Math.abs(item.beta - trueBeta)).toBeLessThan(0.25);
  });

  it('leaves the item untouched when there is nothing in the holdout slice', () => {
    const start = newItemRating(0.4, 5);
    const { item, used } = calibrateItemDifficulty(start, []);
    expect(used).toBe(0);
    expect(item).toEqual(start);
  });
});

describe('selectHoldoutOutcomes', () => {
  it('keeps only the non-adaptive slice', () => {
    const outcomes: PresentationOutcome[] = Array.from({ length: 5000 }, (_, i) => ({
      key: key({ presentationIndex: i }),
      learner: { theta: 0, n: 1 },
      correct: i % 2 === 0,
    }));
    const kept = selectHoldoutOutcomes(outcomes);
    expect(kept.length).toBeLessThan(outcomes.length);
    for (const o of kept) expect(isHoldout(o.key)).toBe(true);
  });
});
