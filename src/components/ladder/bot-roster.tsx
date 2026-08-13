import type { CSSProperties, ReactNode } from "react";

import { cx } from "@/lib/design/cx";
import { formatRating } from "@/lib/design/numerals";
import type { WorldBot } from "@/lib/actions/world";
import { BotMark } from "./bot-mark";
import styles from "./ladder.module.css";

/**
 * The five you will meet.
 * docs/design/design-system.md §2.3, §8.1, §8.2
 * docs/design/discovery-taste.md §2.1, §2.4, §3.2
 *
 * Named characters with a rating and one authored first-person line each. The
 * line shows the rung and never names it, and a CHECK constraint on the table
 * enforces that, so nothing here has to add a label for the player to read a
 * character. Slug is an identifier and is never rendered.
 *
 * The roster climbs. Position in the list, the brightness of the name, the
 * brightness of the rating and the detail in the mark all rise together, so
 * "who is harder" arrives as a property of the picture rather than as a word.
 * Every step of the brightness ramp stays at or above 4.53:1 on the canvas, so
 * the bottom of the roster is dimmer than the top and still passes AA body
 * contrast: quiet is a design decision, faint is a bug.
 *
 * Dividers are sparse by rule, so there is no hairline between rows. Rhythm and
 * the light do the grouping. Avatars in every row would turn this into a chat
 * list, and per-row borders would turn it into a settings screen.
 */

/**
 * Names, ratings and marks: --ink-700 up to --ink-900.
 *
 * The floor is --ink-700 rather than --ink-650 because these rows do not sit on
 * the canvas. They sit on the stratum, which is one surface lightness step up,
 * and --ink-650 measures 4.53:1 against the canvas but roughly 4.1:1 against
 * this bed. A 18-20px name at weight 500 is not large text under WCAG, so it
 * owes the full 4.5:1. --ink-700 clears it at about 5.7:1.
 */
function primaryInk(index: number, total: number): string {
  const t = total <= 1 ? 100 : Math.round((index / (total - 1)) * 100);
  return `color-mix(in oklab, var(--ink-900) ${t}%, var(--ink-700))`;
}

/** Voice lines: --ink-700 up to --ink-800. A shallower ramp, so prose stays prose. */
function proseInk(index: number, total: number): string {
  const t = total <= 1 ? 100 : Math.round((index / (total - 1)) * 100);
  return `color-mix(in oklab, var(--ink-800) ${t}%, var(--ink-700))`;
}

/**
 * The band the roster sits on.
 *
 * A full-bleed stratum, not a card. It has no left or right boundary, so it
 * reads as a layer of the world with the sky continuing above and below it
 * rather than as a panel pasted onto one. Depth is a single surface lightness
 * step plus a light top edge and a dark bottom one, which is the only shadow
 * substitute that works on a dark canvas.
 */
export function RosterStratum({ children }: { children: ReactNode }) {
  return <div className={cx(styles.stratum, "w-full")}>{children}</div>;
}

export interface BotRosterProps {
  bots: readonly WorldBot[];
  /** Milliseconds before the first row arrives. */
  delay?: number;
}

export function BotRoster({ bots, delay = 0 }: BotRosterProps) {
  if (bots.length === 0) {
    return (
      <p className="t-body" style={{ color: "var(--text-secondary)" }}>
        The cast for this world is still being written, so a match here waits on
        another player having answered the same task.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-9 sm:gap-10">
      {bots.map((bot, index) => (
        <li
          key={bot.slug}
          className={cx(
            styles.botRow,
            "grid grid-cols-[44px_minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-2 sm:grid-cols-[52px_minmax(0,1fr)_auto] sm:gap-x-6",
          )}
          // Stagger is 40ms per item, capped at 8 items. Five rows arriving one
          // after another is the climb happening once, on arrival.
          style={
            {
              "--delay": `${delay + Math.min(index, 8) * 40}ms`,
              color: primaryInk(index, bots.length),
            } as CSSProperties
          }
        >
          <span className="col-start-1 row-span-2 self-start pt-[2px]">
            <BotMark slug={bot.slug} tier={index} className="h-11 w-11 sm:h-12 sm:w-12" />
          </span>

          <span className={cx(styles.botName, "col-start-2 text-[1.125rem] sm:text-[1.25rem]")}>
            {bot.name}
          </span>

          <span
            className={cx(styles.botRating, "col-start-3 text-right text-[1.0625rem]")}
            data-numeric=""
          >
            {formatRating(bot.displayRating)}
          </span>

          <p
            className="col-span-2 col-start-2 text-[0.9375rem] leading-[1.55]"
            style={{
              color: proseInk(index, bots.length),
              maxWidth: "58ch",
            }}
          >
            {bot.selfDescription}
          </p>
        </li>
      ))}
    </ul>
  );
}
