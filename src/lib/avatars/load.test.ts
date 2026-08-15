import { describe, expect, it } from 'vitest';

import { SITUATIONS } from './avatar';
import { AVATAR_COLUMNS, AvatarLoadError, parseAvatarRow } from './load';
import { AvatarTraitError, TRAIT_AXES } from './traits';

const ROW = {
  slug: 'bram',
  name: 'Bram',
  look: 'Broad through the shoulders, and sitting forward on the stool.',
  hook: 'Say it once and I will use it. Say it twice and I will use it wrong, loudly.',
  warmth: 5,
  humour: 4,
  edge: 1,
  patience: 1,
  candour: 2,
  drive: 5,
  voice_guide: { speaks: ['Short sentences.'], never: ['Never lets a silence sit.'] },
  reactions: {
    taught_well: 'Repeats it back louder than the room needs.',
    taught_badly: 'Uses it anyway, and reports back that it went fine.',
    player_slow: 'Starts guessing out loud to fill the gap.',
    player_quit: 'Asks what happened, then talks about tomorrow.',
  },
  portrait_path: null,
  sort_order: 1,
};

describe('AVATAR_COLUMNS', () => {
  it('selects every field an Avatar has', () => {
    const columns = AVATAR_COLUMNS.split(', ');
    for (const axis of TRAIT_AXES) expect(columns).toContain(axis);
    for (const column of ['slug', 'name', 'look', 'hook', 'voice_guide', 'reactions']) {
      expect(columns).toContain(column);
    }
  });

  it('omits homage_note, which is the enforcement and not an oversight', () => {
    // The one column where a source character may be named. It is granted to service_role
    // alone, and `Avatar` has no field for it, so no prompt can carry it even if a later
    // caller selects it by hand.
    expect(AVATAR_COLUMNS).not.toContain('homage_note');
    expect(Object.keys(parseAvatarRow({ ...ROW, homage_note: 'a source name' }))).not.toContain(
      'homage_note',
    );
  });
});

describe('parseAvatarRow', () => {
  it('reads a row into an Avatar', () => {
    const avatar = parseAvatarRow(ROW);
    expect(avatar.slug).toBe('bram');
    expect(avatar.traits).toEqual({
      warmth: 5,
      humour: 4,
      edge: 1,
      patience: 1,
      candour: 2,
      drive: 5,
    });
    expect(avatar.voice.speaks).toEqual(['Short sentences.']);
    expect(Object.keys(avatar.reactions).sort()).toEqual([...SITUATIONS].sort());
    expect(avatar.portraitPath).toBeNull();
  });

  it('rejects a row missing a situation', () => {
    const { player_quit: _dropped, ...partial } = ROW.reactions;
    expect(() => parseAvatarRow({ ...ROW, reactions: partial })).toThrow(AvatarLoadError);
    expect(() => parseAvatarRow({ ...ROW, reactions: partial })).toThrow(
      /reactions.player_quit/,
    );
  });

  it('rejects a row whose vector is off budget, wherever the row came from', () => {
    // Rows also arrive from fixtures and tuning scripts, where no CHECK constraint applies.
    expect(() => parseAvatarRow({ ...ROW, drive: 4 })).toThrow(AvatarTraitError);
  });

  it('rejects a row with an empty voice guide', () => {
    expect(() => parseAvatarRow({ ...ROW, voice_guide: { speaks: [], never: ['x'] } })).toThrow(
      /voice_guide.speaks/,
    );
  });

  it('rejects a row that is not a row', () => {
    expect(() => parseAvatarRow(null)).toThrow(AvatarLoadError);
    expect(() => parseAvatarRow([ROW])).toThrow(AvatarLoadError);
    expect(() => parseAvatarRow({ ...ROW, slug: 42 })).toThrow(/avatars.slug/);
  });
});
