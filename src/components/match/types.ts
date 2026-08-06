/**
 * View models for the two match surfaces.
 * docs/design/design-system.md §6.2, §6.3
 *
 * These are NARROW, LOCAL types: exactly what the prompt screen and the
 * verdict screen render, and nothing else. The database layer is landing
 * separately, so every field here has a `TODO(data)` seam in
 * src/components/match/fixtures.ts that names the column it will come
 * from. When the queries land, the seam is a mapper into these types; the
 * screens do not change.
 *
 * Two deliberate properties of this shape:
 *
 * 1. Every quantity is nullable where the system might not know it yet.
 *    A null rating renders as an absence, never as a placeholder number.
 *    Fabricated precision is on the ban list (§8.1).
 * 2. `sample` travels with the data. The checklist in §10 requires that
 *    every number on screen is a real quantity or a labeled sample, so the
 *    label is a property of the data rather than something a screen
 *    remembers to add.
 */

import type { WorldId } from "@/lib/design/worlds";
import type { MatchStatus, NoSettleReason, ParticipantResult } from "@/lib/match/contract";

/* ------------------------------------------------------------------ */
/* Ladders                                                             */
/* ------------------------------------------------------------------ */

/** Mirrors `ladders.slug`. Three independently rated skills. */
export type LadderId = "duel" | "recall" | "forge";

export const LADDER_IDS = ["duel", "recall", "forge"] as const;

/** Display names are uppercase in the content tables (DUEL / RECALL / FORGE). */
export const LADDER_NAMES: Readonly<Record<LadderId, string>> = {
  duel: "DUEL",
  recall: "RECALL",
  forge: "FORGE",
};

