import type { CSSProperties } from "react";

import { ScriptText } from "@/components/ui/script-text";
import { cx } from "@/lib/design/cx";
import type { WorldId } from "@/lib/design/worlds";
import type { VerdictSide } from "@/lib/match/api";
import type { VerdictRule } from "./types";

const PANEL_STYLE: CSSProperties = {
  background: "var(--surface-2)",
  borderRadius: "var(--r-3)",
  boxShadow: "var(--highlight-inset)",
};

/**
 * The rule colour is read from a custom property rather than written directly,
 * so the mark can land on its own beat without this component knowing anything
 * about the sequence. Until the beat lands the properties are unset and the
 * fallback is transparent, and because `background-color` is animatable the
 * change reads as a fade rather than a pop.
 */
const RULE_VAR: Readonly<Record<VerdictRule, string>> = {
  better: "var(--verdict-rule-better, transparent)",
  other: "var(--verdict-rule-other, transparent)",
};

/**
 * Which side the judge preferred, from the participant result. Real data, so
 * the mark is a locator for a distinction the verdict sentence already made in
 * words rather than a decoration.
 *
 * `draw`, `pending` and `void` produce nothing. There is no better answer to
 * point at, so nothing is pointed at.
 */
function ruleFor(result: VerdictSide["result"]): VerdictRule | null {
  if (result === "win") return "better";
  if (result === "loss") return "other";
  return null;
}

function AnswerPanel({
  world,
  side,
  emptyLine,
  marked,
}: {
  world: WorldId;
  side: VerdictSide;
  emptyLine: string;
  marked: boolean;
}) {
  const rule = marked ? ruleFor(side.result) : null;

  return (
    <article data-raised="" className="flex flex-col gap-4 p-6" style={PANEL_STYLE}>
      {/* Headers are authorship, nothing more. The better answer gets no
          elevation, no border, no order change and no colour. */}
      <header className="flex flex-wrap items-baseline gap-2">
        <span className="t-title-3" style={{ color: "var(--text-primary)" }}>
          {side.label}
        </span>

        {side.isBot ? (
          <span
            className="t-label"
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--r-full)",
              padding: "1px 8px",
              color: "var(--text-tertiary)",
            }}
          >
            BOT
          </span>
        ) : null}
      </header>

      {side.content.length === 0 ? (
        <p className="t-body" style={{ color: "var(--text-tertiary)" }}>
          {emptyLine}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <ScriptText
            world={world}
            tier="text"
            as="p"
            className="t-body-lg"
            style={{ whiteSpace: "pre-wrap", color: "var(--text-primary)" }}
          >
            {side.content}
          </ScriptText>

          {/*
            Beat 3. A 2px rule under the answer the judge preferred, in
            --gold-400, and under the one that did not, in --verdict-loss.
            Never a strikethrough, never a red squiggle, never a colour on the
            text itself.

            §6.3 asks for the rule under the specific differing SPANS, which
            requires a real token-level alignment. The contract carries the two
            answers as plain strings and no alignment, and a string diff marks
            the wrong spans in CJK, where there are no word boundaries to fall
            back on. So the rule sits under the whole answer rather than under
            invented spans. Both panels carry one; only the hue differs.
          */}
          <span
            aria-hidden="true"
            style={{
              height: "2px",
              borderRadius: "var(--r-full)",
              backgroundColor: rule === null ? "transparent" : RULE_VAR[rule],
              transition: "background-color var(--dur-beat) var(--ease-out-expo)",
            }}
          />
        </div>
      )}
    </article>
  );
}

export interface VerdictComparisonProps {
  world: WorldId;
  you: VerdictSide;
  opponent: VerdictSide;
  /** Shown in a panel whose author has not answered. */
  emptyLine?: string;
  /**
   * Whether beat 3's rules are drawn at all. False when there is no winner to
   * report: a position-inconsistent judgment is position bias, not a result.
   */
  marked?: boolean;
  className?: string;
}

/**
 * VerdictComparison
 * docs/design/design-system.md §6.3 beat 1, §7.2
 *
 * The two answers, side by side, yours left. Equal width, equal weight,
 * equal typography, equal surface. Not a podium.
 *
 * The better answer is not elevated, tinted, bordered, badged or moved. Its
 * authority comes from being better, which the reader can see for themselves.
 * Wins and losses render through this same component with the same layout: a
 * loss screen that is structurally different from a win screen is a punishment
 * screen.
 *
 * No rating is printed in either header. §6.3 sketches `You · 1 412`, but the
 * contract carries no per-side rating and the design system bans inventing one.
 * An absence is correct where a measurement is missing.
 *
 * These are the only two cards in the product. They are siblings and are never
 * nested.
 */
export function VerdictComparison({
  world,
  you,
  opponent,
  emptyLine = "No answer yet.",
  marked = true,
  className,
}: VerdictComparisonProps) {
  return (
    <div className={cx("grid items-stretch gap-4 md:grid-cols-2", className)}>
      <AnswerPanel world={world} side={you} emptyLine={emptyLine} marked={marked} />
      <AnswerPanel world={world} side={opponent} emptyLine={emptyLine} marked={marked} />
    </div>
  );
}
