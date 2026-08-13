import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

import { LADDER_IDS, LADDER_NAMES, isLadderId, type LadderId } from "@/components/match/types";
import { AltitudeProvider } from "@/components/ui/altitude-provider";
import { Button, buttonClassName } from "@/components/ui/button";
import { SkyLayer } from "@/components/ui/sky-layer";
import { WORLD_IDS, getWorld, type WorldId } from "@/lib/design/worlds";
import { beginMatch } from "@/lib/actions/match";
import type { StartMatchFailure } from "@/lib/match/api";

/**
 * The ladder route is not a screen. It is the act of starting a match.
 *
 * `startMatch` claims an item, opens the match row and issues `started_at`, so
 * the match id has to exist before anything renders: the clock is the server's,
 * and a screen that rendered a task before the row existed would be running a
 * timer against a match that could still fail to be created. On success this
 * redirects to `/w/[world]/[ladder]/[matchId]` and nothing here paints.
 *
 * What does paint is the set of honest reasons a match could not be made. Each
 * one names the actual condition and offers the exit that is useful for it.
 * There is no generic failure branch, because "Something went wrong" tells a
 * reader nothing they can act on and hides a state we already know the name of.
 */
export default async function LadderPage(props: PageProps<"/w/[world]/[ladder]">) {
  const { world: rawWorld, ladder: rawLadder } = await props.params;
  const { error } = await props.searchParams;

  // A bad slug in the URL is a 404, not a match failure. `startMatch` also
  // reports `unknown_world` and `unknown_ladder`, but it cannot be called with
  // an unnarrowed string, so the narrowing happens here and those two reasons
  // are unreachable from this route by construction.
  if (!isWorldId(rawWorld)) notFound();
  if (!isLadderId(rawLadder)) notFound();

  // A failed attempt comes back here as ?error=, because beginMatch redirects.
  if (typeof error === "string" && isStartFailure(error)) {
    return <StartFailure world={rawWorld} ladder={rawLadder} reason={error} />;
  }

  // DO NOT call startMatch during this render.
  //
  // startMatch provisions a guest session, which WRITES a cookie, and cookie
  // writes only take effect in a Server Action or Route Handler. Called from a
  // Server Component the write throws, the server client swallows it, and the
  // guest is created in Supabase with no persisted session: every navigation
  // mints another orphan user and lands on a 404.
  //
  // It is also correct product behaviour. The clock starts at `started_at`, so
  // a match must begin on a deliberate act, not on navigation or a prefetch.
  return <BeginMatch world={rawWorld} ladder={rawLadder} />;
}

function isStartFailure(value: string): value is StartMatchFailure {
  return (
    value === "no_session" ||
    value === "unknown_world" ||
    value === "unknown_ladder" ||
    value === "world_not_launched" ||
    value === "no_items" ||
    value === "no_opponent" ||
    value === "rate_limited"
  );
}

/**
 * The one deliberate act that starts the clock.
 *
 * Deliberately sparse: the task is not shown here, because seeing it before the
 * timer starts would let a player think about the answer for free and turn a
 * timed ladder into an untimed one.
 */
function BeginMatch({ world, ladder }: { world: WorldId; ladder: LadderId }) {
  const definition = getWorld(world);

  return (
    <AltitudeProvider world={world} ladderRatings={[null]} as="main">
      <SkyLayer />
      <div
        className="relative mx-auto flex min-h-dvh w-full max-w-[62ch] flex-col justify-center gap-6 px-6 py-24"
        style={{ zIndex: "var(--z-content)" } as CSSProperties}
      >
        <p className="t-label" style={{ color: "var(--text-tertiary)" }}>
          {definition.latinName} · {LADDER_NAMES[ladder]}
        </p>
        <h1 className="t-display-3" style={{ color: "var(--text-primary)" }}>
          Ready when you are.
        </h1>
        <p className="t-body" style={{ color: "var(--text-secondary)" }}>
          The task appears and the clock starts at the same moment. Your opponent
          has already played, so nobody is waiting on you.
        </p>
        <form action={beginMatch} className="flex items-center gap-4 pt-2">
          <input type="hidden" name="world" value={world} />
          <input type="hidden" name="ladder" value={ladder} />
          <Button type="submit" variant="primary">
            Start the clock
          </Button>
          <Link
            href={`/w/${world}`}
            className={buttonClassName("quiet", "md")}
          >
            Back to {definition.latinName}
          </Link>
        </form>
      </div>
    </AltitudeProvider>
  );
}

