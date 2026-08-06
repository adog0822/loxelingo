/**
 * coverage — lexical coverage and coverage-band content selection.
 *
 * Implements `docs/research/02-ml-and-naming.md` §(e).
 *
 * ```
 * coverage(text, learner) = SUM_tokens P(learner knows lemma(token)) / |tokens|
 * ```
 *
 * Select content whose coverage lands in **[0.95, 0.98]**: enough unknown words to learn from,
 * not enough to break comprehension. That band *is* the operational i+1 — Krashen's i+1 has no
 * operational definition, but the coverage literature does. Hu & Nation (2000): 98% is where most
 * learners read unassisted, 95% is where minimally acceptable comprehension occurs. Replicated by
 * Kremmel & Brysbaert et al., *Language Learning* 2023 (doi:10.1111/lang.12622), which treats the
 * threshold as a probabilistic gradient rather than a cliff — hence a band, and hence a soft
 * fallback ranking rather than a hard reject.
 *
 * Secondary levers, per §(e): unknown-word **dispersion** (2 unknowns in one sentence is worse
 * than 2 spread over a page) and unknown-word **learnability** (frequency rank, cognate status).
 * Both are tie-breaks, never overriding the band.
 *
 * `P(knows lemma)` comes from `knowledge-tracing.ts` — a per-learner *probabilistic* vocabulary
 * state, not a boolean known-words list (§(e) implication 1).
 *
 * **Tokenization is not this module's job.** Every entry point takes lemmas that someone else
 * produced. §(e) implication 3: precompute a per-text lemma profile at ingest so coverage is a
 * cheap dot product at serve time.
 *
 * §(e) implication 5: reading and video/audio have different thresholds (see "Lexical coverage in
 * L1 and L2 viewing comprehension", *SSLA*). The band is therefore a parameter, and
 * `READING_COVERAGE_BAND` is named rather than being the only option.
 *
 * Pure: no I/O, no randomness.
 */

/** `lemma -> P(learner knows lemma)`. Missing lemmas are treated as unknown (see `KnownFn`). */
export type LemmaKnowledge = ReadonlyMap<string, number> | Readonly<Record<string, number>>;

/** How the caller supplies `P(knows lemma)`. */
export type KnownFn = (lemma: string) => number;

export class CoverageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CoverageError';
  }
}

/** Hu & Nation (2000), replicated Kremmel 2023. §(e) implication 2. */
export const READING_COVERAGE_BAND = { min: 0.95, max: 0.98 } as const;

export type CoverageBand = { min: number; max: number };

function assertBand(band: CoverageBand): CoverageBand {
  if (!(band.min >= 0 && band.max <= 1 && band.min <= band.max)) {
    throw new CoverageError(`coverage band must satisfy 0 <= min <= max <= 1, got [${band.min}, ${band.max}]`);
  }
  return band;
}

const clampProbability = (p: number, lemma: string): number => {
  if (!Number.isFinite(p)) throw new CoverageError(`P(knows ${JSON.stringify(lemma)}) is not finite: ${p}`);
  return Math.min(1, Math.max(0, p));
};

/** Adapt a map or plain object into a `KnownFn`. Unseen lemmas default to `fallback` (0). */
export function knownFromTable(table: LemmaKnowledge, fallback = 0): KnownFn {
  if (table instanceof Map) {
    return (lemma) => clampProbability(table.get(lemma) ?? fallback, lemma);
  }
  const record = table as Readonly<Record<string, number>>;
  return (lemma) => clampProbability(record[lemma] ?? fallback, lemma);
}

/**
 * `SUM P(knows lemma) / |tokens|`, always in [0, 1].
 *
 * Empty input returns 1: a text with no tokens is trivially fully covered. Callers that care
 * should filter empty candidates out before selecting.
 */
