import { Fragment, type ReactNode } from "react";

import { ScriptText } from "@/components/ui/script-text";
import type { ScriptTier, WorldId } from "@/lib/design/worlds";

/**
 * Han, Kana, Hangul, CJK punctuation and the full-width forms. Written
 * as explicit code-point ranges rather than Unicode property escapes,
 * which require an ES2018 target.
 */
const CJK_RUN_SOURCE =
  "[\\u1100-\\u11FF\\u3000-\\u303F\\u3040-\\u309F\\u30A0-\\u30FF" +
  "\\u3130-\\u318F\\u3400-\\u4DBF\\u4E00-\\u9FFF\\uAC00-\\uD7AF" +
  "\\uF900-\\uFAFF\\uFF00-\\uFFEF]+";

export interface MixedTextProps {
  world: WorldId;
  text: string;
  /**
   * Which face the target-script runs take. Pass `display` at
   * --t-display-* sizes, where full-width spacing is correct and the
   * CJK display line-height applies.
   */
  tier?: ScriptTier;
  className?: string;
}

/**
 * MixedText
 * docs/design/design-system.md §3.3
 *
 * Some strings are mostly chrome with a fragment of the target language
 * inside them. The constraint line is the clearest case: `IN ます FORM`,
 * `MUST USE 因为`. Wrapping the whole line in ScriptText would tag the
 * English as Japanese and set it in a Japanese face; leaving the whole
 * line untagged would render the fragment with the wrong glyph shapes,
 * which is a correctness bug rather than a styling one.
 *
 * So the string is split into runs and only the target-script runs go
 * through ScriptText. The Latin runs stay in the UI face and keep the
 * chrome's `lang`. ScriptText remains the only path by which
 * target-language text reaches the screen.
 *
 * A Latin world produces no runs and pays nothing: one pass of a regex
 * that never matches.
 */
export function MixedText({ world, text, tier = "text", className }: MixedTextProps) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  // Built per call: a shared /g/ regex carries `lastIndex` between
  // renders, which is exactly the kind of hidden state a render must
  // not have.
  const runs = new RegExp(CJK_RUN_SOURCE, "g");
  while ((match = runs.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push(<Fragment key={`t${cursor}`}>{text.slice(cursor, match.index)}</Fragment>);
    }
    parts.push(
      <ScriptText key={`s${match.index}`} world={world} tier={tier}>
        {match[0]}
      </ScriptText>,
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) {
    parts.push(<Fragment key={`t${cursor}`}>{text.slice(cursor)}</Fragment>);
  }

  return <span className={className}>{parts}</span>;
}
