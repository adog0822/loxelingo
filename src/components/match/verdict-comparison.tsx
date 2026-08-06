import type { CSSProperties } from "react";

import { cx } from "@/lib/design/cx";
import { formatRating } from "@/lib/design/numerals";
import type { WorldId } from "@/lib/design/worlds";
import { TokenDiff } from "./token-diff";
import type { VerdictAnswer } from "./types";

const PANEL_STYLE: CSSProperties = {
  background: "var(--surface-2)",
  borderRadius: "var(--r-3)",
  boxShadow: "var(--highlight-inset)",
};

function AnswerPanel({
  world,
  answer,
  emptyLine,
}: {
  world: WorldId;
  answer: VerdictAnswer;
  emptyLine: string;
}) {
  return (
    <article
      data-raised=""
      className="flex flex-col gap-4 p-6"
      style={PANEL_STYLE}
    >
      {/* Headers are authorship, nothing more. The higher-rated answer
          gets no elevation, no border, no order change and no colour. */}
      <header className="flex flex-wrap items-baseline gap-2">
        <span className="t-title-3" style={{ color: "var(--text-primary)" }}>
          {answer.authorLabel}
        </span>

        {answer.isBot ? (
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

        {answer.rating === null ? null : (
          <>
            <span aria-hidden="true" style={{ color: "var(--text-tertiary)" }}>
              ·
            </span>
            <span className="sr-only">rating</span>
            <span
              data-numeric=""
              className="t-num"
              style={{ color: "var(--text-secondary)" }}
            >
              {formatRating(answer.rating)}
            </span>
          </>
        )}
      </header>

      {answer.tokens.length === 0 ? (
        <p className="t-body" style={{ color: "var(--text-tertiary)" }}>
          {emptyLine}
        </p>
      ) : (
        <TokenDiff
          world={world}
          tokens={answer.tokens}
          role={answer.diffRole}
          className="t-body-lg"
          style={{ color: "var(--text-primary)" }}
        />
      )}
    </article>
  );
}

export interface VerdictComparisonProps {
  world: WorldId;
  yours: VerdictAnswer;
  theirs: VerdictAnswer;
  /** Shown in a panel whose author has not answered. */
  emptyLine?: string;
  className?: string;
}

/**
 * VerdictComparison
 * docs/design/design-system.md §6.3 beat 1, §7.2
 *
 * The two answers, side by side, yours left. Equal width, equal weight,
 * equal typography, equal surface. Not a podium.
 *
 * The higher-rated answer is not elevated, tinted, bordered, badged or
 * moved. Its authority comes from being better, which the reader can see
 * for themselves. Wins and losses render through this same component
 * with the same layout: a loss screen that is structurally different
 * from a win screen is a punishment screen.
 *
 * These are the only two cards in the product. They are siblings and are
 * never nested.
 */
export function VerdictComparison({
  world,
  yours,
  theirs,
  emptyLine = "No answer yet.",
  className,
}: VerdictComparisonProps) {
  return (
    <div className={cx("grid items-stretch gap-4 md:grid-cols-2", className)}>
      <AnswerPanel world={world} answer={yours} emptyLine={emptyLine} />
      <AnswerPanel world={world} answer={theirs} emptyLine={emptyLine} />
    </div>
  );
}
