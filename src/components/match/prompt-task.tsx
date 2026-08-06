import type { WorldId } from "@/lib/design/worlds";
import { GlyphPrompt } from "./glyph-prompt";
import { MixedText } from "./mixed-text";
import type { PromptTask } from "./types";

/**
 * A still waveform. Deterministic heights, drawn once, never animated:
 * this sits on a timed screen and nothing there moves except the clock.
 */
const WAVEFORM = [
  6, 11, 18, 9, 14, 22, 28, 19, 12, 24, 31, 26, 17, 9, 13, 21, 27, 16, 10, 7,
];

/**
 * PromptTaskView
 * docs/design/design-system.md §6.2.3
 *
 * The task itself: a hero glyph, a brief, or a clip. One of three,
 * chosen by the ladder's content, with no chrome around it.
 */
export function PromptTaskView({ world, task }: { world: WorldId; task: PromptTask }) {
  if (task.kind === "glyph") {
    return (
      <div className="flex flex-col items-center gap-6">
        <p className="t-body" style={{ color: "var(--text-secondary)" }}>
          <MixedText world={world} text={task.instruction} />
        </p>
        <GlyphPrompt
          world={world}
          glyph={task.glyph}
          reading={task.reading}
          strokeOrderPath={task.strokeOrderPath}
        />
      </div>
    );
  }

  if (task.kind === "brief") {
    return (
      <div className="flex flex-col items-center gap-4">
        <p className="t-body-lg" style={{ color: "var(--text-primary)" }}>
          <MixedText world={world} text={task.brief} />
        </p>
        <p className="t-body" style={{ color: "var(--text-secondary)" }}>
          <MixedText world={world} text={task.instruction} />
        </p>
      </div>
    );
  }

  // RECALL. Playback only, and never a recording.
  //
  // TODO(component): WaveformPlayer (§7.2) owns this surface: 2px
  // --gold-500 hairline bars that fill as playback proceeds, an explicit
  // start, and a replay counter that decrements. Until it exists the
  // bars are drawn unfilled and the state says so rather than pretending
  // to be a player.
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="t-body-lg" style={{ color: "var(--text-primary)" }}>
        <MixedText world={world} text={task.instruction} />
      </p>
      <div aria-hidden="true" className="flex h-8 items-end gap-1">
        {WAVEFORM.map((height, index) => (
          <span
            key={index}
            style={{
              display: "block",
              width: "2px",
              height: `${height}px`,
              background: "var(--ink-600)",
            }}
          />
        ))}
      </div>
      <p data-numeric="" className="t-mono" style={{ color: "var(--text-tertiary)" }}>
        {task.replaysAllowed} replays
      </p>
      <p className="t-body-sm" style={{ color: "var(--text-tertiary)" }}>
        Playback is not connected yet.
      </p>
    </div>
  );
}
