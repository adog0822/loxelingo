/**
 * avatar — the shape of a character, and the four situations it has to answer for.
 *
 * An avatar is a STUDENT. The player learns by teaching it, so it starts knowing exactly what
 * the player knows, usually nothing, and what it can do is the record of what the player could
 * explain. This is not `src/lib/match` territory: a `bot` is an OPPONENT with a fixed rung on
 * the ladder, and the two are separate tables for the same reason they are separate modules.
 *
 * WHAT IS DELIBERATELY ABSENT. `public.avatars.homage_note` names the recognizable profile a
 * character was built against, and it has no field here. That is the enforcement, not an
 * oversight: `buildAvatarPrompt` takes an `Avatar`, so a source name cannot reach a prompt by
 * anyone forgetting to strip it. The column is granted to `service_role` alone and the loader
 * never selects it.
 *
 * Pure types. No I/O.
 */
import type { TraitVector } from './traits';

/**
 * The four corners of the teaching loop.
 *
 * These are the moments where a character is either real or decoration, which is why every
 * avatar has to answer all four and why the key set is closed by
 * `avatars_reactions_cover_every_situation`. A fifth situation is a migration and five new
 * authored answers, on purpose: adding one cheaply ships a cast that goes quiet somewhere the
 * player will find.
 */
export const SITUATIONS = [
  'taught_well',
  'taught_badly',
  'player_slow',
  'player_quit',
] as const;

export type Situation = (typeof SITUATIONS)[number];

/** What the player sees happening, in their own terms. Used as a prompt heading. */
export const SITUATION_LABEL: Readonly<Record<Situation, string>> = {
  taught_well: 'the player just explained something and you have it',
  taught_badly: 'the player just explained something and you do not have it',
  player_slow: 'the player has gone quiet and time is passing',
  player_quit: 'the player is leaving in the middle of the lesson',
};

/**
 * How a character speaks, and what it refuses to say.
 *
 * Off the trait point budget on purpose: cadence does not compete with personality, it carries
 * it, and putting register on the budget would tax a character for having a voice. `never` is
 * the load-bearing half. A voice is defined by its refusals.
 */
export interface VoiceGuide {
  readonly speaks: readonly string[];
  readonly never: readonly string[];
}

/** One character, as prompt construction sees it. */
export interface Avatar {
  readonly slug: string;
  readonly name: string;
  /** The look, in words. There is no art, and a described face cannot resemble a source's. */
  readonly look: string;
  /** One first-person line that shows the character and never labels it. */
  readonly hook: string;
  readonly traits: TraitVector;
  readonly voice: VoiceGuide;
  /** One authored stance per situation. */
  readonly reactions: Readonly<Record<Situation, string>>;
  readonly portraitPath: string | null;
  readonly sortOrder: number;
}

export function isSituation(value: unknown): value is Situation {
  return typeof value === 'string' && (SITUATIONS as readonly string[]).includes(value);
}
