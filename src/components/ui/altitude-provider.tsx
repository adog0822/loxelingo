"use client";

import {
  createContext,
  useContext,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  altitudeStateForRating,
  skyAltitudeForWorld,
  type AltitudeState,
} from "@/lib/design/altitude";
import { cx } from "@/lib/design/cx";
import type { WorldId } from "@/lib/design/worlds";

const AltitudeContext = createContext<AltitudeState | null>(null);

export function useAltitude(): AltitudeState {
  const value = useContext(AltitudeContext);
  if (value === null) {
    throw new Error("useAltitude must be used inside an AltitudeProvider.");
  }
  return value;
}

/** Same data, but `null` outside a provider, for optional consumers. */
export function useAltitudeOptional(): AltitudeState | null {
  return useContext(AltitudeContext);
}

export interface AltitudeProviderProps {
  world: WorldId;
  /**
   * A single rating. Use `ladderRatings` instead wherever the three
   * ladders are known: the sky is the world's, not the ladder's.
   */
  rating?: number | null;
  /**
   * DUEL / RECALL / FORGE ratings for this world. The sky renders their
   * MAXIMUM, so tilting in one ladder does not visibly darken the sky.
   */
  ladderRatings?: readonly (number | null | undefined)[];
  /**
   * The world holds its breath. Set during a timed prompt: it stops all
   * ambient motion inside the subtree.
   */
  frozen?: boolean;
  as?: "div" | "main" | "section" | "article";
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * AltitudeProvider
 * docs/design/design-system.md §5
 *
 * Rating becomes the `--altitude` scalar plus a band name, written onto
 * the world root. Everything else in the environment (haze, body size,
 * body position, cloud deck, star opacity, rim light) is a calc() of
 * that one property in src/styles/tokens.css, and `--altitude` is
 * registered with `@property` so the browser interpolates it on the
 * compositor. There is no interpolation loop and no re-render per frame:
 * React renders once per rating change.
 *
 * Descent is never animated in the moment of loss. When the new altitude
 * is lower than the old one the transition is suppressed for that commit,
 * so the loss lands silently and the lower sky reads as arrival on the
 * next world entry.
 */
export function AltitudeProvider({
  world,
  rating = null,
  ladderRatings,
  frozen = false,
  as = "div",
  className,
  style,
  children,
}: AltitudeProviderProps) {
  const state =
    ladderRatings === undefined
      ? altitudeStateForRating(rating)
      : skyAltitudeForWorld(ladderRatings);

  // React's documented "adjust state when a prop changes" pattern. The
  // re-render happens before the browser paints, so the suppression
  // attribute and the new scalar always land in the same commit: a
  // descent can never briefly animate.
  const [seenAltitude, setSeenAltitude] = useState(state.altitude);
  const [descending, setDescending] = useState(false);
  if (seenAltitude !== state.altitude) {
    setDescending(state.altitude < seenAltitude);
    setSeenAltitude(state.altitude);
  }

  const Tag = as;

  return (
    <AltitudeContext.Provider value={state}>
      <Tag
        data-world={world}
        data-band={state.band.id}
        data-frozen={frozen ? "true" : undefined}
        data-descending={descending ? "true" : undefined}
        className={cx("relative", className)}
        style={{ ...state.customProperties, ...style } as CSSProperties}
      >
        {children}
      </Tag>
    </AltitudeContext.Provider>
  );
}
