/**
 * knowledge-tracing — online logistic regression producing `P(learner knows concept)`.
 *
 * Implements `docs/research/03-learning-libs.md` §9.3–§9.4 and `02-ml-and-naming.md` §(b).
 *
 * Best-LR-style features (Gervet, Koedinger, Schneider & Mitchell, "When is Deep Learning the
 * Best Approach to Knowledge Tracing?", *JEDM* 12(3), 2020) trained by **per-coordinate AdaGrad
 * SGD**. §9.3: AdaGrad is the right optimizer for sparse one-hot features specifically because
 * each feature's effective rate is proportional to `1/sqrt(SUM g^2)` — rare skills keep a large
 * step while frequent ones anneal automatically, which a global `1/sqrt(t)` schedule cannot do.
 *
 * §9.4 validated this by simulation (40 skills, 400 learners, 200k interactions, prequential
 * evaluation over the last 40%): log loss **0.1952** vs 0.6931 for `p = 0.5`, with the textbook
 * PFA weight signs recovered (`succ_skill = +0.966`, `fail_skill = -1.189`).
 *
 * §9.1–§9.2 established that no npm library does what we need: `ml-logistic-regression` is
 * unmaintained, has no probability output (an open issue since 2018), is full-batch with a
 * hardcoded 50,000 iterations and no warm start; tfjs (~147 MB) and onnxruntime-node (~271 MB)
 * are a ~10^4x install-weight overhead for a dot product and are server-only, which would also
 * foreclose ever running this on edge. So it is hand-rolled, dependency-free, ~40 lines.
 *
 * ## The feature-extraction boundary
 *
 * §9.4 carries the document's one **UNVERIFIED** note: the exact Best-LR feature specification
 * was not checked against the primary source. `sqrt(count)` is used here; the PFA literature also
 * uses `log(1 + count)`, and the two are not equivalent. Open questions: (a) the exact one-hot
 * set (skill only, or skill + item?), (b) sqrt vs log1p, (c) whether cross-skill totals belong,
 * (d) whether lag/time features are Best-LR proper or Best-LR+.
 *
 * That is why the extractor is a first-class, swappable value (`FeatureExtractor`) rather than
 * code inlined into the optimizer. The optimizer only ever sees `Feature[]`; changing the feature
 * list is a change to one function and a re-fit, and touches nothing else in this file.
 *
 * Pure: no I/O, no clock, no randomness. Counts are supplied by the caller.
 */

/** A single sparse feature: a string key and its value. */
export type Feature = [key: string, value: number];

/** Running practice tallies the caller already maintains per (user, skill). */
export type PracticeCounts = {
  skillSucc: number;
  skillFail: number;
  totSucc: number;
  totFail: number;
};

/** Everything an extractor is allowed to see. Widen this type to add feature inputs. */
export type TracingContext = {
  /** The concept / lemma / skill being practised. */
  skillId: string;
  counts: PracticeCounts;
  /** Optional item id, for extractors that want a per-item one-hot (Best-LR open question (a)). */
  itemId?: string;
  /** Optional days since this skill was last practised (Best-LR+ lag feature, question (d)). */
  lagDays?: number;
};

/**
 * The swappable boundary. Anything that maps a context to sparse features is a valid extractor;
 * the model never inspects the context itself.
 */
export type FeatureExtractor<C extends TracingContext = TracingContext> = (ctx: C) => Feature[];

const nonNegative = (n: number, label: string): number => {
  if (!Number.isFinite(n) || n < 0) {
    throw new RangeError(`${label} must be a finite count >= 0, got ${n}`);
  }
  return n;
};

/**
 * Best-LR features as implemented and validated in §9.4: per-skill one-hot, `sqrt` of per-skill
 * success/fail counts, and user-level totals. §9.4 measured exactly `skills * 3 + 2` features.
 *
 * The concave transform on counts is not incidental — it is what encodes diminishing returns
 * from repeated practice, and §9.4 notes raw counts measurably degrade fit.
 */
export const bestLrFeatures: FeatureExtractor = (ctx) => {
  const c = ctx.counts;
  return [
    [`bias_skill:${ctx.skillId}`, 1],
    [`succ_skill:${ctx.skillId}`, Math.sqrt(nonNegative(c.skillSucc, 'skillSucc'))],
    [`fail_skill:${ctx.skillId}`, Math.sqrt(nonNegative(c.skillFail, 'skillFail'))],
    ['succ_total', Math.sqrt(nonNegative(c.totSucc, 'totSucc'))],
    ['fail_total', Math.sqrt(nonNegative(c.totFail, 'totFail'))],
  ];
};

/**
 * The `log(1 + count)` variant, the other transform the PFA literature uses. Exists so the
 * open question in §9.4 can be settled empirically by swapping one argument rather than by
 * editing the model.
 */
export const bestLrFeaturesLog1p: FeatureExtractor = (ctx) => {
  const c = ctx.counts;
  return [
    [`bias_skill:${ctx.skillId}`, 1],
    [`succ_skill:${ctx.skillId}`, Math.log1p(nonNegative(c.skillSucc, 'skillSucc'))],
    [`fail_skill:${ctx.skillId}`, Math.log1p(nonNegative(c.skillFail, 'skillFail'))],
    ['succ_total', Math.log1p(nonNegative(c.totSucc, 'totSucc'))],
    ['fail_total', Math.log1p(nonNegative(c.totFail, 'totFail'))],
  ];
};

