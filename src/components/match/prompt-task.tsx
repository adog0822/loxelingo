import type { PromptPayload } from "@/lib/match/api";
import { GlyphPrompt } from "./glyph-prompt";
import { MixedText } from "./mixed-text";

export interface PromptTaskViewProps {
  world: PromptPayload["world"];
  /** `PromptPayload.task`. The instruction, always present. */
  task: string;
  /** `PromptPayload.glyph`. Non-null only on FORGE in a CJK world. */
  glyph: string | null;
}

/**
 * PromptTaskView
 * docs/design/design-system.md §6.2.3
 *
 * The task itself, with no chrome around it. Two shapes, and which one you get
 * is decided by the payload rather than by the ladder:
 *
 *   - a hero glyph plus its one-line instruction, when the item carries a
 *     glyph. `--t-glyph` is CJK only, so a Latin world's FORGE item carries no
 *     glyph and falls through to the brief, which is correct: its FORGE prompt
 *     is morphology, not script.
 *   - the brief on its own otherwise.
 *
 * There is no third shape. RECALL's waveform player (§7.2) reads from a media
 * path the contract does not carry, and drawing unfilled bars next to a prompt
 * that has no audio behind it would be a decoration pretending to be
 * information. When the payload grows a clip, the player goes here.
 */
export function PromptTaskView({ world, task, glyph }: PromptTaskViewProps) {
  if (glyph !== null) {
    return (
      <div className="flex flex-col items-center gap-6">
        <p className="t-body" style={{ color: "var(--text-secondary)" }}>
          <MixedText world={world} text={task} />
        </p>
        {/*
          `reading` and `strokeOrderPath` are null because the contract does
          not carry them. Furigana and a stroke path are content, and content
          the pipeline has not produced is never synthesised here.
        */}
        <GlyphPrompt world={world} glyph={glyph} reading={null} strokeOrderPath={null} />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="t-body-lg" style={{ color: "var(--text-primary)" }}>
        <MixedText world={world} text={task} />
      </p>
    </div>
  );
}
