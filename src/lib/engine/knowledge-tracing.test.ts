import { describe, expect, it } from 'vitest';

import {
  bestLrFeatures,
  bestLrFeaturesLog1p,
  KnowledgeTracer,
  meanLogLoss,
  SparseLogReg,
  type Feature,
  type FeatureExtractor,
  type TracingContext,
} from './knowledge-tracing';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const zeroCounts = { skillSucc: 0, skillFail: 0, totSucc: 0, totFail: 0 };

describe('bestLrFeatures', () => {
  it('emits the Gervet et al. feature set: skill one-hot, sqrt skill counts, sqrt totals', () => {
    const features = bestLrFeatures({
      skillId: 'gato',
      counts: { skillSucc: 9, skillFail: 4, totSucc: 100, totFail: 25 },
    });
    expect(features).toEqual([
      ['bias_skill:gato', 1],
      ['succ_skill:gato', 3],
      ['fail_skill:gato', 2],
      ['succ_total', 10],
      ['fail_total', 5],
    ]);
  });

  it('uses a concave transform, which is what encodes diminishing returns from practice', () => {
    const value = (skillSucc: number) =>
      bestLrFeatures({ skillId: 's', counts: { ...zeroCounts, skillSucc } })[1][1];
    // The 1st -> 2nd success is worth more than the 20th -> 21st.
    expect(value(2) - value(1)).toBeGreaterThan(value(21) - value(20));
    expect(value(21) - value(20)).toBeGreaterThan(0);
  });

  it('offers a log1p variant, because §9.4 flags sqrt-vs-log1p as UNVERIFIED', () => {
    const features = bestLrFeaturesLog1p({
      skillId: 'gato',
      counts: { skillSucc: 9, skillFail: 4, totSucc: 100, totFail: 25 },
    });
    expect(features[1]).toEqual(['succ_skill:gato', Math.log(10)]);
    expect(features[3]).toEqual(['succ_total', Math.log(101)]);
    // The two transforms are genuinely different, which is why the choice must be settled
    // empirically rather than assumed.
    expect(features[1][1]).not.toBeCloseTo(bestLrFeatures({ skillId: 'gato', counts: { skillSucc: 9, skillFail: 4, totSucc: 100, totFail: 25 } })[1][1], 3);
  });

  it('rejects a negative count', () => {
    expect(() => bestLrFeatures({ skillId: 's', counts: { ...zeroCounts, skillFail: -1 } })).toThrow(RangeError);
  });

  it('namespaces per-skill features so two skills never share a weight', () => {
    const a = bestLrFeatures({ skillId: 'perro', counts: zeroCounts }).map(([k]) => k);
    const b = bestLrFeatures({ skillId: 'gato', counts: zeroCounts }).map(([k]) => k);
    expect(a.filter((k) => b.includes(k))).toEqual(['succ_total', 'fail_total']);
  });
});

