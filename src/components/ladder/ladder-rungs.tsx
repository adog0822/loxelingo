import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { RatingNumeral } from "@/components/ui/rating-numeral";
import { cx } from "@/lib/design/cx";
import type { LadderStanding } from "@/lib/actions/world";
import type { WorldId } from "@/lib/design/worlds";
import { DuelMark, ForgeMark, RecallMark } from "./ladder-marks";
import styles from "./ladder.module.css";

/**
 * The three ladders.
 * docs/design/discovery-taste.md §5, §3.2
 * docs/design/design-system.md §5.4, §7.4, §8.1
 *
 * The previous version of this screen rendered DUEL, RECALL and FORGE from one
 * array through one template: same size, same weight, same right-aligned state,
 * same hairline. Three identical rows tell the player the three are
 * interchangeable. They are not. They measure different things, they carry
 * independent ratings, and a hard week in one is invisible in the other two.
 *
 * So each ladder owns one point on the width axis, one dominant line direction
 * and one motion vector, and none of them may borrow another's:
 *
 *   DUEL    wdth 112 / 600 / -0.02em. No rules at all; structure comes from an
 *           off-axis split with content pushed to opposite outer edges. Motion
 *           on X, the only entrances in the product that come from the side.
 *   FORGE   wdth 100 / 500 / 0. A visible module, strictly centred on one axis,
 *           one column. Motion on Y, quantised to one step, staggered 40ms,
 *           with no overshoot.
 *   RECALL  wdth 88 / 400 / +0.01em. One vertical rule, a wide left margin,
 *           the only loose leading in the product. No motion vector: opacity.
 *
 * Nothing here is a colour, a chip, a badge, a letter mark or an ordinal. If a
 * reader needs a legend, the system failed.
 *
 * ORDER. Not `ladders.display_order` (duel, recall, forge). Read top to bottom
 * the width axis runs 112, 100, 88, so the page itself narrows as it descends
 * and the three postures are legible as one gradient instead of as three
 * unrelated treatments. The order is presentation; the ratings are independent
 * and unordered.
 */

interface LadderCopy {
  readonly name: string;
  readonly lead: string;
  readonly note: string;
}

const DUEL: LadderCopy = {
  name: "DUEL",
  lead: "Open production. Write something better than they wrote.",
  note: "A judge reads both answers for task, accuracy, range and register.",
};

const FORGE: LadderCopy = {
  name: "FORGE",
  lead: "Script and form, against a clock.",
  note: "Closed answers.",
};

const RECALL: LadderCopy = {
  name: "RECALL",
  lead: "Comprehension. The same playback goes to both of you, and the match turns on who understood it sooner.",
  note: "Closed answers.",
};

/** FORGE's module. Three rungs, one per 24px row, countable by eye. */
const FORGE_MODULE = ["Readings", "Inflection", "The small words"] as const;

export interface LadderRungsProps {
  world: WorldId;
  /** This world's Latin name, for the link's accessible name. */
  worldName: string;
  standings: readonly LadderStanding[];
}