export function isLadderId(value: string): value is LadderId {
  return (LADDER_IDS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* The prompt screen                                                   */
/* ------------------------------------------------------------------ */

/**
 * FORGE: one character, hero size, in the world's display face.
 * `reading` is furigana / pinyin, rendered as native <ruby>.
 */
export interface GlyphTask {
  readonly kind: "glyph";
  readonly glyph: string;
  readonly reading: string | null;
  /** One line, plain, above the glyph. Referee voice, imperative. */
  readonly instruction: string;
  /**
   * Optional stroke-order overlay: an SVG path in a 1024x1024 box,
   * drawn as a 1px --ink-600 line. Null when the content pipeline has
   * no path for this character. Never synthesised.
   */
  readonly strokeOrderPath: string | null;
}

/** DUEL: a brief at --t-body-lg, 62ch. */
export interface BriefTask {
  readonly kind: "brief";
  readonly brief: string;
  readonly instruction: string;
}

/**
 * RECALL: playback only, never a recording (see the schema comment on
 * `submissions.media_path`). The real surface is `WaveformPlayer`
 * (§7.2), which is not one of the two screens in scope here, so this
 * kind renders a still, honest, non-playing state.
 */
export interface PlaybackTask {
  readonly kind: "playback";
  readonly instruction: string;
  readonly replaysAllowed: number;
}

export type PromptTask = GlyphTask | BriefTask | PlaybackTask;

/** What the answer field is, and what the counter counts. */
export interface InputSpec {
  /** Above the field at --t-body-sm. Never placeholder-as-label. */
  readonly label: string;
  readonly multiline: boolean;
  /**
   * The counter renders only when the constraint IS a count (§6.2.4).
   * Words for Latin worlds, characters for CJK, because whitespace
   * segmentation is meaningless in Japanese and Chinese.
   */
  readonly countUnit: "word" | "character" | null;
  readonly countLimit: number | null;
}

export interface PromptView {
  readonly matchId: string;
  readonly world: WorldId;
  readonly ladder: LadderId;
  /**
   * `items.constraint_text`. One of exactly two eyebrow-shaped elements
   * in the entire product, and it earns its place by carrying a rule the
   * user must obey to score. Null when the item has no constraint, in
   * which case nothing is rendered in its place.
   */
  readonly constraint: string | null;
  readonly task: PromptTask;
  readonly input: InputSpec;
  /** `items.time_limit_ms`. */
  readonly timeLimitMs: number;
  /**
   * `matches.started_at`, as epoch milliseconds, issued by the server so
   * that a refresh cannot buy time.
   */
  readonly startedAtEpochMs: number;
  /**
   * The rating the sky renders: the MAX of this world's three ladders.
   * The sky is the world's, not the ladder's. Null for a world with no
   * rating yet, which renders as the Valley Floor rather than as a
   * guess. This never appears as a numeral: there is no rating on the
   * match screen (§8.3).
   */
  readonly skyRating: number | null;
  readonly sample: boolean;
}

/* ------------------------------------------------------------------ */
/* Integrity signals                                                   */
/* ------------------------------------------------------------------ */

/**
 * Coarse typing shape. Deliberately coarse: no key identities, no
 * per-keystroke timeline, nothing that reconstructs what was typed or
 * how a particular person types. Aggregates only.
 *
 * Maps to `submissions.keystroke_features` (jsonb).
 */
export interface KeystrokeFeatures {
  readonly keydowns: number;
  readonly backspaces: number;
  /** First keystroke to submit. Zero when nothing was typed. */
  readonly typingWindowMs: number;
  readonly meanInterKeyMs: number | null;
  readonly longestPauseMs: number;
  /** Pauses over two seconds. A shape, not a timeline. */
  readonly pausesOver2s: number;
  /** Insertions larger than a keystroke can explain. */
  readonly bulkInsertions: number;
  readonly finalLength: number;
}

/**
 * The integrity payload a submission carries.
 *
 * SERVER MUST NEVER TRUST THESE AS AUTHORITATIVE. Every field here is
 * produced by code running on a machine the user controls, so all of it
 * is forgeable: `elapsedMs` can be understated, `pasteDetected` can be
 * suppressed by not using the clipboard event, and the keystroke shape
 * can be synthesised. They are evidence, not measurements.
 *
 * The authoritative clock is `matches.started_at` compared against the
 * server's own receipt time inside the settling transaction. Integrity
 * scoring (`submissions.integrity_flags`) must be computed server-side
 * from values the server observed. These client signals may only ever
 * add to a suspicion score. They may never, on their own, void a match,
 * move a rating, or be shown to a user as an accusation.
 */
export interface IntegritySignals {
  readonly elapsedMs: number;
  readonly pasteDetected: boolean;
  readonly keystrokeFeatures: KeystrokeFeatures;
  /** `submissions.client_tz`. IANA zone, for timezone-consistency checks. */
  readonly clientTz: string | null;
}

/** What the client hands the (not yet built) submit action. */
export interface SubmissionDraft {
  readonly matchId: string;
  readonly content: string;
  readonly integrity: IntegritySignals;
}

/* ------------------------------------------------------------------ */
/* The verdict screen                                                  */
/* ------------------------------------------------------------------ */

/**
 * One token of a real token-level diff. Not a string diff: §6.3 beat 3
 * requires token alignment, and the aligner belongs to the judge layer,
 * not to a rendering component. `text` carries its own trailing
 * whitespace so that CJK (no spaces) and Latin (spaces) share one shape.
 */
export interface DiffToken {
  readonly text: string;
  /** True when this span is part of what separated the two answers. */
  readonly differing: boolean;
}

/**
 * Which 2px bottom rule a differing span gets. `better` is gold, `yours`
 * is the cool slate. Never a strikethrough, never a red squiggle.
 */
export type DiffRole = "better" | "yours";

export interface VerdictAnswer {
  /** Authorship only. `You`, or the opponent's handle. */
  readonly authorLabel: string;
  /** Null when unrated or not loaded. Renders as an absence. */
  readonly rating: number | null;
  /** Bots are always labeled BOT (§8.1). */
  readonly isBot: boolean;
  readonly tokens: readonly DiffToken[];
  readonly diffRole: DiffRole;
}

/**
 * Settled: the judge agreed with itself and the ladder moved (or the
 * match was unrated, which is still a settled result).
 */
export interface SettledOutcome {
  readonly kind: "settled";
  readonly result: Extract<ParticipantResult, "win" | "loss" | "draw">;
  /** Null when this ladder had no rating yet. Never invented. */
  readonly ratingBefore: number | null;
  readonly ratingAfter: number | null;
}

/**
 * No rating moved. `position_inconsistent` is the load-bearing case: the
 * judge read the same pair in both orders and did not agree with itself,
 * so there is no result to report and the UI must not invent a winner.
 */
export interface UnsettledOutcome {
  readonly kind: "unsettled";
  readonly reason: NoSettleReason;
  /** The unchanged rating, so the screen can still show where you stand. */
  readonly rating: number | null;
}

export type VerdictOutcome = SettledOutcome | UnsettledOutcome;

/** The concept the match turned on. The primary action owns this. */
export interface TrialTarget {
  /** Rendered through ScriptText: this is target-language text. */
  readonly label: string;
  /** `concepts.slug`, for the (not yet built) add-to-Trials action. */
  readonly conceptSlug: string;
}

export interface VerdictView {
  readonly matchId: string;
  readonly world: WorldId;
  readonly ladder: LadderId;
  readonly status: MatchStatus;
  /**
   * `judgments.verdict_summary`. One sentence, referee voice, present
   * tense. The largest type on the screen, larger than the rating delta.
   */
  readonly reason: string;
  readonly yours: VerdictAnswer;
  readonly theirs: VerdictAnswer;
  readonly outcome: VerdictOutcome;
  readonly trialTarget: TrialTarget | null;
  /**
   * The rating the sky renders: the MAX of this world's three ladders
   * BEFORE settlement. Deliberately the before value. Descent is silent
   * and deferred to the next world entry, so the verdict's sky must not
   * already be lower.
   */
  readonly skyRatingBefore: number | null;
  readonly sample: boolean;
}