describe('SparseLogReg', () => {
  it('starts at p = 0.5 for an unseen feature set', () => {
    expect(new SparseLogReg().predict([['unseen', 1]])).toBe(0.5);
  });

  it('always returns a probability in (0, 1)', () => {
    const model = new SparseLogReg();
    for (let i = 0; i < 500; i++) model.update([['x', 1]], 1);
    const p = model.predict([['x', 1]]);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });

  it('moves the prediction toward the observed label', () => {
    const model = new SparseLogReg();
    const before = model.predict([['x', 1]]);
    model.update([['x', 1]], 1);
    expect(model.predict([['x', 1]])).toBeGreaterThan(before);
    const positive = model.predict([['x', 1]]);
    model.update([['x', 1]], 0);
    expect(model.predict([['x', 1]])).toBeLessThan(positive);
  });

  it('returns the PRE-update prediction, which is what prequential scoring needs', () => {
    const model = new SparseLogReg();
    const returned = model.update([['x', 1]], 1);
    expect(returned).toBe(0.5);
    expect(model.predict([['x', 1]])).not.toBe(0.5);
  });

  it('learns only the features it has seen (§9.4 counted skills * 3 + 2)', () => {
    const model = new SparseLogReg();
    const skills = ['a', 'b', 'c', 'd'];
    for (const skillId of skills) {
      model.update(bestLrFeatures({ skillId, counts: zeroCounts }), 1);
    }
    expect(model.featureCount).toBe(skills.length * 3 + 2);
  });

  it('gives rare features a large step and frequent ones a small one (AdaGrad)', () => {
    const model = new SparseLogReg();
    for (let i = 0; i < 200; i++) model.update([['frequent', 1]], 1);
    const frequentBefore = model.weight('frequent');
    model.update([['frequent', 1]], 1);
    const frequentStep = Math.abs(model.weight('frequent') - frequentBefore);

    const fresh = new SparseLogReg();
    fresh.update([['rare', 1]], 1);
    const rareStep = Math.abs(fresh.weight('rare'));
    expect(rareStep).toBeGreaterThan(frequentStep);
  });

  it('round-trips through export/from', () => {
    const model = new SparseLogReg();
    for (let i = 0; i < 50; i++) model.update([['x', 1], ['y', 0.5]], i % 3 === 0 ? 1 : 0);
    const features: Feature[] = [['x', 1], ['y', 0.5]];
    const restored = SparseLogReg.from(model.export());
    expect(restored.predict(features)).toBeCloseTo(model.predict(features), 12);
    expect(restored.intercept).toBe(model.intercept);
  });

  it('warmStart preserves coefficients and damps the first online step (§9.3)', () => {
    const batch = { b: 0.2, w: { 'bias_skill:s': 1.5 } };
    const features: Feature[] = [['bias_skill:s', 1]];

    const cold = SparseLogReg.from(batch);
    const warm = SparseLogReg.warmStart(batch, 50);
    expect(warm.predict(features)).toBeCloseTo(cold.predict(features), 12);

    cold.update(features, 0);
    warm.update(features, 0);
    const coldDrift = Math.abs(cold.weight('bias_skill:s') - 1.5);
    const warmDrift = Math.abs(warm.weight('bias_skill:s') - 1.5);
    // Without a seeded accumulator the first online example nearly overwrites the batch fit.
    expect(warmDrift).toBeLessThan(coldDrift);
  });
});

describe('KnowledgeTracer', () => {
  it('produces P(knows concept) and updates on observation', () => {
    const tracer = new KnowledgeTracer(new SparseLogReg(), bestLrFeatures);
    const ctx: TracingContext = { skillId: 'gato', counts: zeroCounts };
    expect(tracer.probabilityKnows(ctx)).toBe(0.5);

    for (let i = 0; i < 30; i++) tracer.observe({ skillId: 'gato', counts: zeroCounts }, true);
    expect(tracer.probabilityKnows(ctx)).toBeGreaterThan(0.8);
  });

  it('probabilityKnows has no side effects', () => {
    const tracer = new KnowledgeTracer(new SparseLogReg(), bestLrFeatures);
    const ctx: TracingContext = { skillId: 'gato', counts: zeroCounts };
    const first = tracer.probabilityKnows(ctx);
    tracer.probabilityKnows(ctx);
    expect(tracer.probabilityKnows(ctx)).toBe(first);
  });

  it('emits the lemma -> probability map that coverage.ts consumes', () => {
    const tracer = new KnowledgeTracer(new SparseLogReg(), bestLrFeatures);
    tracer.observe({ skillId: 'gato', counts: zeroCounts }, true);
    const probabilities = tracer.probabilitiesFor([
      { skillId: 'gato', counts: zeroCounts },
      { skillId: 'perro', counts: zeroCounts },
    ]);
    expect([...probabilities.keys()]).toEqual(['gato', 'perro']);
    expect(probabilities.get('gato')).toBeGreaterThan(probabilities.get('perro') as number);
  });

  it('accepts a swapped-in extractor without any change to the model (the boundary)', () => {
    type WithCognate = TracingContext & { isCognate: boolean };
    const custom: FeatureExtractor<WithCognate> = (ctx) => [
      ...bestLrFeatures(ctx),
      ['cognate', ctx.isCognate ? 1 : 0],
    ];
    const tracer = new KnowledgeTracer<WithCognate>(new SparseLogReg(), custom);

    for (let i = 0; i < 200; i++) {
      tracer.observe({ skillId: `s${i % 5}`, counts: zeroCounts, isCognate: true }, true);
      tracer.observe({ skillId: `s${i % 5}`, counts: zeroCounts, isCognate: false }, false);
    }
    const cognate = tracer.probabilityKnows({ skillId: 's0', counts: zeroCounts, isCognate: true });
    const notCognate = tracer.probabilityKnows({ skillId: 's0', counts: zeroCounts, isCognate: false });
    expect(cognate).toBeGreaterThan(notCognate);
    expect(tracer.model.weight('cognate')).toBeGreaterThan(0);
  });
});

