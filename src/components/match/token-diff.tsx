import type { CSSProperties, ElementType } from "react";

import { ScriptText } from "@/components/ui/script-text";
import type { WorldId } from "@/lib/design/worlds";
import type { DiffRole, DiffToken } from "./types";

/**
 * The rule colour is read from a custom property rather than written
 * directly, so that the diff can land on its own beat without this
 * component knowing anything about the sequence. Until the beat lands
 * the properties are unset and the fallback is transparent, and because
 * `border-bottom-color` is an animatable property the change reads as a
 * fade rather than a pop.
 */
const RULE_VAR: Readonly<Record<DiffRole, string>> = {
  better: "var(--diff-rule-better, transparent)",
  yours: "var(--diff-rule-yours, transparent)",
};

export interface TokenDiffProps {
  world: WorldId;
  tokens: readonly DiffToken[];
  role: DiffRole;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}

/**
 * TokenDiff
 * docs/design/design-system.md §2.6, §6.3 beat 3
 *
 * The differing spans carry a 2px bottom rule: --gold-400 under the
 * better move, --verdict-loss under yours. That is step 2 of the loss
 * depiction ladder, and the steps above it are used first: the better
 * answer is already shown side by side, at equal weight, which is why
 * this rule can be quiet.
 *
 * Never a strikethrough. Never a red squiggle. Never a shake, an X, or a
 * colour on the text itself. A wrong answer is not an error, and red in
 * this product means the system is broken.
 *
 * Colour is not the only channel: the spans sit in panels labeled by
 * authorship and the verdict sentence above names the difference in
 * words, so the marks are a locator for a distinction already made in
 * text.
 *
 * `tokens` must come from a real token-level alignment. A character or
 * string diff marks the wrong spans in CJK, where there are no word
 * boundaries to fall back on.
 */
export function TokenDiff({ world, tokens, role, as = "p", className, style }: TokenDiffProps) {
  return (
    <ScriptText
      world={world}
      tier="text"
      as={as}
      className={className}
      style={{ whiteSpace: "pre-wrap", ...style }}
    >
      {tokens.map((token, index) =>
        token.differing ? (
          <span
            key={index}
            data-diff="differing"
            style={{
              borderBottom: `2px solid ${RULE_VAR[role]}`,
              paddingBottom: "2px",
              transition: "border-bottom-color var(--dur-beat) var(--ease-out-expo)",
            }}
          >
            {token.text}
          </span>
        ) : (
          <span key={index}>{token.text}</span>
        ),
      )}
    </ScriptText>
  );
}
