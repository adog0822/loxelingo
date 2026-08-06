/**
 * bradley-terry — pairwise judge verdicts into stable scores, by MM / Zermelo iteration.
 *
 * Implements `docs/research/03-learning-libs.md` §8.3–§8.5.
 *
 * ## Model and update
 *
 * David R. Hunter, "MM algorithms for generalized Bradley-Terry models", *The Annals of
 * Statistics* 32(1):384–406, 2004, doi:10.1214/aos/1079120141. Eq. 1 and the simultaneous
 * (Jacobi) update of Eq. 3:
 *
 * ```
 * P(i beats j) = g_i / (g_i + g_j)
 * g_i^(k+1)    = W_i * [ SUM_{j != i} N_ij / (g_i^(k) + g_j^(k)) ]^(-1)
 * ```
 *
 * where `W_i` = total wins by i and `N_ij = w_ij + w_ji` = number of pairings. Renormalisation
 * is part of the algorithm, not an afterthought — Hunter: *"This renormalization step is to be
 * understood as part of each algorithm described in this paper."* His convention is `SUM g = 1`;
 * we use geometric mean 1, equivalent up to a constant factor (the model is scale-invariant) and
 * better conditioned for the `log`-ratio convergence test.
 *
 * ## Ties
 *
 * Half a win plus half a loss, matching FastChat's current `bt_loss_and_grad` (§8.2), where a
 * tie is one row with `outcome = 0.5` and ties are NOT duplicated. Corroborated by arXiv
 * 2412.18407 (ICLR 2025): "treating a tie as halfway between a win and a loss, modifying the
 * outcome matrix as `W <- W + (1/2)T`". §8.2 also records the cost: half-tie BT predicts no ties
 * at all, and its win-probability matrix visibly diverges from observed data when the tie rate is
 * high. If our judge starts producing many ties, move to Rao-Kupper (1967) — Hunter Eq. 6 / MM
 * update Eq. 15, which §8.3 notes has no apparent typo, unlike his printed Davidson theta step.
 *
 * ## Making the solve unconditionally safe (§8.5)
 *
 * The MLE is finite iff Hunter's Assumption 1 holds: *"In every possible partition of the
 * individuals into two nonempty subsets, some individual in the second set beats some individual
 * in the first set at least once"* — equivalently, the win digraph is strongly connected. §8.4
 * Test 4 confirms the failure mode: with a disconnected graph, strengths diverge to 1e+300 /
 * 1e-300.
 *
 * For LLM-judge aggregation this is violated *routinely* — a brand-new candidate answer has no
 * losses yet — and we want a finite answer anyway. So `solveBradleyTerry` detects the violation
 * with Tarjan's SCC and, by default, applies the phantom half-match smoothing of §8.5(a),
 * reporting in the result that it did so. NOTE that smoothing is not in Hunter (2004), which has
 * no Bayesian variant at all (§8.3 correction); for the principled treatment see Caron & Doucet,
 * "Efficient Bayesian Inference for Generalized Bradley-Terry Models". §8.5(b)'s alternative —
 * detect and partition/drop, Hunter's own remedy — is available as
 * `stronglyConnectedComponents` for the case where these become public rankings and you need to
 * know when shrinkage is load-bearing.
 *
 * Pure: no I/O, no randomness.
 */

export class BradleyTerryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BradleyTerryError';
  }
}

export type Verdict = 'a' | 'b' | 'tie';

/** One pairwise comparison as it comes out of the judge. */
export type Comparison = {
  a: string;
  b: string;
  winner: Verdict;
  /** Occurrence count, for pre-aggregated triples (§8.2's `weights`). Defaults to 1. */
  weight?: number;
};

/** `wins[i][j]` = (weighted) number of times i beat j. A tie contributes 0.5 to each side. */
export type WinMatrix = number[][];

export type MatrixBuild = {
  /** Stable index order; `wins[i][j]` refers to `ids[i]` and `ids[j]`. */
  ids: string[];
  wins: WinMatrix;
};

/**
 * Build a win matrix from verdicts. Ids are collected in first-appearance order so the mapping
 * is deterministic and reproducible from the same input ordering.
 */
export function buildWinMatrix(comparisons: readonly Comparison[]): MatrixBuild {
  const index = new Map<string, number>();
  const ids: string[] = [];
  const idOf = (id: string): number => {
    const existing = index.get(id);
    if (existing !== undefined) return existing;
    const next = ids.length;
    index.set(id, next);
    ids.push(id);
    return next;
  };

  for (const c of comparisons) {
    if (c.a === c.b) throw new BradleyTerryError(`self-comparison for ${JSON.stringify(c.a)}`);
    idOf(c.a);
    idOf(c.b);
  }

  const n = ids.length;
  const wins: WinMatrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));

  for (const c of comparisons) {
    const w = c.weight ?? 1;
    if (!(w > 0) || !Number.isFinite(w)) {
      throw new BradleyTerryError(`comparison weight must be finite and > 0, got ${w}`);
    }
    const i = index.get(c.a) as number;
    const j = index.get(c.b) as number;
    if (c.winner === 'a') wins[i][j] += w;
    else if (c.winner === 'b') wins[j][i] += w;
    else {
      // half a win plus half a loss (§8.2)
      wins[i][j] += w / 2;
      wins[j][i] += w / 2;
    }
  }

  return { ids, wins };
}