export function coverage(lemmas: readonly string[], knows: KnownFn): number {
  if (lemmas.length === 0) return 1;
  let sum = 0;
  for (const lemma of lemmas) sum += clampProbability(knows(lemma), lemma);
  return sum / lemmas.length;
}

/** Expected count of unknown tokens, `SUM (1 - P(knows))`. */
export function expectedUnknownTokens(lemmas: readonly string[], knows: KnownFn): number {
  let sum = 0;
  for (const lemma of lemmas) sum += 1 - clampProbability(knows(lemma), lemma);
  return sum;
}

/**
 * Unknown-mass dispersion in [0, 1], where 1 means unknown probability mass is spread perfectly
 * evenly across units and 0 means it is entirely concentrated in one unit.
 *
 * Definition: total variation distance between the observed distribution of unknown mass over
 * units and the distribution implied by unit sizes, subtracted from 1. Zero total unknown mass
 * scores 1 (nothing is concentrated).
 *
 * "Units" are sentences when the caller has them. If only a flat lemma list is available, pass a
 * window size and this splits into fixed-size windows — a crude but monotone stand-in.
 */
export function dispersion(units: readonly (readonly string[])[], knows: KnownFn): number {
  const totalTokens = units.reduce((a, u) => a + u.length, 0);
  if (totalTokens === 0) return 1;

  const unknownPerUnit = units.map((u) => expectedUnknownTokens(u, knows));
  const totalUnknown = unknownPerUnit.reduce((a, b) => a + b, 0);
  if (totalUnknown <= 0) return 1;

  let tv = 0;
  for (let i = 0; i < units.length; i++) {
    tv += Math.abs(unknownPerUnit[i] / totalUnknown - units[i].length / totalTokens);
  }
  return Math.min(1, Math.max(0, 1 - tv / 2));
}

/** Split a flat lemma list into fixed-size windows, for dispersion without sentence boundaries. */
export function windows(lemmas: readonly string[], size: number): string[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new CoverageError(`window size must be a positive integer, got ${size}`);
  }
  const out: string[][] = [];
  for (let i = 0; i < lemmas.length; i += size) out.push(lemmas.slice(i, i + size));
  return out;
}

/**
 * Learnability of a candidate's unknown words, in [0, 1].
 *
 * Weighted by each lemma's unknown mass `(1 - P(knows))`, so a lemma the learner probably already
 * knows barely counts. The per-lemma learnability function is the caller's — §(e) names frequency
 * rank and cognate status. With no function supplied everything scores 0.5, which makes the
 * tie-break inert rather than arbitrary.
 */
export function learnability(
  lemmas: readonly string[],
  knows: KnownFn,
  lemmaLearnability?: (lemma: string) => number,
): number {
  if (!lemmaLearnability) return 0.5;
  let weighted = 0;
  let mass = 0;
  const seen = new Set<string>();
  for (const lemma of lemmas) {
    if (seen.has(lemma)) continue;
    seen.add(lemma);
    const unknown = 1 - clampProbability(knows(lemma), lemma);
    if (unknown <= 0) continue;
    const l = lemmaLearnability(lemma);
    if (!Number.isFinite(l)) throw new CoverageError(`learnability(${JSON.stringify(lemma)}) is not finite`);
    weighted += Math.min(1, Math.max(0, l)) * unknown;
    mass += unknown;
  }
  return mass > 0 ? weighted / mass : 0.5;
}

/**
 * A candidate piece of content, already lemmatised by someone else.
 *
 * Supply `sentences` when you have them — dispersion is much more meaningful per sentence. If you
 * only have `lemmas`, dispersion falls back to fixed-size windows.
 */
export type Candidate = {
  id: string;
  lemmas: readonly string[];
  sentences?: readonly (readonly string[])[];
};

export type ScoredCandidate = {
  id: string;
  coverage: number;
  /** Whether `coverage` falls inside the target band, inclusive. */
  inBand: boolean;
  /** 0 when in band; otherwise the absolute distance to the nearer edge. */
  bandDistance: number;
  dispersion: number;
  learnability: number;
  expectedUnknownTokens: number;
  /** Weighted tie-break score in [0, 1]. Only meaningful between candidates in the same band. */
  tieBreakScore: number;
};

