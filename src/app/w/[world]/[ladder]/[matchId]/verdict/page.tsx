import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { MixedText } from "@/components/match/mixed-text";
import { VerdictComparison } from "@/components/match/verdict-comparison";
import { VerdictPoll } from "@/components/match/verdict-poll";
import { Beat, VerdictRules, VerdictStage } from "@/components/match/verdict-stage";
import {
  LADDER_NAMES,
  isLadderId,
  type LadderId,
  type NoSettleReason,
} from "@/components/match/types";
import { AltitudeProvider } from "@/components/ui/altitude-provider";
import { Button, buttonClassName } from "@/components/ui/button";
import { RatingNumeral } from "@/components/ui/rating-numeral";
import { ScriptText } from "@/components/ui/script-text";
import { SkyLayer } from "@/components/ui/sky-layer";
import { formatRating } from "@/lib/design/numerals";
import { WORLD_IDS, getWorld, type WorldId } from "@/lib/design/worlds";
import { getPrompt, getVerdict } from "@/lib/actions/match";
import type { VerdictPayload } from "@/lib/match/api";

/**
 * Why nothing moved. Referee voice: what happened, in the present tense, with
 * no apology and no encouragement, and specific enough that the reader knows
 * which of these six things happened rather than that "something" did.
 */
const NO_SETTLE_LINES: Readonly<Record<NoSettleReason, string>> = {
  position_inconsistent:
    "The judge read this pair in both orders and did not agree with itself. That is position bias, not a result, so there is no winner here and no rating moved.",
  opponent_not_submitted:
    "Your opponent did not answer. No rating moves until both answers are in.",
  unrated_match: "This match was unrated. It was judged, and no rating changed.",
  bot_opponent_unrated:
    "This opponent does not move ratings. The judgment stands and no rating changed.",
  already_complete:
    "This match had already settled when the worker reached it. The result stands as first recorded, and nothing was applied to your rating twice.",
  claim_lost:
    "Another worker settled this match first. The result stands as that worker recorded it, and nothing was applied to your rating twice.",
};

/**
 * Beat 4. Bottom right, small, at --t-num. Smaller than the reason, always,
 * because the lesson is the point and the rating is the receipt.
 *
 * Four outcomes, in priority order, and every one of them is stated rather than
 * left as a blank space:
 *
 *   1. The judge disagreed with itself. No winner, no delta, and the reason why.
 *   2. The pipeline recorded a specific reason nothing settled. That reason.
 *   3. A real rating change. The numerals.
 *   4. No change and no reason: ratings are frozen pending judge calibration.
 *
 * The sky does not move here in any of them. Descent is applied silently and
 * reads as arrival on the next world entry, which is why this route renders the
 * altitude from the rating BEFORE settlement.
 */
function RatingOutcome({
  verdict,
  ladder,
}: {
  verdict: VerdictPayload;
  ladder: LadderId;
}) {
  const label = `${LADDER_NAMES[ladder]} rating`;

  if (verdict.positionInconsistent) {
    return (
      <p
        className="t-body-sm max-w-[46ch] text-right"
        style={{ color: "var(--text-secondary)" }}
      >
        {NO_SETTLE_LINES.position_inconsistent}
      </p>
    );
  }

  if (verdict.noSettleReason !== null) {
    return (
      <p
        className="t-body-sm max-w-[46ch] text-right"
        style={{ color: "var(--text-secondary)" }}
      >
        {NO_SETTLE_LINES[verdict.noSettleReason]}
      </p>
    );
  }

  if (verdict.ratingChange !== null) {
    const { before, after } = verdict.ratingChange;
    const delta = after - before;

    return (
      <div className="flex items-baseline gap-2">
        <span data-numeric="" className="t-num" style={{ color: "var(--text-tertiary)" }}>
          {formatRating(before)}
        </span>
        <span aria-hidden="true" style={{ color: "var(--text-tertiary)" }}>
          →
        </span>
        <RatingNumeral
          value={after}
          from={before}
          delta={delta === 0 ? undefined : delta}
          label={label}
        />
      </div>
    );
  }

  // Settled, consistent, and no number moved. Saying nothing here would read as
  // a rating of zero change; saying "no change" would be a measurement we did
  // not take. The true reason is that the ladder is not accepting movement yet.
  return (
    <p
      className="t-body-sm max-w-[46ch] text-right"
      style={{ color: "var(--text-secondary)" }}
    >
      Ratings are frozen while the judge is being calibrated, so this match was
      judged but moved no number.
    </p>
  );
}

/**
 * The verdict. docs/design/design-system.md §6.3
 *
 * The most important screen in the product, and the one you usually see after
 * losing. The job is to make you feel shown, not scolded, and to point your
 * attention at the thing you can own.
 *
 * Wins and losses share one layout, one type scale and one motion sequence.
 * Only the content of the verdict line and the sign of the delta differ. A loss
 * screen that is structurally different from a win screen is a punishment
 * screen.
 *
 * No confetti, no percentage, no star rating, no face, no green for correct and
 * no red for wrong: rose-gold is winning, cool slate is losing, and red in this
 * product means the system is broken.
 *
 * A Server Component. The only client code is the stage, which owns the five
 * beats' clock and nothing else; every panel, sentence and diff inside it is
 * server rendered and passed through as children.
 */
