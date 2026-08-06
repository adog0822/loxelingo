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
 * `precedence` makes React block paint until the sheet lands. Inside a world
 * that is the right trade: the display glyphs are the LCP element and the
 * specific face is part of the identity.
 *
 * It is the WRONG trade on a screen that shows several worlds at once — the
 * world-select menu renders all six names, so it mounts every CJK family and
 * blocks first paint on three stylesheets across two CDNs, on the first screen
 * a user ever sees.
 *
 * The justification for blocking does not hold there either. The fallback
 * stacks in worlds.ts are already per-language (Hiragino for ja, Apple SD
 * Gothic Neo for ko, PingFang SC for zh) and `lang` is always set, so a
 * fallback flash shows the RIGHT glyph shapes in a different face — not the
 * wrong shapes. `blocking={false}` therefore costs a font swap, not correctness.
 */
export function WorldFonts({
  world,
  tier = "text",
  blocking = true,
}: {
  world: WorldId;
  tier?: ScriptTier;
  /** Set false where several worlds render at once. See the note above. */
  blocking?: boolean;
}) {
  const source = fontSourceForWorld(world, tier);
  if (source === null || source.href === null) return null;

  return (
    <>
      {CJK_FONT_PRECONNECT_ORIGINS.map((origin) => (
        <link key={origin} rel="preconnect" href={origin} crossOrigin="anonymous" />
      ))}
      {blocking ? (
        <link rel="stylesheet" href={source.href} precedence="loxe-world-fonts" />
      ) : (
        // No `precedence`: React does not hoist or block on it, so the glyphs
        // paint immediately in the per-language fallback and upgrade on arrival.
        <link rel="stylesheet" href={source.href} media="all" />
      )}
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
  /**
   * Whether the world's font sheet blocks first paint. Leave true inside a
   * world. Set false on any screen that renders several worlds at once, where
   * blocking would serialise one stylesheet per world before anything paints.
   */
  blocking?: boolean;
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
  blocking = true,
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
      <WorldFonts world={world} tier={tier} blocking={blocking} />
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
