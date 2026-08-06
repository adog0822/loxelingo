"use client";

import { useEffect, useRef } from "react";

import type { Band } from "@/lib/design/altitude";
import { cx } from "@/lib/design/cx";
import { formatDelta, formatRating, widestNumeral } from "@/lib/design/numerals";

export interface RatingNumeralProps {
  /** The rating, as an authoritative quantity. Never a percentage or a score out of anything. */
  value: number;
  /**
   * Where to count up from. Omit for a static numeral. Only the verdict's
   * beat 4 and the profile hero should ever pass this.
   */
  from?: number;
  /** `hero` for the profile and orrery, `inline` everywhere else. */
  size?: "hero" | "inline";
  /**
   * Signed delta, rendered adjacent: `1 588 +14`. Coloured by sign with
   * the verdict tokens, never green and never red.
   */
  delta?: number;
  /**
   * The band label under the rating. One of exactly two permitted
   * eyebrow-shaped elements in the whole product.
   */
  band?: Band;
  /**
   * True while a match is live. Forces the numeral completely static: no
   * count-up, no transition. The rating must never move during a match,
   * and per §8.3 it should not be on the match screen at all.
   */
  live?: boolean;
  locale?: string;
  /** Accessible name, e.g. "DUEL rating". */
  label?: string;
  className?: string;
}

/**
 * RatingNumeral
 * docs/design/design-system.md §3.5, §7.2
 *
 * Ratings use the DISPLAY face with tabular lining figures, not mono:
 * mono ratings read as terminal output, display ratings read as a score.
 * Authority comes from width, weight and tight tracking.
 *
 * Zero layout shift is structural, not incidental. A hidden sizer holds
 * the widest string the numeral will ever show during this count, so even
 * a 999 to 1 000 transition cannot move anything. The count-up writes
 * `textContent` from a rAF loop: no state, no re-render per frame.
 */
export function RatingNumeral({
  value,
  from,
  size = "inline",
  delta,
  band,
  live = false,
  locale = "en-US",
  label,
  className,
}: RatingNumeralProps) {
  const numeralRef = useRef<HTMLSpanElement>(null);
  const final = formatRating(value, locale);

  useEffect(() => {
    const node = numeralRef.current;
    if (node === null) return;
    if (live || from === undefined || from === value) {
      node.textContent = final;
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // Reduced motion: final value, immediately.
      node.textContent = final;
      return;
    }

    const duration = 700; // --dur-beat
    const start = performance.now();
    let frame = 0;

    // --ease-out-expo, as a scalar.
    const ease = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const current = from + (value - from) * ease(t);
      node.textContent = formatRating(current, locale);
      if (t < 1) {
        frame = requestAnimationFrame(step);
      } else {
        node.textContent = final;
      }
    };

    node.textContent = formatRating(from, locale);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [final, from, live, locale, value]);

  const sizer = widestNumeral(final, from === undefined ? "" : formatRating(from, locale));
  const typeClass = size === "hero" ? "t-num-hero" : "t-num";

  return (
    <span className={cx("inline-flex flex-col items-start", className)}>
      <span className="inline-flex items-baseline gap-2">
        {label === undefined ? null : <span className="sr-only">{label}</span>}
        <span className={cx("inline-grid", typeClass)} data-numeric="">
          {/* Width reservation. Present in the layout, absent from a11y. */}
          <span
            aria-hidden="true"
            className="invisible whitespace-pre"
            style={{ gridArea: "1 / 1" }}
          >
            {sizer}
          </span>
          <span
            ref={numeralRef}
            className="whitespace-pre"
            style={{ gridArea: "1 / 1" }}
            suppressHydrationWarning
          >
            {final}
          </span>
        </span>

        {delta === undefined ? null : (
          <span
            data-numeric=""
            className="t-num"
            style={{
              color: delta < 0 ? "var(--verdict-loss)" : "var(--verdict-win)",
              fontSize: size === "hero" ? "var(--t-title-2)" : "var(--t-body-sm)",
            }}
          >
            {formatDelta(delta, locale)}
          </span>
        )}
      </span>

      {band === undefined ? null : (
        <span className="t-label" style={{ color: "var(--accent-text)" }}>
          {band.name}
        </span>
      )}
    </span>
  );
}
