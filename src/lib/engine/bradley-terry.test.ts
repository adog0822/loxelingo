import { describe, expect, it } from 'vitest';

import {
  bradleyTerryMM,
  BradleyTerryError,
  btProb,
  buildWinMatrix,
  isStronglyConnected,
  logLikelihood,
  solveBradleyTerry,
  solveFromWinMatrix,
  stronglyConnectedComponents,
  toEloScale,
  withSmoothing,
  type Comparison,
  type WinMatrix,
} from './bradley-terry';

const geometricMean = (xs: readonly number[]) =>
  Math.exp(xs.reduce((a, b) => a + Math.log(b), 0) / xs.length);

describe('buildWinMatrix', () => {
  it('collects ids in first-appearance order for a deterministic index mapping', () => {
    const { ids } = buildWinMatrix([
      { a: 'zeta', b: 'alpha', winner: 'a' },
      { a: 'alpha', b: 'mu', winner: 'b' },
    ]);
    expect(ids).toEqual(['zeta', 'alpha', 'mu']);
  });

  it('records a win as a full count in one direction', () => {
    const { wins } = buildWinMatrix([{ a: 'x', b: 'y', winner: 'a' }]);
    expect(wins).toEqual([
      [0, 1],
      [0, 0],
    ]);
  });

  it('splits a tie into half a win and half a loss, without duplicating the row (§8.2)', () => {
    const { wins } = buildWinMatrix([{ a: 'x', b: 'y', winner: 'tie' }]);
    expect(wins).toEqual([
      [0, 0.5],
      [0.5, 0],
    ]);
  });

  it('honours pre-aggregated occurrence weights', () => {
    const { wins } = buildWinMatrix([{ a: 'x', b: 'y', winner: 'a', weight: 7 }]);
    expect(wins[0][1]).toBe(7);
  });

  it('rejects a self-comparison and a non-positive weight', () => {
    expect(() => buildWinMatrix([{ a: 'x', b: 'x', winner: 'a' }])).toThrow(BradleyTerryError);
    expect(() => buildWinMatrix([{ a: 'x', b: 'y', winner: 'a', weight: 0 }])).toThrow(BradleyTerryError);
  });

  it('leaves ties with an identical fitted strength', () => {
    const result = solveBradleyTerry([
      { a: 'x', b: 'y', winner: 'tie', weight: 10 },
      { a: 'y', b: 'x', winner: 'tie', weight: 10 },
    ]);
    expect(result.byId.x).toBeCloseTo(result.byId.y, 10);
  });
});

