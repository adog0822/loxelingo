import { describe, expect, it } from 'vitest';

import { type Avatar, SITUATIONS, type Situation } from './avatar';
import { AvatarPromptError, buildAvatarPrompt, PROMPT_TABLES } from './prompt';
import { AvatarTraitError, band, TRAIT_AXES, type TraitVector } from './traits';

const CONTEXT = { language: 'Japanese', topic: 'asking for the bill' } as const;

/** Same authored strings for every fixture, so any difference in output came from the vector. */
const SHARED_TEXT = {
  look: 'A described face, deliberately identical across these fixtures.',
  hook: 'One line that says something about me without saying what kind of thing I am.',
  voice: {
    speaks: ['Short sentences.', 'Present tense.', 'One idea per turn.'],
    never: ['Never quotes anyone.', 'Never uses a title.', 'Never repeats a question.'],
  },
  reactions: {
    taught_well: 'A shared authored stance for the case where the lesson landed cleanly.',
    taught_badly: 'A shared authored stance for the case where the lesson did not land.',
    player_slow: 'A shared authored stance for the case where nothing is arriving.',
    player_quit: 'A shared authored stance for the case where the player walks off.',
  },
} as const;

function fixture(slug: string, traits: TraitVector): Avatar {
  return {
    slug,
    name: slug[0].toUpperCase() + slug.slice(1),
    look: SHARED_TEXT.look,
    hook: SHARED_TEXT.hook,
    traits,
    voice: SHARED_TEXT.voice,
    reactions: SHARED_TEXT.reactions,
    portraitPath: null,
    sortOrder: 1,
  };
}

const BRAM: TraitVector = { warmth: 5, humour: 4, edge: 1, patience: 1, candour: 2, drive: 5 };
const SORREL: TraitVector = { warmth: 0, humour: 3, edge: 5, patience: 2, candour: 5, drive: 3 };
const ALDER: TraitVector = { warmth: 1, humour: 3, edge: 2, patience: 5, candour: 4, drive: 3 };
const NELL: TraitVector = { warmth: 5, humour: 1, edge: 0, patience: 5, candour: 5, drive: 2 };
const VANE: TraitVector = { warmth: 3, humour: 5, edge: 4, patience: 1, candour: 0, drive: 5 };
const CAST = { bram: BRAM, sorrel: SORREL, alder: ALDER, nell: NELL, vane: VANE };

describe('the tables are complete', () => {
  it('authors a line for every axis in every band', () => {
    for (const axis of TRAIT_AXES) {
      for (const b of ['low', 'mid', 'high'] as const) {
        expect(PROMPT_TABLES.BEARING[axis][b].length).toBeGreaterThan(20);
      }
    }
  });

  it('authors a line for every salient axis of every situation, in every band', () => {
    for (const situation of SITUATIONS) {
      const axes = PROMPT_TABLES.SITUATION_AXES[situation];
      expect(axes.length).toBe(3);
      expect(new Set(axes).size).toBe(3);
      for (const axis of axes) {
        const rows = PROMPT_TABLES.SITUATION_BEHAVIOUR[situation][axis];
        expect(rows, `${situation}/${axis}`).toBeDefined();
        if (!rows) continue;
        for (const b of ['low', 'mid', 'high'] as const) {
          expect(rows[b].length).toBeGreaterThan(20);
        }
      }
    }
  });

  it('authors nothing that is never read', () => {
    for (const situation of SITUATIONS) {
      const salient = new Set<string>(PROMPT_TABLES.SITUATION_AXES[situation]);
      for (const axis of Object.keys(PROMPT_TABLES.SITUATION_BEHAVIOUR[situation])) {
        expect(salient.has(axis), `${situation}/${axis} is authored and never used`).toBe(true);
      }
    }
  });
});

describe('buildAvatarPrompt', () => {
  it('is deterministic', () => {
    const a = buildAvatarPrompt(fixture('bram', BRAM), 'taught_badly', CONTEXT);
    const b = buildAvatarPrompt(fixture('bram', BRAM), 'taught_badly', CONTEXT);
    expect(a).toBe(b);
  });

  it('carries the situation the caller asked for and none of the other three', () => {
    for (const situation of SITUATIONS) {
      const prompt = buildAvatarPrompt(fixture('nell', NELL), situation, CONTEXT);
      expect(prompt).toContain(SHARED_TEXT.reactions[situation]);
      for (const other of SITUATIONS.filter((s) => s !== situation)) {
        expect(prompt).not.toContain(SHARED_TEXT.reactions[other]);
      }
    }
  });

  it('states the language and the standing fact that the avatar knows only what it was taught', () => {
    const prompt = buildAvatarPrompt(fixture('alder', ALDER), 'player_slow', CONTEXT);
    expect(prompt).toContain('teaching you Japanese');
    expect(prompt).toContain('you know only what they have managed to teach you');
    expect(prompt).toContain('asking for the bill');
  });

  it('states a number for each measure, and says so plainly when a behaviour is absent', () => {
    // Bram: humour 4, patience 1, drive 5.
    const bram = buildAvatarPrompt(fixture('bram', BRAM), 'taught_well', CONTEXT);
    expect(bram).toContain('once every 2 turns');
    expect(bram).toContain('2 sentences at most');
    expect(bram).toContain('once every 1 turn.');

    const silent = buildAvatarPrompt(
      fixture('silent', { warmth: 5, humour: 0, edge: 3, patience: 5, candour: 5, drive: 0 }),
      'taught_well',
      CONTEXT,
    );
    expect(silent).toContain('Make no jokes.');
    expect(silent).toContain('only when the player offers it');
    expect(silent).toContain('6 sentences at most');
  });

  it('rejects a vector the cast could not contain', () => {
    const off = fixture('off', {
      warmth: 5,
      humour: 4,
      edge: 1,
      patience: 1,
      candour: 2,
      drive: 4,
    });
    expect(() => buildAvatarPrompt(off, 'taught_well', CONTEXT)).toThrow(AvatarTraitError);
  });

  it('rejects an unknown situation and a missing language', () => {
    const bram = fixture('bram', BRAM);
    expect(() => buildAvatarPrompt(bram, 'taught_brilliantly' as Situation, CONTEXT)).toThrow(
      AvatarPromptError,
    );
    expect(() => buildAvatarPrompt(bram, 'taught_well', { language: '  ' })).toThrow(
      AvatarPromptError,
    );
  });
});

