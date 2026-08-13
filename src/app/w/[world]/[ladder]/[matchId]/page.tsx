import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { MixedText } from "@/components/match/mixed-text";
import { PromptComposer } from "@/components/match/prompt-composer";
import { PromptTaskView } from "@/components/match/prompt-task";
import { isLadderId } from "@/components/match/types";
import { AltitudeProvider } from "@/components/ui/altitude-provider";
import { SkyLayer } from "@/components/ui/sky-layer";
import { WORLD_IDS, type WorldId } from "@/lib/design/worlds";
import { getPrompt } from "@/lib/actions/match";

/**
 * The prompt. docs/design/design-system.md §6.2
 *
 * The one screen in the product that is deliberately centered: under time
 * pressure, symmetry is legibility and the message is the design. Everything
 * that is not the task is gone. No nav, no rating, no avatar, no world HUD, and
 * none of hearts, lives, energy, a combo counter, a mascot or XP, none of which
 * exist anywhere in this product.
 *
 * The world visibly freezes. `frozen` stops every ambient animation in the
 * subtree and the haze locks one step thicker, so the only moving thing on
 * screen is the 2px bar at the top. Designed stillness here is what makes the
 * verdict's motion land.
 *
 * This page is a Server Component. The client boundary is one component,
 * PromptComposer, which owns the timer, the field and the integrity signals,
 * because those are the only things that change while the clock runs. The
 * constraint line, the task and the sky are all server rendered.
 */
export default async function MatchPromptPage(
  props: PageProps<"/w/[world]/[ladder]/[matchId]">,
) {
  const { world: rawWorld, ladder: rawLadder, matchId } = await props.params;
  if (!isWorldId(rawWorld)) notFound();
  if (!isLadderId(rawLadder)) notFound();

  const prompt = await getPrompt(matchId);

  // Null is not "empty state". `getPrompt` is authorised, so null means this
  // match does not exist or is not yours to read, and both of those are 404.
  // The answer key lives in the same row and is projected away server side;
  // this screen never sees it.
  if (prompt === null) notFound();

  // A match id under the wrong world or ladder in the URL is a different match
  // than the one the path claims. Rendering it would put Japanese content under
  // /w/es and set the wrong `lang` on it, which is a correctness bug.
  if (prompt.world !== rawWorld || prompt.ladder !== rawLadder) notFound();

  // `startedAt` is the server clock at issue. The composer never reads its own
  // Date.now() for the start, so a reload cannot buy time.
  const startedAtEpochMs = Date.parse(prompt.startedAt);

  return (
    <AltitudeProvider
      world={prompt.world}
      // The sky is the world's, not the ladder's: `skyRating` is already the
      // max of this world's three ladders, or null for a world with no rating,
      // which renders as the Valley Floor rather than as a guess.
      ladderRatings={[prompt.skyRating]}
      frozen
      as="main"
      style={
        {
          // The world holds its breath: haze one step thicker than normal for
          // the duration of the prompt. Expressed as an increment on the
          // inherited value rather than a replacement, so it composes with the
          // increased-contrast cap in base.css instead of overriding it. It is
          // published under a second name because a custom property cannot
          // reference itself.
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
            elements in the entire product, and it earns its place by carrying a
            rule the user must obey to score. */}
        {prompt.constraint === null ? null : (
          <p className="t-eyebrow" style={{ color: "var(--text-tertiary)" }}>
            <MixedText world={prompt.world} text={prompt.constraint} />
          </p>
        )}

        <PromptTaskView world={prompt.world} task={prompt.task} glyph={prompt.glyph} />

        <PromptComposer
          world={prompt.world}
          matchId={prompt.matchId}
          input={prompt.input}
          options={prompt.options}
          timeLimitMs={prompt.timeLimitMs}
          startedAtEpochMs={startedAtEpochMs}
          verdictHref={`/w/${rawWorld}/${rawLadder}/${prompt.matchId}/verdict`}
        />
      </div>
    </AltitudeProvider>
  );
}

function isWorldId(value: string): value is WorldId {
  return (WORLD_IDS as readonly string[]).includes(value);
}
