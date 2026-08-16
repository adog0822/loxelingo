import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { BAND_STEPS_DISPLAY } from '@/lib/match/matchmaking'
import { bandForRating } from '@/lib/design/altitude'
import { DISPLAY_INIT, DISPLAY_SCALE, fromDisplayScale, toDisplayScale } from './elo'

/**
 * The bot cast is authored in DISPLAY points and means something in LOGITS.
 *
 * That gap is where the bug lived. The five rungs were typed as 940 / 1120 / 1340 / 1580 / 1820
 * against `900 + 400 * theta`; `20260815094459_rating_scale_10k` moved the display scale to
 * `1000 + 1250 * theta` and did not move the roster. Read through the new scale those same
 * numbers mean theta -0.048 to 0.656 — a cast designed to span 2.2 logits squeezed into 0.7,
 * with adjacent rungs closer together than the NARROWEST matchmaking band, so
 * `nearestBotPerformance` could no longer tell one rung from another and the "master" sat about
 * half a logit above a brand-new account.
 *
 * Nothing failed. The migration applied, the seeds ran, the suite stayed green, and the ladder
 * quietly stopped being a ladder. This file exists so the next display rescale that forgets the
 * cast fails here instead of shipping: it reads the SQL that authors the rungs and checks the
 * numbers in it against the thetas they are supposed to mean.
 *
 * It is the roster-side twin of `display-scale.test.ts`, which pins the scale itself.
 */

const repo = (p: string) => join(process.cwd(), p)

const RATINGS_MIGRATION = repo('supabase/migrations/20260815131207_bot_ratings_10k.sql')
const JA_SEED = repo('supabase/seeds/20-bot-performances-ja.sql')
const EN_SEED = repo('supabase/seeds/30-bot-performances-en.sql')
const CLOSED_SEED = repo('supabase/seeds/40-bot-performances-closed.sql')

const read = (path: string) => readFileSync(path, 'utf8')

/**
 * THE RUNGS, IN LOGITS. This is the authored intent and the only thing in the system that is
 * allowed to be a bare number here — everything else is derived from it or checked against it.
 *
 * These five thetas have never moved. They are what `match_participants.theta_before` already
 * holds on every seeded bot seat and what the authored performances were tuned against, which
 * is why the fix to the display ratings was a restatement rather than a re-design.
 */
const RUNG_THETA: ReadonlyArray<readonly [string, number]> = [
  ['earnest_beginner', 0.1],
  ['casual_peer', 0.55],
  ['precise_literary', 1.1],
  ['warm_guide', 1.7],
  ['master', 2.3],
]

/** The most an integer `display_rating` column can be off the exact conversion. */
const ROUNDING_SLACK_LOGITS = 0.5 / DISPLAY_SCALE + 1e-9

/**
 * Pull a `(values ('key', number), ...) as r (archetype, <column>)` list out of the SQL.
 *
 * Parsed rather than duplicated: a test that restates the numbers it is checking only proves
 * the test and the schema were edited by the same person on the same day.
 */
function parseValuesList(sql: string, column: string): Map<string, number> {
  const block = new RegExp(`\\(values([\\s\\S]*?)\\)\\s*as\\s+r\\s*\\(archetype,\\s*${column}\\)`)
  const found = block.exec(sql)
  if (found === null) throw new Error(`no "(values ...) as r (archetype, ${column})" list in SQL`)

  const out = new Map<string, number>()
  for (const [, key, value] of found[1]!.matchAll(/\('([a-z_]+)',\s*(-?[0-9.]+)\)/g)) {
    out.set(key!, Number(value!))
  }
  return out
}

describe('the bot cast is on the current display scale', () => {
  const sql = read(RATINGS_MIGRATION)

  it('authors exactly the five rungs, once each', () => {
    const authored = parseValuesList(sql, 'display_rating')
    expect([...authored.keys()].sort()).toEqual(RUNG_THETA.map(([a]) => a).sort())
  })

  it('converts every authored rating back to the theta its rung means', () => {
    // THE TEST THIS FILE EXISTS FOR. Not "is the rating 1125" — that is the same kind of typed
    // number that broke — but "does the rating mean theta 0.10 on the scale elo.ts defines".
    const authored = parseValuesList(sql, 'display_rating')

    for (const [archetype, theta] of RUNG_THETA) {
      const rating = authored.get(archetype)!
      expect(Number.isInteger(rating)).toBe(true)
      expect(fromDisplayScale(rating)).toBeCloseTo(theta, 3)
      // Stated the other way too, because this is the direction a designer works in.
      expect(Math.abs(rating - toDisplayScale(theta))).toBeLessThanOrEqual(0.5)
      expect(Math.abs(fromDisplayScale(rating) - theta)).toBeLessThanOrEqual(ROUNDING_SLACK_LOGITS)
    }
  })

  it('checks itself in the database against the same thetas this file asserts', () => {
    // The migration carries a `do $$` guard with its own copy of the rungs, so a later seed or
    // content edit is caught at apply time as well as here. Two copies of the intent is one more
    // than one, so they are compared rather than trusted.
    const guard = parseValuesList(sql, 'theta')
    for (const [archetype, theta] of RUNG_THETA) {
      expect(guard.get(archetype)).toBeCloseTo(theta, 10)
    }
  })

  it('states the check constraint as the display range itself, not two chosen bounds', () => {
    // The old bound was 400-3000: sized for the old scale, and two of the current rungs fall
    // outside it. A bound that has to be re-picked at every rescale is a bound that will be
    // forgotten at some rescale.
    expect(sql).toContain('check (display_rating between 0 and 10000)')
  })
})

