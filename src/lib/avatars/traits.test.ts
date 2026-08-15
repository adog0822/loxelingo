import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SITUATIONS } from './avatar';
import {
  assertTraitVector,
  AvatarTraitError,
  band,
  compositeReadings,
  strongestAxis,
  TRAIT_AXES,
  TRAIT_MAX,
  TRAIT_MIN_SILHOUETTE,
  TRAIT_POINT_BUDGET,
  type TraitVector,
  traitDistance,
  traitMeasure,
  traitSpread,
  traitTotal,
  weakestAxis,
} from './traits';

/**
 * The point budget is expressed three times: as `TRAIT_POINT_BUDGET` here, as
 * `avatars_trait_budget` in the migration, and implicitly in every authored vector in the
 * seed. Postgres cannot call TypeScript, so the same guard the display scale uses applies
 * here: these tests read the SQL and fail on a one-sided edit.
 */
const MIGRATION = join(process.cwd(), 'supabase/migrations/20260815100430_avatars.sql');
const SEED = join(process.cwd(), 'supabase/seeds/50-avatars.sql');

const readMigration = () => readFileSync(MIGRATION, 'utf8');
const readSeed = () => readFileSync(SEED, 'utf8');

/** Pull the authored cast straight out of the seed: slug, then the six-number line under it. */
function seedCast(): { slug: string; traits: TraitVector }[] {
  const sql = readSeed();
  // Anchored on strings that appear once each: the header discusses `on conflict (slug) do
  // update ... where`, so a looser marker would slice backwards and match nothing.
  const start = sql.indexOf('\nvalues\n');
  const end = sql.indexOf('on conflict (slug) do update set');
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const values = sql.slice(start, end);
  const slugs = [...values.matchAll(/^ {2}\('([a-z0-9-]+)',/gm)].map((m) => m[1]);
  const vectors = [...values.matchAll(/^ {3}(\d+), (\d+), (\d+), (\d+), (\d+), (\d+),$/gm)].map(
    (m) =>
      Object.fromEntries(
        TRAIT_AXES.map((axis, i) => [axis, Number(m[i + 1])]),
      ) as unknown as TraitVector,
  );
  expect(slugs.length).toBe(vectors.length);
  return slugs.map((slug, i) => ({ slug, traits: vectors[i] }));
}

describe('the budget, pinned across TypeScript and SQL', () => {
  it('is 18 of a possible 30, so a character is a set of tradeoffs', () => {
    // Changing this is a product decision, not a refactor: at 30 every avatar maxes every
    // axis and the cast becomes one character. Change the SQL in the same commit.
    expect(TRAIT_POINT_BUDGET).toBe(18);
    expect(TRAIT_AXES.length * TRAIT_MAX).toBe(30);
  });

  it('matches avatars_trait_budget in the migration', () => {
    expect(readMigration()).toContain(
      `${TRAIT_AXES.join(' + ')} = ${TRAIT_POINT_BUDGET}`,
    );
  });

  it('matches avatars_trait_silhouette in the migration', () => {
    expect(readMigration()).toContain(`>= ${TRAIT_MIN_SILHOUETTE}`);
  });

  it('declares the same six axes as the table', () => {
    const sql = readMigration();
    for (const axis of TRAIT_AXES) {
      expect(sql).toContain(`check (${axis}`);
      expect(sql).toContain(`between 0 and ${TRAIT_MAX}`);
    }
  });

  it('closes the reactions key set over exactly the four situations', () => {
    const sql = readMigration();
    for (const situation of SITUATIONS) {
      expect(sql).toContain(`reactions -> '${situation}'`);
    }
    expect(sql).toContain(
      `reactions - ${SITUATIONS.map((s) => `'${s}'`).join(' - ')}`,
    );
  });
});

describe('the authored cast', () => {
  const cast = seedCast();

  it('is five characters', () => {
    expect(cast.map((c) => c.slug)).toEqual(['bram', 'sorrel', 'alder', 'nell', 'vane']);
  });

  it.each(seedCast())('$slug spends the budget and has a silhouette', ({ traits }) => {
    expect(() => assertTraitVector(traits)).not.toThrow();
    expect(traitTotal(traits)).toBe(TRAIT_POINT_BUDGET);
    expect(traitSpread(traits)).toBeGreaterThanOrEqual(TRAIT_MIN_SILHOUETTE);
  });

  it('uses every axis as a discriminator', () => {
    // An axis that never rises above 3 or never falls below 3 across the cast is separating
    // nobody, and the sixth dimension is decoration. Mirrors the assertion in the seed.
    for (const axis of TRAIT_AXES) {
      const values = cast.map((c) => c.traits[axis]);
      expect(Math.max(...values), `${axis} never goes high`).toBeGreaterThanOrEqual(4);
      expect(Math.min(...values), `${axis} never goes low`).toBeLessThanOrEqual(2);
    }
  });

  it('holds no two characters that are variations of each other', () => {
    for (let i = 0; i < cast.length; i++) {
      for (let j = i + 1; j < cast.length; j++) {
        const distance = traitDistance(cast[i].traits, cast[j].traits);
        // Equal sums make the signed differences cancel, so L1 is always even and is twice
        // the number of points that would have to move. 8 means four points move.
        expect(distance % 2, `${cast[i].slug}/${cast[j].slug}`).toBe(0);
        expect(distance, `${cast[i].slug} and ${cast[j].slug}`).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('covers the range the brief asked for: warm, abrasive, level', () => {
    const by = (slug: string) => cast.find((c) => c.slug === slug)!.traits;
    expect(by('nell').warmth).toBeGreaterThanOrEqual(4);
    expect(by('sorrel').edge).toBeGreaterThanOrEqual(4);
    expect(by('alder').patience).toBeGreaterThanOrEqual(4);
    // And the two comic axes really do split: funny-at-nobody against funny-at-you.
    expect(compositeReadings(by('bram'))).toContain('gentleComic');
    expect(compositeReadings(by('sorrel'))).toContain('roasts');
    expect(compositeReadings(by('bram'))).not.toContain('roasts');
  });
});

describe('band', () => {
  it('splits 0-5 into low, mid and high', () => {
    expect([0, 1, 2, 3, 4, 5].map(band)).toEqual([
      'low',
      'low',
      'mid',
      'mid',
      'high',
      'high',
    ]);
  });
});

describe('assertTraitVector', () => {
  const ok: TraitVector = { warmth: 5, humour: 4, edge: 1, patience: 1, candour: 2, drive: 5 };

  it('accepts a vector the database would have accepted', () => {
    expect(() => assertTraitVector(ok)).not.toThrow();
  });

  it('rejects an off-budget vector', () => {
    expect(() => assertTraitVector({ ...ok, drive: 4 })).toThrow(AvatarTraitError);
    expect(() => assertTraitVector({ ...ok, drive: 4 })).toThrow(/spends 17 points/);
  });

  it('rejects the flat build, which sums to 18 and is nobody', () => {
    const flat: TraitVector = {
      warmth: 3,
      humour: 3,
      edge: 3,
      patience: 3,
      candour: 3,
      drive: 3,
    };
    expect(traitTotal(flat)).toBe(TRAIT_POINT_BUDGET);
    expect(() => assertTraitVector(flat)).toThrow(/is nobody/);
  });

  it('rejects points outside 0..5 and non-integers', () => {
    expect(() => assertTraitVector({ ...ok, warmth: 6, drive: 4 })).toThrow(AvatarTraitError);
    expect(() => assertTraitVector({ ...ok, warmth: -1 })).toThrow(AvatarTraitError);
    expect(() => assertTraitVector({ ...ok, warmth: 4.5, drive: 5.5 })).toThrow(AvatarTraitError);
  });
});

describe('silhouette readouts', () => {
  const bram: TraitVector = { warmth: 5, humour: 4, edge: 1, patience: 1, candour: 2, drive: 5 };

  it('names a strongest and a weakest axis, breaking ties in declaration order', () => {
    expect(strongestAxis(bram)).toBe('warmth'); // ties with drive at 5; warmth is declared first
    expect(weakestAxis(bram)).toBe('edge'); // ties with patience at 1
  });

  it('measures distance as points that would have to move', () => {
    expect(traitDistance(bram, bram)).toBe(0);
    expect(
      traitDistance(bram, { warmth: 4, humour: 4, edge: 1, patience: 1, candour: 2, drive: 6 }),
    ).toBe(2);
  });
});

describe('the named traits are regions, not dimensions', () => {
  // The whole argument for a six-axis basis: the traits the brief named are computed, and a
  // character can be near one without being defined by it.
  const sorrel: TraitVector = { warmth: 0, humour: 3, edge: 5, patience: 2, candour: 5, drive: 3 };
  const nell: TraitVector = { warmth: 5, humour: 1, edge: 0, patience: 5, candour: 5, drive: 2 };
  const vane: TraitVector = { warmth: 3, humour: 5, edge: 4, patience: 1, candour: 0, drive: 5 };

  it('computes grumpy from three axes rather than storing it', () => {
    expect(compositeReadings(sorrel)).toContain('grumpy');
    expect(compositeReadings(nell)).not.toContain('grumpy');
  });

  it('separates roasting from being funny', () => {
    // Vane is the funnier of the two and Sorrel is the one aiming it. Both roast; neither is
    // "the funny one", which is the distinction a single humour score cannot hold.
    expect(vane.humour).toBeGreaterThan(sorrel.humour);
    expect(compositeReadings(sorrel)).toContain('roasts');
    expect(compositeReadings(vane)).toContain('roasts');
    expect(compositeReadings(nell)).not.toContain('roasts');
  });

  it('treats impatience as the other end of patience', () => {
    expect(compositeReadings(vane)).toContain('impatient');
    expect(compositeReadings(nell)).not.toContain('impatient');
  });

  it('flags the one reading with a product consequence', () => {
    // candour 0 means the teach-back cannot be trusted. That is a different game, not a tone.
    expect(compositeReadings(vane)).toContain('bluffs');
    expect(compositeReadings(nell)).not.toContain('bluffs');
  });
});

describe('traitMeasure', () => {
  it('derives each number from exactly one axis', () => {
    const m = traitMeasure({
      warmth: 5,
      humour: 4,
      edge: 1,
      patience: 1,
      candour: 2,
      drive: 5,
    });
    expect(m.jokeEveryNTurns).toBe(2); // humour 4
    expect(m.sentenceCeiling).toBe(2); // patience 1, floored at 2
    expect(m.asksForMoreEveryNTurns).toBe(1); // drive 5
  });

  it('reports an absent behaviour as null rather than as a very large number', () => {
    const m = traitMeasure({
      warmth: 5,
      humour: 0,
      edge: 3,
      patience: 5,
      candour: 5,
      drive: 0,
    });
    expect(m.jokeEveryNTurns).toBeNull();
    expect(m.asksForMoreEveryNTurns).toBeNull();
    expect(m.sentenceCeiling).toBe(6); // patience 5
  });
});
