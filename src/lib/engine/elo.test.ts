import { describe, expect, it } from 'vitest';

import {
  CONTENT_PRIOR_PSEUDO_COUNT,
  DEFAULT_ELO,
  DISPLAY_INIT,
  eloUpdate,
  expectedCorrect,
  fromDisplayScale,
  itemK,
  kFactor,
  learnerK,
  newItemRating,
  newLearnerRating,
  sigmoid,
  toDisplayScale,
  updateItemOnly,
  updateLearnerOnly,
  type EloConfig,
} from './elo';

/** Deterministic PRNG so the simulations below never flake. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('sigmoid / expectedCorrect', () => {
  it('is 0.5 when ability equals difficulty', () => {
    expect(sigmoid(0)).toBe(0.5);
    expect(expectedCorrect(1.3, 1.3)).toBeCloseTo(0.5, 12);
  });

  it('is monotone increasing in ability and decreasing in difficulty', () => {
    expect(expectedCorrect(1, 0)).toBeGreaterThan(expectedCorrect(0, 0));
    expect(expectedCorrect(0, 1)).toBeLessThan(expectedCorrect(0, 0));
  });

  it('stays strictly inside (0, 1)', () => {
    for (const z of [-50, -5, 0, 5, 50]) {
      const p = expectedCorrect(z, 0);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('applies a 1/k guessing floor for multiple choice (Pelanek 2016)', () => {
    // P = 1/k + (1 - 1/k) * sigmoid(theta - beta)
    expect(expectedCorrect(-20, 0, 4)).toBeCloseTo(0.25, 6);
    expect(expectedCorrect(0, 0, 4)).toBeCloseTo(0.25 + 0.75 * 0.5, 12);
    // k <= 1 means free response: no floor.
    expect(expectedCorrect(-20, 0, 1)).toBeCloseTo(sigmoid(-20), 12);
    expect(expectedCorrect(-20, 0)).toBeCloseTo(sigmoid(-20), 12);
  });
});

describe('dynamic K = a / (1 + b*n)', () => {
  it('matches the Papousek 2014 constants at n = 0', () => {
    expect(DEFAULT_ELO.aUser).toBe(1);
    expect(DEFAULT_ELO.bUser).toBe(0.05);
    expect(kFactor(0, 1, 0.05)).toBe(1);
  });

  it('decreases strictly monotonically with games played, until the floor', () => {
    let previous = Infinity;
    for (let n = 0; n <= 500; n++) {
      const k = kFactor(n, 1, 0.05, 0);
      expect(k).toBeLessThan(previous);
      previous = k;
    }
  });

  it('reproduces the documented values at n = 0, 20 and 200', () => {
    expect(kFactor(0, 1, 0.05, 0)).toBeCloseTo(1.0, 12);
    expect(kFactor(20, 1, 0.05, 0)).toBeCloseTo(0.5, 12);
    expect(kFactor(200, 1, 0.05, 0)).toBeCloseTo(1 / 11, 12);
  });

  it('never falls below the floor, so long-lived items can still drift (§7.3 note 3)', () => {
    expect(kFactor(1_000_000, 1, 0.05, 0.02)).toBe(0.02);
    expect(itemK({ beta: 0, n: 1_000_000 })).toBe(DEFAULT_ELO.kFloor);
    expect(learnerK({ theta: 0, n: 1_000_000 })).toBe(DEFAULT_ELO.kFloor);
  });

  it('rejects a negative observation count', () => {
    expect(() => kFactor(-1, 1, 0.05)).toThrow(RangeError);
  });

  it('is monotone non-increasing in the entity\'s own n, per side', () => {
    const cfg: EloConfig = { ...DEFAULT_ELO, aItem: 0.4, bItem: 0.1 };
    for (let n = 1; n < 100; n++) {
      expect(itemK({ beta: 0, n }, cfg)).toBeLessThanOrEqual(itemK({ beta: 0, n: n - 1 }, cfg));
      expect(learnerK({ theta: 0, n }, cfg)).toBeLessThanOrEqual(learnerK({ theta: 0, n: n - 1 }, cfg));
    }
  });
});

describe('initialisation', () => {
  it('starts both sides at 0 (Pelanek 2016 states this explicitly)', () => {
    expect(newLearnerRating()).toEqual({ theta: 0, n: 0 });
    expect(newItemRating()).toEqual({ beta: 0, n: 0 });
  });

  it('lets a content-primed item carry a pseudo-count so the prior is not washed out', () => {
    const primed = newItemRating(1.4, CONTENT_PRIOR_PSEUDO_COUNT);
    expect(primed).toEqual({ beta: 1.4, n: 5 });
    // A primed item moves less on its first observation than a cold one does.
    const cold = newItemRating(1.4, 0);
    const primedStep = Math.abs(updateItemOnly(newLearnerRating(), primed, true).item.beta - 1.4);
    const coldStep = Math.abs(updateItemOnly(newLearnerRating(), cold, true).item.beta - 1.4);
    expect(primedStep).toBeLessThan(coldStep);
  });
});

describe('eloUpdate — two-sided', () => {
  it('raises ability and lowers difficulty on a correct answer', () => {
    const r = eloUpdate(newLearnerRating(), newItemRating(), true);
    expect(r.user.theta).toBeGreaterThan(0);
    expect(r.item.beta).toBeLessThan(0);
  });

  it('lowers ability and raises difficulty on an incorrect answer', () => {
    const r = eloUpdate(newLearnerRating(), newItemRating(), false);
    expect(r.user.theta).toBeLessThan(0);
    expect(r.item.beta).toBeGreaterThan(0);
  });

  it('is zero-sum in (theta + beta) when both sides share the same K', () => {
    // The sign asymmetry is the whole model: the same observation moves both sides by the same
    // magnitude in opposite directions, so theta + beta is invariant.
    for (const n of [0, 3, 17, 240]) {
      for (const correct of [true, false]) {
        const user = { theta: 0.7, n };
        const item = { beta: -0.2, n };
        const before = user.theta + item.beta;
        const r = eloUpdate(user, item, correct);
        expect(r.user.theta + r.item.beta).toBeCloseTo(before, 12);
      }
    }
  });

  it('is NOT zero-sum when the two sides have different observation counts', () => {
    // Items accrue far more answers than learners do, so per-side counts (which §7.2 calls a
    // faithful reading of Pelanek's recommendation) deliberately break the symmetry.
    const r = eloUpdate({ theta: 0, n: 0 }, { beta: 0, n: 500 }, true);
    expect(r.user.theta).toBeGreaterThan(Math.abs(r.item.beta));
  });

  it('increments both observation counts and mutates neither input', () => {
    const user = newLearnerRating(0.5, 4);
    const item = newItemRating(0.1, 9);
    const r = eloUpdate(user, item, true);
    expect(r.user.n).toBe(5);
    expect(r.item.n).toBe(10);
    expect(user).toEqual({ theta: 0.5, n: 4 });
    expect(item).toEqual({ beta: 0.1, n: 9 });
  });

  it('reports the pre-update prediction and the surprise', () => {
    const r = eloUpdate({ theta: 1, n: 0 }, { beta: 0, n: 0 }, true);
    expect(r.predicted).toBeCloseTo(sigmoid(1), 12);
    expect(r.surprise).toBeCloseTo(1 - sigmoid(1), 12);
    expect(r.surprise).toBeGreaterThanOrEqual(0);
    expect(r.surprise).toBeLessThanOrEqual(1);
  });

  it('takes a step proportional to the surprise', () => {
    const expected = eloUpdate({ theta: 3, n: 0 }, { beta: -3, n: 0 }, true);
    const surprising = eloUpdate({ theta: -3, n: 0 }, { beta: 3, n: 0 }, true);
    expect(surprising.user.theta - -3).toBeGreaterThan(expected.user.theta - 3);
  });
});

describe('one-sided updates', () => {
  it('updateLearnerOnly leaves item difficulty untouched', () => {
    const both = eloUpdate({ theta: 0, n: 2 }, { beta: 0.3, n: 2 }, true);
    const learnerOnly = updateLearnerOnly({ theta: 0, n: 2 }, { beta: 0.3, n: 2 }, true);
    expect(learnerOnly.user).toEqual(both.user);
    expect(learnerOnly.predicted).toBeCloseTo(both.predicted, 12);
  });

  it('updateItemOnly leaves learner ability untouched', () => {
    const both = eloUpdate({ theta: 0, n: 2 }, { beta: 0.3, n: 2 }, false);
    const itemOnly = updateItemOnly({ theta: 0, n: 2 }, { beta: 0.3, n: 2 }, false);
    expect(itemOnly.item).toEqual(both.item);
  });
});

describe('convergence (the property that matters for item selection)', () => {
  it('recovers a learner\'s true ability from responses to known-difficulty items', () => {
    const rng = mulberry32(1234);
    const trueTheta = 1.1;
    let user = newLearnerRating();
    // Items with known difficulty spread around the learner's ability.
    const betas = [-2, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3];
    for (let i = 0; i < 4000; i++) {
      const beta = betas[i % betas.length];
      const correct = rng() < sigmoid(trueTheta - beta);
      user = updateLearnerOnly(user, { beta, n: 10_000 }, correct).user;
    }
    expect(user.theta).toBeCloseTo(trueTheta, 0);
    expect(Math.abs(user.theta - trueTheta)).toBeLessThan(0.25);
  });

  it('recovers an item\'s true difficulty from known-ability learners', () => {
    const rng = mulberry32(99);
    const trueBeta = -0.8;
    let item = newItemRating(0, 0);
    const thetas = [-2, -1, 0, 1, 2];
    for (let i = 0; i < 4000; i++) {
      const theta = thetas[i % thetas.length];
      const correct = rng() < sigmoid(theta - trueBeta);
      item = updateItemOnly({ theta, n: 10_000 }, item, correct).item;
    }
    expect(Math.abs(item.beta - trueBeta)).toBeLessThan(0.25);
  });

  it('dynamic K beats a large constant K on held-out log loss (§7.3\'s finding)', () => {
    const rng = mulberry32(7);
    const trueTheta = 0.9;
    const betas = [-1.5, -0.5, 0, 0.5, 1.5];

    const run = (cfg: EloConfig) => {
      let user = newLearnerRating();
      let loss = 0;
      let scored = 0;
      for (let i = 0; i < 2000; i++) {
        const beta = betas[i % betas.length];
        const p = sigmoid(trueTheta - beta);
        const correct = rng() < p;
        const predicted = expectedCorrect(user.theta, beta);
        if (i >= 1000) {
          loss += -(correct ? Math.log(predicted) : Math.log(1 - predicted));
          scored++;
        }
        user = updateLearnerOnly(user, { beta, n: 10_000 }, correct, cfg).user;
      }
      return loss / scored;
    };

    const dynamic = run({ ...DEFAULT_ELO, kFloor: 0 });
    const constantHigh = run({ aUser: 0.5, bUser: 0, aItem: 0.5, bItem: 0, kFloor: 0 });
    expect(dynamic).toBeLessThan(constantHigh);
  });
});

describe('display scale (presentation only)', () => {
  it('round-trips through the 400-point scale', () => {
    for (const logit of [-3, -0.4, 0, 1.7, 4]) {
      expect(fromDisplayScale(toDisplayScale(logit))).toBeCloseTo(logit, 10);
    }
  });

  it('puts a zero logit at the anchor', () => {
    // The anchor is 900, the floor of the Treeline altitude band, not the
    // conventional 1500. At 1500 a brand-new account would spawn inside
    // "Above the Deck" — the payoff band — inverting the whole climb.
    // See the rationale on DISPLAY_INIT in elo.ts; the constants and their SQL
    // counterpart are pinned by display-scale.test.ts.
    expect(toDisplayScale(0)).toBe(DISPLAY_INIT);
    expect(DISPLAY_INIT).toBe(900);
  });
});