describe('prequential evaluation (§9.4\'s methodology)', () => {
  /**
   * Ground truth mirrors §9.4: `z = ability - difficulty + 0.35 * log1p(practice)`, scored by
   * predict-then-update over the tail of the stream.
   */
  function simulate(extractor: FeatureExtractor) {
    const rng = mulberry32(4242);
    const skillCount = 20;
    const learnerCount = 40;
    const difficulty = Array.from({ length: skillCount }, () => rng() * 3 - 1.5);
    const ability = Array.from({ length: learnerCount }, () => rng() * 2 - 1);

    const model = new SparseLogReg();
    const tracer = new KnowledgeTracer(model, extractor);
    const counts = new Map<string, { skillSucc: number; skillFail: number }>();
    const totals = new Map<number, { totSucc: number; totFail: number }>();

    const scored: { p: number; y: 0 | 1 }[] = [];
    const total = 30_000;
    for (let i = 0; i < total; i++) {
      const learner = Math.floor(rng() * learnerCount);
      const skill = Math.floor(rng() * skillCount);
      const cKey = `${learner}:${skill}`;
      const skillCounts = counts.get(cKey) ?? { skillSucc: 0, skillFail: 0 };
      const learnerTotals = totals.get(learner) ?? { totSucc: 0, totFail: 0 };
      const practice = skillCounts.skillSucc + skillCounts.skillFail;

      const z = ability[learner] - difficulty[skill] + 0.35 * Math.log1p(practice);
      const y: 0 | 1 = rng() < 1 / (1 + Math.exp(-z)) ? 1 : 0;

      const ctx: TracingContext = {
        skillId: `s${skill}`,
        counts: { ...skillCounts, ...learnerTotals },
      };
      const p = tracer.observe(ctx, y === 1);
      if (i >= total * 0.6) scored.push({ p, y });

      if (y === 1) {
        skillCounts.skillSucc++;
        learnerTotals.totSucc++;
      } else {
        skillCounts.skillFail++;
        learnerTotals.totFail++;
      }
      counts.set(cKey, skillCounts);
      totals.set(learner, learnerTotals);
    }
    return { model, logLoss: meanLogLoss(scored), scored };
  }

  it('beats the p = 0.5 baseline by a wide margin', () => {
    const { logLoss, scored } = simulate(bestLrFeatures);
    const baseline = meanLogLoss(scored.map(({ y }) => ({ p: 0.5, y })));
    expect(baseline).toBeCloseTo(Math.log(2), 6);
    expect(logLoss).toBeLessThan(baseline);
    expect(logLoss).toBeLessThan(0.62);
  });

  it('recovers the textbook PFA weight signs: successes help, failures hurt', () => {
    const { model } = simulate(bestLrFeatures);
    // §9.4 reported succ_skill = +0.966, fail_skill = -1.189 on its own simulation.
    expect(model.weight('succ_total')).toBeGreaterThan(0);
    expect(model.weight('fail_total')).toBeLessThan(0);
  });

  it('works identically with the log1p extractor swapped in', () => {
    const { logLoss } = simulate(bestLrFeaturesLog1p);
    expect(logLoss).toBeLessThan(Math.log(2));
  });
});

describe('meanLogLoss', () => {
  it('is ln 2 for an uninformative model', () => {
    expect(meanLogLoss([{ p: 0.5, y: 1 }, { p: 0.5, y: 0 }])).toBeCloseTo(Math.log(2), 12);
  });

  it('is near 0 for a confident, correct model', () => {
    expect(meanLogLoss([{ p: 0.999, y: 1 }])).toBeLessThan(0.002);
  });

  it('clamps rather than returning Infinity for a confident, wrong model', () => {
    expect(Number.isFinite(meanLogLoss([{ p: 1, y: 0 }]))).toBe(true);
    expect(Number.isFinite(meanLogLoss([{ p: 0, y: 1 }]))).toBe(true);
  });

  it('requires at least one prediction', () => {
    expect(() => meanLogLoss([])).toThrow(RangeError);
  });
});