describe('bradleyTerryMM — §8.4 validated vectors', () => {
  it('Test 1: reproduces the exact closed form for two items (7 wins in 10 -> ratio 7/3)', () => {
    const wins: WinMatrix = [
      [0, 7],
      [3, 0],
    ];
    const { strengths, converged } = bradleyTerryMM(wins);
    expect(converged).toBe(true);
    expect(strengths[0] / strengths[1]).toBeCloseTo(7 / 3, 6);
    expect(strengths[0] / strengths[1]).toBeCloseTo(2.333333, 6);
  });

  it('Test 1 generalised: the two-item MLE ratio is always w / (n - w)', () => {
    for (const [w, n] of [
      [1, 2],
      [3, 4],
      [9, 20],
      [17, 25],
    ]) {
      const { strengths } = bradleyTerryMM([
        [0, w],
        [n - w, 0],
      ]);
      expect(strengths[0] / strengths[1]).toBeCloseTo(w / (n - w), 6);
    }
  });

  it('Test 2: transitive triple gives §8.4\'s strengths, Elo scale and implied probabilities', () => {
    // A beat B 8/10, B beat C 8/10, A beat C 9/10.
    const wins: WinMatrix = [
      [0, 8, 9],
      [2, 0, 8],
      [1, 2, 0],
    ];
    const { strengths, converged } = bradleyTerryMM(wins);
    expect(converged).toBe(true);
    expect(strengths[0]).toBeCloseTo(3.474, 2);
    expect(strengths[1]).toBeCloseTo(1.0, 2);
    expect(strengths[2]).toBeCloseTo(0.288, 2);

    const elo = toEloScale(strengths);
    expect(elo[0]).toBeCloseTo(1216.3, 0);
    expect(elo[1]).toBeCloseTo(1000.0, 0);
    expect(elo[2]).toBeCloseTo(783.7, 0);

    // The model shrinks toward transitivity rather than overfitting each pair.
    expect(btProb(strengths, 0, 1)).toBeCloseTo(0.777, 2);
    expect(btProb(strengths, 1, 2)).toBeCloseTo(0.777, 2);
    expect(btProb(strengths, 0, 2)).toBeCloseTo(0.923, 2);
  });

  it('Test 3: recovers known strengths from a full round robin', () => {
    // Deterministic version of §8.4's Test 3: expected win counts rather than sampled ones, so
    // the MLE should land essentially on the truth.
    const truth = [2.572, 1.714, 1.286, 0.857, 0.6, 0.343];
    const n = truth.length;
    const perPair = 400;
    const wins: WinMatrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        wins[i][j] = (perPair * truth[i]) / (truth[i] + truth[j]);
      }
    }

    const { strengths } = bradleyTerryMM(wins, { maxIter: 5000 });
    const scale = geometricMean(truth);
    const normalisedTruth = truth.map((t) => t / scale);
    for (let i = 0; i < n; i++) {
      expect(strengths[i]).toBeCloseTo(normalisedTruth[i], 4);
    }
    // Ordering is preserved.
    for (let i = 1; i < n; i++) expect(strengths[i]).toBeLessThan(strengths[i - 1]);
  });

  it('renormalises to geometric mean 1 every sweep (Hunter: part of the algorithm)', () => {
    const { strengths } = bradleyTerryMM([
      [0, 8, 9],
      [2, 0, 8],
      [1, 2, 0],
    ]);
    expect(geometricMean(strengths)).toBeCloseTo(1, 9);
  });

  it('converges, and ascends the log-likelihood relative to the uniform start', () => {
    const wins: WinMatrix = [
      [0, 8, 9, 4],
      [2, 0, 8, 3],
      [1, 2, 0, 6],
      [6, 7, 4, 0],
    ];
    const { strengths, iterations, converged } = bradleyTerryMM(wins);
    expect(converged).toBe(true);
    expect(iterations).toBeLessThan(1000);
    expect(logLikelihood(wins, strengths)).toBeGreaterThan(logLikelihood(wins, [1, 1, 1, 1]));
  });

  it('is monotone in the log-likelihood at every sweep', () => {
    const wins: WinMatrix = [
      [0, 6, 3],
      [4, 0, 7],
      [7, 3, 0],
    ];
    let previous = logLikelihood(wins, [1, 1, 1]);
    for (let iter = 1; iter <= 25; iter++) {
      const { strengths } = bradleyTerryMM(wins, { maxIter: iter, tol: 0 });
      const ll = logLikelihood(wins, strengths);
      // MM is a monotone ascent method; allow only floating-point slack.
      expect(ll).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = ll;
    }
  });

  it('handles the empty and singleton cases', () => {
    expect(bradleyTerryMM([])).toEqual({ strengths: [], iterations: 0, converged: true });
    expect(bradleyTerryMM([[0]]).strengths).toEqual([1]);
  });

  it('rejects a ragged or negative matrix', () => {
    expect(() => bradleyTerryMM([[0, 1], [0]])).toThrow(/square/);
    expect(() =>
      bradleyTerryMM([
        [0, -1],
        [1, 0],
      ]),
    ).toThrow(/>= 0/);
  });
});

