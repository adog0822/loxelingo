/**
 * load — rows in, `Avatar` out.
 *
 * Two halves, kept apart on purpose. `parseAvatarRow` is pure and is where every assumption
 * about the row shape lives; `createAvatarQueries` is the only part that touches a database.
 * Everything downstream of the parse, including `buildAvatarPrompt`, is testable with a plain
 * object.
 *
 * `AVATAR_COLUMNS` OMITS `homage_note`, AND THAT IS THE POINT. That column names the
 * recognizable profile a character was built against. It is granted to `service_role` alone,
 * it never reaches a player, and it must never reach a model: an avatar that can be asked who
 * it is based on will eventually answer. Because `Avatar` has no field for it, no prompt can
 * carry it even if someone later selects it by hand.
 */
import type { createClient as createSupabaseServerClient } from '@/lib/supabase/server';

import { type Avatar, SITUATIONS, type Situation, type VoiceGuide } from './avatar';
import { assertTraitVector, TRAIT_AXES, type TraitVector } from './traits';

/**
 * The same shape `src/lib/match/tasks.ts` calls `SupabaseLike`, redeclared here rather than
 * imported: an avatar is a student and a match is an opponent, and a type import would be the
 * first thread tying the two domains together.
 */
export type SupabaseLike = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Every column an avatar needs, and not one more. See the header on what is missing. */
export const AVATAR_COLUMNS =
  'slug, name, look, hook, warmth, humour, edge, patience, candour, drive, voice_guide, reactions, portrait_path, sort_order';

export class AvatarLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AvatarLoadError';
  }
}

const asRecord = (value: unknown, where: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AvatarLoadError(`${where} is not an object`);
  }
  return value as Record<string, unknown>;
};

const asString = (value: unknown, where: string): string => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AvatarLoadError(`${where} is missing or is not a string`);
  }
  return value;
};

const asStringArray = (value: unknown, where: string): readonly string[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AvatarLoadError(`${where} is missing or is not a non-empty array`);
  }
  return value.map((entry, i) => asString(entry, `${where}[${i}]`));
};

const asInteger = (value: unknown, where: string): number => {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new AvatarLoadError(`${where} is missing or is not a whole number`);
  }
  return value;
};

/**
 * Pure. Throws `AvatarLoadError` on a row the schema should have made impossible, and
 * `AvatarTraitError` on a vector that is off budget.
 *
 * Re-checking constraints the database already enforces is not belt and braces: rows also
 * arrive from fixtures, from tuning scripts and from a future admin surface, and a character
 * whose vector does not sum to the budget is one the cast does not contain.
 */
export function parseAvatarRow(row: unknown): Avatar {
  const r = asRecord(row, 'avatar row');

  const traits = Object.fromEntries(
    TRAIT_AXES.map((axis) => [axis, asInteger(r[axis], `avatars.${axis}`)]),
  ) as unknown as TraitVector;
  assertTraitVector(traits);

  const rawVoice = asRecord(r.voice_guide, 'avatars.voice_guide');
  const voice: VoiceGuide = {
    speaks: asStringArray(rawVoice.speaks, 'avatars.voice_guide.speaks'),
    never: asStringArray(rawVoice.never, 'avatars.voice_guide.never'),
  };

  const rawReactions = asRecord(r.reactions, 'avatars.reactions');
  const reactions = Object.fromEntries(
    SITUATIONS.map((situation) => [
      situation,
      asString(rawReactions[situation], `avatars.reactions.${situation}`),
    ]),
  ) as Record<Situation, string>;

  return {
    slug: asString(r.slug, 'avatars.slug'),
    name: asString(r.name, 'avatars.name'),
    look: asString(r.look, 'avatars.look'),
    hook: asString(r.hook, 'avatars.hook'),
    traits,
    voice,
    reactions,
    portraitPath: typeof r.portrait_path === 'string' ? r.portrait_path : null,
    sortOrder: asInteger(r.sort_order, 'avatars.sort_order'),
  };
}

/** The port. Everything above it is pure; the implementation below is the only I/O. */
export interface AvatarQueries {
  /** The whole cast, in authored order. */
  listAvatars(): Promise<Avatar[]>;
  /** One character, or null when the slug names nobody. */
  getAvatar(slug: string): Promise<Avatar | null>;
}

export function createAvatarQueries(db: SupabaseLike): AvatarQueries {
  return {
    async listAvatars() {
      const { data, error } = await db
        .from('avatars')
        .select(AVATAR_COLUMNS)
        .order('sort_order', { ascending: true });
      if (error) throw new AvatarLoadError(`avatars: ${error.message}`);
      return (data ?? []).map(parseAvatarRow);
    },

    async getAvatar(slug: string) {
      const { data, error } = await db
        .from('avatars')
        .select(AVATAR_COLUMNS)
        .eq('slug', slug)
        .maybeSingle();
      if (error) throw new AvatarLoadError(`avatars(${slug}): ${error.message}`);
      return data ? parseAvatarRow(data) : null;
    },
  };
}