function assertSquare(wins: WinMatrix): number {
  const n = wins.length;
  for (let i = 0; i < n; i++) {
    if (wins[i].length !== n) {
      throw new BradleyTerryError(`win matrix must be square; row ${i} has length ${wins[i].length}, expected ${n}`);
    }
    for (let j = 0; j < n; j++) {
      if (!Number.isFinite(wins[i][j]) || wins[i][j] < 0) {
        throw new BradleyTerryError(`wins[${i}][${j}] must be finite and >= 0, got ${wins[i][j]}`);
      }
    }
  }
  return n;
}

/**
 * §8.5(a): a phantom half-win in each direction, so the MLE is always finite.
 * Symmetric Beta-prior-style smoothing. Not from Hunter (2004) — see the module docstring.
 */
export function withSmoothing(wins: WinMatrix, alpha = 0.5): WinMatrix {
  assertSquare(wins);
  return wins.map((row, i) => row.map((v, j) => (i === j ? 0 : v + alpha)));
}

/**
 * §8.5(b): Tarjan's strongly-connected components over edges `i -> j` where i beat j at least
 * once. Assumption 1 holds iff there is exactly one component.
 *
 * Returns components as arrays of indices, in Tarjan's completion order (reverse topological).
 */
export function stronglyConnectedComponents(wins: WinMatrix): number[][] {
  const n = assertSquare(wins);

  const index = new Array<number>(n).fill(-1);
  const low = new Array<number>(n).fill(0);
  const onStack = new Array<boolean>(n).fill(false);
  const stack: number[] = [];
  const components: number[][] = [];
  let counter = 0;

  // Iterative Tarjan: recursion would blow the stack on a large judge graph.
  for (let root = 0; root < n; root++) {
    if (index[root] !== -1) continue;
    const work: { v: number; j: number }[] = [{ v: root, j: 0 }];
    index[root] = low[root] = counter++;
    stack.push(root);
    onStack[root] = true;

    while (work.length > 0) {
      const frame = work[work.length - 1];
      const v = frame.v;
      let recursed = false;

      while (frame.j < n) {
        const w = frame.j++;
        if (w === v || wins[v][w] <= 0) continue;
        if (index[w] === -1) {
          index[w] = low[w] = counter++;
          stack.push(w);
          onStack[w] = true;
          work.push({ v: w, j: 0 });
          recursed = true;
          break;
        }
        if (onStack[w]) low[v] = Math.min(low[v], index[w]);
      }
      if (recursed) continue;

      if (low[v] === index[v]) {
        const component: number[] = [];
        for (;;) {
          const w = stack.pop() as number;
          onStack[w] = false;
          component.push(w);
          if (w === v) break;
        }
        components.push(component.sort((a, b) => a - b));
      }
      work.pop();
      if (work.length > 0) {
        const parent = work[work.length - 1].v;
        low[parent] = Math.min(low[parent], low[v]);
      }
    }
  }

  return components;
}

/** Assumption 1 / Ford's condition: the win digraph is strongly connected. */
export function isStronglyConnected(wins: WinMatrix): boolean {
  const n = assertSquare(wins);
  if (n <= 1) return true;
  return stronglyConnectedComponents(wins).length === 1;
}

export type MMOptions = {
  maxIter?: number;
  tol?: number;
};

export type MMResult = {
  strengths: number[];
  iterations: number;
  converged: boolean;
};

/**
 * Bradley-Terry MLE by the MM (minorization-maximization) / Zermelo iteration.
 *
 * Copy-ready implementation from §8.4, numerically validated there three ways:
 *   - Test 1, exact closed form: 7 wins in 10 gives the ratio `w/(n-w) = 7/3` exactly.
 *   - Test 3, ground-truth recovery over 6 items: max relative error 6.9%, ordering preserved.
 *   - Test 4, the failure mode: a disconnected graph diverges to 1e+300 / 1e-300.
 *
 * Prefer `solveBradleyTerry`, which handles Test 4's case for you.
 */
