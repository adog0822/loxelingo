/**
 * View-local types for the two match surfaces.
 * docs/design/design-system.md §6.2, §6.3
 *
 * THIS FILE IS DELIBERATELY SMALL. The shapes the screens render come from
 * src/lib/match/api.ts, which is the contract with the match engine. Anything
 * that would restate a field of `PromptPayload` or `VerdictPayload` here would
 * be a second source of truth that drifts on the first schema change, so what
 * remains is only what the contract does not carry:
 *
 *   - the ladder slug list, because route params arrive as strings and have to
 *     be narrowed before `startMatch` will accept them;
 *   - the display names for the three ladders, which are presentation;
 *   - the client-side integrity signals, which are produced in the browser and
 *     travel INTO the submit action rather than out of a payload.
 *
 * `LadderId` is derived from the payload rather than re-declared, so a change
 * to the engine's ladder set is a type error here instead of a silent mismatch.
 */

import type { PromptPayload, VerdictPayload } from "@/lib/match/api";

/* ------------------------------------------------------------------ */
/* Ladders                                                             */
/* ------------------------------------------------------------------ */

/** Mirrors `ladders.slug`, via the contract. Three independently rated skills. */
export type LadderId = PromptPayload["ladder"];

/**
 * The runtime list. `satisfies` keeps it honest: adding a ladder to the engine
 * without adding it here fails to compile, and adding one here that the engine
 * does not know fails too.
 */
export const LADDER_IDS = ["duel", "recall", "forge"] as const satisfies readonly LadderId[];

/** Display names are uppercase in the content tables (DUEL / RECALL / FORGE). */
export const LADDER_NAMES: Readonly<Record<LadderId, string>> = {
  duel: "DUEL",
  recall: "RECALL",
  forge: "FORGE",
};

/**
 * Route params are strings. `startMatch` takes a `LadderId`, so the narrowing
 * has to happen at the route boundary; a bad slug is a 404, not a match.
 */
export function isLadderId(value: string): value is LadderId {
  return (LADDER_IDS as readonly string[]).includes(value);
}

/* ------------------------------------------------------------------ */
/* Verdict presentation                                                */
/* ------------------------------------------------------------------ */

/**
 * Beat 3's 2px bottom rule. `better` is gold, under the answer the judge
 * preferred. `other` is the cool slate, under the one that did not prevail.
 * Null when there is nothing to mark: a draw, a pending result, or a judgment
 * the judge did not agree with itself about.
 *
 * Deliberately not named `yours`. The gold can fall on either panel, because
 * wins and losses render through one component with one layout.
 */
export type VerdictRule = "better" | "other";

/** Why a match reached a terminal state without a rating change. Via the contract. */
export type NoSettleReason = NonNullable<VerdictPayload["noSettleReason"]>;

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
 * The authoritative clock is `matches.started_at` (surfaced to this screen as
 * `PromptPayload.startedAt`) compared against the server's own receipt time
 * inside the settling transaction. Integrity scoring
 * (`submissions.integrity_flags`) must be computed server-side from values the
 * server observed. These client signals may only ever add to a suspicion score.
 * They may never, on their own, void a match, move a rating, or be shown to a
 * user as an accusation.
 */
export interface IntegritySignals {
  readonly elapsedMs: number;
  readonly pasteDetected: boolean;
  readonly keystrokeFeatures: KeystrokeFeatures;
  /** `submissions.client_tz`. IANA zone, for timezone-consistency checks. */
  readonly clientTz: string | null;
}

/**
 * Field names the integrity signals travel under inside the submit action's
 * `FormData`. Named here rather than spelled inline so the composer and any
 * future reader agree without a comment linking them.
 */
export const SUBMIT_FIELDS = {
  content: "content",
  elapsedMs: "elapsedMs",
  pasteDetected: "pasteDetected",
  keystrokeFeatures: "keystrokeFeatures",
  clientTz: "clientTz",
} as const;
