import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DISPLAY_INIT,
  DISPLAY_SCALE,
  fromDisplayScale,
  newLearnerRating,
  toDisplayScale,
} from './elo'
import { bandForRating } from '@/lib/design/altitude'

/**
 * The display scale is expressed twice — once in TypeScript, once as a
 * `generated always as (...)` column in Postgres — because Postgres cannot call
 * TypeScript. A one-sided edit would make the same player show one rating in the
 * UI and a different one from the database, diverging further as skill grows.
 *
 * These tests exist so that mistake fails the suite instead of shipping.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/20260805104120_identity_and_progression.sql',
)

describe('display scale constants', () => {
  it('are pinned', () => {
    // Changing these is a product decision, not a refactor. If you change them,
    // change the SQL in the same commit and update this test deliberately.
    expect(DISPLAY_INIT).toBe(900)
    expect(DISPLAY_SCALE).toBe(400)
  })

  it('matches the generated columns in the migration', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    const expected = `${DISPLAY_INIT} + ${DISPLAY_SCALE} * theta`
    const expectedPeak = `${DISPLAY_INIT} + ${DISPLAY_SCALE} * peak_theta`

    expect(sql).toContain(`generated always as (${expected}) stored`)
    expect(sql).toContain(`generated always as (${expectedPeak}) stored`)
  })

  it('leaves no stale formula behind in the migration', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    // The original scaffold used 1000; the engine briefly used 1500 with a
    // base-10 division. Neither may survive anywhere in the schema.
    const generatedExpressions = sql.match(/generated always as \([^)]*theta[^)]*\)/g) ?? []
    expect(generatedExpressions.length).toBeGreaterThan(0)
    for (const expression of generatedExpressions) {
      expect(expression).toContain(`${DISPLAY_INIT} +`)
      expect(expression).not.toContain('ln(')
    }
  })
})

describe('conversion', () => {
  it('places a fresh learner at the floor of the visible climb', () => {
    const fresh = newLearnerRating()
    expect(fresh.theta).toBe(0)

    const display = toDisplayScale(fresh.theta)
    expect(display).toBe(900)

    // Treeline, not "Above the Deck". A new account must not spawn at the
    // payoff — see the rationale on DISPLAY_INIT in elo.ts.
    const band = bandForRating(display)
    expect(band.name).toBe('Treeline')
  })

  it('puts the first threshold crossing within about half a logit', () => {
    // First crossings are the highest-leverage retention events, so the first
    // one has to be close enough to be reachable.
    const ridgeFloor = 1100
    const logitsToRidge = fromDisplayScale(ridgeFloor) - fromDisplayScale(900)
    expect(logitsToRidge).toBeCloseTo(0.5, 10)
  })

  it('round-trips', () => {
    for (const theta of [-2, -0.75, 0, 0.25, 1, 3.5]) {
      expect(fromDisplayScale(toDisplayScale(theta))).toBeCloseTo(theta, 10)
    }
  })

  it('is linear in theta at 400 points per logit', () => {
    expect(toDisplayScale(1) - toDisplayScale(0)).toBe(400)
    expect(toDisplayScale(0) - toDisplayScale(-1)).toBe(400)
  })

  it('agrees with the SQL formula evaluated in JS', () => {
    // Mirror of the generated column, computed independently.
    const sqlFormula = (theta: number) => 900 + 400 * theta
    for (const theta of [-1.5, 0, 0.5, 2, 4]) {
      expect(toDisplayScale(theta)).toBe(sqlFormula(theta))
    }
  })
})
