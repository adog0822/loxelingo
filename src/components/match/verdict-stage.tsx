"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * The five beats, at their offsets from the verdict landing.
 * docs/design/design-system.md §6.3
 *
 *   0    0ms   the world exhales (haze normal, ambient motion resumes)
 *   1  400ms   the two answers
 *   2 1100ms   the verdict line
 *   3 1800ms   the diff
 *   4 2500ms   the rating
 *   5 3200ms   the exits
 *
 * Beat 0 has no element of its own: it is the sky, which is simply not
 * frozen on this route. Beats 1 through 5 step 700ms (--dur-beat) apart.
 */
export const BEAT_OFFSETS_MS = [0, 400, 1100, 1800, 2500, 3200] as const;

const LAST_BEAT = BEAT_OFFSETS_MS.length - 1;

/**
 * Highest beat index revealed so far. Defaults to "all", so that a tree
 * rendered without a stage (or by a reader with no JavaScript) shows the
 * whole verdict rather than an empty screen.
 */
const RevealContext = createContext<number>(LAST_BEAT);

/**
 * The sequence is driven by timers rather than by CSS animation delays,
 * because reduced motion must keep the five beats and their offsets and
 * only lose the movement. A `prefers-reduced-motion` rule that collapses
 * animation durations would collapse a CSS-timed sequence into a single
 * instant, which would remove the design's most important function. With
 * timers, the reduced-motion path in src/styles/base.css turns each beat
 * into a 700ms crossfade at the same offset, which is what §4.5 asks for.
 */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export interface VerdictStageProps {
  children: ReactNode;
  className?: string;
}

/**
 * VerdictStage
 *
 * Owns the clock and nothing else. The beats it reveals are ordinary
 * server-rendered content passed through as children, so this client
 * boundary carries timing, not markup.
 *
 * It renders fully revealed on the server and hides the beats in a
 * layout effect, before the first paint. That order matters twice: a
 * reader without JavaScript still gets the entire verdict, and a reader
 * with JavaScript never sees a flash of the finished screen before the
 * sequence starts.
 */
export function VerdictStage({ children, className }: VerdictStageProps) {
  const [revealed, setRevealed] = useState(LAST_BEAT);

  useIsomorphicLayoutEffect(() => {
    setRevealed(-1);
    const timers = BEAT_OFFSETS_MS.map((offset, index) =>
      window.setTimeout(() => {
        setRevealed((current) => (current >= index ? current : index));
      }, offset),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  return (
    <RevealContext.Provider value={revealed}>
      <div className={className}>{children}</div>
    </RevealContext.Provider>
  );
}

export interface BeatProps {
  /** Index into BEAT_OFFSETS_MS. */
  index: number;
  children: ReactNode;
  /**
   * Hold the children out of the tree until the beat lands, then mount
   * them. Only for content that starts something on mount, which in
   * practice is the rating count-up: a RatingNumeral mounted at page
   * load would finish counting behind an invisible element.
   */
  mount?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * One beat. Opacity plus a 16px rise, over --dur-beat.
 *
 * `data-verdict-beat` is the hook the reduced-motion path in base.css
 * uses to keep the fade and drop the movement. Until a beat lands it is
 * `inert`, so an exit button that has not appeared yet cannot be tabbed
 * to or read out.
 */
export function Beat({ index, children, mount = false, className, style }: BeatProps) {
  const revealed = useContext(RevealContext);
  const shown = revealed >= index;

  // Mounted beats need one frame at opacity 0 before they can transition
  // to 1. Starting `true` keeps the server render, and therefore the
  // no-JavaScript render, fully visible.
  const [entered, setEntered] = useState(true);
  useEffect(() => {
    if (!mount) return;
    if (!shown) {
      // Armed for the next reveal. Nothing is visible meanwhile, since
      // `visible` already requires `shown`.
      const timer = window.setTimeout(() => {
        setEntered((current) => (current ? false : current));
      }, 0);
      return () => window.clearTimeout(timer);
    }
    // One frame at opacity 0, then the fade. The timeout is the fallback
    // for a backgrounded tab, where requestAnimationFrame does not run at
    // all: without it the beat would be held until the tab was looked at
    // again, which is a long time to hold a rating.
    const frame = requestAnimationFrame(() => setEntered(true));
    const fallback = window.setTimeout(() => setEntered(true), 60);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(fallback);
    };
  }, [mount, shown]);

  const visible = mount ? shown && entered : shown;

  return (
    <div
      data-verdict-beat={String(index)}
      inert={!visible}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(16px)",
        transition:
          "opacity var(--dur-beat) var(--ease-out-expo), transform var(--dur-beat) var(--ease-out-expo)",
        ...style,
      }}
    >
      {mount && !shown ? null : children}
    </div>
  );
}

export interface DiffRulesProps {
  /** The beat at which the diff marks land. */
  at: number;
  children: ReactNode;
  className?: string;
}

/**
 * DiffRules
 *
 * The diff is beat 3, but the spans it marks live inside beat 1's
 * panels. Rather than re-render the panels, this scope publishes the two
 * rule colours as custom properties when the beat lands. TokenDiff reads
 * them with a transparent fallback and transitions `border-bottom-color`,
 * so the rules fade in under the differing spans and nothing moves.
 */
export function DiffRules({ at, children, className }: DiffRulesProps) {
  const revealed = useContext(RevealContext);
  const shown = revealed >= at;

  return (
    <div
      className={className}
      style={
        shown
          ? ({
              // Gold under the better move, cool slate under yours.
              "--diff-rule-better": "var(--gold-400)",
              "--diff-rule-yours": "var(--verdict-loss)",
            } as CSSProperties)
          : undefined
      }
    >
      {children}
    </div>
  );
}
