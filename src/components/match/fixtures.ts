/**
 * FIXTURES. Not data. Not a fallback. Not a seed.
 *
 * The database layer for matches is being written separately, so the two
 * match screens render from this module in order to exist at all. Every
 * export here is illustrative and every consumer of it carries
 * `sample: true`, which the screens surface in words.
 *
 * Numbers here are deliberately round. The design system bans fabricated
 * precision (§8.1), and a rating like `1 412 → 1 398` in a fixture is
 * exactly the kind of number a reader would mistake for a measurement.
 * Ratings below move in tens and are labeled on screen as a sample.
 *
 * TODO(data): delete this module. Each function below names the tables
 * its replacement reads. The screens consume only the view-model types in
 * ./types, so the replacement is a mapper, not a rewrite.
 */

import { isCjkWorld, type WorldId } from "@/lib/design/worlds";
import type { LadderId, PromptView, VerdictView } from "./types";

/** Shown on any surface rendering fixture content. */
export const SAMPLE_NOTICE = "Sample data. These numbers are illustrative, not measurements.";

/**
 * TODO(data): replace with
 *   select m.*, i.prompt, i.constraint_text, i.time_limit_ms
 *   from matches m join items i on i.id = m.item_id
 *   where m.id = $1 and public.is_match_participant(m.id)
 * and project `items.answer` away. `items` is deliberately not readable
 * by clients: the answer is in the row.
 */
export function getPromptFixture(world: WorldId, ladder: LadderId): PromptView {
  const cjk = isCjkWorld(world);

  const base = {
    matchId: "sample-open",
    world,
    ladder,
    // The server issues this. A client-chosen start is a client-chosen
    // time limit.
    startedAtEpochMs: Date.now(),
    // TODO(data): select rating from user_ratings for this user and
    // world across all three ladders, and take the max. Null until then:
    // the same call the world entry route makes, for the same reason.
    // An invented altitude would be an invented standing.
    skyRating: null,
    sample: true,
  } as const;

  if (ladder === "forge") {
    // --t-glyph is CJK only. A Latin world's FORGE prompt is morphology,
    // not script, so it is a brief.
    if (!cjk) {
      return {
        ...base,
        constraint: "IN THE PRETERITE",
        task: {
          kind: "brief",
          brief: "olvidar",
          instruction: "Write the third person singular preterite.",
        },
        input: {
          label: "Your form",
          multiline: false,
          countUnit: null,
          countLimit: null,
        },
        timeLimitMs: 20_000,
      };
    }

    return {
      ...base,
      constraint: "IN て FORM",
      task: {
        kind: "glyph",
        glyph: "忘",
        reading: null,
        instruction: "Write this verb in て form.",
        // Never synthesised. Null until the content pipeline supplies a
        // real path for this character.
        strokeOrderPath: null,
      },
      input: {
        label: "Your form",
        multiline: false,
        countUnit: null,
        countLimit: null,
      },
      timeLimitMs: 20_000,
    };
  }

  if (ladder === "recall") {
    return {
      ...base,
      constraint: null,
      task: {
        kind: "playback",
        instruction: "Answer the question the clip asks.",
        replaysAllowed: 2,
      },
      input: {
        label: "Your answer",
        multiline: false,
        countUnit: null,
        countLimit: null,
      },
      timeLimitMs: 45_000,
    };
  }

  return {
    ...base,
    constraint: cjk ? "UNDER 40 CHARACTERS" : "UNDER 25 WORDS",
    task: {
      kind: "brief",
      brief:
        "A neighbour's package was left at your door for a week before you noticed. Write the note you leave with it.",
      instruction: "Write it the way you would actually write it.",
    },
    input: {
      label: "Your answer",
      multiline: true,
      countUnit: cjk ? "character" : "word",
      countLimit: cjk ? 40 : 25,
    },
    timeLimitMs: 120_000,
  };
}

/**
 * TODO(data): replace with
 *   select j.verdict, j.verdict_summary, j.position_disagreement,
 *          s.content, mp.result, mp.rating_before, mp.rating_after
 *   from judgments j ... where j.match_id = $1 and j.is_current
 * The token alignment behind `DiffToken[]` is the judge layer's job, not
 * a rendering component's: §6.3 beat 3 requires a real token-level diff,
 * and a string diff would mark the wrong spans in CJK.
 *
 * Keyed by match id so every state in the design can be reviewed:
 *   sample-loss     a loss that settled
 *   sample-win      the same layout, won
 *   sample-close    the judge disagreed with itself, nothing moved
 *   sample-waiting  the opponent has not answered
 */
