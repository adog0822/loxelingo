import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ATTEMPT_PROMPT_VERSION } from './prompt'
import {
  PRIOR_CONFIRM_SAMPLES,
  PRIOR_WILSON_Z,
  TEACHABLE_MAX_P0,
  wilsonInterval,
} from './prior'

/**
 * The eligibility rule is written twice, once as `TEACHABLE_MAX_P0` plus `ATTEMPT_PROMPT_VERSION`
 * plus `PRIOR_CONFIRM_SAMPLES` here and once as SQL functions in the migration, because Postgres
 * cannot call TypeScript. A one-sided edit gives two different answers to "may this item be
 * taught", and since the point of the rule is to keep dead items off the scored surface, the side
 * that drifts permissive silently reopens the surface to them.
 *
 * This is the fourth guard of its shape in the repository, after display-scale.test.ts,
 * bot-rungs.test.ts and altitude-band-sql.test.ts. All three exist because a value was recorded
 * somewhere that could not see its source. A threshold, a sample bar and a prompt version are
 * exactly that kind of value: the SQL cannot import them, so the test reads the SQL instead.
 */

const MIGRATION = join(process.cwd(), 'supabase/migrations/20260816120000_item_prior.sql')

const sql = (): string => readFileSync(MIGRATION, 'utf8')

/** The `select <literal>;` body of a zero-argument SQL function. */
function constantFunctionBody(name: string): string {
  const source = sql()
  const pattern = new RegExp(
    `create function public\\.${name}\\(\\)[\\s\\S]*?as \\$\\$\\s*select ([^;]+);`,
  )
  const match = source.match(pattern)
  if (!match) throw new Error(`no constant-returning function public.${name}() in the migration`)
  return match[1]!.trim()
}

/** `0.5::double precision` -> 0.5 */
const numeric = (literal: string): number => Number(literal.replace(/::[a-z ]+$/, ''))

describe('the SQL mirrors of the eligibility rule', () => {
  it('attempt_prompt_version() returns ATTEMPT_PROMPT_VERSION', () => {
    // Bumping the prompt in prompt.ts without bumping it here leaves every stored measurement
    // reading as current, which is the failure 07 documents: the same six items measured 0.333,
    // 0.567 and 0.400 across three versions, so a p0 that outlives its prompt is a stale number
    // wearing a current label.
    expect(numeric(constantFunctionBody('attempt_prompt_version'))).toBe(ATTEMPT_PROMPT_VERSION)
  })

  it('teachable_max_p0() returns TEACHABLE_MAX_P0', () => {
    expect(numeric(constantFunctionBody('teachable_max_p0'))).toBe(TEACHABLE_MAX_P0)
  })

  it('prior_confirm_samples() returns PRIOR_CONFIRM_SAMPLES', () => {
    expect(numeric(constantFunctionBody('prior_confirm_samples'))).toBe(PRIOR_CONFIRM_SAMPLES)
  })

  it('carries the same Wilson z as prior.ts, everywhere it appears', () => {
    const source = sql()
    const body = source.slice(
      source.indexOf('create function public.wilson_bound'),
      source.indexOf('comment on function public.wilson_bound'),
    )
    const constants = [...body.matchAll(/1\.\d{6,}/g)].map((m) => Number(m[0]))
    expect(constants.length).toBeGreaterThan(0)
    for (const z of constants) expect(z).toBe(PRIOR_WILSON_Z)
  })
})