/* ------------------------------------------------------------------ */
/* The failures                                                        */
/* ------------------------------------------------------------------ */

function StartFailure({
  world,
  ladder,
  reason,
}: {
  world: WorldId;
  ladder: LadderId;
  reason: StartMatchFailure;
}) {
  const definition = getWorld(world);
  const ladderName = LADDER_NAMES[ladder];
  const otherLadders = LADDER_IDS.filter((id) => id !== ladder);

  let heading: string;
  let body: string;
  let exits: ReactNode;

  switch (reason) {
    case "world_not_launched":
      heading = `${definition.latinName} has no content yet.`;
      body =
        "Japanese is the only world with items in it today. The other five are built and rated, and they are empty, so there is no task to set you.";
      exits = (
        <>
          <Link href="/w/ja/duel" className={buttonClassName("primary", "md")}>
            Play Japanese
          </Link>
          <Link href="/" className={buttonClassName("ghost", "md")}>
            All worlds
          </Link>
        </>
      );
      break;

    case "no_items":
      heading = `${ladderName} has no items in ${definition.latinName}.`;
      body = `The item bank for this ladder is empty, so there is nothing to set as a task. The other two ladders in ${definition.latinName} are rated separately and may still have items.`;
      exits = (
        <>
          {otherLadders.map((id) => (
            <Link
              key={id}
              href={`/w/${world}/${id}`}
              className={buttonClassName("ghost", "md")}
            >
              Try {LADDER_NAMES[id]}
            </Link>
          ))}
          <Link href={`/w/${world}`} className={buttonClassName("quiet", "md")}>
            Back to {definition.latinName}
          </Link>
        </>
      );
      break;

    case "rate_limited":
      heading = "This network has opened too many guest sessions.";
      body =
        "Guest sessions are capped per IP address, and a school, an office or anything else behind one shared address reaches that cap in ordinary use. An existing account is not affected by the cap. The limit resets within the hour.";
      exits = (
        <Link href="/" className={buttonClassName("ghost", "md")}>
          All worlds
        </Link>
      );
      break;

    case "no_opponent":
      heading = "Nobody to face on this one yet.";
      body =
        "A task was picked, but there is no stored performance to match it against: no other player has answered this item, and the practice opponents have not been given an answer for it either. Matches here are asynchronous, so an opponent does not need to be online, only to have played. Try another ladder while this one fills.";
      exits = (
        <>
          {otherLadders.map((other) => (
            <Link
              key={other}
              href={`/w/${world}/${other}`}
              className={buttonClassName("ghost", "md")}
            >
              Try {other.toUpperCase()}
            </Link>
          ))}
          <Link
            href={`/w/${world}`}
            className={buttonClassName("quiet", "md")}
          >
            Back to {definition.latinName}
          </Link>
        </>
      );
      break;

    case "no_session":
      heading = "You have no session.";
      body =
        "A guest session is created when you enter a world, and this match was asked for without one. Entering a world creates it. No account, no email, no password.";
      exits = (
        <Link href="/" className={buttonClassName("primary", "md")}>
          Enter a world
        </Link>
      );
      break;

    // Unreachable: both slugs are narrowed above and a bad one is a 404. Kept
    // so the switch stays exhaustive if the contract grows a reason.
    case "unknown_world":
    case "unknown_ladder":
      notFound();
  }

  return (
    <AltitudeProvider world={world} ladderRatings={[null]} as="main">
      <SkyLayer />
      <div
        className="relative mx-auto flex min-h-dvh w-full max-w-[62ch] flex-col justify-center gap-6 px-6 py-24"
        style={{ zIndex: "var(--z-content)" } as CSSProperties}
      >
        <h1 className="t-display-3" style={{ color: "var(--text-primary)" }}>
          {heading}
        </h1>
        <p className="t-body" style={{ color: "var(--text-secondary)" }}>
          {body}
        </p>
        <div className="flex flex-wrap gap-3">{exits}</div>
      </div>
    </AltitudeProvider>
  );
}

function isWorldId(value: string): value is WorldId {
  return (WORLD_IDS as readonly string[]).includes(value);
}
