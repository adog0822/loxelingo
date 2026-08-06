/**
 * The seam between the match engine and the UI.
 *
 * Everything below the line is pure logic with injectable queries and is fully
 * tested. Everything above it is a React Server Component that needs plain data.
 * This file is the contract between them: the UI imports ONLY these types, and
 * the server actions in `src/lib/actions/match.ts` are the only functions it
 * calls. Screens never touch Supabase, never import an engine module, and never
 * see a database row shape.
 *
 * Why a hard seam: the engine's row types come from the generated
 * `src/lib/db/types.ts`, which changes whenever the schema changes. If screens
 * read rows directly, every migration becomes a UI change.
 */
import type { WorldId } from '@/lib/design/worlds'
import type { LadderId } from '@/lib/judge/rubric'
import type { NoSettleReason, ParticipantResult } from './contract'

/** The task, ready to render. No answer key, ever. */
export interface PromptPayload {
  matchId: string
  world: WorldId
  ladder: LadderId
  /** Human-readable instruction. Always a string (judge-runner requires it). */
  task: string
  /** The constraint line. One of only two eyebrows in the product. */
  constraint: string | null
  /** Large single-glyph prompt for FORGE. Null on other ladders. */
  glyph: string | null
  /** Closed-answer options. Null for open production. */
  options: readonly string[] | null
  input: {
    label: string
    multiline: boolean
    countLimit: number | null
    countUnit: 'character' | 'word' | null
  }
  timeLimitMs: number | null
  /** Server clock at issue. The authoritative start, never the client's. */
  startedAt: string
  /** Max of this world's three ladder ratings, or null when unrated. */
  skyRating: number | null
}

/** One side of a finished match, as the verdict screen renders it. */
export interface VerdictSide {
  /** Display handle, or the bot's character name. Never a raw user id. */
  label: string
  isBot: boolean
  isYou: boolean
  content: string
  result: ParticipantResult
}

export interface VerdictPayload {
  matchId: string
  world: WorldId
  ladder: LadderId
  task: string
  you: VerdictSide
  opponent: VerdictSide
  /** The decisive sentence. Largest type on the screen. */
  reason: string
  /**
   * True when the two orderings disagreed. The screen must then show no winner
   * and no rating change: self-disagreement is position bias, not a result.
   */
  positionInconsistent: boolean
  /** Null when unrated, bypassed, or position-inconsistent. */
  ratingChange: { before: number; after: number } | null
  /** Present when nothing settled, so the UI can explain rather than go blank. */
  noSettleReason: NoSettleReason | null
  /** The concept that decided it, for the "Add to Trials" primary action. */
  trialsItem: { conceptId: string; label: string } | null
}

/** Returned by startMatch when a match cannot be produced. */
export type StartMatchFailure =
  | 'no_session'
  | 'unknown_world'
  | 'unknown_ladder'
  | 'world_not_launched'
  | 'no_items'
  | 'rate_limited'

export type StartMatchResult =
  | { ok: true; matchId: string }
  | { ok: false; reason: StartMatchFailure }

export type SubmitResult =
  | { ok: true; bothSubmitted: boolean }
  | { ok: false; reason: 'not_participant' | 'already_submitted' | 'match_closed' | 'invalid' }
