import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { getVerdictFixture, SAMPLE_NOTICE } from "@/components/match/fixtures";
import { MixedText } from "@/components/match/mixed-text";
import { VerdictComparison } from "@/components/match/verdict-comparison";
import { Beat, DiffRules, VerdictStage } from "@/components/match/verdict-stage";
import {
  LADDER_NAMES,
  isLadderId,
  type LadderId,
  type VerdictOutcome,
} from "@/components/match/types";
import { AltitudeProvider } from "@/components/ui/altitude-provider";
import { Button, buttonClassName } from "@/components/ui/button";
import { RatingNumeral } from "@/components/ui/rating-numeral";
import { ScriptText } from "@/components/ui/script-text";
import { SkyLayer } from "@/components/ui/sky-layer";
import { formatRating } from "@/lib/design/numerals";
import { WORLD_IDS, getWorld, type WorldId } from "@/lib/design/worlds";
import type { NoSettleReason } from "@/lib/match/contract";

/**
 * Why nothing moved. Referee voice: what happened, in the present tense,
 * with no apology and no encouragement. `position_inconsistent` is the
 * one that matters: the judge read the same pair in both orders and
 * favoured a different answer each time, which is position bias rather
 * than a result. There is no winner to report, so none is reported.
 */
function noSettleLine(reason: NoSettleReason): string {
  switch (reason) {
    case "position_inconsistent":
      return "The judge read this pair in both orders and did not agree with itself. The match was too close to separate. No rating changed.";
    case "opponent_not_submitted":
      return "No rating moves until both answers are in.";
    case "unrated_match":
      return "This match was unrated. No rating changed.";
    case "bot_opponent_unrated":
      return "This opponent does not move ratings. No rating changed.";
    default:
      return "No rating changed.";
  }
}

/**
 * Beat 4. Bottom right, small, at --t-num. Smaller than the reason,
 * always, because the lesson is the point and the rating is the receipt.
 *
 * The sky does not move here. Descent is applied silently and reads as
 * arrival on the next world entry, which is why this route renders the
 * altitude from the rating BEFORE settlement.
 */
function RatingOutcome({ outcome, ladder }: { outcome: VerdictOutcome; ladder: LadderId }) {
  const label = `${LADDER_NAMES[ladder]} rating`;

  if (outcome.kind === "unsettled") {
    return (
      <div className="flex max-w-[46ch] flex-col items-end gap-2 text-right">
        {outcome.rating === null ? null : (
          <RatingNumeral value={outcome.rating} label={label} />
        )}
        <p className="t-body-sm" style={{ color: "var(--text-secondary)" }}>
          {noSettleLine(outcome.reason)}
        </p>
      </div>
    );
  }

  const { ratingBefore, ratingAfter } = outcome;
  if (ratingBefore === null || ratingAfter === null) {
    return (
      <p className="t-body-sm" style={{ color: "var(--text-secondary)" }}>
        This ladder has no rating yet. Your first matches place you.
      </p>
    );
  }

  const delta = ratingAfter - ratingBefore;

  return (
    <div className="flex items-baseline gap-2">
      <span data-numeric="" className="t-num" style={{ color: "var(--text-tertiary)" }}>
        {formatRating(ratingBefore)}
      </span>
      <span aria-hidden="true" style={{ color: "var(--text-tertiary)" }}>
        →
      </span>
      <RatingNumeral
        value={ratingAfter}
        from={ratingBefore}
        delta={delta === 0 ? undefined : delta}
        label={label}
      />
    </div>
  );
}

/**
 * The verdict. docs/design/design-system.md §6.3
 *
 * The most important screen in the product, and the one you usually see
 * after losing. The job is to make you feel shown, not scolded, and to
 * point your attention at the thing you can own.
 *
 * Wins and losses share one layout, one type scale and one motion
 * sequence. Only the content of the verdict line and the sign of the
 * delta differ. A loss screen that is structurally different from a win
 * screen is a punishment screen.
 *
 * No confetti, no percentage, no star rating, no face, no green for
 * correct and no red for wrong: rose-gold is winning, cool slate is
 * losing, and red in this product means the system is broken.
 *
 * A Server Component. The only client code is the stage, which owns the
 * five beats' clock and nothing else; every panel, sentence and diff
 * inside it is server rendered and passed through as children.
 */
