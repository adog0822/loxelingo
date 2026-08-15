/**
 * The avatar system: five student characters, a trait point system that drives their
 * behaviour, and the prompt construction that turns points into dialogue instructions.
 *
 * An avatar is a STUDENT the player teaches, not an opponent the player beats. Opponents are
 * `public.bots` and `src/lib/match`. See supabase/migrations/20260815100430_avatars.sql and
 * docs/design/avatars.md.
 */
export {
  type Avatar,
  isSituation,
  SITUATION_LABEL,
  SITUATIONS,
  type Situation,
  type VoiceGuide,
} from './avatar';

export {
  AVATAR_COLUMNS,
  AvatarLoadError,
  type AvatarQueries,
  createAvatarQueries,
  parseAvatarRow,
} from './load';

export {
  AvatarPromptError,
  buildAvatarPrompt,
  PROMPT_TABLES,
  type PromptContext,
} from './prompt';

export {
  assertTraitVector,
  AvatarTraitError,
  band,
  type CompositeReading,
  COMPOSITE_READINGS,
  compositeReadings,
  strongestAxis,
  TRAIT_AXES,
  TRAIT_MAX,
  TRAIT_MIN_SILHOUETTE,
  TRAIT_POINT_BUDGET,
  type TraitAxis,
  type TraitBand,
  traitDistance,
  traitMeasure,
  type TraitMeasure,
  traitSpread,
  traitTotal,
  type TraitVector,
  weakestAxis,
} from './traits';
