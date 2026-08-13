'use server'

import { getSessionState } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { WORLD_IDS, langForWorld, type WorldId } from '@/lib/design/worlds'
import type { LadderId } from '@/lib/judge/rubric'

/**
 * What one world knows about you, and who lives in it.
 *
 * Everything here runs with the SERVICE ROLE, so RLS is bypassed entirely and
 * every ownership check is done in code below. There is exactly one read that
 * touches a user: `user_ratings`, and it is filtered by the id on the verified
 * session claim rather than by anything the caller supplied. `bots` is authored
 * config, readable by any signed-in user, and is fetched for a world slug that
 * comes from the world registry rather than from the request.
 *
 * The three ladder standings are always returned, in a fixed order, including
 * the ones with no row. An unrated ladder is a real state with its own
 * rendering, so it is represented rather than omitted.
 */

/** Fixed order. Not `display_order`: see the note in ladder-rungs.tsx. */
const LADDERS: readonly LadderId[] = ['duel', 'forge', 'recall']

export interface LadderStanding {
  readonly ladder: LadderId
  /**
   * The 900-2100 display rating, or `null` when this ladder has never been
   * played. The absence of a number is the state, and it is rendered as an
   * absence rather than as a badge reading "Unrated".
   */
  readonly rating: number | null
  readonly gamesPlayed: number
}

export interface WorldBot {
  readonly slug: string
  readonly name: string
  /** Authored, on the same display scale the player sees. */
  readonly displayRating: number
  /** One first-person line that shows the rung and never names it. */
  readonly selfDescription: string
  /** The rung. Shared across worlds; never rendered as a label. */
  readonly archetype: string
  readonly sortOrder: number
}

export interface WorldStanding {
  readonly world: WorldId
  /** Always three, in DUEL / FORGE / RECALL order. */
  readonly ladders: readonly LadderStanding[]
  /** This world's cast, weakest first. */
  readonly bots: readonly WorldBot[]
}

type RatingRow = {
  ladder_slug: string | null
  rating: number | null
  games_played: number | null
}

type BotRow = {
  slug: string | null
  name: string | null
  display_rating: number | null
  self_description: string | null
  archetype: string | null
  sort_order: number | null
}

/**
 * Read this user's three ladder standings and this world's cast.
 *
 * Returns `null` only when there is no session or the world id is not one of
 * ours. A failed read of either table degrades to the empty shape rather than
 * to `null`: losing the roster should cost the roster, not the whole screen.
 */
export async function getWorldStanding(world: string): Promise<WorldStanding | null> {
  // Server Functions are reachable by direct POST, so the route params having
  // been narrowed upstream proves nothing about this call.
  if (!isWorldId(world)) return null

  const session = await getSessionState()
  if (session.status === 'anonymous') return null

  const db = createServiceRoleClient()

  // WorldId ('zh') is the design-layer identifier; `worlds.slug` ('zh-Hans') is
  // the database one. `langForWorld` is the single bridge between them, so a
  // second lookup table cannot drift out of step with the registry.
  const worldSlug = langForWorld(world)

  const [ratings, bots] = await Promise.all([
    readLadderStandings(db, session.userId, worldSlug),
    readBots(db, worldSlug),
  ])

  return { world, ladders: ratings, bots }
}

async function readLadderStandings(
  db: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  worldSlug: string,
): Promise<readonly LadderStanding[]> {
  const { data, error } = await db
    .from('user_ratings')
    .select('ladder_slug, rating, games_played')
    // OWNERSHIP CHECK, and not a redundant one. The service role bypasses RLS,
    // so this predicate is the only thing standing between one user's ratings
    // and another's. `userId` comes from verified JWT claims, never from input.
    .eq('user_id', userId)
    .eq('world_slug', worldSlug)

  if (error) {
    // An unrated-looking world is a wrong but harmless picture; a thrown render
    // is a lost screen. Log loudly so this is never mistaken for a fresh player.
    console.error('[getWorldStanding] user_ratings read failed', { worldSlug, error })
  }

  const rows = (data ?? []) as RatingRow[]
  const bySlug = new Map<string, RatingRow>()
  for (const row of rows) {
    if (typeof row.ladder_slug === 'string') bySlug.set(row.ladder_slug, row)
  }

  return LADDERS.map((ladder) => {
    const row = bySlug.get(ladder)
    return {
      ladder,
      // `rating` is a generated column and arrives as a float. It is rounded at
      // render time by the numeral formatter, not here, so nothing downstream
      // has to know whether it was already rounded.
      rating: typeof row?.rating === 'number' ? row.rating : null,
      gamesPlayed: typeof row?.games_played === 'number' ? row.games_played : 0,
    }
  })
}

async function readBots(
  db: ReturnType<typeof createServiceRoleClient>,
  worldSlug: string,
): Promise<readonly WorldBot[]> {
  const { data, error } = await db
    .from('bots')
    .select('slug, name, display_rating, self_description, archetype, sort_order')
    .eq('world_slug', worldSlug)
    // By rating, which is what the screen is ordered by. `sort_order` is the
    // authored roster order and agrees with it today; ordering by the number
    // that is actually rendered keeps the two from disagreeing on screen if it
    // ever stops agreeing in the data.
    .order('display_rating', { ascending: true })

  if (error) {
    console.error('[getWorldStanding] bots read failed', { worldSlug, error })
    return []
  }

  const rows = (data ?? []) as BotRow[]
  const bots: WorldBot[] = []
  for (const row of rows) {
    if (
      typeof row.slug !== 'string' ||
      typeof row.name !== 'string' ||
      typeof row.display_rating !== 'number' ||
      typeof row.self_description !== 'string' ||
      typeof row.archetype !== 'string'
    ) {
      continue
    }
    bots.push({
      slug: row.slug,
      name: row.name,
      displayRating: row.display_rating,
      selfDescription: row.self_description,
      archetype: row.archetype,
      sortOrder: typeof row.sort_order === 'number' ? row.sort_order : bots.length,
    })
  }
  return bots
}

function isWorldId(value: string): value is WorldId {
  return (WORLD_IDS as readonly string[]).includes(value)
}