export default async function VerdictPage({
  params,
}: {
  params: Promise<{ world: string; ladder: string; matchId: string }>;
}) {
  const { world: rawWorld, ladder: rawLadder, matchId } = await params;
  if (!isWorldId(rawWorld)) notFound();
  if (!isLadderId(rawLadder)) notFound();

  // TODO(data): replace with the server read of this match, its current
  // judgment and both submissions, authorised by RLS: the opponent's
  // answer is readable only once you have committed your own, and that
  // reveal rule is the schema's, not this screen's.
  const view = getVerdictFixture(matchId);
  if (view === null || view.world !== rawWorld || view.ladder !== rawLadder) notFound();

  const world = getWorld(rawWorld);
  const ladderHref = `/w/${rawWorld}/${rawLadder}`;

  // The opponent has not answered. Not a verdict, so not a sequence.
  if (view.status !== "complete") {
    return (
      <AltitudeProvider
        world={rawWorld}
        ladderRatings={[view.skyRatingBefore]}
        as="main"
      >
        <SkyLayer />
        <div
          className="relative mx-auto flex min-h-dvh w-full max-w-4xl flex-col justify-center gap-8 px-6 py-24"
          style={{ zIndex: "var(--z-content)" } as CSSProperties}
        >
          <h1 className="t-display-3" style={{ color: "var(--text-primary)" }}>
            {view.theirs.authorLabel} has not answered yet.
          </h1>
          <VerdictComparison
            world={rawWorld}
            yours={view.yours}
            theirs={view.theirs}
            emptyLine="No answer yet."
          />
          <p className="t-body" style={{ color: "var(--text-secondary)" }}>
            Your answer is in and it is final. The verdict lands when theirs does.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href={`/w/${rawWorld}`} className={buttonClassName("ghost", "md")}>
              Back to {world.latinName}
            </Link>
          </div>
          {view.sample ? (
            <p className="t-body-sm" style={{ color: "var(--text-tertiary)" }}>
              {SAMPLE_NOTICE}
            </p>
          ) : null}
        </div>
      </AltitudeProvider>
    );
  }

  return (
    <AltitudeProvider
      world={rawWorld}
      // The altitude BEFORE settlement. Never the new one: the sky must
      // not move downward in the moment of loss.
      ladderRatings={[view.skyRatingBefore]}
      as="main"
    >
      {/* Beat 0, at 0ms. The world exhales: the sky is not frozen here,
          the haze is back to normal and the ambient drift resumes. It is
          the release, and it is the only reason freezing the prompt
          screen was worth doing. */}
      <SkyLayer />

      <VerdictStage
        className="relative mx-auto flex min-h-dvh w-full max-w-4xl flex-col justify-center gap-10 px-6 py-24"
      >
        {/* Beat 1, 400ms. Both answers, equal weight, equal surface.
            Beat 3, 1800ms, lands the 2px rules inside them. */}
        <Beat index={1}>
          <DiffRules at={3}>
            <VerdictComparison world={rawWorld} yours={view.yours} theirs={view.theirs} />
          </DiffRules>
        </Beat>

        {/* Beat 2, 1100ms. The largest type on the screen, and larger
            than the rating delta. This is the product thesis expressed
            as a type scale. */}
        <Beat index={2}>
          <h1 className="t-display-3" style={{ color: "var(--text-primary)" }}>
            <MixedText world={rawWorld} text={view.reason} tier="display" />
          </h1>
        </Beat>

        {/* Beat 4, 2500ms. `mount` holds the numeral out of the tree
            until the beat lands, so the count-up runs here rather than
            finishing behind an invisible element. */}
        <Beat index={4} mount className="flex justify-end">
          <RatingOutcome outcome={view.outcome} ladder={rawLadder} />
        </Beat>

        {/* Beat 5, 3200ms. Three exits, ranked by usefulness rather than
            by revenge. The primary action is to own the thing you lost
            to; rematch is deliberately last. The pedagogy is encoded in
            the button hierarchy. */}
        <Beat index={5} className="flex flex-wrap items-center gap-3">
          {/* TODO(data): these are inert until the actions land. Primary
              writes a card into the user's Trials for this concept;
              `Ask about this` opens the Ask thread for the judgment. */}
          {view.trialTarget === null ? null : (
            <Button variant="primary">
              Add{" "}
              <ScriptText world={rawWorld} tier="text">
                {view.trialTarget.label}
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

        {view.sample ? (
          <p className="t-body-sm" style={{ color: "var(--text-tertiary)" }}>
            {SAMPLE_NOTICE}
          </p>
        ) : null}
      </VerdictStage>
    </AltitudeProvider>
  );
}

function isWorldId(value: string): value is WorldId {
  return (WORLD_IDS as readonly string[]).includes(value);
}
