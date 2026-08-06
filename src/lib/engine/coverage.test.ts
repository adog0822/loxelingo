import { describe, expect, it } from 'vitest';

import {
  coverage,
  CoverageError,
  dispersion,
  expectedUnknownTokens,
  knownFromTable,
  learnability,
  rankCandidates,
  READING_COVERAGE_BAND,
  scoreCandidate,
  selectBest,
  selectInBand,
  windows,
  type Candidate,
} from './coverage';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A learner who knows `known` perfectly and nothing else. */
const knowsOnly = (...known: string[]) => knownFromTable(new Map(known.map((k) => [k, 1])));

/** `n` known lemmas followed by `m` unknown ones. */
const text = (known: number, unknown: number): string[] => [
  ...Array.from({ length: known }, (_, i) => `k${i % 50}`),
  ...Array.from({ length: unknown }, (_, i) => `u${i}`),
];

const allKnown = knownFromTable({}, 1);
const kKnown = knownFromTable(
  Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, 1])),
  0,
);

describe('the band', () => {
  it('is Hu & Nation\'s [0.95, 0.98]', () => {
    expect(READING_COVERAGE_BAND).toEqual({ min: 0.95, max: 0.98 });
  });

  it('rejects a malformed band', () => {
    const c: Candidate = { id: 'a', lemmas: ['x'] };
    expect(() => scoreCandidate(c, allKnown, { band: { min: 0.9, max: 0.8 } })).toThrow(CoverageError);
    expect(() => scoreCandidate(c, allKnown, { band: { min: -0.1, max: 0.9 } })).toThrow(CoverageError);
    expect(() => scoreCandidate(c, allKnown, { band: { min: 0.9, max: 1.1 } })).toThrow(CoverageError);
  });
});

describe('knownFromTable', () => {
  it('reads a Map and a plain object identically', () => {
    const fromMap = knownFromTable(new Map([['gato', 0.7]]));
    const fromObject = knownFromTable({ gato: 0.7 });
    expect(fromMap('gato')).toBe(0.7);
    expect(fromObject('gato')).toBe(0.7);
  });

  it('treats unseen lemmas as unknown by default', () => {
    expect(knownFromTable({})('nunca')).toBe(0);
    expect(knownFromTable({}, 0.3)('nunca')).toBe(0.3);
  });

  it('clamps out-of-range probabilities and rejects non-finite ones', () => {
    expect(knownFromTable({ a: 1.4 })('a')).toBe(1);
    expect(knownFromTable({ a: -0.2 })('a')).toBe(0);
    expect(() => knownFromTable({ a: Number.NaN })('a')).toThrow(CoverageError);
  });
});

