import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BANDS, bandForRating } from './altitude'

/**
 * The band floors are written twice, once as `BANDS` here and once as a `case` in Postgres,
 * because Postgres cannot call TypeScript. A one-sided edit shows one player two different
 * bands depending on which side answered, and a band floor is a threshold players cross, so
 * that is a promise breaking rather than a cosmetic mismatch.
 *
 * This is the third guard of its shape in the repository, after `display-scale.test.ts` and
 * `bot-rungs.test.ts`. All three exist because the same rescale left three separate sets of
 * numbers behind: the matchmaking band steps, the bot roster, and this function. The common
 * cause is a value derived from `DISPLAY_SCALE` recorded somewhere that cannot see it, so the
 * fix in every case is a test that reads the other side.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/20260815140000_altitude_band_10k.sql',
)

/** `when rating < 1800  then 'Treeline'` -> { threshold: 1800, name: 'Treeline' } */
function cutsFromMigration(): { threshold: number; name: string }[] {
  const sql = readFileSync(MIGRATION, 'utf8')
  const body = sql.slice(sql.indexOf('create or replace function'), sql.indexOf('comment on'))
  return [...body.matchAll(/when rating < (\d+)\s+then '([^']+)'/g)].map((m) => ({
    threshold: Number(m[1]),
    name: m[2]!,
  }))
}

describe('altitude_band mirrors the TypeScript bands', () => {
  const cuts = cutsFromMigration()

  it('cuts at every finite floor, and at no others', () => {
    // Valley Floor opens at negative infinity, so it is a name without a cut. Every other band
    // contributes exactly one `when rating < floor`.
    const finite = BANDS.filter((band) => Number.isFinite(band.floor))
    expect(cuts.map((cut) => cut.threshold)).toEqual(finite.map((band) => band.floor))
  })

  it('names the band BELOW each cut, which is where an off-by-one would hide', () => {
    // `when rating < 1800 then 'Treeline'` is correct precisely because Treeline is the band
    // under Ridge. Reading it as "1800 is Treeline" is the mistake this pins.
    for (const [i, cut] of cuts.entries()) {
      expect(cut.name).toBe(BANDS[i]!.name)
    }
  })

  it('carries the top band with no cut of its own', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    const top = BANDS[BANDS.length - 1]!
    expect(sql).toContain(`else                     '${top.name}'`)
    expect(cuts.map((cut) => cut.name)).not.toContain(top.name)
  })

  it('agrees with bandForRating on both sides of every floor', () => {
    // The SQL is a string here rather than a running function, so this evaluates the same case
    // expression the migration applies and compares it against the TypeScript reader.
    const sqlBand = (rating: number): string => {
      for (const cut of cuts) if (rating < cut.threshold) return cut.name
      return BANDS[BANDS.length - 1]!.name
    }

    for (const band of BANDS) {
      if (!Number.isFinite(band.floor)) continue
      expect(sqlBand(band.floor)).toBe(bandForRating(band.floor).name)
      expect(sqlBand(band.floor - 1)).toBe(bandForRating(band.floor - 1).name)
    }
  })

  it('leaves none of the pre-rescale thresholds behind', () => {
    // The exact numbers this function used to cut at, under `900 + 400 * theta`. Finding any of
    // them again means a revert or a bad merge rather than a considered change.
    const sql = readFileSync(MIGRATION, 'utf8')
    const body = sql.slice(sql.indexOf('create or replace function'), sql.indexOf('comment on'))
    for (const stale of [900, 1100, 1300, 1550, 2100]) {
      expect(body).not.toContain(`< ${stale}`)
    }
  })
})
