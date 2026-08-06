import type { CSSProperties } from "react";

import { cx } from "@/lib/design/cx";
import { ScriptText, WorldFontPreload } from "@/components/ui/script-text";
import type { WorldId } from "@/lib/design/worlds";

export interface GlyphPromptProps {
  world: WorldId;
  /** One character. --t-glyph is a special case in the scale for exactly this. */
  glyph: string;
  /** Furigana or pinyin, as native <ruby>. Null when the item has none. */
  reading?: string | null;
  /**
   * Stroke-order overlay: an SVG path in a 1024x1024 box, drawn as a 1px
   * --ink-600 line. Optional, and never synthesised.
   */
  strokeOrderPath?: string | null;
  className?: string;
}

/**
 * GlyphPrompt
 * docs/design/design-system.md §6.2, §7.2
 *
 * The FORGE hero character. Rendered through ScriptText, which is the
 * only sanctioned way to put target-language text on screen: it sets
 * `lang` from the world registry and loads that world's display face and
 * nothing else. `lang="ja"` and `lang="zh-Hans"` select different glyph
 * shapes for the same codepoints, so a hard-coded `lang` here would
 * render Chinese-form kanji to a Japanese learner. That is a correctness
 * bug, not a styling one, which is why ScriptText has no `lang` prop to
 * get wrong.
 *
 * --t-glyph is CJK only. A Latin world's FORGE prompt is morphology
 * rather than script and is presented as a brief instead.
 *
 * This is the LCP element in its view, so the world's display face is
 * preloaded here rather than on the route, which keeps the preload next
 * to the only thing that needs it.
 *
 * Nothing about this component animates. It sits on a timed screen.
 */
export function GlyphPrompt({
  world,
  glyph,
  reading = null,
  strokeOrderPath = null,
  className,
}: GlyphPromptProps) {
  return (
    <div className={cx("relative inline-block", className)}>
      <WorldFontPreload world={world} tier="display" />

      <ScriptText
        world={world}
        tier="display"
        as="div"
        className="t-glyph"
        style={{ color: "var(--text-primary)" } as CSSProperties}
      >
        {reading === null ? (
          glyph
        ) : (
          <ruby>
            {glyph}
            <rt>{reading}</rt>
          </ruby>
        )}
      </ScriptText>

      {strokeOrderPath === null ? null : (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox="0 0 1024 1024"
          preserveAspectRatio="xMidYMid meet"
        >
          <path
            d={strokeOrderPath}
            fill="none"
            stroke="var(--ink-600)"
            strokeWidth={1}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}