export type SparseLogRegOptions = {
  lr?: number;
  l2?: number;
  /**
   * Seed value for the AdaGrad accumulators. §9.3: when warm-starting from batch-fitted global
   * weights, seed these with a pseudo-count or the first few online examples will overwrite the
   * batch fit (a zero accumulator means an enormous first step).
   */
  accumulatorPseudoCount?: number;
};

export type SerializedModel = {
  b: number;
  w: Record<string, number>;
};

/**
 * Sparse logistic regression with per-coordinate AdaGrad. Serving is one dot product over the
 * handful of active features.
 */
export class SparseLogReg {
  private w = new Map<string, number>();
  private g2 = new Map<string, number>();
  private b = 0;
  private gb2 = 0;
  private readonly lr: number;
  private readonly l2: number;
  private readonly accumulatorPseudoCount: number;

  constructor(opts: SparseLogRegOptions = {}) {
    this.lr = opts.lr ?? 0.15;
    this.l2 = opts.l2 ?? 1e-6;
    this.accumulatorPseudoCount = opts.accumulatorPseudoCount ?? 0;
  }

  /** Number of features the model has ever seen. §9.4 asserts this equals `skills * 3 + 2`. */
  get featureCount(): number {
    return this.w.size;
  }

  get intercept(): number {
    return this.b;
  }

  weight(key: string): number {
    return this.w.get(key) ?? 0;
  }

  predict(x: readonly Feature[]): number {
    let z = this.b;
    for (const [k, v] of x) z += (this.w.get(k) ?? 0) * v;
    return 1 / (1 + Math.exp(-z));
  }

  /**
   * Predict-then-update. Returns the **pre-update** prediction, which is what prequential
   * evaluation needs (§9.4 scores exactly this value).
   */
  update(x: readonly Feature[], y: 0 | 1): number {
    const p = this.predict(x);
    const err = p - y;

    this.gb2 += err * err;
    this.b -= (this.lr * err) / (Math.sqrt(this.gb2) + 1e-8);

    for (const [k, v] of x) {
      const current = this.w.get(k) ?? 0;
      const g = err * v + this.l2 * current;
      const g2 = (this.g2.get(k) ?? this.accumulatorPseudoCount) + g * g;
      this.g2.set(k, g2);
      this.w.set(k, current - (this.lr * g) / (Math.sqrt(g2) + 1e-8));
    }
    return p;
  }

  /** Coefficients only — AdaGrad accumulators are re-seeded on reload (§9.3). */
  export(): SerializedModel {
    return { b: this.b, w: Object.fromEntries(this.w) };
  }

  static from(s: SerializedModel, opts: SparseLogRegOptions = {}): SparseLogReg {
    const m = new SparseLogReg(opts);
    m.b = s.b;
    m.w = new Map(Object.entries(s.w));
    return m;
  }

  /**
   * Warm-start from batch-fitted global coefficients (§9.3's recommended hybrid: fit the global
   * skill/item terms offline where you get L-BFGS and cross-validation, run online SGD in Node
   * only on the per-learner terms). Seeds the AdaGrad accumulators so the batch fit survives the
   * first few online examples.
   */
  static warmStart(
    s: SerializedModel,
    accumulatorPseudoCount: number,
    opts: Omit<SparseLogRegOptions, 'accumulatorPseudoCount'> = {},
  ): SparseLogReg {
    const m = SparseLogReg.from(s, { ...opts, accumulatorPseudoCount });
    for (const k of Object.keys(s.w)) m.g2.set(k, accumulatorPseudoCount);
    m.gb2 = accumulatorPseudoCount;
    return m;
  }
}

/**
 * The product-facing wrapper: `P(learner knows concept)`.
 *
 * This output is exactly the per-learner probabilistic vocabulary state that `coverage.ts`
 * consumes (§9.4's closing note, `02-ml-and-naming.md` §(e)).
 */
export class KnowledgeTracer<C extends TracingContext = TracingContext> {
  constructor(
    readonly model: SparseLogReg,
    private readonly extract: FeatureExtractor<C>,
  ) {}

  /** `P(knows)`. No side effects. */
  probabilityKnows(ctx: C): number {
    return this.model.predict(this.extract(ctx));
  }

  /** Observe one graded response. Returns the pre-update `P(knows)`. */
  observe(ctx: C, correct: boolean): number {
    return this.model.update(this.extract(ctx), correct ? 1 : 0);
  }

  /** `P(knows)` for many concepts at once — the input `coverage.ts` wants. */
  probabilitiesFor(contexts: readonly C[]): Map<string, number> {
    const out = new Map<string, number>();
    for (const ctx of contexts) out.set(ctx.skillId, this.probabilityKnows(ctx));
    return out;
  }
}

/** Mean binary cross-entropy. Lower is better; `p = 0.5` everywhere gives ln 2 = 0.6931. */
export function meanLogLoss(predictions: readonly { p: number; y: 0 | 1 }[]): number {
  if (predictions.length === 0) throw new RangeError('meanLogLoss requires at least one prediction');
  const eps = 1e-15;
  let sum = 0;
  for (const { p, y } of predictions) {
    const clamped = Math.min(1 - eps, Math.max(eps, p));
    sum += -(y === 1 ? Math.log(clamped) : Math.log(1 - clamped));
  }
  return sum / predictions.length;
}
