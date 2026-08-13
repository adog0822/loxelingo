import type { CSSProperties } from 'react'

import { SkyLayer } from '@/components/ui/sky-layer'
import { QuietWorld, WorldChoice } from '@/components/world/world-choice'
import { WorldField } from '@/components/world/world-field'
import { WORLD_IDS, langForWorld, type WorldId } from '@/lib/design/worlds'
import { getSessionState } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * Every string a reader can be shown after a failed entry.
 * docs/design/copy.md
 *
 * The rules those rewrites follow, because this map is where they are
 * easiest to break: state what happened, then the one thing the reader
 * can do about it. Present tense. No apology, no "Oops", no "Something
 * went wrong", no em-dash, and no sentence that opens on a negation.
 * "Nobody to face there yet" told a reader what the product lacked
 * before it told them anything they could act on.
 */
const ERRORS: Record<string, string> = {
  rate_limited:
    'This network has used up its new sessions for the hour. Wait a few minutes, then pick a world again.',
  guests_disabled: 'Guest play is paused right now. Sign in to enter a world.',
  linking_disabled:
    'Account linking is paused right now. Your rating is saved and stays with this browser.',
  unknown_world: 'That link does not name a world. Pick one from the list below.',
  world_not_launched: 'That world is closed for now. The open ones are listed below.',
  no_items: 'That ladder is still waiting on its first prompts. Pick another ladder in this world.',
  no_opponent: 'That ladder is waiting on a second player. Pick another ladder in this world.',
  unknown: 'The session stopped short of starting. Pick a world to try again.',
}

/**
 * Which worlds can actually be entered.
 *
 * `worlds.is_launched` is the authority, not the design-layer WORLD_IDS list.
 * This screen previously rendered all seven unconditionally, so a world with no
 * content still looked open and walked the user into an error screen. A door
 * that opens onto nothing is worse than a door that is visibly shut.
 */
async function launchedWorlds(): Promise<ReadonlySet<WorldId>> {
  const db = createServiceRoleClient()
  const { data } = await db.from('worlds').select('slug, is_launched').eq('is_launched', true)
  const slugs = new Set((data ?? []).map((w) => w.slug))
  return new Set(WORLD_IDS.filter((id) => slugs.has(langForWorld(id))))
}

/**
 * World select.
 * docs/design/design-system.md §6.1, docs/design/discovery-taste.md §3.2-§3.4
 *
 * Each open world is a body, turning once every 90 seconds, lit by its own
 * three hue tokens. All of them are drawn by one shader into one canvas
 * (src/components/world/world-field.tsx); the rows here are plain server-
 * rendered HTML that leaves a slot for each body, so the page is complete and
 * the forms work before any of that arrives, or if it never does.
 *
 * The composition is asymmetric on purpose: the type block holds the left,
 * the bodies run down and to the right of it, and the closed worlds sit small
 * and quiet under a hairline. The composition is carried by type, spacing and
 * the bodies alone: tiles, a grid, icons and badges are all absent, and
 * nothing in the copy names what is being rendered.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const [{ error }, session, launched] = await Promise.all([
    searchParams,
    getSessionState(),
    launchedWorlds(),
  ])
  const message = error ? (ERRORS[error] ?? ERRORS.unknown) : null

  const open = WORLD_IDS.filter((id) => launched.has(id))
  const closed = WORLD_IDS.filter((id) => !launched.has(id))

  return (
    <main className="relative isolate min-h-dvh overflow-hidden">
      <SkyLayer />

      {/* Gutters from the taste review's measured table: 20px at 375, 24 at
          390-430, 40 at 768, 64 at 1024 and then the 1200px grid maximum. */}
      <div
        className="relative mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col justify-center gap-14 px-5 py-20 sm:px-6 md:gap-24 md:px-10 md:py-28 lg:px-16"
        style={{ zIndex: 'var(--z-content)' }}
      >
        {/* The type block runs the role classes rather than one-off
            arbitrary values. That is the whole of the "flat page" fix from
            discovery-taste.md §6.2: the roles carry width, weight, tracking
            and measure together, so a heading cannot ship at 400 weight with
            default tracking because someone set only its size.

            At 375 exactly one element is allowed to be big. --t-display-2
            bottoms out at 40px there, and the native script bottoms out at
            48px, so the world names stay the largest thing on a phone and
            take the lead back from this heading. */}
        <header className="flex flex-col gap-5 md:gap-6">
          {/* --t-display-1's own floor is 52px, which would put this heading
              and the native script within 4px of each other on a phone: the
              "everything is medium" failure. The role still supplies width
              112, weight 600, -0.035em tracking, the 22ch measure and the
              balance; only the floor is retuned, down to 40px, so the world
              names lead at 375 and this leads from about 1024 up. The 96px
              ceiling is the spec's and is unchanged.

              Retuned by overriding the token rather than the font-size, so
              that the role keeps computing its own size and nothing in the
              cascade has to be fought. */}
          {/* Ceiling pulled from 6rem to 4.25rem after measuring the result at
              1280x900: the 96px setting pushed BOTH world choices past the fold,
              so the screen led with a statement and hid the only decision on it.
              The headline was winning against the task it introduces. 68px still
              carries the display role and returns both choices to the first
              screen. */}
          <h1
            className="t-display-1 text-[color:var(--ink-900)]"
            style={{ '--t-display-1': 'clamp(2.25rem, 5.2vw, 4.25rem)' } as CSSProperties}
          >
            Your first match sets where you stand.
          </h1>
          <p className="t-body-lg text-[color:var(--ink-700)]">
            Pick a world. The first match starts now. The account comes later,
            once there is a rating worth keeping.
          </p>
          {session.status === 'guest' ? (
            <p className="t-body-sm max-w-[52ch] text-[color:var(--ink-700)]">
              Playing as a guest. Your rating is saved and follows you into an
              account.
            </p>
          ) : null}
        </header>

        {message ? (
          <p
            role="alert"
            className="t-body-sm max-w-[58ch] border-l border-[color:var(--signal-warn)] pl-4 text-[color:var(--ink-700)]"
          >
            {message}
          </p>
        ) : null}

        {/* Offset right of the type block. One shared canvas covers every slot
            inside this element and nothing outside it. */}
        <WorldField className="w-full">
          {/* Both lists are named for a screen reader and for nobody else.
              Sighted readers get the distinction from the typography: open
              worlds carry the display posture and a lit body, closed ones
              sit at text size and do not answer the cursor. A reader who
              cannot see that needs the same fact in words, and a visible
              heading over a list of seven rows would be the label the
              composition was built to avoid. */}
          <h2 className="sr-only">Worlds you can enter now</h2>
          <ul className="flex flex-col gap-8 md:items-end lg:gap-10">
            {open.map((id) => (
              <WorldChoice key={id} world={id} />
            ))}
          </ul>

          {closed.length > 0 ? (
            <>
              <h2 className="sr-only">Worlds opening later</h2>
              <ul className="mt-16 flex flex-col gap-1 border-t border-[color:var(--ink-400)] pt-7 md:mt-24">
                {closed.map((id) => (
                  <QuietWorld key={id} world={id} />
                ))}
              </ul>
            </>
          ) : null}
        </WorldField>
      </div>
    </main>
  )
}
