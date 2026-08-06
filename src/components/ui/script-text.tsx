import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from "react";

import { CJK_FONT_PRECONNECT_ORIGINS } from "@/lib/design/font-sources";
import {
  fontSourceForWorld,
  getWorld,
  isCjkWorld,
  type ScriptTier,
  type WorldId,
} from "@/lib/design/worlds";

/**
 * WorldFonts
 * docs/design/design-system.md §3.2, §8.3
 *
 * The per-world lazy CJK loader. The stylesheet for a world is requested
 * only where that world's text is actually rendered, so a user in the
 * Spanish world downloads zero CJK bytes and no user ever downloads all
 * three CJK families. React hoists and de-duplicates these links, so
 * rendering it once per text run costs one request per world per session.
 *
 * `precedence` is set deliberately: React blocks paint until the sheet
 * lands. For CJK that is the correct trade, because a flash of fallback
 * glyphs is a flash of the wrong glyph shapes, not just the wrong font.
 */
export function WorldFonts({
  world,
  tier = "text",
}: {
  world: WorldId;
  tier?: ScriptTier;
}) {
  const source = fontSourceForWorld(world, tier);
  if (source === null || source.href === null) return null;

  return (
    <>
      {CJK_FONT_PRECONNECT_ORIGINS.map((origin) => (
        <link key={origin} rel="preconnect" href={origin} crossOrigin="anonymous" />
      ))}
      <link rel="stylesheet" href={source.href} precedence="loxe-world-fonts" />
    </>
  );
}

/** Preload hook for a world-entry route, where the display face is the LCP element. */
export function WorldFontPreload({
  world,
  tier = "display",
}: {
  world: WorldId;
  tier?: ScriptTier;
}) {
  const source = fontSourceForWorld(world, tier);
  if (source === null || source.href === null) return null;
  return <link rel="preload" as="style" href={source.href} />;
}

type ScriptTextOwnProps = {
  /** The world the text belongs to. `lang` is derived from it. */
  world: WorldId;
  /** Which face. `display` also suppresses `palt`, where full-width spacing is correct. */
  tier?: ScriptTier;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
};

/**
 * `lang` is intentionally absent from the props type. It cannot be passed
 * and it cannot be forgotten.
 */
export type ScriptTextProps = ScriptTextOwnProps &
  Omit<HTMLAttributes<HTMLElement>, "lang" | "className" | "style" | "children">;

/**
 * ScriptText
 * docs/design/design-system.md §3.3
 *
 * The only sanctioned way to render world content. It sets `lang` from
 * the world registry, binds the world's font stack for the tier, and
 * pulls in that world's faces lazily. The `:lang()` rules in
 * src/styles/typography.css then apply the script's line-height, line
 * breaking, punctuation feature and the CJK letter-spacing lock.
 *
 * Latin worlds pay nothing for this: no extra stylesheet, no extra
 * request, just a correct `lang`.
 */
export function ScriptText({
  world,
  tier = "text",
  as,
  className,
  style,
  children,
  ...rest
}: ScriptTextProps) {
  const definition = getWorld(world);
  const Tag = (as ?? "span") as ElementType;

  return (
    <>
      <WorldFonts world={world} tier={tier} />
      <Tag
        {...rest}
        lang={definition.lang}
        data-script-tier={tier}
        data-script={isCjkWorld(world) ? "cjk" : "latn"}
        className={className}
        style={{ fontFamily: definition.fontVar[tier], ...style }}
      >
        {children}
      </Tag>
    </>
  );
}
