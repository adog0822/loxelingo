import { cx } from "@/lib/design/cx";
import styles from "./ladder.module.css";

/**
 * A bot's mark, drawn from its slug.
 * docs/design/design-system.md §7.2, §8.1
 * docs/design/discovery-taste.md §7.2
 *
 * Portraits do not exist yet (`bots.avatar_path` is nullable and currently
 * unset in every row), so each opponent gets a seal instead: a broken ring
 * whose segment angles and lengths are derived from a hash of the slug. The
 * same character therefore carries the same mark on every render, on every
 * device, forever, which is what makes it recognisable rather than decorative.
 *
 * WHAT THIS DELIBERATELY IS NOT:
 *
 *   - Not a connected-dots constellation. This product has a REAL constellation
 *     that encodes real mastery data. A decorative one anywhere else would
 *     retroactively turn that one into wallpaper.
 *   - Not a progress ring. There is no track behind the segments, the segments
 *     start at scattered angles rather than filling from the top, and a higher
 *     rung reads as busier rather than as fuller. Filled comparison tracks are
 *     banned and this is not one.
 *   - Not an avatar, a face or a mascot. It is a mark on a thing, at distance.
 *
 * Difficulty is legible without a label through two channels at once: the ring
 * gains detail as the rung rises, and the row it sits in is lit one step
 * brighter. More light reaches whoever is further up, which is the same
 * argument the altitude system makes everywhere else in the product.
 */

/** FNV-1a, 32-bit. Small, stable, and identical on server and client. */
function hashSlug(slug: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < slug.length; i += 1) {
    hash ^= slug.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32. One seed in, a repeatable stream of 0..1 out. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CENTER = 20;

/** Two decimals, so the path string is byte-identical across engines. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function polar(radius: number, degrees: number): [number, number] {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [
    round(CENTER + radius * Math.cos(radians)),
    round(CENTER + radius * Math.sin(radians)),
  ];
}

function arcPath(radius: number, startDeg: number, sweepDeg: number): string {
  const [sx, sy] = polar(radius, startDeg);
  const [ex, ey] = polar(radius, startDeg + sweepDeg);
  const large = sweepDeg > 180 ? 1 : 0;
  return `M${sx} ${sy}A${radius} ${radius} 0 ${large} 1 ${ex} ${ey}`;
}

export interface BotMarkProps {
  /** The bot's slug. The only input. Same slug, same mark. */
  slug: string;
  /** Roster position, weakest first. Drives how much detail the seal carries. */
  tier: number;
  className?: string;
}

export function BotMark({ slug, tier, className }: BotMarkProps) {
  const random = seeded(hashSlug(slug));

  // Three at the bottom of the roster, seven at the top. The ring gets busier
  // rather than fuller, so it cannot be read as a bar bent into a circle.
  const count = 3 + Math.max(0, Math.min(4, tier));
  const step = 360 / count;

  const segments: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = i * step + random() * step * 0.4;
    const sweep = step * (0.28 + random() * 0.34);
    segments.push(arcPath(14, start, sweep));
  }

  // The signature: one radial tick that points somewhere only this slug points.
  const tickAngle = random() * 360;
  const [tx1, ty1] = polar(14.5, tickAngle);
  const [tx2, ty2] = polar(18, tickAngle);

  // An inner arc arrives once a character is past the first rung.
  const innerStart = random() * 360;
  const innerSweep = 70 + random() * 130;

  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      aria-hidden="true"
      focusable={false}
      className={cx(styles.botMark, className)}
    >
      <g strokeWidth={1.25}>
        {segments.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <path d={`M${tx1} ${ty1}L${tx2} ${ty2}`} strokeWidth={1.25} />
      {tier > 0 ? (
        <path d={arcPath(7.5, innerStart, innerSweep)} strokeWidth={1} opacity={0.8} />
      ) : null}
      <circle cx={CENTER} cy={CENTER} r={1.1} fill="currentColor" stroke="none" />
    </svg>
  );
}
