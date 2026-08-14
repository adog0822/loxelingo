import type { CSSProperties } from "react";

import { cx } from "@/lib/design/cx";
import { SkyParallax } from "./sky-parallax";

/**
 * Deterministic star field. Seeded at module scope, so server and client
 * render the same sky and there is no hydration mismatch. A user's sky is
 * the same sky every time.
 */
interface Star {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly o: number;
}

function makeStars(count: number, seed: number): readonly Star[] {
  let state = seed;
  const next = () => {
    // Numerical Recipes LCG. Stable across engines.
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  const stars: Star[] = [];
  for (let i = 0; i < count; i += 1) {
    const tier = next();
    stars.push({
      x: Math.round(next() * 10000) / 10,
      // Weighted toward the upper sky: overhead first, per §5.2.
      y: Math.round(next() * next() * 10000) / 10,
      r: tier > 0.93 ? 2.4 : tier > 0.72 ? 1.6 : 0.9,
      o: Math.round((0.45 + next() * 0.55) * 100) / 100,
    });
  }
  return stars;
}

const STARS = makeStars(220, 20260805);

/**
 * Two interleaved sub-fields. Real air scintillates: the whole sky dims and
 * clears together over tens of seconds, because the atmosphere between you and
 * it is moving. Per-star twinkle is the kitsch version of the same observation
 * and is banned outright (§4.4), so the oscillation is applied to two halves of
 * the field in counterphase, at periods that do not divide into each other. The
 * field is never uniformly bright and never visibly pulses.
 */
const STAR_FIELDS: readonly (readonly Star[])[] = [
  STARS.filter((_, index) => index % 2 === 0),
  STARS.filter((_, index) => index % 2 === 1),
];

export interface SkyLayerProps {
  /**
   * The world holds its breath. Also set by AltitudeProvider's `frozen`,
   * which covers the whole subtree; this is the local override.
   */
  frozen?: boolean;
  /** Star field parallax to pointer, 6px maximum. Off when frozen. */
  parallax?: boolean;
  className?: string;
}

/**
 * SkyLayer
 * docs/design/design-system.md §4.3, §4.4, §5, §7.2
 * docs/design/discovery-view-transitions.md §2.5
 *
 * Four layers: sky gradient (CSS), star field (SVG, one paint), celestial
 * body and cloud deck (CSS gradients), haze (two drifting radial
 * gradients). Every quantity is a calc() of the inherited `--altitude`,
 * so this component has no props for altitude and cannot disagree with
 * the provider.
 *
 * AMBIENT MOTION. The world breathes and the instrument does not, so this
 * is the one component in the product that never stops moving. Four
 * independent, slow, incommensurable cycles, all of them `transform` or
 * `opacity`:
 *
 *   haze     drift 34s / 51s, plus a thickness breath at 71s / 89s
 *   stars    counterphase scintillation at 64s / 97s, plus a 143s drift
 *   deck     a 118s lateral drift, half the amplitude of the haze
 *   body     a 97s rise and fall of roughly 0.5% of the viewport
 *
 * The amplitudes are deliberately below the threshold at which you can
 * watch a single element move. The sky is different when you look back at
 * it, and it never performs. Anything faster or larger reads as a
 * screensaver, which is the failure this is written against.
 *
 * Every animated element carries `data-ambient`, which is the single
 * switch: `[data-frozen]` kills all of it for a timed prompt, and the
 * reduced-motion block in base.css kills all of it for good.
 *
 * SCROLL. The star field and the body also answer the scroll position,
 * through a scroll-driven animation timeline rather than a scroll
 * listener, so distant things lag behind near things and the page has
 * depth as you move down it. There is no JS involved and no fallback
 * needed: where `animation-timeline` is unsupported the declaration is
 * dropped and the sky is simply still on that axis.
 *
 * Only `transform` and `opacity` animate. The body's size and position
 * are a scale and a translate, never width/height/top, because those are
 * on the ban list and would also cost layout on every altitude change.
 * The altitude transform and the ambient transform live on separate
 * elements: one element cannot hold two transforms, and an animation
 * would silently take ownership of the inline one.
 *
 * Must be rendered inside an AltitudeProvider (it needs `[data-world]`
 * in an ancestor for the scalar and the world hue).
 */
export function SkyLayer({ frozen = false, parallax = true, className }: SkyLayerProps) {
  return (
    <div
      aria-hidden="true"
      data-sky=""
      data-frozen={frozen ? "true" : undefined}
      className={cx(
        "pointer-events-none absolute inset-0 overflow-hidden",
        className,
      )}
      style={
        {
          zIndex: "var(--z-sky)",
          // The sky is the spatial anchor across a route change: the reader
          // descends into the same sky rather than being handed a new one. A
          // shared name plus `animation: none` on its group in motion.css means
          // it is excluded from the page transition instead of sliding with the
          // content.
          viewTransitionName: "loxe-sky",
        } as CSSProperties
      }
    >
      {/* 1. Sky gradient. Band-gated at the top two bands. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, var(--sky-top) 0%, var(--sky-bottom) 62%, color-mix(in oklab, var(--sky-bottom) 88%, var(--world-deep, var(--ink-050))) 100%)",
        }}
      />

      {/* 2. Star field. Thinning haze is what reveals it; opacity is the
             altitude scalar and there is no per-star idle animation.

             Four nested transforms, because each one answers a different
             thing and a single element can hold only one: altitude gate,
             scroll lag, pointer parallax, ambient drift. */}
      <div className="absolute inset-0" style={{ opacity: "var(--star-op)" }}>
        <div data-ambient="sky-lag-far" className="absolute inset-0">
          <div
            className="absolute inset-0"
            style={{
              transform:
                "translate3d(calc(var(--parallax-x, 0) * 6px), calc(var(--parallax-y, 0) * 6px), 0)",
              transition: "transform var(--dur-fast) var(--ease-out-quint)",
            }}
          >
            <div data-ambient="star-drift" className="absolute inset-0">
              <svg
                className="absolute inset-0 h-full w-full"
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
              >
                {STAR_FIELDS.map((field, fieldIndex) => (
                  <g
                    key={fieldIndex}
                    data-ambient={
                      fieldIndex === 0 ? "star-breathe-a" : "star-breathe-b"
                    }
                    fill="rgb(var(--star-color))"
                  >
                    {field.map((star, index) => (
                      <circle
                        key={index}
                        cx={star.x}
                        cy={star.y}
                        r={star.r}
                        opacity={star.o}
                      />
                    ))}
                  </g>
                ))}
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Celestial body. Square of one viewport height, scaled and
             translated: never resized. */}
      <div data-ambient="sky-lag-near" className="absolute inset-0">
        <div
          className="absolute left-1/2 top-0 aspect-square"
          style={{
            height: "100dvh",
            transform:
              "translate3d(-50%, calc(var(--body-y) - 50%), 0) scale(var(--body-scale))",
            transformOrigin: "50% 50%",
            // Invisible below Ridge, where §5.2 says no body exists yet.
            //
            // The 0.82 ceiling is legibility, not taste. Once a reader is above
            // the cloud deck the body is large enough to sit behind real text,
            // and §8.3's first product-specific trap is making the sky pretty at
            // the cost of reading it. The body is a light source seen through
            // air, so it is never at full strength anyway.
            opacity: "calc(var(--body-op, 1) * 0.82)",
          }}
        >
          <div
            data-ambient="body-drift"
            className="absolute inset-0"
            style={{
              borderRadius: "var(--r-full)",
              // Fallback is --world-deep, not --ink-800. The old light-grey
              // fallback meant any surface without a [data-world] painted a
              // pale disc.
              background:
                "radial-gradient(circle at 50% 42%, var(--world-atmos, var(--world-deep, transparent)) 0%, var(--world-atmos, var(--world-deep, transparent)) 58%, color-mix(in oklab, var(--world-atmos, var(--world-deep, transparent)) 40%, transparent) 74%, transparent 78%)",
            }}
          />
        </div>
      </div>

      {/* 4. Cloud deck. Above you, then at your level, then below. */}
      <div
        className="absolute inset-x-0 top-0"
        style={{
          height: "100dvh",
          transform: "translate3d(0, calc(var(--deck-y) - 50%), 0)",
          opacity: "calc(0.35 + var(--haze) * 0.5)",
        }}
      >
        <div
          data-ambient="deck-drift"
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 42% at 50% 50%, color-mix(in oklab, rgb(var(--haze-color)) 92%, var(--world-deep, transparent)) 0%, transparent 72%)",
          }}
        />
      </div>

      {/* 5. Haze. Loss thickens it. It never breaks, cracks, drains or
             flashes. Two offset layers drift at 34s and 51s, and each one
             breathes on a longer period, so the air is a different
             thickness every time you look at it. */}
      <div className="absolute inset-0" style={{ opacity: "var(--haze)" }}>
        <div
          data-ambient="haze-a"
          className="absolute -inset-[12%]"
          style={{
            background:
              "radial-gradient(70% 52% at 32% 78%, rgb(var(--haze-color) / 0.95) 0%, rgb(var(--haze-color) / 0.35) 58%, transparent 82%)",
          }}
        />
        <div
          data-ambient="haze-b"
          className="absolute -inset-[12%]"
          style={{
            background:
              "radial-gradient(80% 46% at 68% 88%, rgb(var(--haze-color) / 0.85) 0%, rgb(var(--haze-color) / 0.28) 62%, transparent 86%)",
          }}
        />
      </div>

      {/* Rim light: the earned light catching UI edges, appearing for the
          first time at Ridge and directional above The Long Light. */}
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: "var(--rim-line)" }}
      />

      {parallax && !frozen ? <SkyParallax /> : null}
    </div>
  );
}