export type SelectionOptions = {
  band?: CoverageBand;
  /** Relative weight of dispersion in the tie-break. */
  dispersionWeight?: number;
  /** Relative weight of learnability in the tie-break. */
  learnabilityWeight?: number;
  /** Window size used for dispersion when a candidate has no `sentences`. */
  windowSize?: number;
  /** Per-lemma learnability, e.g. from Zipf rank or cognate status. */
  lemmaLearnability?: (lemma: string) => number;
};

const DEFAULTS = {
  dispersionWeight: 0.5,
  learnabilityWeight: 0.5,
  windowSize: 20,
} as const;

export function scoreCandidate(
  candidate: Candidate,
  knows: KnownFn,
  options: SelectionOptions = {},
): ScoredCandidate {
  const band = assertBand(options.band ?? READING_COVERAGE_BAND);
  const dw = options.dispersionWeight ?? DEFAULTS.dispersionWeight;
  const lw = options.learnabilityWeight ?? DEFAULTS.learnabilityWeight;
  if (dw < 0 || lw < 0) throw new CoverageError('tie-break weights must be >= 0');

  const cov = coverage(candidate.lemmas, knows);
  const units = candidate.sentences ?? windows(candidate.lemmas, options.windowSize ?? DEFAULTS.windowSize);
  const disp = dispersion(units, knows);
  const learn = learnability(candidate.lemmas, knows, options.lemmaLearnability);

  const inBand = cov >= band.min && cov <= band.max;
  const bandDistance = inBand ? 0 : cov < band.min ? band.min - cov : cov - band.max;
  const weightSum = dw + lw;

  return {
    id: candidate.id,
    coverage: cov,
    inBand,
    bandDistance,
    dispersion: disp,
    learnability: learn,
    expectedUnknownTokens: expectedUnknownTokens(candidate.lemmas, knows),
    tieBreakScore: weightSum > 0 ? (dw * disp + lw * learn) / weightSum : 0,
  };
}

/**
 * Rank candidates for a learner.
 *
 * Ordering, strictly: (1) in-band candidates before out-of-band ones — the band is the objective,
 * not a preference; (2) within a group, higher tie-break score (dispersion + learnability) first;
 * (3) out-of-band candidates additionally ordered by distance to the band, so the fallback is the
 * nearest-miss rather than an arbitrary text — §(e)'s replication treats the threshold as a
 * gradient, so a 0.94 text is a reasonable answer when nothing is in band; (4) id, so the order is
 * total and deterministic.
 */
export function rankCandidates(
  candidates: readonly Candidate[],
  knows: KnownFn,
  options: SelectionOptions = {},
): ScoredCandidate[] {
  const scored = candidates.map((c) => scoreCandidate(c, knows, options));
  return scored.sort((a, b) => {
    if (a.inBand !== b.inBand) return a.inBand ? -1 : 1;
    if (!a.inBand && a.bandDistance !== b.bandDistance) return a.bandDistance - b.bandDistance;
    if (a.tieBreakScore !== b.tieBreakScore) return b.tieBreakScore - a.tieBreakScore;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Only the in-band candidates, best tie-break first. May be empty. */
export function selectInBand(
  candidates: readonly Candidate[],
  knows: KnownFn,
  options: SelectionOptions = {},
): ScoredCandidate[] {
  return rankCandidates(candidates, knows, options).filter((c) => c.inBand);
}

/** The single best candidate, preferring in-band and falling back to nearest-miss. */
export function selectBest(
  candidates: readonly Candidate[],
  knows: KnownFn,
  options: SelectionOptions = {},
): ScoredCandidate | null {
  return rankCandidates(candidates, knows, options)[0] ?? null;
}
