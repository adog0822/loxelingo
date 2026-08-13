import type { CSSProperties } from "react";

import { cx } from "@/lib/design/cx";
import styles from "./ladder.module.css";

/**
 * The three ladder marks.
 * docs/design/discovery-taste.md §5
 * docs/design/design-system.md §4.3, §7.3, §8.1
 *
 * Drawn, not iconography: no icon font, no emoji, no raster asset, no
 * generated image. Each mark is line work in SVG whose geometry and motion
 * vector belong to one ladder and to no other. Read them in order and the three
 * directions are the whole system:
 *
 *   DUEL    two strokes advancing from opposite edges, crossing off centre. X.
 *   FORGE   a practice grid: a ruled square you can count. Y, quantised.
 *   RECALL  arcs widening from a point on a vertical axis. No vector at all.
 *
 * Stroke only. No fill, no gradient, no glow: in this product glow is
 * atmospheric and has a position, and a mark is not a light source. Colour is
 * `currentColor` throughout, so a mark takes the accent exactly when the
 * control it belongs to becomes actionable, and never on its own.
 *
 * STRUCTURE, and it is load-bearing: entrance transforms live on an outer <g>
 * and hover transforms on an inner one. A filled animation permanently owns the
 * property it animated, so an entrance and a hover written onto the same
 * element would leave the hover silently dead. Nested groups compose instead.
 *
 * Motion is transform and opacity only, runs once, and fills both ways, so
 * under `prefers-reduced-motion` the base-layer override lands every part on
 * its final position. The marks go still. They do not go missing.
 */

const STROKE = 1.5;

export interface LadderMarkProps {
  className?: string;
  /** Milliseconds after the block's own entrance. */
  delay?: number;
}

function markProps(className?: string, viewBox = "0 0 56 56") {
  return {
    viewBox,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: STROKE,
    strokeLinecap: "round" as const,
    "aria-hidden": true,
    focusable: false,
    className: cx(styles.mark, className),
  };
}

/** `--delay` is read by both the entrance keyframe and the hover transition. */
function delayVar(ms: number, fromX?: string): CSSProperties {
  const style: Record<string, string> = { "--delay": `${ms}ms` };
  if (fromX !== undefined) style["--from-x"] = fromX;
  return style as CSSProperties;
}

/**
 * DUEL.
 *
 * Two blades enter from opposite sides and pass through one another at a point
 * that is deliberately off centre, because a confrontation composed on the
 * centreline is a logo. The open circle is the place of contact: the blades
 * slide through it on hover and it holds still, so the mark reads as two masses
 * meeting somewhere fixed rather than as a symmetrical badge.
 *
 * Twice as wide as it is tall, and twice as wide as the other two marks. DUEL
 * owns the wide end of the width axis, and a mark that took the same square as
 * its neighbours would say the opposite of the type does.
 */
export function DuelMark({ className, delay = 0 }: LadderMarkProps) {
  return (
    <svg {...markProps(className, "0 0 112 56")}>
      <g className={styles.enterX} style={delayVar(delay, "-24px")}>
        <g className={cx(styles.duelBlade, styles.duelBladeA)}>
          <path d="M2 12 L110 37" />
        </g>
      </g>
      <g className={styles.enterX} style={delayVar(delay + 60, "24px")}>
        <g className={cx(styles.duelBlade, styles.duelBladeB)}>
          <path d="M110 21 L2 44" />
        </g>
      </g>
      <g className={styles.enterX} style={delayVar(delay + 140, "0px")}>
        <circle cx="74" cy="28.7" r="4.5" />
      </g>
    </svg>
  );
}

/**
 * FORGE.
 *
 * A character-practice grid. Script and form are what this ladder drills, and
 * the ruled square a learner actually writes inside is both the honest picture
 * of that and the one shape on this screen with a countable module. The
 * interior rules seat themselves on the same step the FORGE block's layout
 * uses, staggered 40ms, on a standard curve with no overshoot: machine-like,
 * because the ladder is.
 */
export function ForgeMark({ className, delay = 0 }: LadderMarkProps) {
  const rules = [16, 28, 40];
  return (
    <svg {...markProps(className)}>
      {rules.map((y, index) => (
        <g key={y} className={styles.enterStep} style={delayVar(delay + index * 40)}>
          <g className={styles.forgeRule}>
            <path d={`M4 ${y} H52`} />
          </g>
        </g>
      ))}
      <g className={styles.enterStep} style={delayVar(delay + 120)}>
        <g className={styles.forgeRule}>
          <path d="M28 4 V52" />
        </g>
      </g>
      <g className={styles.enterStep} style={delayVar(delay + 160)}>
        <rect x="4" y="4" width="48" height="48" rx="1" />
      </g>
    </svg>
  );
}

/**
 * RECALL.
 *
 * A vertical axis with four arcs widening away from a single point on it. The
 * axis is the same listening line the RECALL block indents from, so the mark
 * and the layout state one idea at two scales. Nothing here translates, rotates
 * or scales, on entrance or on hover. The only channel is opacity, and it takes
 * 900ms, because nothing on this ladder arrives quickly.
 */
export function RecallMark({ className, delay = 0 }: LadderMarkProps) {
  const arcs = [
    { d: "M14.03 19.08 A12 12 0 0 1 14.03 36.92", at: 0 },
    { d: "M20.72 11.65 A22 22 0 0 1 20.72 44.35", at: 140 },
    { d: "M29.02 5.77 A32 32 0 0 1 29.02 50.23", at: 280 },
    { d: "M39.10 2.14 A42 42 0 0 1 39.10 53.86", at: 420 },
  ];
  return (
    <svg {...markProps(className)}>
      <g className={styles.enterSlow} style={delayVar(delay)}>
        <path d="M6 4 V52" />
        <circle cx="6" cy="28" r="1.6" fill="currentColor" stroke="none" />
      </g>
      {arcs.map((arc) => (
        <g key={arc.d} className={styles.enterSlow} style={delayVar(delay + arc.at)}>
          <g className={styles.recallArc}>
            <path d={arc.d} />
          </g>
        </g>
      ))}
    </svg>
  );
}
