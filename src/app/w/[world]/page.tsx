import { notFound } from 'next/navigation'
import Link from 'next/link'
import { AltitudeProvider } from '@/components/ui/altitude-provider'
import { SkyLayer } from '@/components/ui/sky-layer'
import { ScriptText } from '@/components/ui/script-text'
import { WORLDS, WORLD_IDS, type WorldId } from '@/lib/design/worlds'
import { getSessionState } from '@/lib/auth/session'

const LADDERS = [
  { id: 'duel', name: 'Duel', description: 'Build it better, against the clock.' },
  { id: 'recall', name: 'Recall', description: 'Understand it faster than they do.' },
  { id: 'forge', name: 'Forge', description: 'Script and form, at speed.' },
] as const

/**
 * World entry.
 *
 * The sky renders the MAX of this world's three ladder ratings, so a bad run in
 * one ladder never darkens the world. Ratings are not yet persisted — the schema
 * is landing separately — so an unrated player currently sees the provisional
 * state rather than an invented number. The design system bans fabricated
 * precision, and a fake rating here would be exactly that.
 */
export default async function WorldPage({
  params,
}: {
  params: Promise<{ world: string }>
}) {
  const { world: raw } = await params
  if (!isWorldId(raw)) notFound()

  const world = WORLDS[raw]
  const session = await getSessionState()
  if (session.status === 'anonymous') {
    // No session means the guest provisioning in enterWorld did not run.
    // Send them back rather than rendering a world they cannot play.
    notFound()
  }

  // TODO(schema): read user_ratings for this user × world × ladder.
  const ladderRatings: readonly (number | null)[] = [null, null, null]

  return (
    <AltitudeProvider world={raw} ladderRatings={ladderRatings} as="main">
      <SkyLayer />

      <div className="relative mx-auto flex min-h-dvh max-w-2xl flex-col justify-between gap-16 px-6 py-16">
        <header className="flex flex-col gap-2">
          <Link
            href="/"
            className="w-fit text-sm text-[color:var(--ink-650)] hover:text-[color:var(--ink-800)]"
          >
            All worlds
          </Link>
          <ScriptText
            world={raw}
            tier="display"
            as="h1"
            className="mt-6 text-6xl leading-none text-[color:var(--ink-900)]"
          >
            {world.nativeName}
          </ScriptText>
          <p className="text-[color:var(--ink-700)]">{world.concept}</p>
        </header>

        <section className="flex flex-col gap-6">
          <h2 className="text-sm tracking-wide text-[color:var(--ink-650)]">
            Three ladders. Three ratings. A bad day in one is not a bad day.
          </h2>

          <ul className="flex flex-col">
            {LADDERS.map((ladder) => (
              <li
                key={ladder.id}
                className="flex items-baseline justify-between gap-6 border-b border-[color:var(--ink-600)] py-5 last:border-b-0"
              >
                <span className="flex flex-col gap-1">
                  <span className="text-lg text-[color:var(--ink-900)]">{ladder.name}</span>
                  <span className="text-sm text-[color:var(--ink-700)]">
                    {ladder.description}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-[color:var(--ink-650)]">
                  Unrated
                </span>
              </li>
            ))}
          </ul>

          <p className="text-sm text-[color:var(--ink-650)]">
            Your first few matches place you. The sky rises with your best ladder.
          </p>
        </section>
      </div>
    </AltitudeProvider>
  )
}

function isWorldId(value: string): value is WorldId {
  return (WORLD_IDS as readonly string[]).includes(value)
}
