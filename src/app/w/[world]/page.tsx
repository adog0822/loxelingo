import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";

import { BotRoster, RosterStratum } from "@/components/ladder/bot-roster";
import { LadderRungs } from "@/components/ladder/ladder-rungs";
import { RouteTransition } from "@/components/ladder/route-transition";
import { AltitudeProvider } from "@/components/ui/altitude-provider";
import { RatingNumeral } from "@/components/ui/rating-numeral";
import { ScriptText, WorldFontPreload } from "@/components/ui/script-text";
import { SkyLayer } from "@/components/ui/sky-layer";
import { getWorldStanding } from "@/lib/actions/world";
import { getSessionState } from "@/lib/auth/session";
import { bandForRating, skyRatingForWorld } from "@/lib/design/altitude";
import { WORLDS, WORLD_IDS, type WorldId } from "@/lib/design/worlds";

/**
 * World entry: pick a ladder.
 * docs/design/design-system.md §5.4, §6.1, §7.4
 * docs/design/discovery-taste.md §3.2, §3.3, §3.4, §5
 *
 * Three things live on this screen, in this order: where you are standing, the
 * three ways to climb, and the people you will meet doing it.
 *
 * The sky renders the MAXIMUM of this world's three ladder ratings, because the
 * sky belongs to the world and not to a ladder. That is the visual form of the
 * retention mechanism: tilting in DUEL leaves the light exactly where it was.
 *
 * The three ladders are deliberately not one array through one template. Each
 * carries an independent rating and measures a different thing, so each gets
 * its own posture on the width axis, its own line direction and its own motion
 * vector. See src/components/ladder/ladder-rungs.tsx.
 *
 * Composition is asymmetric on purpose: the type block holds the left, the
 * standing holds the right, and the sky occupies the space between them rather
 * than a centred column floating in an empty viewport.
 */
export default async function WorldPage(props: PageProps<"/w/[world]">) {
  const { world: raw } = await props.params;
  if (!isWorldId(raw)) notFound();

  const world = WORLDS[raw];
  const session = await getSessionState();
  if (session.status === "anonymous") {
    // No session means the guest provisioning in enterWorld never ran. Sending
    // them back beats rendering a world they cannot play.
    notFound();
  }

  const standing = await getWorldStanding(raw);
  const ladders = standing?.ladders ?? [];
  const bots = standing?.bots ?? [];

  const ladderRatings = ladders.map((l) => l.rating);
  const skyRating = skyRatingForWorld(ladderRatings);
  const band = skyRating === null ? null : bandForRating(skyRating);

  return (
    <AltitudeProvider world={raw} ladderRatings={ladderRatings} as="main">
      {/* The display face is the LCP element on a world route. */}
      <WorldFontPreload world={raw} />
      <SkyLayer />

      <RouteTransition>
        <div
          className="relative flex min-h-dvh flex-col"
          style={{ zIndex: "var(--z-content)" } as CSSProperties}
        >
          <div className="mx-auto w-full max-w-[1200px] px-5 pb-14 pt-8 sm:px-6 md:px-10 md:pb-20 md:pt-10 lg:px-16">
            <Link
              href="/"
              // Ascending. Browser back carries no transition type, so the only
              // way the reverse direction can ever play is a real Link.
              transitionTypes={["nav-back"]}
              className="t-body-sm inline-block rounded-[var(--r-1)] text-[color:var(--ink-650)] transition-colors duration-[var(--dur-fast)] hover:text-[color:var(--ink-900)]"
            >
              All worlds
            </Link>

            {/* Header. Latin name small and above, native script large: the
                native form being larger is the thesis of entering a place.
                The two halves of one item stay within 8px of each other, and
                the standing sits on the opposite edge of the same row. */}
            <header className="mt-10 grid gap-8 md:mt-14 md:grid-cols-12 md:items-end md:gap-10">
              <div className="md:col-span-7">
                <p className="t-label" style={{ color: "var(--text-tertiary)" }}>
                  {world.latinName}
                </p>
                <ScriptText
                  world={raw}
                  tier="display"
                  as="h1"
                  className="mt-1 text-[clamp(3rem,15vw,4.5rem)] leading-[1.02] text-[color:var(--ink-900)] md:text-[clamp(3.5rem,7vw,5rem)]"
                >
                  {world.nativeName}
                </ScriptText>
                <p
                  className="mt-3 text-[1.0625rem]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {world.concept}
                </p>
              </div>

              {/* Rated: the numeral and the band name, which is the one
                  eyebrow-shaped element this screen is allowed alongside the
                  world's Latin name. Unrated: nothing at all, because the
                  absence of a number is the invitation. */}
              {skyRating === null || band === null ? null : (
                <div className="md:col-span-4 md:col-start-9 md:justify-self-end">
                  <RatingNumeral
                    value={skyRating}
                    size="hero"
                    band={band}
                    label="Highest rating in this world"
                    className="md:items-end"
                  />
                </div>
              )}
            </header>
          </div>

          {/* The ladders. Full-width container so RECALL's wide left margin and
              DUEL's outer edges have real room to be different from each other. */}
          <div className="mx-auto w-full max-w-[1200px] px-5 sm:px-6 md:px-10 lg:px-16">
            <LadderRungs world={raw} worldName={world.latinName} standings={ladders} />
          </div>

          {/* The roster sits on a full-bleed stratum. Not a card: it has no left
              or right boundary, so it reads as a layer of the world with the sky
              continuing above and below it. Depth is one surface lightness step
              plus a light top edge and a dark bottom one. */}
          <section
            aria-labelledby="roster-heading"
            className="mt-16 border-t border-[color:var(--hairline)] md:mt-24"
          >
            <RosterStratum>
              <div className="mx-auto w-full max-w-[1200px] px-5 py-14 sm:px-6 md:px-10 md:py-20 lg:px-16">
                <div className="grid gap-8 md:grid-cols-12 md:gap-10">
                  <div className="md:col-span-4">
                    <h2
                      id="roster-heading"
                      className="t-display-3"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Who you meet here.
                    </h2>
                    <p
                      className="t-body mt-4 max-w-[46ch]"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      These ratings are theirs. A match against one of them settles
                      and leaves your own number where it was.
                    </p>
                  </div>

                  <div className="md:col-span-7 md:col-start-6">
                    <BotRoster bots={bots} delay={120} />
                  </div>
                </div>
              </div>
            </RosterStratum>
          </section>
        </div>
      </RouteTransition>
    </AltitudeProvider>
  );
}

function isWorldId(value: string): value is WorldId {
  return (WORLD_IDS as readonly string[]).includes(value);
}