describe('the vector is what makes two characters different', () => {
  /**
   * The load-bearing test. Every fixture shares the same look, hook, voice guide and reactions,
   * so if these prompts differ, the difference came from six numbers. Strip the authored
   * strings and the cast is still five people.
   */
  it.each(SITUATIONS)('differs for every pair of the cast in %s', (situation) => {
    const slugs = Object.keys(CAST) as (keyof typeof CAST)[];
    const prompts = new Map(
      slugs.map((slug) => [slug, buildAvatarPrompt(fixture(slug, CAST[slug]), situation, CONTEXT)]),
    );
    for (let i = 0; i < slugs.length; i++) {
      for (let j = i + 1; j < slugs.length; j++) {
        expect(prompts.get(slugs[i]), `${slugs[i]} vs ${slugs[j]}`).not.toBe(
          prompts.get(slugs[j]),
        );
      }
    }
  });

  it('changes the Right now section, not only the header', () => {
    const rightNow = (traits: TraitVector) => {
      const prompt = buildAvatarPrompt(fixture('x', traits), 'taught_badly', CONTEXT);
      return prompt.slice(prompt.indexOf('## Right now'), prompt.indexOf('## Voice'));
    };
    // Nell (candour 5, edge 0, patience 5) and Vane (candour 0, edge 4, patience 1) sit at
    // opposite bands on all three axes this situation reads.
    const nell = rightNow(NELL);
    const vane = rightNow(VANE);
    expect(nell).not.toBe(vane);
    expect(nell).toContain('Say plainly that you did not follow it');
    expect(vane).toContain('Withhold the fact that you missed it');
  });

  it('gives identical derived text to two avatars with the same vector', () => {
    // The other half of the claim: the derived layer reads the vector and nothing else.
    const one = buildAvatarPrompt(fixture('one', ALDER), 'player_quit', CONTEXT);
    const two = buildAvatarPrompt(fixture('two', ALDER), 'player_quit', CONTEXT);
    expect(one.replace('# You are One', '')).toBe(two.replace('# You are Two', ''));
  });

  it('reads bands, so two vectors that differ inside one band say the same thing there', () => {
    const four: TraitVector = { warmth: 4, humour: 4, edge: 1, patience: 1, candour: 3, drive: 5 };
    const five: TraitVector = { warmth: 5, humour: 4, edge: 1, patience: 1, candour: 2, drive: 5 };
    expect(band(four.warmth)).toBe(band(five.warmth));
    const line = PROMPT_TABLES.BEARING.warmth.high;
    expect(buildAvatarPrompt(fixture('a', four), 'taught_well', CONTEXT)).toContain(line);
    expect(buildAvatarPrompt(fixture('a', five), 'taught_well', CONTEXT)).toContain(line);
  });
});

describe('every generated prompt obeys docs/design/copy.md', () => {
  const everyPrompt = (Object.keys(CAST) as (keyof typeof CAST)[]).flatMap((slug) =>
    SITUATIONS.map((situation) => ({
      where: `${slug}/${situation}`,
      text: buildAvatarPrompt(fixture(slug, CAST[slug]), situation, CONTEXT),
    })),
  );

  it.each(everyPrompt)('$where carries no em-dash, en-dash or exclamation mark', ({ text }) => {
    // copy.md §1.1 and §1.5. The instructions themselves have to hold the line, because a
    // model shown an em-dash in its own system prompt will produce one.
    expect(text).not.toMatch(/[—–]/);
    expect(text).not.toContain('!');
    // §1.4. The word appears exactly once, inside the rule that bans it, and nowhere else.
    expect(text.toLowerCase().split('genuinely')).toHaveLength(2);
    expect(
      text.slice(0, text.indexOf('## House rules')).toLowerCase(),
    ).not.toContain('genuinely');
  });

  it.each(everyPrompt)('$where restates the house rules', ({ text }) => {
    expect(text).toContain('## House rules');
    for (const rule of PROMPT_TABLES.HOUSE_RULES) {
      expect(text).toContain(rule);
    }
  });

  it.each(everyPrompt)('$where hands the model no label for its own make-up', ({ where, text }) => {
    // Mirrors avatars_says_no_label. The derived text may describe behaviour at any length;
    // what it may never do is name an axis, because a model handed the word will use it and
    // the player will read a stat block instead of meeting somebody.
    const body = text.slice(text.indexOf('## Bearing'), text.indexOf('## House rules'));
    expect(body, where).not.toMatch(
      /\b(warmth|humour|humor|candour|candor|patience|personality|archetype|trait|grumpy|deadpan)\b/i,
    );
  });
});