const VERDICT_FIXTURES: Readonly<Record<string, VerdictView>> = {
  "sample-loss": {
    matchId: "sample-loss",
    world: "ja",
    ladder: "duel",
    status: "complete",
    reason:
      "Haruki chose 〜てしまった. You chose 〜た. The regret is the whole point of the sentence.",
    yours: {
      authorLabel: "You",
      rating: 1250,
      isBot: false,
      diffRole: "yours",
      tokens: [
        { text: "彼は", differing: false },
        { text: "宿題を", differing: false },
        { text: "忘れた", differing: true },
        { text: "。", differing: false },
      ],
    },
    theirs: {
      authorLabel: "Haruki",
      rating: 1420,
      isBot: false,
      diffRole: "better",
      tokens: [
        { text: "彼は", differing: false },
        { text: "宿題を", differing: false },
        { text: "忘れてしまった", differing: true },
        { text: "。", differing: false },
      ],
    },
    outcome: {
      kind: "settled",
      result: "loss",
      ratingBefore: 1250,
      ratingAfter: 1240,
    },
    trialTarget: { label: "〜てしまった", conceptSlug: "ja-grammar-te-shimau" },
    skyRatingBefore: 1250,
    sample: true,
  },

  "sample-win": {
    matchId: "sample-win",
    world: "ja",
    ladder: "duel",
    status: "complete",
    reason:
      "You chose 〜てしまった. Haruki chose 〜た. The regret is the whole point of the sentence.",
    yours: {
      authorLabel: "You",
      rating: 1250,
      isBot: false,
      diffRole: "better",
      tokens: [
        { text: "彼は", differing: false },
        { text: "宿題を", differing: false },
        { text: "忘れてしまった", differing: true },
        { text: "。", differing: false },
      ],
    },
    theirs: {
      authorLabel: "Haruki",
      rating: 1420,
      isBot: false,
      diffRole: "yours",
      tokens: [
        { text: "彼は", differing: false },
        { text: "宿題を", differing: false },
        { text: "忘れた", differing: true },
        { text: "。", differing: false },
      ],
    },
    outcome: {
      kind: "settled",
      result: "win",
      ratingBefore: 1250,
      ratingAfter: 1270,
    },
    trialTarget: { label: "〜てしまった", conceptSlug: "ja-grammar-te-shimau" },
    skyRatingBefore: 1250,
    sample: true,
  },

  "sample-close": {
    matchId: "sample-close",
    world: "ja",
    ladder: "duel",
    status: "complete",
    reason:
      "Both answers carry the regret. 〜てしまった states it and 残念ながら frames it, and neither is the better move here.",
    yours: {
      authorLabel: "You",
      rating: 1250,
      isBot: false,
      diffRole: "yours",
      tokens: [
        { text: "彼は", differing: false },
        { text: "宿題を", differing: false },
        { text: "忘れてしまった", differing: false },
        { text: "。", differing: false },
      ],
    },
    theirs: {
      authorLabel: "Haruki",
      rating: 1420,
      isBot: false,
      diffRole: "better",
      tokens: [
        { text: "残念ながら", differing: false },
        { text: "彼は", differing: false },
        { text: "宿題を", differing: false },
        { text: "忘れた", differing: false },
        { text: "。", differing: false },
      ],
    },
    // The judge read the pair in both orders and favoured a different
    // answer each time. That is position bias, not a result.
    outcome: { kind: "unsettled", reason: "position_inconsistent", rating: 1250 },
    trialTarget: { label: "〜てしまった", conceptSlug: "ja-grammar-te-shimau" },
    skyRatingBefore: 1250,
    sample: true,
  },

  "sample-waiting": {
    matchId: "sample-waiting",
    world: "ja",
    ladder: "duel",
    status: "awaiting_opponent",
    reason: "",
    yours: {
      authorLabel: "You",
      rating: 1250,
      isBot: false,
      diffRole: "yours",
      tokens: [
        { text: "彼は", differing: false },
        { text: "宿題を", differing: false },
        { text: "忘れてしまった", differing: false },
        { text: "。", differing: false },
      ],
    },
    theirs: {
      authorLabel: "Haruki",
      rating: 1420,
      isBot: false,
      diffRole: "better",
      tokens: [],
    },
    outcome: { kind: "unsettled", reason: "opponent_not_submitted", rating: 1250 },
    trialTarget: null,
    skyRatingBefore: 1250,
    sample: true,
  },
};

export function getVerdictFixture(matchId: string): VerdictView | null {
  return VERDICT_FIXTURES[matchId] ?? null;
}

export const VERDICT_FIXTURE_IDS = Object.keys(VERDICT_FIXTURES);
