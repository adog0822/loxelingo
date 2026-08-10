import { SkyLayer } from '@/components/ui/sky-layer'
import { QuietWorld, WorldChoice } from '@/components/world/world-choice'
import { WorldField } from '@/components/world/world-field'
import { WORLD_IDS, langForWorld, type WorldId } from '@/lib/design/worlds'
import { getSessionState } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/server'

const ERRORS: Record<string, string> = {
  rate_limited: 'Too many new sessions from this network right now. Try again shortly.',
  guests_disabled: 'Guest play is unavailable right now.',
  linking_disabled: 'Account linking is unavailable right now.',
  unknown_world: 'That world does not exist.',
  world_not_launched: 'That one is not open yet.',
  no_items: 'That ladder has nothing to set as a task yet.',
  no_opponent: 'Nobody to face there yet.',
  unknown: 'Something went wrong starting your session.',
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
 * and quiet under a hairline. No tiles, no grid, no icons, no badges — and
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
        <header className="flex max-w-[30ch] flex-col gap-4">
          {/* At 375 exactly one element is allowed to be big, and on this
              screen that is the native script, not this line. */}
          <h1 className="text-[clamp(1.625rem,3.6vw,3.25rem)] font-medium leading-[1.1] tracking-[-0.025em] text-[color:var(--ink-900)]">
            Not a student. Ranked.
          </h1>
          <p className="max-w-[34ch] text-[1rem] leading-[1.55] text-[color:var(--ink-700)]">
            Pick one. You play your first match now. No account until you have
            something worth keeping.
          </p>
          {session.status === 'guest' ? (
            <p className="text-[0.875rem] leading-[1.5] text-[color:var(--ink-650)]">
              Playing as a guest. Your rating is being saved.
            </p>
          ) : null}
        </header>

        {message ? (
          <p
            role="alert"
            className="border-l border-[color:var(--signal-warn)] pl-4 text-[0.875rem] leading-[1.5] text-[color:var(--ink-700)]"
          >
            {message}
          </p>
        ) : null}

        {/* Offset right of the type block. One shared canvas covers every slot
            inside this element and nothing outside it. */}
        <WorldField className="w-full">
          <ul className="flex flex-col gap-8 md:items-end lg:gap-10">
            {open.map((id) => (
              <WorldChoice key={id} world={id} />
            ))}
          </ul>

          {closed.length > 0 ? (
            <ul className="mt-16 flex flex-col gap-1 border-t border-[color:var(--ink-400)] pt-7 md:mt-24">
              {closed.map((id) => (
                <QuietWorld key={id} world={id} />
              ))}
            </ul>
          ) : null}
        </WorldField>
      </div>
    </main>
  )
}
