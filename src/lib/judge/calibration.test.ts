import { describe, expect, it } from 'vitest'
import {
  assertJudgeCalibrated,
  cohensKappa,
  interAnnotatorAgreement,
  JudgeNotCalibrated,
  KAPPA_GATE,
  MIN_GOLD_SET,
  type Label,
  type LabelPair,
} from './calibration'

/** A gold set where 90% of matches have a clear 'a' winner — the realistic skew. */
function skewedGoldSet(n: number, clearWinnerRatio = 0.9): Label[] {
  return Array.from({ length: n }, (_, i) => (i < n * clearWinnerRatio ? 'a' : 'b'))
}

describe('cohensKappa', () => {
  it('scores a perfect judge at 1', () => {
    const humans = skewedGoldSet(120)
    const pairs: LabelPair[] = humans.map((h) => ({ human: h, judge: h }))

    const report = cohensKappa(pairs)
    expect(report.kappa).toBeCloseTo(1, 10)
    expect(report.passesGate).toBe(true)
  })

  /**
   * THE LOAD-BEARING TEST.
   *
   * A judge that always answers 'a' on a gold set that is 90% 'a' achieves 90%
   * raw agreement and looks excellent. Kappa must see through it. If this test
   * ever passes the gate, the calibration harness is broken and every rating on
   * the platform is untrustworthy.
   */
  it('fails an always-pass judge despite 90% raw agreement', () => {
    const humans = skewedGoldSet(200, 0.9)
    const pairs: LabelPair[] = humans.map((h) => ({ human: h, judge: 'a' as Label }))

    const report = cohensKappa(pairs)

    expect(report.rawAgreement).toBeCloseTo(0.9, 10)
    expect(report.kappa).toBeCloseTo(0, 10)
    expect(report.passesGate).toBe(false)
    expect(report.interpretation).toBe('rubric_ambiguous')
    expect(() => assertJudgeCalibrated(report)).toThrow(JudgeNotCalibrated)
  })

  it('collapses to kappa 0 when both raters use a single identical label', () => {
    const pairs: LabelPair[] = Array.from({ length: 150 }, () => ({
      human: 'draw' as Label,
      judge: 'draw' as Label,
    }))

    const report = cohensKappa(pairs)
    expect(report.rawAgreement).toBe(1)
    expect(report.expectedAgreement).toBe(1)
    // Undefined mathematically; 0 is the honest answer — no discriminative ability shown.
    expect(report.kappa).toBe(0)
    expect(report.passesGate).toBe(false)
  })

  it('passes a genuinely discriminating judge', () => {
    // Balanced gold set, judge wrong on 1 in 10.
    const humans: Label[] = Array.from({ length: 200 }, (_, i) =>
      i % 2 === 0 ? 'a' : 'b',
    )
    const pairs: LabelPair[] = humans.map((h, i) => ({
      human: h,
      judge: i % 10 === 0 ? (h === 'a' ? 'b' : 'a') : h,
    }))

    const report = cohensKappa(pairs)
    expect(report.kappa).toBeGreaterThan(KAPPA_GATE)
    expect(report.passesGate).toBe(true)
    expect(() => assertJudgeCalibrated(report)).not.toThrow()
  })

  it('reports kappa well below raw agreement on skewed data', () => {
    // Demonstrates the deflation that makes raw agreement misleading.
    const humans = skewedGoldSet(200, 0.85)
    const pairs: LabelPair[] = humans.map((h, i) => ({
      human: h,
      judge: i % 7 === 0 ? 'a' : h,
    }))

    const report = cohensKappa(pairs)
    expect(report.rawAgreement).toBeGreaterThan(report.kappa)
  })

  it('throws on an empty gold set', () => {
    expect(() => cohensKappa([])).toThrow(/empty gold set/i)
  })
})

describe('assertJudgeCalibrated', () => {
  it('refuses a gold set that is too small even at kappa 1', () => {
    const humans: Label[] = Array.from({ length: MIN_GOLD_SET - 1 }, (_, i) =>
      i % 2 === 0 ? 'a' : 'b',
    )
    const report = cohensKappa(humans.map((h) => ({ human: h, judge: h })))

    expect(report.kappa).toBeCloseTo(1, 10)
    expect(() => assertJudgeCalibrated(report)).toThrow(/too small/i)
  })

  it('names raw agreement in the failure message, so the trap is visible', () => {
    const humans = skewedGoldSet(200, 0.9)
    const report = cohensKappa(humans.map((h) => ({ human: h, judge: 'a' as Label })))

    expect(() => assertJudgeCalibrated(report)).toThrow(/raw agreement/i)
  })
})

describe('interAnnotatorAgreement', () => {
  it('measures human-human agreement on the same scale', () => {
    const a: Label[] = Array.from({ length: 120 }, (_, i) => (i % 2 === 0 ? 'a' : 'b'))
    const b: Label[] = a.map((label, i) => (i % 12 === 0 ? 'draw' : label))

    const report = interAnnotatorAgreement(a, b)
    expect(report.kappa).toBeGreaterThan(0.6)
  })

  it('rejects mismatched annotator arrays', () => {
    expect(() => interAnnotatorAgreement(['a'], ['a', 'b'])).toThrow(/same length/i)
  })
})
