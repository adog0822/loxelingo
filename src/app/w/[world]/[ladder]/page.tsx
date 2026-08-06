import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { AltitudeProvider } from "@/components/ui/altitude-provider";
import { SkyLayer } from "@/components/ui/sky-layer";
import { getPromptFixture, SAMPLE_NOTICE } from "@/components/match/fixtures";
import { MixedText } from "@/components/match/mixed-text";
import { PromptComposer } from "@/components/match/prompt-composer";
import { PromptTaskView } from "@/components/match/prompt-task";
import { isLadderId } from "@/components/match/types";
import { WORLD_IDS, type WorldId } from "@/lib/design/worlds";

/**
 * The prompt. docs/design/design-system.md §6.2
 *
 * The one screen in the product that is deliberately centered: under
 * time pressure, symmetry is legibility and the message is the design.
 * Everything that is not the task is gone. No nav, no rating, no avatar,
 * no world HUD, and none of hearts, lives, energy, a combo counter, a
 * mascot or XP, none of which exist anywhere in this product.
 *
 * The world visibly freezes. `frozen` stops every ambient animation in
 * the subtree and the haze locks one step thicker, so the only moving
 * thing on screen is the 2px bar at the top. Designed stillness here is
 * what makes the verdict's motion land.
 *
 * This page is a Server Component. The client boundary is one component,
 * PromptComposer, which owns the timer, the field and the integrity
 * signals, because those are the only things that change while the clock
 * runs. The constraint line, the task and the sky are all server
 * rendered.
 */
export default async function PromptPage({
  params,
}: {
  params: Promise<{ world: string; ladder: string }>;
}) {
  const { world: rawWorld, ladder: rawLadder } = await params;
  if (!isWorldId(rawWorld)) notFound();
  if (!isLadderId(rawLadder)) notFound();

  // TODO(data): this is the seam. Replace with the server read that
  // opens or resumes a match for this user in this world and ladder,
  // projecting `items.answer` away, and take `started_at` from the row
  // rather than from the render. `items` is not client readable for
  // exactly this reason: the answer is in the row.
  const view = getPromptFixture(rawWorld, rawLadder);

  return (
    <AltitudeProvider
      world={rawWorld}
      ladderRatings={[view.skyRating]}
      frozen
      as="main"
      style={
        {
          // The world holds its breath: haze one step thicker than
          // normal for the duration of the prompt. Expressed as an
          // increment on the inherited value rather than a replacement,
          // so it composes with the increased-contrast cap in base.css
          // instead of overriding it. It is published under a second
          // name because a custom property cannot reference itself.
          "--prompt-haze": "min(0.94, calc(var(--haze) + 0.12))",
        } as CSSProperties
      }
    >
      <div
        className="absolute inset-0"
        style={{ "--haze": "var(--prompt-haze)" } as CSSProperties}
      >
        <SkyLayer frozen parallax={false} />
      </div>

      <div
        className="relative mx-auto flex min-h-dvh w-full max-w-[62ch] flex-col items-center justify-center gap-12 px-6 py-24 text-center"
        style={{ zIndex: "var(--z-content)" } as CSSProperties}
      >
        {/* The match constraint line. One of exactly two eyebrow-shaped
            elements in the entire product, and it earns its place by
            carrying a rule the user must obey to score. */}
        {view.constraint === null ? null : (
          <p className="t-label" style={{ color: "var(--text-tertiary)" }}>
            <MixedText world={rawWorld} text={view.constraint} />
          </p>
        )}

        <PromptTaskView world={rawWorld} task={view.task} />

        <PromptComposer
          world={rawWorld}
          matchId={view.matchId}
          input={view.input}
          timeLimitMs={view.timeLimitMs}
          startedAtEpochMs={view.startedAtEpochMs}
          verdictHref={`/w/${rawWorld}/${rawLadder}/sample-loss/verdict`}
        />

        {view.sample ? (
          <p className="t-body-sm" style={{ color: "var(--text-tertiary)" }}>
            {SAMPLE_NOTICE}
          </p>
        ) : null}
      </div>
    </AltitudeProvider>
  );
}

function isWorldId(value: string): value is WorldId {
  return (WORLD_IDS as readonly string[]).includes(value);
}
