import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CalibrationUnavailable,
  clearCalibrationCache,
  getCalibrationReport,
  resolveCalibrationGate,
  type GoldLabelRow,
  type GoldSetStore,
} from './gold-set'
import { MIN_GOLD_SET, type Label } from './calibration'

const MODEL = 'anthropic/claude-haiku-4.5@1'

function rows(n: number, judge: (i: number) => Label): GoldLabelRow[] {
  return Array.from({ length: n }, (_, i) => ({
    matchId: `m${i}`,
    humanLabel: (i % 2 === 0 ? 'a' : 'b') as Label,
    judgeLabel: judge(i),
    rubricRef: 'duel@1',
    judgeModelVersion: MODEL,
  }))
}

function storeOf(data: GoldLabelRow[], spy?: () => void): GoldSetStore {
  return {
    async loadGoldLabels() {
      spy?.()
      return data
    },
  }
}

beforeEach(() => {
  clearCalibrationCache()
  delete process.env.JUDGE_CALIBRATION_BYPASS
})

afterEach(() => {
  vi.unstubAllEnvs()
  delete process.env.JUDGE_CALIBRATION_BYPASS
})

describe('getCalibrationReport', () => {
  it('refuses to report on too little data instead of defaulting to permissive', () => {
    const store = storeOf(rows(MIN_GOLD_SET - 1, (i) => (i % 2 === 0 ? 'a' : 'b')))
    return expect(getCalibrationReport(store, MODEL)).rejects.toThrow(CalibrationUnavailable)
  })

  it('reports a passing judge', async () => {
    // Agrees with the human except 1 in 10.
    const store = storeOf(
      rows(200, (i) => (i % 10 === 0 ? 'draw' : i % 2 === 0 ? 'a' : 'b')),
    )
    const report = await getCalibrationReport(store, MODEL)
    expect(report.passesGate).toBe(true)
  })

  it('reports an always-pass judge as failing', async () => {
    const store = storeOf(rows(200, () => 'a'))
    const report = await getCalibrationReport(store, MODEL)
    expect(report.passesGate).toBe(false)
  })

  it('caches within the TTL and refreshes after it', async () => {
    let loads = 0
    const store = storeOf(
      rows(200, (i) => (i % 2 === 0 ? 'a' : 'b')),
      () => {
        loads += 1
      },
    )

    const t0 = 1_000_000
    await getCalibrationReport(store, MODEL, { now: t0 })
    await getCalibrationReport(store, MODEL, { now: t0 + 60_000 })
    expect(loads).toBe(1)

    await getCalibrationReport(store, MODEL, { now: t0 + 6 * 60 * 1000 })
    expect(loads).toBe(2)
  })

  it('keys the cache by judge configuration', async () => {
    let loads = 0
    const store = storeOf(
      rows(200, (i) => (i % 2 === 0 ? 'a' : 'b')),
      () => {
        loads += 1
      },
    )

    const t0 = 2_000_000
    await getCalibrationReport(store, 'model-a@1', { now: t0 })
    await getCalibrationReport(store, 'model-b@1', { now: t0 })
    // A different model is a different system; its calibration cannot be reused.
    expect(loads).toBe(2)
  })
})

describe('resolveCalibrationGate', () => {
  it('throws when uncalibrated and the bypass is off', () => {
    const store = storeOf(rows(10, () => 'a'))
    return expect(resolveCalibrationGate(store, MODEL)).rejects.toThrow(CalibrationUnavailable)
  })

  it('degrades to unrated play when the bypass is explicitly on', async () => {
    process.env.JUDGE_CALIBRATION_BYPASS = 'true'
    const store = storeOf(rows(10, () => 'a'))

    const gate = await resolveCalibrationGate(store, MODEL)
    expect(gate.status).toBe('uncalibrated_unrated')
  })

  it('never treats a merely truthy env value as enabling the bypass', async () => {
    process.env.JUDGE_CALIBRATION_BYPASS = '1'
    const store = storeOf(rows(10, () => 'a'))
    // Only the exact string 'true' counts. '1', 'yes', 'TRUE' must not.
    await expect(resolveCalibrationGate(store, MODEL)).rejects.toThrow(CalibrationUnavailable)
  })

  it('reports calibrated when the data supports it, bypass irrelevant', async () => {
    process.env.JUDGE_CALIBRATION_BYPASS = 'true'
    const store = storeOf(
      rows(200, (i) => (i % 10 === 0 ? 'draw' : i % 2 === 0 ? 'a' : 'b')),
    )

    const gate = await resolveCalibrationGate(store, MODEL)
    expect(gate.status).toBe('calibrated')
    if (gate.status === 'calibrated') {
      expect(gate.report.passesGate).toBe(true)
    }
  })

  it('does not swallow unrelated failures', () => {
    process.env.JUDGE_CALIBRATION_BYPASS = 'true'
    const store: GoldSetStore = {
      async loadGoldLabels() {
        throw new Error('network down')
      },
    }
    // The bypass covers "not enough labels", never a broken store.
    return expect(resolveCalibrationGate(store, MODEL)).rejects.toThrow('network down')
  })
})