describe('Test 4: the failure mode (Ford\'s condition / Hunter\'s Assumption 1)', () => {
  // A undefeated over B; C undefeated over D; no edges between the pairs.
  const disconnected: WinMatrix = [
    [0, 5, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 5],
    [0, 0, 0, 0],
  ];

  it('detects that the win digraph is not strongly connected', () => {
    expect(isStronglyConnected(disconnected)).toBe(false);
    expect(stronglyConnectedComponents(disconnected)).toHaveLength(4);
  });

  it('confirms the raw MM iteration diverges', () => {
    const { strengths } = bradleyTerryMM(disconnected);
    const max = Math.max(...strengths);
    const min = Math.min(...strengths);
    expect(max / min).toBeGreaterThan(1e100);
  });

  it('recognises a strongly connected graph', () => {
    expect(
      isStronglyConnected([
        [0, 3, 1],
        [2, 0, 4],
        [5, 1, 0],
      ]),
    ).toBe(true);
    // A single item, and no items, trivially satisfy the condition.
    expect(isStronglyConnected([[0]])).toBe(true);
    expect(isStronglyConnected([])).toBe(true);
  });

  it('finds one component per cycle in a mixed graph', () => {
    // {0,1,2} form a cycle; 3 only ever loses; so two components.
    const wins: WinMatrix = [
      [0, 1, 0, 2],
      [0, 0, 1, 0],
      [1, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    const components = stronglyConnectedComponents(wins);
    expect(components).toHaveLength(2);
    expect(components.map((c) => c.length).sort()).toEqual([1, 3]);
    expect(isStronglyConnected(wins)).toBe(false);
  });

  it('handles a long chain without blowing the call stack (iterative Tarjan)', () => {
    // A single cycle of length n forces Tarjan to a recursion depth of n. A recursive
    // implementation would overflow here; the iterative one bounds depth by the heap instead.
    const n = 4000;
    const wins: WinMatrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    for (let i = 0; i + 1 < n; i++) wins[i][i + 1] = 1;
    wins[n - 1][0] = 1; // close the cycle
    expect(stronglyConnectedComponents(wins)).toHaveLength(1);
  });
});

describe('§8.5 — making the solve unconditionally safe', () => {
  const disconnected: WinMatrix = [
    [0, 5, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 5],
    [0, 0, 0, 0],
  ];

  it('withSmoothing adds a phantom half-match in each direction, leaving the diagonal at 0', () => {
    const smoothed = withSmoothing([
      [0, 2],
      [1, 0],
    ]);
    expect(smoothed).toEqual([
      [0, 2.5],
      [1.5, 0],
    ]);
  });

  it('smooths by default and returns finite, ordered strengths', () => {
    const result = solveFromWinMatrix(['a', 'b', 'c', 'd'], disconnected);
    expect(result.smoothed).toBe(true);
    expect(result.stronglyConnected).toBe(false);
    for (const s of result.strengths) {
      expect(Number.isFinite(s)).toBe(true);
      expect(s).toBeGreaterThan(0);
    }
    expect(result.byId.a).toBeGreaterThan(result.byId.b);
    expect(result.byId.c).toBeGreaterThan(result.byId.d);
  });

  it('does not smooth when the graph is already strongly connected', () => {
    const result = solveBradleyTerry([
      { a: 'a', b: 'b', winner: 'a', weight: 8 },
      { a: 'b', b: 'a', winner: 'a', weight: 2 },
      { a: 'b', b: 'c', winner: 'a', weight: 8 },
      { a: 'c', b: 'b', winner: 'a', weight: 2 },
      { a: 'a', b: 'c', winner: 'a', weight: 9 },
      { a: 'c', b: 'a', winner: 'a', weight: 1 },
    ]);
    expect(result.stronglyConnected).toBe(true);
    expect(result.smoothed).toBe(false);
    expect(result.byId.a).toBeCloseTo(3.474, 2);
  });

  it('can be told to throw instead, for public rankings (§8.5b)', () => {
    expect(() => solveFromWinMatrix(['a', 'b', 'c', 'd'], disconnected, { onDisconnected: 'throw' })).toThrow(
      /Assumption 1 fails/,
    );
  });

  it('reports the raw components so a caller can partition instead', () => {
    const result = solveFromWinMatrix(['a', 'b', 'c', 'd'], disconnected);
    expect(result.components).toHaveLength(4);
  });

  it('gives a brand-new undefeated candidate a finite score (the LLM-judge case)', () => {
    // `new` has one win and no losses; without smoothing its strength would diverge.
    const result = solveBradleyTerry([
      { a: 'anchor-1', b: 'anchor-2', winner: 'a', weight: 5 },
      { a: 'anchor-2', b: 'anchor-1', winner: 'a', weight: 5 },
      { a: 'new', b: 'anchor-1', winner: 'a' },
    ]);
    expect(result.smoothed).toBe(true);
    expect(Number.isFinite(result.byId.new)).toBe(true);
    expect(result.byId.new).toBeGreaterThan(result.byId['anchor-1']);
  });

  it('rejects an ids/matrix length mismatch', () => {
    expect(() => solveFromWinMatrix(['a'], disconnected)).toThrow(/does not match matrix size/);
  });

  it('solves an empty comparison list without throwing', () => {
    const result = solveBradleyTerry([]);
    expect(result.ids).toEqual([]);
    expect(result.strengths).toEqual([]);
    expect(result.byId).toEqual({});
  });
});

describe('judge-verdict aggregation end to end', () => {
  it('ranks candidates consistently with a latent quality ordering', () => {
    const quality = { great: 2.0, good: 1.0, ok: 0.3, poor: 0.1 };
    const ids = Object.keys(quality) as (keyof typeof quality)[];
    const comparisons: Comparison[] = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const qi = quality[ids[i]];
        const qj = quality[ids[j]];
        const trials = 100;
        const iWins = Math.round((trials * qi) / (qi + qj));
        comparisons.push({ a: ids[i], b: ids[j], winner: 'a', weight: iWins });
        comparisons.push({ a: ids[i], b: ids[j], winner: 'b', weight: trials - iWins });
      }
    }
    const result = solveBradleyTerry(comparisons);
    expect(result.stronglyConnected).toBe(true);
    const ordered = [...result.ids].sort((a, b) => result.byId[b] - result.byId[a]);
    expect(ordered).toEqual(['great', 'good', 'ok', 'poor']);
  });

  it('toEloScale is order-preserving and anchors strength 1 at the init rating', () => {
    expect(toEloScale([1])).toEqual([1000]);
    const scaled = toEloScale([4, 2, 1, 0.5]);
    for (let i = 1; i < scaled.length; i++) expect(scaled[i]).toBeLessThan(scaled[i - 1]);
  });
});