export default async function VerdictPage(
  props: PageProps<"/w/[world]/[ladder]/[matchId]/verdict">,
) {
  const { world: rawWorld, ladder: rawLadder, matchId } = await props.params;
  if (!isWorldId(rawWorld)) notFound();
  if (!isLadderId(rawLadder)) notFound();

  // `getPrompt` is read alongside the verdict for two reasons, both of which
  // need a second fact about the match:
  //
  //   - it separates "not judged yet" from "no such match". A null verdict on
  //     its own is ambiguous, and polling forever on a match id that does not
  //     exist would be a waiting state that is a lie.
  //   - it carries `skyRating`, the max of this world's three ladders, which is
  //     the altitude this screen must render. `ratingChange.before` is one
  //     ladder's rating and would draw a lower sky than the world has earned.
  const [verdict, prompt] = await Promise.all([getVerdict(matchId), getPrompt(matchId)]);

  const world = getWorld(rawWorld);
  const ladderHref = `/w/${rawWorld}/${rawLadder}`;

  /* ---------------------------------------------------------------- */
  /* Not judged yet                                                    */
  /* ---------------------------------------------------------------- */

  if (verdict === null) {
    if (prompt === null) notFound();

    return (
      <AltitudeProvider world={rawWorld} ladderRatings={[prompt.skyRating]} as="main">
        <SkyLayer />
        <div
          className="relative mx-auto flex min-h-dvh w-full max-w-[62ch] flex-col justify-center gap-6 px-6 py-24"
          style={{ zIndex: "var(--z-content)" } as CSSProperties}
        >
          <h1 className="t-display-3" style={{ color: "var(--text-primary)" }}>
            This match has not been judged yet.
          </h1>
          <VerdictPoll>
            <p className="t-body" style={{ color: "var(--text-secondary)" }}>
              Both answers go to the judge together, and the judgment is produced by a
              worker rather than by this page. This screen re-asks every few seconds and
              shows the verdict when it lands. Nothing is expected of you until then.
            </p>
          </VerdictPoll>
          <div className="flex flex-wrap gap-3">
            <Link href={`/w/${rawWorld}`} className={buttonClassName("quiet", "md")}>
              Back to {world.latinName}
            </Link>
          </div>
        </div>
      </AltitudeProvider>
    );
  }

  // A match under a different world or ladder than the path claims is not this
  // page's match. Rendering it would set the wrong `lang` on its content.
  if (verdict.world !== rawWorld || verdict.ladder !== rawLadder) notFound();

  /* ---------------------------------------------------------------- */
  /* The verdict                                                       */
  /* ---------------------------------------------------------------- */

  // Beat 3's marks are suppressed when the judge did not agree with itself.
  // There is no better answer to point at, so nothing is pointed at.
  const marked = !verdict.positionInconsistent;

  const skyRatingBefore = prompt?.skyRating ?? verdict.ratingChange?.before ?? null;

  return (
    <AltitudeProvider
      world={rawWorld}
      // The altitude BEFORE settlement. Never the new one: the sky must not
      // move downward in the moment of loss.
      ladderRatings={[skyRatingBefore]}
      as="main"
    >
      {/* Beat 0, at 0ms. The world exhales: the sky is not frozen here, the
          haze is back to normal and the ambient drift resumes. It is the
          release, and it is the only reason freezing the prompt screen was
          worth doing. */}
      <SkyLayer />

      <VerdictStage className="relative mx-auto flex min-h-dvh w-full max-w-4xl flex-col justify-center gap-10 px-6 py-24">
        {/* Beat 1, 400ms. Both answers, equal weight, equal surface.
            Beat 3, 1800ms, lands the 2px rules inside them. */}
        <Beat index={1}>
          <VerdictRules at={3}>
            <VerdictComparison
              world={rawWorld}
              you={verdict.you}
              opponent={verdict.opponent}
              marked={marked}
            />
          </VerdictRules>
        </Beat>

        {/* Beat 2, 1100ms. The largest type on the screen, and larger than the
            rating delta. This is the product thesis expressed as a type scale.
            Omitted rather than rendered empty when the judge produced no
            sentence: an empty h1 is a hole where the lesson should be. */}
        {verdict.reason.length === 0 ? null : (
          <Beat index={2}>
            <h1 className="t-display-3" style={{ color: "var(--text-primary)" }}>
              <MixedText world={rawWorld} text={verdict.reason} tier="display" />
            </h1>
          </Beat>
        )}

        {/* Beat 4, 2500ms. `mount` holds the numeral out of the tree until the
            beat lands, so the count-up runs here rather than finishing behind
            an invisible element. */}
        <Beat index={4} mount className="flex justify-end">
          <RatingOutcome verdict={verdict} ladder={rawLadder} />
        </Beat>

        {/* Beat 5, 3200ms. Three exits, ranked by usefulness rather than by
            revenge. The primary action is to own the thing you lost to;
            rematch is deliberately last. The pedagogy is encoded in the button
            hierarchy. */}
        <Beat index={5} className="flex flex-wrap items-center gap-3">
          {/* TODO(actions): the Trials write and the Ask thread are not in the
              match contract, so these two are inert. The label below is real
              content from the judgment, not a placeholder. */}
          {verdict.trialsItem === null ? null : (
            <Button variant="primary">
              Add{" "}
              <ScriptText world={rawWorld} tier="text">
                {verdict.trialsItem.label}
              </ScriptText>{" "}
              to Trials
            </Button>
          )}
          <Button variant="ghost">Ask about this</Button>
          <Link href={ladderHref} className={buttonClassName("ghost", "md")}>
            Next match
          </Link>
          <Button variant="quiet">Rematch</Button>
        </Beat>
      </VerdictStage>
    </AltitudeProvider>
  );
}

function isWorldId(value: string): value is WorldId {
  return (WORLD_IDS as readonly string[]).includes(value);
}