describe('the cast spans a ladder a learner can actually be placed on', () => {
  const authored = parseValuesList(read(RATINGS_MIGRATION), 'display_rating')
  const ratings = RUNG_THETA.map(([archetype]) => authored.get(archetype)!)

  it('climbs, rung by rung', () => {
    for (let i = 1; i < ratings.length; i++) {
      expect(ratings[i]!).toBeGreaterThan(ratings[i - 1]!)
    }
  })

  it('separates adjacent rungs by more than the NARROWEST matchmaking band', () => {
    // This is the precise form of the breakage. `nearestBotPerformance` picks the rung closest
    // to the learner on the display scale, so rungs packed tighter than the tightest band
    // (BAND_STEPS_DISPLAY[0]) are not distinguishable by any learner the band can place: which
    // one you meet turns on noise. The old cast's gaps were 180 / 220 / 240 / 240 against a
    // 313-point band — every one of them too small. The current gaps are all comfortably wider.
    const narrowestBand = BAND_STEPS_DISPLAY[0]!
    for (let i = 1; i < ratings.length; i++) {
      expect(ratings[i]! - ratings[i - 1]!).toBeGreaterThan(narrowestBand)
    }
  })

  it('spans the 2.2 logits it was designed to span', () => {
    const span = fromDisplayScale(ratings.at(-1)!) - fromDisplayScale(ratings[0]!)
    expect(span).toBeCloseTo(2.2, 2)
  })

  it('puts the top rung a real climb above a brand-new account', () => {
    // A fresh account is theta 0 by construction (`newLearnerRating`). When the roster was left
    // behind, the master rung read as theta 0.656 — barely past Ridge, the FIRST threshold
    // crossing, which sits at 0.64. The hardest opponent in the game was an opening-week
    // milestone. It is now 2.3 logits up, which is roughly 91% expected score against a newcomer.
    const master = fromDisplayScale(ratings.at(-1)!)
    expect(master).toBeGreaterThan(2)

    // More than a full logit clear of the first threshold crossing, so reaching Ridge is the
    // start of the climb rather than the end of it.
    const ridge = fromDisplayScale(1800)
    expect(master - ridge).toBeGreaterThan(1)
  })

  it('spreads across the altitude bands instead of huddling in one', () => {
    // The bands are the visible ladder (src/lib/design/altitude.ts). A cast that fits in one
    // band cannot show a learner progress no matter how the matchmaker picks.
    const bands = new Set(ratings.map((r) => bandForRating(r).id))
    expect(bands.size).toBeGreaterThanOrEqual(3)

    // Concretely: the bottom rung sits just above a new account in Treeline, and the top rung is
    // above the cloud deck. Named rather than counted, because these are product statements.
    expect(bandForRating(ratings[0]!).name).toBe('Treeline')
    expect(bandForRating(ratings.at(-1)!).name).toBe('Above the Deck')
    expect(ratings[0]!).toBeGreaterThan(DISPLAY_INIT)
  })
})

describe('the seeds derive theta from the same two constants', () => {
  // SQL cannot read elo.ts, so `DISPLAY_INIT` and `DISPLAY_SCALE` are typed into the seeds. Every
  // seeded bot seat's `theta_before` comes out of this expression; if it is left on an old scale
  // the whole pool lands on the wrong rungs while every row still looks plausible.
  //
  // Matched as one expression rather than as two loose numbers, so a file that still divides by
  // the old scale cannot pass on the strength of `1000` appearing somewhere else in it. The
  // optional alias and cast absorb the two shapes in use: `(r.display_rating - 1000)::double
  // precision / 1250.0` in the ja/en pools and `((display_rating - 1000) / 1250.0)::double
  // precision` in the closed-item scorer.
  const conversion = new RegExp(
    `\\(?(?:\\w+\\.)?display_rating - ${DISPLAY_INIT}\\)(?:::double precision)?\\s*/\\s*${DISPLAY_SCALE}\\.0`,
  )

  it.each([
    ['ja', JA_SEED],
    ['en', EN_SEED],
    ['closed', CLOSED_SEED],
  ])('%s seed converts with the current DISPLAY_INIT / DISPLAY_SCALE', (_name, path) => {
    const sql = read(path)
    expect(sql).toMatch(conversion)

    // No stale conversion may survive anywhere in the file, including in prose: the comments are
    // how the next person learns which scale they are on.
    expect(sql).not.toContain('- 900)')
    expect(sql).not.toContain('/ 400.0')
  })

  it('the en seed types its roster ratings, so they are checked against the migration', () => {
    // The ja pool reads `display_rating` from `public.bots`; the en pool types it into three
    // roster CTEs. Typed copies are the hazard this whole file is about, so they are compared to
    // the authored source rather than eyeballed.
    const authored = parseValuesList(read(RATINGS_MIGRATION), 'display_rating')
    const sql = read(EN_SEED)

    const slugs: ReadonlyArray<readonly [string, string]> = [
      ['wren-the-copyist', 'earnest_beginner'],
      ['orrin-the-ferryman', 'casual_peer'],
      ['mira-the-cartographer', 'precise_literary'],
      ['kestrel-the-archivist', 'warm_guide'],
      ['sable-the-lantern-keeper', 'master'],
    ]

    for (const [slug, archetype] of slugs) {
      const typed = [...sql.matchAll(new RegExp(`\\('${slug}',\\s*(\\d+),`, 'g'))].map((m) =>
        Number(m[1]!),
      )
      // Three CTEs, all three agreeing with the rung.
      expect(typed.length).toBeGreaterThanOrEqual(1)
      for (const rating of typed) expect(rating).toBe(authored.get(archetype))
    }
  })
})