describe('coverage = SUM P(knows lemma) / |tokens|', () => {
  it('computes the documented formula exactly', () => {
    const knows = knownFromTable({ a: 1, b: 0.5, c: 0 });
    expect(coverage(['a', 'b', 'c', 'c'], knows)).toBeCloseTo((1 + 0.5 + 0 + 0) / 4, 12);
  });

  it('is 1 when every lemma is known and 0 when none is', () => {
    expect(coverage(['a', 'b'], knownFromTable({}, 1))).toBe(1);
    expect(coverage(['a', 'b'], knownFromTable({}, 0))).toBe(0);
  });

  it('is 1 for an empty token list', () => {
    expect(coverage([], knownFromTable({}))).toBe(1);
  });

  it('always lands in [0, 1] for arbitrary probabilities', () => {
    const rng = mulberry32(31337);
    for (let trial = 0; trial < 300; trial++) {
      const size = 1 + Math.floor(rng() * 40);
      const lemmas = Array.from({ length: size }, (_, i) => `w${i}`);
      const table = Object.fromEntries(lemmas.map((l) => [l, rng()]));
      const c = coverage(lemmas, knownFromTable(table));
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });

  it('counts repeated tokens once per occurrence, not once per type', () => {
    // 'a' appears 3 times and is known; 'u' once and is not: coverage 0.75, not 0.5.
    expect(coverage(['a', 'a', 'a', 'u'], knowsOnly('a'))).toBeCloseTo(0.75, 12);
  });

  it('hits 0.96 for 96 known tokens out of 100', () => {
    expect(coverage(text(96, 4), kKnown)).toBeCloseTo(0.96, 12);
  });
});

describe('expectedUnknownTokens', () => {
  it('is the complement of coverage, scaled by length', () => {
    const lemmas = text(96, 4);
    expect(expectedUnknownTokens(lemmas, kKnown)).toBeCloseTo(4, 12);
    expect(expectedUnknownTokens(lemmas, kKnown)).toBeCloseTo(
      lemmas.length * (1 - coverage(lemmas, kKnown)),
      9,
    );
  });
});

describe('dispersion', () => {
  const knows = kKnown;

  it('is 1 when unknown mass is spread perfectly evenly', () => {
    const sentences = [
      ['k0', 'k1', 'u0'],
      ['k2', 'k3', 'u1'],
      ['k4', 'k5', 'u2'],
    ];
    expect(dispersion(sentences, knows)).toBeCloseTo(1, 12);
  });

  it('is lower when the same number of unknowns is concentrated in one sentence', () => {
    const spread = [
      ['k0', 'k1', 'u0'],
      ['k2', 'k3', 'u1'],
      ['k4', 'k5', 'u2'],
    ];
    const clumped = [
      ['k0', 'k1', 'k2'],
      ['k3', 'k4', 'k5'],
      ['u0', 'u1', 'u2'],
    ];
    expect(dispersion(clumped, knows)).toBeLessThan(dispersion(spread, knows));
  });

  it('is 1 when there is no unknown mass at all', () => {
    expect(dispersion([['k0', 'k1'], ['k2']], knows)).toBe(1);
    expect(dispersion([], knows)).toBe(1);
  });

  it('stays inside [0, 1] for arbitrary inputs', () => {
    const rng = mulberry32(555);
    for (let trial = 0; trial < 200; trial++) {
      const unitCount = 1 + Math.floor(rng() * 6);
      const units = Array.from({ length: unitCount }, () =>
        Array.from({ length: 1 + Math.floor(rng() * 8) }, () => (rng() < 0.5 ? 'k0' : `u${Math.floor(rng() * 20)}`)),
      );
      const d = dispersion(units, knows);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
  });

  it('windows a flat lemma list when sentence boundaries are unavailable', () => {
    expect(windows(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
    expect(windows([], 3)).toEqual([]);
    expect(() => windows(['a'], 0)).toThrow(CoverageError);
    expect(() => windows(['a'], 1.5)).toThrow(CoverageError);
  });
});

describe('learnability', () => {
  it('is inert (0.5) when no per-lemma function is supplied', () => {
    expect(learnability(['u0', 'u1'], kKnown)).toBe(0.5);
  });

  it('weights each unknown lemma by its unknown mass', () => {
    const knows = knownFromTable({ nearlyKnown: 0.9, unknown: 0 });
    const l = learnability(['nearlyKnown', 'unknown'], knows, (lemma) => (lemma === 'unknown' ? 1 : 0));
    // Masses are 0.1 and 1.0, so the fully-unknown lemma dominates.
    expect(l).toBeCloseTo(1 / 1.1, 9);
  });

  it('ignores fully-known lemmas entirely', () => {
    const knows = knowsOnly('k');
    expect(learnability(['k', 'k', 'u'], knows, (lemma) => (lemma === 'u' ? 0.8 : 0))).toBeCloseTo(0.8, 9);
  });

  it('is 0.5 when everything is already known', () => {
    expect(learnability(['k'], knowsOnly('k'), () => 1)).toBe(0.5);
  });

  it('clamps out-of-range values and rejects non-finite ones', () => {
    expect(learnability(['u'], kKnown, () => 5)).toBe(1);
    expect(learnability(['u'], kKnown, () => -5)).toBe(0);
    expect(() => learnability(['u'], kKnown, () => Number.NaN)).toThrow(CoverageError);
  });
});

describe('scoreCandidate', () => {
  it('marks a 0.96 text as in-band and a 0.90 text as out', () => {
    expect(scoreCandidate({ id: 'a', lemmas: text(96, 4) }, kKnown).inBand).toBe(true);
    expect(scoreCandidate({ id: 'b', lemmas: text(90, 10) }, kKnown).inBand).toBe(false);
  });

  it('treats both band edges as inclusive', () => {
    expect(scoreCandidate({ id: 'a', lemmas: text(95, 5) }, kKnown).inBand).toBe(true);
    expect(scoreCandidate({ id: 'b', lemmas: text(98, 2) }, kKnown).inBand).toBe(true);
    expect(scoreCandidate({ id: 'c', lemmas: text(99, 1) }, kKnown).inBand).toBe(false);
  });

  it('reports the distance to the nearer band edge for out-of-band candidates', () => {
    const tooHard = scoreCandidate({ id: 'a', lemmas: text(90, 10) }, kKnown);
    expect(tooHard.bandDistance).toBeCloseTo(0.05, 9);
    const tooEasy = scoreCandidate({ id: 'b', lemmas: text(100, 0) }, kKnown);
    expect(tooEasy.bandDistance).toBeCloseTo(0.02, 9);
    expect(scoreCandidate({ id: 'c', lemmas: text(96, 4) }, kKnown).bandDistance).toBe(0);
  });

  it('rejects negative tie-break weights', () => {
    expect(() => scoreCandidate({ id: 'a', lemmas: ['k0'] }, kKnown, { dispersionWeight: -1 })).toThrow(
      CoverageError,
    );
  });
});

describe('rankCandidates / selectInBand / selectBest', () => {
  const inBandSpread: Candidate = {
    id: 'in-band-spread',
    lemmas: text(96, 4),
    sentences: [
      [...Array.from({ length: 24 }, (_, i) => `k${i}`), 'u0'],
      [...Array.from({ length: 24 }, (_, i) => `k${i}`), 'u1'],
      [...Array.from({ length: 24 }, (_, i) => `k${i}`), 'u2'],
      [...Array.from({ length: 24 }, (_, i) => `k${i}`), 'u3'],
    ],
  };
  const inBandClumped: Candidate = {
    id: 'in-band-clumped',
    lemmas: text(96, 4),
    sentences: [
      Array.from({ length: 25 }, (_, i) => `k${i}`),
      Array.from({ length: 25 }, (_, i) => `k${i}`),
      Array.from({ length: 25 }, (_, i) => `k${i}`),
      [...Array.from({ length: 21 }, (_, i) => `k${i}`), 'u0', 'u1', 'u2', 'u3'],
    ],
  };
  const tooHard: Candidate = { id: 'too-hard', lemmas: text(80, 20) };
  const tooEasy: Candidate = { id: 'too-easy', lemmas: text(100, 0) };
  const nearMiss: Candidate = { id: 'near-miss', lemmas: text(94, 6) };

  it('puts in-band candidates ahead of every out-of-band one', () => {
    const ranked = rankCandidates([tooEasy, tooHard, inBandClumped], kKnown);
    expect(ranked[0].id).toBe('in-band-clumped');
    expect(ranked[0].inBand).toBe(true);
    expect(ranked.slice(1).every((r) => !r.inBand)).toBe(true);
  });

  it('breaks a tie between two in-band texts by dispersion', () => {
    const ranked = rankCandidates([inBandClumped, inBandSpread], kKnown, {
      dispersionWeight: 1,
      learnabilityWeight: 0,
    });
    expect(ranked.map((r) => r.id)).toEqual(['in-band-spread', 'in-band-clumped']);
    expect(ranked[0].coverage).toBeCloseTo(ranked[1].coverage, 12);
  });

  it('breaks a tie between two in-band texts by learnability', () => {
    const easyWords: Candidate = { id: 'easy-words', lemmas: [...text(96, 0), 'frequent1', 'frequent2', 'frequent3', 'frequent4'] };
    const hardWords: Candidate = { id: 'hard-words', lemmas: [...text(96, 0), 'rare1', 'rare2', 'rare3', 'rare4'] };
    const ranked = rankCandidates([hardWords, easyWords], kKnown, {
      dispersionWeight: 0,
      learnabilityWeight: 1,
      lemmaLearnability: (lemma) => (lemma.startsWith('frequent') ? 0.9 : 0.1),
    });
    expect(ranked.map((r) => r.id)).toEqual(['easy-words', 'hard-words']);
  });

  it('falls back to the nearest-miss when nothing is in band', () => {
    const ranked = rankCandidates([tooHard, tooEasy, nearMiss], kKnown);
    expect(ranked.every((r) => !r.inBand)).toBe(true);
    // near-miss (0.94, distance 0.01) beats too-easy (1.00, distance 0.02) and too-hard (0.80).
    expect(ranked.map((r) => r.id)).toEqual(['near-miss', 'too-easy', 'too-hard']);
  });

  it('is a total, deterministic order — identical candidates fall back to id', () => {
    const a: Candidate = { id: 'aaa', lemmas: text(96, 4) };
    const b: Candidate = { id: 'bbb', lemmas: text(96, 4) };
    expect(rankCandidates([b, a], kKnown).map((r) => r.id)).toEqual(['aaa', 'bbb']);
    expect(rankCandidates([a, b], kKnown).map((r) => r.id)).toEqual(['aaa', 'bbb']);
  });

  it('does not mutate the input array', () => {
    const input = [tooEasy, inBandClumped, tooHard];
    const order = input.map((c) => c.id);
    rankCandidates(input, kKnown);
    expect(input.map((c) => c.id)).toEqual(order);
  });

  it('selectInBand returns only in-band candidates, best first', () => {
    const selected = selectInBand([tooEasy, inBandClumped, inBandSpread, tooHard], kKnown, {
      dispersionWeight: 1,
      learnabilityWeight: 0,
    });
    expect(selected.map((s) => s.id)).toEqual(['in-band-spread', 'in-band-clumped']);
  });

  it('selectInBand can be empty', () => {
    expect(selectInBand([tooHard, tooEasy], kKnown)).toEqual([]);
  });

  it('selectBest prefers in-band and returns null for no candidates', () => {
    expect(selectBest([tooEasy, inBandClumped, tooHard], kKnown)?.id).toBe('in-band-clumped');
    expect(selectBest([tooHard, tooEasy], kKnown)?.id).toBe('too-easy');
    expect(selectBest([], kKnown)).toBeNull();
  });

  it('accepts a different band for a different modality (§(e) implication 5)', () => {
    // A viewing band, deliberately different from the reading one.
    const viewing = { min: 0.9, max: 0.95 };
    expect(scoreCandidate(nearMiss, kKnown, { band: viewing }).inBand).toBe(true);
    expect(scoreCandidate(nearMiss, kKnown).inBand).toBe(false);
  });

  it('works from a probabilistic vocabulary state, not just a boolean known-set', () => {
    const probabilistic = knownFromTable(
      Object.fromEntries([
        ...Array.from({ length: 50 }, (_, i) => [`k${i}`, 0.99] as const),
        ...Array.from({ length: 20 }, (_, i) => [`u${i}`, 0.3] as const),
      ]),
    );
    const scored = scoreCandidate({ id: 'a', lemmas: text(96, 4) }, probabilistic);
    expect(scored.coverage).toBeGreaterThan(0.9);
    expect(scored.coverage).toBeLessThan(1);
    expect(scored.expectedUnknownTokens).toBeCloseTo(96 * 0.01 + 4 * 0.7, 6);
  });
});
