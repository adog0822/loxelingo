import { SkyLayer } from '@/components/ui/sky-layer'
import { ScriptText } from '@/components/ui/script-text'
import { enterWorld } from '@/lib/actions/enter-world'
import { WORLDS, WORLD_IDS, langForWorld, type WorldId } from '@/lib/design/worlds'
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
    <main className="relative isolate min-h-dvh">
      <SkyLayer />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-14 px-6 py-24">
        <header className="flex max-w-[34ch] flex-col gap-4">
          <h1 className="text-[clamp(2.5rem,7vw,3.5rem)] leading-[1.02] tracking-[-0.03em] text-[color:var(--ink-900)]">
            Not a student. Ranked.
          </h1>
          <p className="text-[color:var(--ink-700)]">
            Pick one. You play your first match now. No account until you have
            something worth keeping.
          </p>
          {session.status === 'guest' ? (
            <p className="text-sm text-[color:var(--ink-650)]">
              Playing as a guest. Your rating is being saved.
            </p>
          ) : null}
        </header>

        {message ? (
          <p
            role="alert"
            className="border-l border-[color:var(--signal-warn)] pl-4 text-sm text-[color:var(--ink-700)]"
          >
            {message}
          </p>
        ) : null}

        <ul className="flex flex-col gap-2">
          {open.map((id) => {
            const world = WORLDS[id]
            return (
              <li key={id}>
                <form action={enterWorld}>
                  <input type="hidden" name="world" value={id} />
                  {/*
                    Name and label sit TOGETHER. They were previously at opposite
                    ends of a full-width row, which put ~560px between 日本 and
                    the word naming it — the label read as belonging to the next
                    world, not this one. Proximity is the grouping signal; a
                    hairline is not a substitute for it.
                  */}
                  <button
                    type="submit"
                    data-world={id}
                    className="group flex w-full items-baseline gap-5 rounded-[4px] px-2 py-5 text-left transition-[background-color] duration-[var(--dur-fast,180ms)] hover:bg-[color:var(--ink-200)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--gold-400)]"
                  >
                    <ScriptText
                      world={id}
                      tier="display"
                      as="span"
                      /* The only screen rendering every world at once. Blocking
                         here would serialise CJK stylesheets across two CDNs
                         before anything paints, on the first screen a user ever
                         sees. The per-language fallback stacks already show the
                         correct glyph shapes, so this costs a swap, not
                         correctness. */
                      blocking={false}
                      className="text-[clamp(1.75rem,5vw,2.25rem)] leading-none text-[color:var(--ink-900)] transition-colors duration-[var(--dur-fast,180ms)] group-hover:text-[color:var(--world-atmos,var(--gold-300))]"
                    >
                      {world.nativeName}
                    </ScriptText>

                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm text-[color:var(--ink-800)]">
                        {world.latinName}
                      </span>
                      <span className="truncate text-xs text-[color:var(--ink-650)]">
                        {world.concept}
                      </span>
                    </span>
                  </button>
                </form>
              </li>
            )
          })}
        </ul>

        {closed.length > 0 ? (
          /*
            Not yet open. No padlock, no "coming soon" badge, no countdown — the
            row is simply quieter and does not respond to the cursor. Absence of
            affordance is the message; anything louder turns a gap in the content
            into a marketing surface.
          */
          <ul className="flex flex-col gap-1 border-t border-[color:var(--ink-400)] pt-6">
            {closed.map((id) => {
              const world = WORLDS[id]
              return (
                <li
                  key={id}
                  className="flex items-baseline gap-5 px-2 py-2 opacity-40"
                  aria-disabled="true"
                >
                  <ScriptText
                    world={id}
                    tier="text"
                    as="span"
                    blocking={false}
                    className="text-base leading-none text-[color:var(--ink-800)]"
                  >
                    {world.nativeName}
                  </ScriptText>
                  <span className="text-sm text-[color:var(--ink-700)]">
                    {world.latinName}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </main>
  )
}