export function bradleyTerryMM(wins: WinMatrix, { maxIter = 1000, tol = 1e-10 }: MMOptions = {}): MMResult {
  const n = assertSquare(wins);
  if (n === 0) return { strengths: [], iterations: 0, converged: true };

  let p = new Array<number>(n).fill(1);

  const N = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => wins[i][j] + wins[j][i]),
  );
  const W = wins.map((row) => row.reduce((a, b) => a + b, 0));

  let iter = 0;
  let converged = false;
  for (; iter < maxIter; iter++) {
    const pNew = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      let denom = 0;
      for (let j = 0; j < n; j++) {
        if (i === j || N[i][j] === 0) continue;
        denom += N[i][j] / (p[i] + p[j]);
      }
      pNew[i] = denom > 0 ? W[i] / denom : p[i];
    }

    // renormalize to geometric mean 1 (part of the algorithm — Hunter)
    const logs = pNew.map((v) => Math.log(Math.max(v, 1e-300)));
    const m = logs.reduce((a, b) => a + b, 0) / n;
    for (let i = 0; i < n; i++) pNew[i] = Math.exp(logs[i] - m);

    let diff = 0;
    for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(Math.log(pNew[i] / p[i])));
    p = pNew;
    if (diff < tol) {
      converged = true;
      break;
    }
  }
  return { strengths: p, iterations: iter + 1, converged };
}

export type SolveOptions = MMOptions & {
  /**
   * What to do when the win digraph is not strongly connected and the MLE is therefore infinite.
   * `'smooth'` (default) is §8.5(a) — right for judge aggregation. `'throw'` is for public
   * rankings, where you must know that shrinkage is load-bearing before shipping the numbers.
   */
  onDisconnected?: 'smooth' | 'throw';
  /** Phantom half-match mass added in each direction when smoothing. */
  smoothingAlpha?: number;
};

export type SolveResult = MMResult & {
  ids: string[];
  /** Strength by id. */
  byId: Record<string, number>;
  /** Whether the raw win digraph satisfied Hunter's Assumption 1. */
  stronglyConnected: boolean;
  /** Whether phantom-match smoothing was applied to make the solve finite. */
  smoothed: boolean;
  /** SCCs of the *raw* digraph, so a caller can partition instead if it prefers §8.5(b). */
  components: number[][];
};

/**
 * The safe entry point: solve from verdicts, never diverging, always reporting what it did.
 */
export function solveBradleyTerry(
  comparisons: readonly Comparison[],
  options: SolveOptions = {},
): SolveResult {
  const { ids, wins } = buildWinMatrix(comparisons);
  return solveFromWinMatrix(ids, wins, options);
}

export function solveFromWinMatrix(
  ids: readonly string[],
  wins: WinMatrix,
  { onDisconnected = 'smooth', smoothingAlpha = 0.5, ...mm }: SolveOptions = {},
): SolveResult {
  const n = assertSquare(wins);
  if (ids.length !== n) {
    throw new BradleyTerryError(`ids length ${ids.length} does not match matrix size ${n}`);
  }

  const components = n === 0 ? [] : stronglyConnectedComponents(wins);
  const connected = n <= 1 || components.length === 1;

  let matrix = wins;
  let smoothed = false;
  if (!connected) {
    if (onDisconnected === 'throw') {
      throw new BradleyTerryError(
        `the comparison digraph has ${components.length} strongly connected components, so ` +
          `Hunter's Assumption 1 fails and the Bradley-Terry MLE is infinite. Either smooth ` +
          `(onDisconnected: 'smooth'), or rate within each component separately.`,
      );
    }
    matrix = withSmoothing(wins, smoothingAlpha);
    smoothed = true;
  }

  const result = bradleyTerryMM(matrix, mm);
  const byId: Record<string, number> = {};
  for (let i = 0; i < n; i++) byId[ids[i]] = result.strengths[i];

  return { ...result, ids: [...ids], byId, stronglyConnected: connected, smoothed, components };
}

/**
 * Present BT strengths on a familiar Elo-like scale. Chatbot Arena uses `scale = 400`,
 * `init = 1000` (§8.2: `scaled_ratings = (ratings * scale) + init_rating`).
 */
export const toEloScale = (strengths: readonly number[], scale = 400, init = 1000): number[] =>
  strengths.map((v) => init + scale * Math.log10(v));

/** Implied win probability between two items under the fitted model. */
export const btProb = (strengths: readonly number[], i: number, j: number): number =>
  strengths[i] / (strengths[i] + strengths[j]);

/**
 * Log-likelihood of a win matrix under fitted strengths — Hunter Eq. 2, the double sum over all
 * `i, j` (not `i < j`). Used in tests to confirm MM actually ascends the likelihood.
 */
export function logLikelihood(wins: WinMatrix, strengths: readonly number[]): number {
  const n = assertSquare(wins);
  let ll = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j || wins[i][j] === 0) continue;
      ll += wins[i][j] * (Math.log(strengths[i]) - Math.log(strengths[i] + strengths[j]));
    }
  }
  return ll;
}
