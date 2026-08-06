"use client";

import { useEffect, useRef, type CSSProperties } from "react";

import { cx } from "@/lib/design/cx";
import { formatSeconds } from "@/lib/design/numerals";

/** Remaining fraction at which the bar becomes --signal-warn. */
const WARN_AT = 0.2;

/** Remaining milliseconds at which the static mono numeral appears. */
const NUMERAL_AT_MS = 5000;

export interface MatchTimerProps {
  /** Total time for the prompt. */
  durationMs: number;
  /**
   * `performance.now()`-independent start, as epoch milliseconds. Omit to
   * start on mount. Pass the server's value so a refresh cannot buy time.
   */
  startedAtEpochMs?: number;
  onExpire?: () => void;
  paused?: boolean;
  /** Full viewport width at the very top by default. */
  className?: string;
  label?: string;
}

/**
 * MatchTimer
 * docs/design/design-system.md §4.3, §4.4, §6.2
 *
 * A 2px bar spanning the full viewport width at the very top, depleting
 * left to right. At 20% remaining it becomes --signal-warn. At 5s a mono
 * numeral appears at the right end, statically.
 *
 * Under time pressure nothing moves except the clock, and the clock is
 * one custom property written by one rAF loop. No React state, so no
 * render is ever scheduled by the timer, so nothing else on the screen
 * can move because of it.
 *
 * The numerals never animate: no pulse, no scale, no colour flash. The
 * bar never pulses either. Motion is not the only channel, because the
 * numeral appearing at 5s is a static change of presence.
 */
export function MatchTimer({
  durationMs,
  startedAtEpochMs,
  onExpire,
  paused = false,
  className,
  label = "Time remaining",
}: MatchTimerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const numeralRef = useRef<HTMLSpanElement>(null);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const root = rootRef.current;
    const bar = barRef.current;
    const numeral = numeralRef.current;
    if (root === null || bar === null || numeral === null) return;
    if (paused) return;

    const startedAt = startedAtEpochMs ?? Date.now();
    let frame = 0;
    let phase = "";
    let shownSeconds = -1;
    let expired = false;

    const tick = () => {
      const remainingMs = Math.max(0, durationMs - (Date.now() - startedAt));
      const remaining = durationMs === 0 ? 0 : remainingMs / durationMs;

      // The one property this component writes per frame.
      bar.style.setProperty("--timer-remaining", remaining.toFixed(4));

      // Two discrete attribute writes for the whole match, not per frame.
      const nextPhase = remaining <= WARN_AT ? "warn" : "normal";
      if (nextPhase !== phase) {
        phase = nextPhase;
        root.dataset.timerPhase = nextPhase;
      }

      if (remainingMs <= NUMERAL_AT_MS) {
        const seconds = Math.ceil(remainingMs / 1000);
        if (seconds !== shownSeconds) {
          shownSeconds = seconds;
          numeral.textContent = formatSeconds(remainingMs);
          numeral.removeAttribute("hidden");
        }
      }

      if (remainingMs <= 0) {
        if (!expired) {
          expired = true;
          onExpireRef.current?.();
        }
        return;
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, paused, startedAtEpochMs]);

  return (
    <div
      ref={rootRef}
      role="timer"
      aria-label={label}
      data-timer-phase="normal"
      className={cx("pointer-events-none fixed inset-x-0 top-0", className)}
      style={{ height: "2px", zIndex: "var(--z-hud)" } as CSSProperties}
    >
      <div
        ref={barRef}
        aria-hidden="true"
        className="h-full w-full origin-left"
        style={
          {
            "--timer-remaining": 1,
            transform: "scaleX(var(--timer-remaining))",
            // The bar depletes. It does not pulse, and it does not
            // transition: a transition would lag the true clock.
            transition: "none",
            // Phase colour comes from an inherited property so the
            // stylesheet owns the threshold, not this inline style.
            background: "var(--timer-color, var(--accent))",
            willChange: "transform",
          } as CSSProperties
        }
      />
      {/* Static mono numeral, right-aligned under the bar's end. */}
      <span
        ref={numeralRef}
        hidden
        data-numeric=""
        className="t-mono absolute right-3 top-2 block"
        style={{
          color: "var(--text-tertiary)",
          animation: "none",
          transition: "none",
        }}
      />
    </div>
  );
}
