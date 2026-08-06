import { SkyLayer } from '@/components/ui/sky-layer'
import { ScriptText } from '@/components/ui/script-text'
import { enterWorld } from '@/lib/actions/enter-world'
import { WORLDS, WORLD_IDS } from '@/lib/design/worlds'
import { getSessionState } from '@/lib/auth/session'

const ERRORS: Record<string, string> = {
  rate_limited: 'Too many new sessions from this network right now. Try again shortly.',
  guests_disabled: 'Guest play is unavailable right now.',
  linking_disabled: 'Account linking is unavailable right now.',
  unknown_world: 'That world does not exist.',
  unknown: 'Something went wrong starting your session.',
}

/**
 * World select.
 *
 * A vertical orbital list rather than six cards: the design system bans
 * repeated identical containers, and the native script must outweigh the Latin
 * name. No icons, no flags.
 *
 * Entering requires no account. `enterWorld` provisions a guest session, so the
 * first match happens before signup and the rating exists before the email does.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const [{ error }, session] = await Promise.all([searchParams, getSessionState()])
  const message = error ? (ERRORS[error] ?? ERRORS.unknown) : null

  return (
    <main className="relative isolate min-h-dvh">
      <SkyLayer />

      <div className="relative mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-12 px-6 py-24">
        <header className="flex flex-col gap-3">
          <h1 className="text-5xl leading-[1.05] text-[color:var(--ink-900)]">
            Not a student. Ranked.
          </h1>
          <p className="max-w-md text-[color:var(--ink-700)]">
            Pick a world. You play your first match now. No account until you have
            something worth keeping.
          </p>
          {session.status === 'guest' ? (
            <p className="text-sm text-[color:var(--ink-650)]">
              You are playing as a guest. Your rating is being saved.
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

        <ul className="flex flex-col">
          {WORLD_IDS.map((id) => {
            const world = WORLDS[id]
            return (
              <li key={id} className="border-b border-[color:var(--ink-600)] last:border-b-0">
                <form action={enterWorld}>
                  <input type="hidden" name="world" value={id} />
                  <button
                    type="submit"
                    className="group flex w-full items-baseline justify-between gap-6 py-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--gold-400)]"
                  >
                    <ScriptText
                      world={id}
                      tier="display"
                      as="span"
                      /* This is the only screen that renders every world at once,
                         so blocking here would serialise three CJK stylesheets
                         across two CDNs before anything paints — on the first
                         screen a user ever sees. The per-language fallback stacks
                         already show the correct glyph shapes, so this costs a
                         font swap, not correctness. */
                      blocking={false}
                      className="text-4xl leading-none text-[color:var(--ink-900)] group-hover:text-[color:var(--gold-300)]"
                    >
                      {world.nativeName}
                    </ScriptText>

                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-sm text-[color:var(--ink-700)]">
                        {world.latinName}
                      </span>
                      <span className="text-xs text-[color:var(--ink-650)]">
                        {world.concept}
                      </span>
                    </span>
                  </button>
                </form>
              </li>
            )
          })}
        </ul>
      </div>
    </main>
  )
}
