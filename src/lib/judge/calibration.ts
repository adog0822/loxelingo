/**
 * Judge calibration via Cohen's kappa.
 *
 * WHY NOT RAW AGREEMENT: if 90% of matches have a clear winner, a judge that
 * always answers "first" scores 90% raw agreement and looks excellent. Kappa
 * corrects for agreement expected by chance, so that same judge scores ~0.
 * A 2026 systematic evaluation found kappa deflation of 33-41 percentage points
 * against exact-match agreement on MT-Bench — i.e. raw agreement overstates
 * judge quality by that much. Never gate on raw agreement.
 *
 * THE GATE: no judged outcome may move a user's rating until the active judge
 * configuration clears kappa > 0.6 against a human-labelled gold set. This is
 * enforced in code, not by convention — see `assertJudgeCalibrated`.
 *
 * Thresholds (standard interpretation, and what we do at each):
 *   < 0.40  rubric is ambiguous — rewrite the rubric, do not tune the model
 *   0.40-0.60  marginal — tunable, but not shippable
 *   > 0.60  acceptable — ratings may move
 *   > 0.80  strong
 */

export type Label = 'a' | 'b' | 'draw'
const LABELS: readonly Label[] = ['a', 'b', 'draw'] as const

export interface LabelPair {
  human: Label
  judge: Label
}

export interface CalibrationReport {
  n: number
  /** Cohen's kappa. The number that matters. */
  kappa: number
  /** Raw agreement. Reported for contrast only — never gate on it. */
  rawAgreement: number
  expectedAgreement: number
  interpretation: 'rubric_ambiguous' | 'marginal' | 'acceptable' | 'strong'
  /** True when ratings may move under this judge configuration. */
  passesGate: boolean
  /** Per-label counts, to spot a judge collapsing onto one answer. */
  judgeDistribution: Record<Label, number>
  humanDistribution: Record<Label, number>
}

export const KAPPA_GATE = 0.6

function emptyCounts(): Record<Label, number> {
  return { a: 0, b: 0, draw: 0 }
}

/**
 * Cohen's kappa: (p_o - p_e) / (1 - p_e)
 *
 * p_o = observed agreement, p_e = agreement expected from the marginals.
 */
export function cohensKappa(pairs: readonly LabelPair[]): CalibrationReport {
  if (pairs.length === 0) {
    throw new Error('Cannot calibrate on an empty gold set.')
  }

  const n = pairs.length
  const humanDistribution = emptyCounts()
  const judgeDistribution = emptyCounts()
  let agreements = 0

  for (const { human, judge } of pairs) {
    humanDistribution[human] += 1
    judgeDistribution[judge] += 1
    if (human === judge) agreements += 1
  }

  const rawAgreement = agreements / n

  // Expected agreement from the product of marginals.
  let expectedAgreement = 0
  for (const label of LABELS) {
    expectedAgreement += (humanDistribution[label] / n) * (judgeDistribution[label] / n)
  }

  // p_e === 1 means both raters used exactly one identical label throughout.
  // Kappa is undefined there; 0 is the honest answer because such a judge has
  // demonstrated no discriminative ability whatsoever.
  const kappa =
    expectedAgreement >= 1 ? 0 : (rawAgreement - expectedAgreement) / (1 - expectedAgreement)

  return {
    n,
    kappa,
    rawAgreement,
    expectedAgreement,
    interpretation: interpret(kappa),
    passesGate: kappa > KAPPA_GATE,
    judgeDistribution,
    humanDistribution,
  }
}

function interpret(kappa: number): CalibrationReport['interpretation'] {
  if (kappa < 0.4) return 'rubric_ambiguous'
  if (kappa <= 0.6) return 'marginal'
  if (kappa <= 0.8) return 'acceptable'
  return 'strong'
}

/**
 * Minimum gold-set size before a kappa is meaningful.
 * Below this, one flipped label swings the estimate materially.
 */
export const MIN_GOLD_SET = 100

export class JudgeNotCalibrated extends Error {}

/**
 * Hard gate. Call this before any code path that writes a rating.
 *
 * Deliberately throws rather than returning a boolean: a calibration check
 * whose result can be ignored is not a gate.
 */
export function assertJudgeCalibrated(report: CalibrationReport): void {
  if (report.n < MIN_GOLD_SET) {
    throw new JudgeNotCalibrated(
      `Gold set too small: ${report.n} < ${MIN_GOLD_SET}. Label more matches before ratings move.`,
    )
  }
  if (!report.passesGate) {
    throw new JudgeNotCalibrated(
      `Judge kappa ${report.kappa.toFixed(3)} <= ${KAPPA_GATE} (${report.interpretation}). ` +
        `Raw agreement was ${(report.rawAgreement * 100).toFixed(1)}% — which is why we do not gate on it. ` +
        `Ratings are frozen until this clears.`,
    )
  }
}

/**
 * Inter-annotator agreement among humans, computed the same way.
 *
 * Run this FIRST. If humans cannot agree with each other above ~0.4, the rubric
 * is ambiguous and no amount of model or prompt work will fix the judge — the
 * task itself is underspecified.
 */
export function interAnnotatorAgreement(
  a: readonly Label[],
  b: readonly Label[],
): CalibrationReport {
  if (a.length !== b.length) {
    throw new Error('Annotator label arrays must be the same length.')
  }
  return cohensKappa(a.map((human, i) => ({ human, judge: b[i]! })))
}