export function LadderRungs({ world, worldName, standings }: LadderRungsProps) {
  const by = (id: string) => standings.find((s) => s.ladder === id);
  const duel = by("duel");
  const forge = by("forge");
  const recall = by("recall");
  const anyRated = standings.some((s) => s.rating !== null);

  return (
    <section aria-label="Ladders" className="flex flex-col">
      {/* Section rhythm is per ladder: 32px under DUEL, 24px under FORGE,
          64px under RECALL. Compressed, modular, sparse. */}
      <div className="mb-8 md:mb-8">
        <DuelRung world={world} worldName={worldName} standing={duel} />
      </div>
      <div className="mb-6 md:mb-6">
        <ForgeRung world={world} worldName={worldName} standing={forge} />
      </div>
      <div className="mb-16">
        <RecallRung world={world} worldName={worldName} standing={recall} />
      </div>

      <p
        className="t-body max-w-[58ch]"
        style={{ color: "var(--text-secondary)" }}
      >
        Three numbers, moved separately. A hard run in one leaves the other two
        where they are.
        {anyRated ? null : " Each one starts the first time a rated match settles."}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Shared shell                                                        */
/* ------------------------------------------------------------------ */

function Rung({
  world,
  ladder,
  ladderName,
  worldName,
  className,
  children,
}: {
  world: WorldId;
  ladder: string;
  ladderName: string;
  worldName: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={`/w/${world}/${ladder}`}
      // Descending. The type is what the destination's <RouteTransition> reads
      // to pick a direction; browser back carries no type and falls through to
      // a clean cut, which is why the return trip is a real Link too.
      transitionTypes={["nav-forward"]}
      // The name is not the control: the whole block is. A gold pill on each of
      // three rows would be three primary actions on one screen. What says
      // "pressable" at rest is the threshold in ladder.module.css, and gold
      // deepens on hover and focus.
      aria-label={`${ladderName}, ${worldName}`}
      className={cx(
        styles.rung,
        "block rounded-[var(--r-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--focus-offset)]",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/**
 * The standing, or its absence.
 *
 * An unrated ladder renders no numeral and no badge reading "Unrated". The
 * absence of a number is the state, exactly as it is for an unstarted world:
 * adding a label there would turn an invitation into a gap someone has to
 * explain. Games played appears only once it is a real quantity.
 */
function Standing({
  standing,
  ladderName,
  align = "start",
}: {
  standing: LadderStanding | undefined;
  ladderName: string;
  align?: "start" | "end" | "center";
}) {
  if (standing === undefined) return null;

  // The wrapper does the aligning. RatingNumeral is an inline-flex column with
  // its own internal alignment, so passing it a competing `items-*` class would
  // be two Tailwind utilities fighting over one property and resolving by
  // stylesheet order rather than by intent.
  const alignment =
    align === "end"
      ? "items-end text-right"
      : align === "center"
        ? "items-center text-center"
        : "items-start";

  if (standing.rating === null) {
    if (standing.gamesPlayed === 0) return null;
    return (
      <span className={cx("flex flex-col", alignment)}>
        <span
          className="t-body-sm"
          style={{ color: "var(--text-tertiary)" }}
          data-numeric=""
        >
          {gamesLine(standing.gamesPlayed)}
        </span>
      </span>
    );
  }

  return (
    <span className={cx("flex flex-col gap-1", alignment)}>
      <RatingNumeral value={standing.rating} label={`${ladderName} rating`} />
      <span
        className="t-body-sm"
        style={{ color: "var(--text-tertiary)" }}
        data-numeric=""
      >
        {gamesLine(standing.gamesPlayed)}
      </span>
    </span>
  );
}

function gamesLine(count: number): string {
  return count === 1 ? "1 game" : `${count} games`;
}

/* ------------------------------------------------------------------ */
/* DUEL: two opposed masses, motion on X                               */
/* ------------------------------------------------------------------ */

function DuelRung({
  world,
  worldName,
  standing,
}: {
  world: WorldId;
  worldName: string;
  standing: LadderStanding | undefined;
}) {
  return (
    <Rung world={world} ladder="duel" ladderName={DUEL.name} worldName={worldName}>
      {/* Full width, because DUEL's structure IS the two outer edges.
          PROXIMITY. The mark used to sit in the right-hand mass, which put it
          about 900px from its own heading at 1280 and read as an unrelated
          object rather than as part of the name. It now sits directly under the
          wordmark, sharing its left edge, 8px away. The off-axis split is
          untouched: the left mass is name plus mark, the right mass is the
          brief and the standing, and the two still enter from opposite sides on
          X. This also removes the state where an unrated DUEL had nothing at all
          in its right-hand column. */}
      <div
        className={cx(
          styles.surface,
          styles.sillX,
          styles.duelSurface,
          "-mx-3 grid gap-6 px-3 py-6 md:-mx-4 md:grid-cols-12 md:items-end md:gap-8 md:px-4",
        )}
      >
        <div
          className={cx(styles.enterX, "md:col-span-5")}
          style={{ "--from-x": "-24px", "--delay": "40ms" } as CSSProperties}
        >
          <h2 className={cx(styles.name, styles.duelName, styles.rungName)}>
            {DUEL.name}
          </h2>
          <DuelMark className="mt-2 h-12 w-24 md:h-14 md:w-28" delay={160} />
        </div>

        {/* The right-hand mass starts at a hard interior seam rather than
            being pushed against the outer gutter: right-aligned prose is
            affected and slower to read, and the seam is the stronger half of
            "two opposed masses" anyway. The standing keeps the outer edge. */}
        <div
          className={cx(
            styles.enterX,
            "flex flex-col gap-4 md:col-span-6 md:col-start-7",
          )}
          style={{ "--from-x": "24px", "--delay": "40ms" } as CSSProperties}
        >
          <div>
            <p
              className={cx(styles.duelLead, "text-[1.0625rem]")}
              style={{ color: "var(--ink-800)" }}
            >
              {DUEL.lead}
            </p>
            <p
              className={cx(styles.duelLead, "mt-2 text-[0.875rem]")}
              style={{ color: "var(--text-tertiary)" }}
            >
              {DUEL.note}
            </p>
          </div>
          <div className="md:self-end">
            <Standing standing={standing} ladderName={DUEL.name} align="end" />
          </div>
        </div>
      </div>
    </Rung>
  );
}

/* ------------------------------------------------------------------ */
/* FORGE: one axis, one module, motion on Y                            */
/* ------------------------------------------------------------------ */

function ForgeRung({
  world,
  worldName,
  standing,
}: {
  world: WorldId;
  worldName: string;
  standing: LadderStanding | undefined;
}) {
  return (
    <Rung world={world} ladder="forge" ladderName={FORGE.name} worldName={worldName}>
      {/* The wash hugs the centred column. A full-bleed bar behind centred
          content is a selected list row, which is the one thing this screen
          exists to stop being. */}
      <div
        className={cx(
          styles.surface,
          styles.sillX,
          styles.forgeSurface,
          "mx-auto flex w-fit max-w-full flex-col items-center px-6 py-6 text-center sm:px-10",
        )}
      >
        <span className={styles.enterStep} style={{ "--delay": "40ms" } as CSSProperties}>
          <ForgeMark className="h-14 w-14 md:h-16 md:w-16" delay={80} />
        </span>

        <h2
          className={cx(styles.name, styles.forgeName, styles.rungName, styles.enterStep, "mt-4")}
          style={{ "--delay": "80ms" } as CSSProperties}
        >
          {FORGE.name}
        </h2>

        <p
          className={cx(styles.forgeLead, styles.enterStep, "mt-3 text-[1.0625rem]")}
          style={{ "--delay": "120ms", color: "var(--ink-800)" } as CSSProperties}
        >
          {FORGE.lead}
        </p>

        {/* The module. Hairlines at a fixed 24px rhythm, which is the only
            perceptible baseline grid on this screen and belongs to FORGE
            alone. Not a bordered list: the rules ARE the composition. */}
        <div className={cx(styles.module, "mt-5 w-full max-w-[26ch]")}>
          {FORGE_MODULE.map((item, index) => (
            <div
              key={item}
              className={cx(styles.moduleRow, styles.enterStep, "t-body-sm")}
              style={
                {
                  "--delay": `${160 + index * 40}ms`,
                  color: "var(--text-secondary)",
                } as CSSProperties
              }
            >
              {item}
            </div>
          ))}
        </div>

        <p
          className={cx(styles.enterStep, "mt-4 t-body-sm")}
          style={{ "--delay": "280ms", color: "var(--text-tertiary)" } as CSSProperties}
        >
          {FORGE.note}
        </p>

        <span className={cx(styles.enterStep, "mt-4")} style={{ "--delay": "320ms" } as CSSProperties}>
          <Standing standing={standing} ladderName={FORGE.name} align="center" />
        </span>
      </div>
    </Rung>
  );
}

/* ------------------------------------------------------------------ */
/* RECALL: one vertical rule, wide left margin, opacity only           */
/* ------------------------------------------------------------------ */

function RecallRung({
  world,
  worldName,
  standing,
}: {
  world: WorldId;
  worldName: string;
  standing: LadderStanding | undefined;
}) {
  return (
    <Rung world={world} ladder="recall" ladderName={RECALL.name} worldName={worldName}>
      <div className="md:grid md:grid-cols-12">
        {/* The listening axis: one 1px rule, full height, at the left of the
            content, and a wide left margin before it. A thicker coloured edge
            here would be the side-stripe the system bans outright. */}
        <div
          className={cx(
            styles.axis,
            styles.surface,
            styles.recallSurface,
            "rounded-l-none py-6 pl-6 pr-4 md:col-span-9 md:col-start-4 md:pl-10",
          )}
        >
          <span className={styles.enterSlow} style={{ "--delay": "0ms" } as CSSProperties}>
            <RecallMark className="h-14 w-14 md:h-16 md:w-16" delay={120} />
          </span>

          <h2
            className={cx(styles.name, styles.recallName, styles.rungName, styles.enterSlow, "mt-4")}
            style={{ "--delay": "180ms" } as CSSProperties}
          >
            {RECALL.name}
          </h2>

          <p
            className={cx(styles.recallLead, styles.enterSlow, "mt-4 text-[1.0625rem]")}
            style={{ "--delay": "320ms", color: "var(--ink-800)" } as CSSProperties}
          >
            {RECALL.lead}
          </p>

          <p
            className={cx(styles.enterSlow, "mt-3 t-body-sm")}
            style={{ "--delay": "460ms", color: "var(--text-tertiary)" } as CSSProperties}
          >
            {RECALL.note}
          </p>

          <span
            className={cx(styles.enterSlow, "mt-5 block")}
            style={{ "--delay": "600ms" } as CSSProperties}
          >
            <Standing standing={standing} ladderName={RECALL.name} />
          </span>
        </div>
      </div>
    </Rung>
  );
}