describe('is_teachable compares a bound, not a point estimate', () => {
  /** The `as is_teachable` expression in the view, without its surrounding SQL. */
  const expression = (): string => {
    const source = sql()
    const start = source.indexOf('create view public.item_teachability')
    const end = source.indexOf('as is_teachable', start)
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    // The predicate is the parenthesised block immediately before `as is_teachable`, opened on
    // its own line. Anchoring on `\n  (` skips the `()` of the mirror calls inside it.
    return source.slice(source.lastIndexOf('\n  (', end), end)
  }

  it('reads prior_p0_ci_upper rather than prior_p0', () => {
    // The change 07 forces. A five-sample rate does not identify an item, so the rule asks
    // whether the evidence rules out a high prior rather than whether the point estimate is low.
    expect(expression()).toContain('prior_p0_ci_upper < public.teachable_max_p0()')
    expect(expression()).not.toMatch(/prior_p0\s*<\s*public\.teachable_max_p0\(\)/)
  })

  it('compares against teachable_max_p0() rather than a copied number', () => {
    // A literal here would be another home for the threshold, invisible to the mirror assertions
    // above and therefore to any future edit of prior.ts.
    expect(expression()).not.toMatch(/<\s*0?\.\d/)
  })

  it('compares the stored version against attempt_prompt_version() rather than a copied number', () => {
    expect(expression()).toContain('= public.attempt_prompt_version()')
    expect(expression()).not.toMatch(/prior_prompt_version\s*=\s*\d/)
  })

  it('requires a measurement to exist at all', () => {
    // Without this, a row with every prior column null would compare null < 0.5 to null and the
    // view would return null rather than false. Readers that treat null as falsey would agree by
    // accident; readers that do not would serve an unmeasured item.
    expect(expression()).toContain('prior_p0 is not null')
  })

  it('is a view rather than a stored generated column', () => {
    // A stored column is computed at write time, so bumping attempt_prompt_version() would leave
    // every existing row asserting the eligibility it held under the old prompt.
    expect(sql()).not.toMatch(/is_teachable[\s\S]{0,80}generated always as/)
  })

  it('generates the bound it reads from the estimate stored beside it', () => {
    // The one place the bound may be computed. Anything else recomputing it is a second opinion
    // about whether an item is teachable.
    expect(sql()).toMatch(
      /add column prior_p0_ci_upper double precision\s+generated always as \(public\.wilson_bound\(prior_p0, prior_samples, 1\)\) stored/,
    )
  })
})

describe('the evidence bar', () => {
  const constraint = (): string => {
    const source = sql()
    const start =
      source.indexOf('add constraint items_prior_evidence_bar') +
      'add constraint items_prior_evidence_bar'.length
    return source.slice(start, source.indexOf(');', start))
  }

  it('lets a small sample record a rejection but never an acceptance', () => {
    // 0 correct out of 5 has an upper bound of 0.434, comfortably under the line, so without
    // this a single lucky screening draw would admit an item on five samples. That is the exact
    // selection effect the two-stage design exists to exclude.
    expect(wilsonInterval(0, 5).high).toBeLessThan(TEACHABLE_MAX_P0)
    expect(constraint()).toContain('>= public.teachable_max_p0()')
    expect(constraint()).toContain('prior_samples >= public.prior_confirm_samples()')
  })

  it('states the bar in terms of the mirrors rather than copied numbers', () => {
    expect(constraint()).not.toMatch(/>=\s*\d/)
  })
})

describe('the measurement group is atomic', () => {
  const GROUP = [
    'prior_p0',
    'prior_samples',
    'prior_prompt_version',
    'prior_model',
    'prior_measured_at',
  ] as const

  const check = (): string => {
    const source = sql()
    const start =
      source.indexOf('add constraint items_prior_all_or_nothing') +
      'add constraint items_prior_all_or_nothing'.length
    return source.slice(start, source.indexOf('),', start))
  }

  it('names every column of the group, and no others', () => {
    const named = [...check().matchAll(/prior_[a-z0-9_]+/g)].map((m) => m[0])
    expect(named).toEqual([...GROUP])
  })

  it('permits only 0 or all of them to be present', () => {
    expect(check()).toContain(`in (0, ${GROUP.length})`)
  })

  it('leaves the derived Wilson bounds out of the group', () => {
    // They are generated from two members of the group, so including them would make the
    // constraint unsatisfiable on a cleared row.
    expect(check()).not.toContain('prior_p0_ci_lower')
    expect(check()).not.toContain('prior_p0_ci_upper')
  })
})

describe('the Wilson figures the migration asserts at apply time', () => {
  it('agrees with wilsonInterval on 0 correct out of 20', () => {
    // The migration hardcodes this pair in its verification block. It is the case the normal
    // approximation gets wrong, returning [0, 0] and claiming a certainty the sample has not
    // earned, so both sides pinning the same number is the point of the assertion.
    const { low, high } = wilsonInterval(0, PRIOR_CONFIRM_SAMPLES)
    expect(low).toBe(0)
    expect(sql()).toContain(String(high))
  })

  it('agrees on the two cases the rule is calibrated against', () => {
    // 4 of 20 clears the line on the evidence; 9 of 20 does not, even though 0.45 < 0.5. The
    // second is the whole difference between this rule and a point-estimate one.
    expect(wilsonInterval(4, PRIOR_CONFIRM_SAMPLES).high).toBeLessThan(TEACHABLE_MAX_P0)
    expect(wilsonInterval(9, PRIOR_CONFIRM_SAMPLES).high).toBeGreaterThan(TEACHABLE_MAX_P0)
    expect(sql()).toContain('public.wilson_bound(0.20, 20, 1)')
    expect(sql()).toContain('public.wilson_bound(0.45, 20, 1)')
  })
})
