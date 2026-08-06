/**
 * matchmaking — the async performance pool, a.k.a. ghost matching.
 *
 * THE ARCHITECTURAL IDEA: a player is matched against a STORED SUBMISSION, so the opponent
 * need not be online. Match density is then a function of CUMULATIVE players rather than
 * CONCURRENT ones — the difference between needing 100,000 simultaneous users and a few
 * hundred total. That is the whole reason this product can launch at all.
 *
 * Consequences that shape this module:
 *
 *   * A stored performance is REUSABLE. If each one could only be consumed once the pool
 *     would drain as fast as it filled and density would again track concurrency. So we
 *     create a NEW `matches` row and copy the stored performance into seat 2, rather than
 *     joining the ghost's original match.
 *   * The ghost's author is a real participant of the new match and gets a real result when
 *     they next open the app. They are not a prop.
 *   * A bot is just an authored ghost. It occupies a seat through the identical code path,
 *     and it is ALWAYS labeled in the data (`is_bot`, `bot_slug`, `user_id is null`, enforced
 *     by `match_participants_bot_xor_user`). There is no representation in which the API or
 *     the UI could present a bot as human, because the human-ness of a seat is a column, not
 *     an inference.
 *
 * Policy is pure and lives above the `MatchmakingQueries` port so it is unit-testable with no
 * database: band widening, the cap, bot fallback and self-match exclusion are all functions of
 * a candidate list.
 */

import {
  DISPLAY_INIT,
  DISPLAY_SCALE,
  fromDisplayScale,
  toDisplayScale,
} from '@/lib/engine/elo'
import type { MatchSource, MatchStatus } from '@/lib/match/contract'
import type { SupabaseLike } from '@/lib/match/tasks'

// ---------------------------------------------------------------------------
// Row types
//
// NOTE: hand-written narrow shapes for exactly the columns this module touches. REPLACE with
// the generated `src/lib/db/types.ts` once it exists.
// ---------------------------------------------------------------------------

/** One reusable stored performance in the pool. Humans and bots share this shape. */
export type PoolPerformance = {
  /** `submissions.id` of the stored answer. */
  submissionId: string
  /** `matches.id` the performance was originally recorded in. */
  originMatchId: string
  itemId: number
  /** Null exactly when this is a bot performance. */
  authorUserId: string | null
  isBot: boolean
  /** Non-null exactly when `isBot`. Enforced by `match_participants_bot_xor_user`. */
  botSlug: string | null
  /**
   * The author's ability on the logit scale AT THE TIME THE PERFORMANCE WAS RECORDED
   * (`match_participants.theta_before` of the origin seat), not their ability now. Matching a
   * year-old performance against today's rating for its author would be matching a ghost to a
   * person who no longer exists.
   */
  authorTheta: number
  submittedAt: string
  content: string | null
  mediaPath: string | null
  selectedOption: string | null
  elapsedMs: number | null
}

export type MatchInsert = {
  world_slug: string
  ladder_slug: string
  season_id: number | null
  item_id: number
  prompt_snapshot: unknown
  constraint_text: string | null
  time_limit_ms: number | null
  status: MatchStatus
  source: MatchSource
  is_rated: boolean
}

export type ParticipantInsert = {
  match_id: string
  user_id: string | null
  seat: 1 | 2
  is_bot: boolean
  bot_slug: string | null
  submitted_at: string | null
  theta_before: number
}

export type GhostSubmissionInsert = {
  match_id: string
  user_id: string | null
  seat: 1 | 2
  content: string | null
  media_path: string | null
  selected_option: string | null
  elapsed_ms: number | null
}

// ---------------------------------------------------------------------------
// Rating bands
// ---------------------------------------------------------------------------

/**
 * Progressive widening schedule, in DISPLAY points (the 900-2100 number a player actually
 * sees), because a band is a product decision and "within 100 points" is the only form of it
 * anyone can reason about. Converted to logits before use.
 *
 * 100 / 200 / 400 / 800 display points = 0.25 / 0.5 / 1.0 / 2.0 logits.
 */
export const BAND_STEPS_DISPLAY: readonly number[] = [100, 200, 400, 800]

/** The widest band we will ever accept. Beyond this we seat a bot instead. */
export const MAX_BAND_DISPLAY = BAND_STEPS_DISPLAY[BAND_STEPS_DISPLAY.length - 1]!

/**
 * Convert a band WIDTH in display points to a width in logits.
 *
 * `fromDisplayScale` maps an absolute display rating to an absolute theta, so it subtracts
 * `DISPLAY_INIT` before dividing. A width has no origin, so the init offset is added back
 * before the call rather than the division being open-coded here — that keeps the display
 * convention defined in exactly one place (`elo.ts`), which is the invariant its module docs
 * spend a paragraph protecting.
 */
export function bandWidthLogits(displayPoints: number): number {
  return fromDisplayScale(DISPLAY_INIT + displayPoints)
}

// ---------------------------------------------------------------------------
// Bots
// ---------------------------------------------------------------------------

/**
 * A bot is a named character with a personality and a rating, because chess.com's bots are
 * beloved precisely for being characters — and because an unlabeled bot masquerading as a
 * human is fraud that is fatal for a competitive brand when it surfaces.
 *
 * THE ROSTER IS CONTENT, NOT A CONSTANT. It used to be a `BOT_ROSTER` array right here, shared
 * by every world. That was fine while only Japanese existed and became a bug the moment English
 * shipped: the same five English-named characters were seated in Japanese duels answering in
 * Japanese. Names, voices and (soon) avatars are per-world CONTENT and live in `public.bots`;
 * `MatchmakingQueries.fetchBotRoster` reads them.
 *
 * WHAT IS SHARED IS THE RUNG. `archetype` is a stable machine-readable id for one of the five
 * rungs, identical in every world, so code can reason about "the 1580" without knowing the
 * cast. `displayRating` belongs to the rung too, and is on the 900-2100 display scale so it is
 * directly comparable to what the player sees and a designer can place a bot in a band without
 * touching logits. `name` / `selfDescription` / `avatarPath` are local to the world.
 */
export type BotArchetype =
  | 'earnest_beginner'
  | 'casual_peer'
  | 'precise_literary'
  | 'warm_guide'
  | 'master'

export type BotDefinition = {
  slug: string
  name: string
  displayRating: number
  /** The rung. Shared across worlds; this is the field code may branch on. */
  archetype: BotArchetype
  /** One first-person line. Shows the archetype, never names it — the player infers. */
  selfDescription: string
  /** Storage object path for the portrait, once the art exists. */
  avatarPath: string | null
}

/**
 * One world's cast, as an in-memory lookup.
 *
 * This is a plain value with no database behind it, which is the whole point: `chooseOpponent`,
 * `nearestBotPerformance` and `botDisplayRating` take a roster and stay pure, so the policy is
 * still unit-testable with a hand-written five-element array and no Postgres. The only thing
 * that moved into the port is WHERE the array comes from.
 */
export type BotRoster = {
  readonly worldSlug: string
  readonly bots: readonly BotDefinition[]
  bySlug(slug: string): BotDefinition | undefined
  byArchetype(archetype: BotArchetype): BotDefinition | undefined
}

export function botRoster(worldSlug: string, bots: readonly BotDefinition[]): BotRoster {
  const bySlug = new Map(bots.map((b) => [b.slug, b]))
  const byArchetype = new Map(bots.map((b) => [b.archetype, b]))
  const ordered = [...bots]
  return {
    worldSlug,
    bots: ordered,
    bySlug: (slug) => bySlug.get(slug),
    byArchetype: (archetype) => byArchetype.get(archetype),
  }
}

/** The empty roster, for a world whose cast has not been authored yet. */
export const emptyBotRoster = (worldSlug: string): BotRoster => botRoster(worldSlug, [])

export const botBySlug = (roster: BotRoster, slug: string): BotDefinition | undefined =>
  roster.bySlug(slug)

/**
 * IS_RATED FOR BOT MATCHES: **false**.
 *
 * A bot's rating is an authored constant, not an earned estimate. Rating a human against it
 * imports content-authoring error straight into the ladder, and — worse — it is farmable: a
 * player who finds the bot they reliably beat has found a rating printer that no amount of
 * dynamic-K damps. The contract already anticipates this: `NoSettleReason` carries
 * `'bot_opponent_unrated'`, which only exists if a settled bot match is expected to decline
 * to move ratings.
 *
 * Bots exist to seed density at launch — to guarantee that a player never stares at an empty
 * pool — not to price players. So a bot match runs the identical pipeline, produces an
 * identical verdict, and settles without touching `user_ratings`, exactly like the Daily and
 * the Gauntlet do (spec §7 constraint 3: separate the loss-bearing surface from the gain-only
 * one).
 *
 * `ladderIsRated` comes from `ladders.is_rated` rather than being hardcoded, so unrated
 * surfaces flow through this same function.
 */
export function isRatedMatch(args: {
  ladderIsRated: boolean
  opponentIsBot: boolean
}): boolean {
  return args.ladderIsRated && !args.opponentIsBot
}

// ---------------------------------------------------------------------------
// Opponent choice — pure policy
// ---------------------------------------------------------------------------

export type OpponentDecision =
  | {
      kind: 'human'
      performance: PoolPerformance
      /** Which widening step matched, 0-based. */
      bandStep: number
      bandDisplayPoints: number
      /** |theta gap| in display points, for logging. */
      gapDisplayPoints: number
    }
  | {
      kind: 'bot'
      performance: PoolPerformance
      /**
       * Never undefined. A bot performance whose slug is not in this world's roster throws
       * (`botDisplayRating`) rather than being seated as an anonymous "Bot": see rule 5.
       */
      bot: BotDefinition
      reason: 'pool_empty' | 'band_cap_reached'
    }
  | { kind: 'none'; reason: 'no_opponent_available' }

export type ChooseOpponentOptions = {
  /**
   * This world's cast. REQUIRED, and passed in rather than imported, which is what keeps this
   * function pure now that the roster is a database table: the caller
   * (`findGhostMatch` -> `fetchBotRoster`) does the I/O, the policy does not.
   */
  roster: BotRoster
  bandStepsDisplay?: readonly number[]
  /** Authors this learner has already faced on this item. Belt-and-braces over the SQL filter. */
  excludeAuthorUserIds?: readonly string[]
}

/**
 * Choose an opponent performance for `learner` out of `candidates`.
 *
 * Rules, in order:
 *
 *   1. **Never self-match.** A performance authored by the learner is dropped outright. This
 *      is enforced here as well as in the SQL because it is the one failure that is both
 *      invisible (the match looks normal) and absurd (you beat yourself, the ladder moves).
 *   2. **Widen progressively.** Try each band in `bandStepsDisplay`, smallest first, and take
 *      the first band containing a human performance. Within a band, prefer the closest rating
 *      and break ties toward the OLDEST performance, so the pool circulates and every stored
 *      answer eventually earns its author a result instead of the same few being replayed.
 *   3. **Cap the widening.** At `MAX_BAND_DISPLAY` (800 display points = 2 logits) we stop.
 *      We do NOT fall back to "closest human at any distance": at a 2-logit gap the expected
 *      score is ~0.88, the dynamic-K update is nearly zero, the loser learns nothing from a
 *      performance they cannot yet parse, and we have burned a judge call to move no rating.
 *      At the cap we seat a bot, which is a better experience AND honest about its own
 *      unratedness (see `isRatedMatch`).
 *   4. **Bot fallback** also covers the empty pool. If there is no bot performance for the
 *      item either, return `kind: 'none'` so the caller can pick a different item rather than
 *      fabricating an opponent.
 *   5. **A bot outside the roster is an error, not a degradation.** The chosen bot is resolved
 *      against `options.roster` and a miss THROWS. See `botDisplayRating`.
 */
export function chooseOpponent(
  learner: { userId: string; theta: number },
  candidates: readonly PoolPerformance[],
  options: ChooseOpponentOptions,
): OpponentDecision {
  const bands = options.bandStepsDisplay ?? BAND_STEPS_DISPLAY
  const excluded = new Set(options.excludeAuthorUserIds ?? [])

  const eligible = candidates.filter(
    (c) =>
      // Rule 1. Self-match exclusion, on the author id — not on the submission id, because a
      // copy of your own performance carries a different submission id.
      c.authorUserId !== learner.userId &&
      (c.authorUserId === null || !excluded.has(c.authorUserId)),
  )

  const humans = eligible.filter((c) => !c.isBot)
  const bots = eligible.filter((c) => c.isBot)

  for (let step = 0; step < bands.length; step++) {
    const widthDisplay = bands[step]!
    const width = bandWidthLogits(widthDisplay)
    const inBand = humans.filter((c) => Math.abs(c.authorTheta - learner.theta) <= width)
    if (inBand.length === 0) continue

    inBand.sort(
      (a, b) =>
        Math.abs(a.authorTheta - learner.theta) - Math.abs(b.authorTheta - learner.theta) ||
        // Rule 2 tie-break: oldest first, so the pool circulates.
        Date.parse(a.submittedAt) - Date.parse(b.submittedAt) ||
        a.submissionId.localeCompare(b.submissionId),
    )
    const chosen = inBand[0]!
    return {
      kind: 'human',
      performance: chosen,
      bandStep: step,
      bandDisplayPoints: widthDisplay,
      gapDisplayPoints:
        Math.abs(chosen.authorTheta - learner.theta) * DISPLAY_SCALE,
    }
  }

  if (bots.length > 0) {
    const chosen = nearestBotPerformance(options.roster, learner.theta, bots)
    const bot = chosen.botSlug ? options.roster.bySlug(chosen.botSlug) : undefined
    if (!bot) throw unknownBotError(options.roster, chosen)
    return {
      kind: 'bot',
      performance: chosen,
      bot,
      reason: humans.length === 0 ? 'pool_empty' : 'band_cap_reached',
    }
  }

  return { kind: 'none', reason: 'no_opponent_available' }
}

/**
 * Nearest bot by DISPLAY rating. Uses `toDisplayScale` on both sides rather than comparing
 * logits, so the roster's authored display ratings mean exactly what a designer typed.
 */
export function nearestBotPerformance(
  roster: BotRoster,
  learnerTheta: number,
  bots: readonly PoolPerformance[],
): PoolPerformance {
  const learnerDisplay = toDisplayScale(learnerTheta)
  return [...bots].sort((a, b) => {
    const da = Math.abs(botDisplayRating(roster, a) - learnerDisplay)
    const db = Math.abs(botDisplayRating(roster, b) - learnerDisplay)
    return da - db || Date.parse(a.submittedAt) - Date.parse(b.submittedAt)
  })[0]!
}

/**
 * A bot's display rating: the AUTHORED number from its world's roster, and nothing else.
 *
 * There used to be a fallback here — derive the rating from the seeded performance's own theta
 * when the slug was unknown — and it was the wrong shape of mercy. A slug that is not in its
 * world's roster means one of exactly two things, and both are bugs: a pool seeded against a
 * cast that no longer exists (a Japanese match about to seat a bot named Wren), or a roster
 * fetched for the wrong world. Both produce a match that looks completely normal, which is why
 * they must not be survivable. The seeds assert the same invariant from the other side.
 */
export function botDisplayRating(roster: BotRoster, p: PoolPerformance): number {
  const def = p.botSlug ? roster.bySlug(p.botSlug) : undefined
  if (!def) throw unknownBotError(roster, p)
  return def.displayRating
}

function unknownBotError(roster: BotRoster, p: PoolPerformance): MatchmakingError {
  return new MatchmakingError(
    `bot performance ${p.submissionId} carries bot_slug '${p.botSlug}', which is not in the ` +
      `roster for world '${roster.worldSlug}' (known: ` +
      `${roster.bots.map((b) => b.slug).join(', ') || 'none'}). ` +
      `A bot outside its world's cast must not be seated.`,
  )
}

// ---------------------------------------------------------------------------
// Seating
// ---------------------------------------------------------------------------

/**
 * Seat assignment is fixed: the live challenger takes seat 1, the stored performance takes
 * seat 2.
 *
 * Deliberately NOT randomised. Position bias is real and severe, but it is neutralised where
 * it actually occurs — the judge runs both orderings (A,B) and (B,A) and only trusts agreement
 * (`judgments.order_ab_*` / `order_ba_*`). Randomising the seat as well would add a second
 * source of variance to every downstream query ("is seat 1 the live player?") in exchange for
 * protecting against a bias that is already measured and reported per judgment.
 */
export const CHALLENGER_SEAT = 1 as const
export const GHOST_SEAT = 2 as const

export function buildMatchInsert(args: {
  worldSlug: string
  ladderSlug: string
  seasonId: number | null
  itemId: number
  promptSnapshot: unknown
  constraintText: string | null
  timeLimitMs: number | null
  ladderIsRated: boolean
  opponentIsBot: boolean
  source?: MatchSource
}): MatchInsert {
  return {
    world_slug: args.worldSlug,
    ladder_slug: args.ladderSlug,
    season_id: args.seasonId,
    item_id: args.itemId,
    prompt_snapshot: args.promptSnapshot,
    constraint_text: args.constraintText,
    time_limit_ms: args.timeLimitMs,
    // The match opens waiting for the CHALLENGER: seat 2 is already answered. The claim
    // transition `awaiting_opponent -> judging` belongs to the judge worker (contract.ts).
    status: 'awaiting_opponent',
    source: args.source ?? 'ghost',
    is_rated: isRatedMatch(args),
  }
}

/**
 * The two `match_participants` rows.
 *
 * The ghost seat is built straight from the performance, so `is_bot`/`bot_slug`/`user_id`
 * cannot disagree with what the pool said: a bot seat carries `user_id: null` and a non-null
 * `bot_slug`, a human seat carries the inverse. `match_participants_bot_xor_user` rejects
 * anything else, and this function is the only place that pair is constructed.
 */
export function buildParticipants(args: {
  matchId: string
  challengerUserId: string
  challengerTheta: number
  performance: PoolPerformance
}): [ParticipantInsert, ParticipantInsert] {
  const p = args.performance
  if (p.isBot !== (p.authorUserId === null) || p.isBot !== (p.botSlug !== null)) {
    throw new MatchmakingError(
      `pool performance ${p.submissionId} has an inconsistent bot label ` +
        `(is_bot=${p.isBot}, user=${p.authorUserId}, bot_slug=${p.botSlug}); ` +
        `match_participants_bot_xor_user would reject it`,
    )
  }
  return [
    {
      match_id: args.matchId,
      user_id: args.challengerUserId,
      seat: CHALLENGER_SEAT,
      is_bot: false,
      bot_slug: null,
      // Not submitted yet — that is what `awaiting_opponent` means for this match.
      submitted_at: null,
      theta_before: args.challengerTheta,
    },
    {
      match_id: args.matchId,
      user_id: p.authorUserId,
      seat: GHOST_SEAT,
      is_bot: p.isBot,
      bot_slug: p.botSlug,
      // The stored performance's ORIGINAL submission time, not now. The ghost answered then.
      submitted_at: p.submittedAt,
      theta_before: p.authorTheta,
    },
  ]
}

/** Copy the stored performance into seat 2 of the new match. */
export function buildGhostSubmission(
  matchId: string,
  performance: PoolPerformance,
): GhostSubmissionInsert {
  return {
    match_id: matchId,
    user_id: performance.authorUserId,
    seat: GHOST_SEAT,
    content: performance.content,
    media_path: performance.mediaPath,
    selected_option: performance.selectedOption,
    elapsed_ms: performance.elapsedMs,
  }
}

// ---------------------------------------------------------------------------
// End to end
// ---------------------------------------------------------------------------

export class MatchmakingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MatchmakingError'
  }
}

export type FindMatchInput = {
  userId: string
  worldSlug: string
  ladderSlug: string
  itemId: number
  promptSnapshot: unknown
  constraintText: string | null
  timeLimitMs: number | null
  seasonId: number | null
}

export type FindMatchResult =
  /** A new match was created. */
  | { ok: true; matchId: string; reused: false; isRated: boolean; opponent: OpponentDecision }
  /** An already-open match was returned; no opponent was chosen because none was needed. */
  | { ok: true; matchId: string; reused: true; isRated: boolean; opponent: null }
  | { ok: false; reason: 'no_opponent_available' }

export interface MatchmakingQueries {
  /** `ladders.is_rated` for this ladder. */
  fetchLadderIsRated(ladderSlug: string): Promise<boolean>

  /**
   * This world's bot cast, from `public.bots`.
   *
   * A read, not a constant: the cast is content and it is per-world. An empty roster is a
   * legal answer (a world whose cast is unauthored can still match humans against humans); a
   * bot performance with no matching roster row is not, and `chooseOpponent` throws on it.
   */
  fetchBotRoster(worldSlug: string): Promise<BotRoster>

  /** The challenger's current ability. Null when they have never played this ladder. */
  fetchLearnerTheta(
    userId: string,
    worldSlug: string,
    ladderSlug: string,
  ): Promise<number | null>

  /**
   * The one open match this user already has in this (world, ladder), if any — a match they
   * are seated in, still `awaiting_opponent`, and have not submitted to.
   */
  findOpenMatchForUser(args: {
    userId: string
    worldSlug: string
    ladderSlug: string
  }): Promise<{ matchId: string; isRated: boolean } | null>

  /**
   * The reusable performance pool for this item: every stored submission whose seat has a
   * recorded ability, EXCLUDING the requesting user's own and excluding authors this user has
   * already faced on this item.
   */
  fetchPool(args: {
    userId: string
    worldSlug: string
    ladderSlug: string
    itemId: number
    limit: number
  }): Promise<PoolPerformance[]>

  /**
   * Create the match, both seats, and the ghost's copied submission.
   *
   * `matchId` is generated by the CALLER, not by the `gen_random_uuid()` default, so that the
   * three inserts can be built up front and so a retry can be made to target the same row.
   */
  createGhostMatch(args: {
    matchId: string
    match: MatchInsert
    participants: [ParticipantInsert, ParticipantInsert]
    ghostSubmission: GhostSubmissionInsert
  }): Promise<{ matchId: string }>
}

export const POOL_LIMIT = 200

/**
 * Find (or reuse) a ghost match for this user on this item.
 *
 * IDEMPOTENCY: a retried "find me a match" must not create a second match. The guard is
 * `findOpenMatchForUser` — a user may have at most one outstanding unsubmitted match per
 * (world, ladder), and a retry finds it and returns it with `reused: true`. This is a
 * read-then-write check, so two genuinely concurrent requests can still both create a match;
 * closing that race needs a partial unique index the schema does not currently have (see the
 * report). The cost of losing the race is one abandoned match, not a corrupted rating, because
 * settlement is guarded independently by the `awaiting_opponent -> judging` claim.
 */
export async function findGhostMatch(
  input: FindMatchInput,
  deps: { queries: MatchmakingQueries; newMatchId?: () => string },
): Promise<FindMatchResult> {
  const { queries } = deps

  const open = await queries.findOpenMatchForUser({
    userId: input.userId,
    worldSlug: input.worldSlug,
    ladderSlug: input.ladderSlug,
  })
  if (open) {
    return {
      ok: true,
      matchId: open.matchId,
      reused: true,
      isRated: open.isRated,
      opponent: null,
    }
  }

  const [ladderIsRated, theta, roster] = await Promise.all([
    queries.fetchLadderIsRated(input.ladderSlug),
    queries.fetchLearnerTheta(input.userId, input.worldSlug, input.ladderSlug),
    // The cast of THIS world. Fetched here, next to the ladder and the rating, so the pure
    // policy below still receives everything it needs as plain values.
    queries.fetchBotRoster(input.worldSlug),
  ])
  const learnerTheta = theta ?? 0

  const pool = await queries.fetchPool({
    userId: input.userId,
    worldSlug: input.worldSlug,
    ladderSlug: input.ladderSlug,
    itemId: input.itemId,
    limit: POOL_LIMIT,
  })

  const decision = chooseOpponent({ userId: input.userId, theta: learnerTheta }, pool, {
    roster,
  })
  if (decision.kind === 'none') return { ok: false, reason: 'no_opponent_available' }

  const match = buildMatchInsert({
    worldSlug: input.worldSlug,
    ladderSlug: input.ladderSlug,
    seasonId: input.seasonId,
    itemId: input.itemId,
    promptSnapshot: input.promptSnapshot,
    constraintText: input.constraintText,
    timeLimitMs: input.timeLimitMs,
    ladderIsRated,
    opponentIsBot: decision.kind === 'bot',
  })

  const newId = (deps.newMatchId ?? defaultNewMatchId)()
  const { matchId } = await queries.createGhostMatch({
    matchId: newId,
    match,
    participants: buildParticipants({
      matchId: newId,
      challengerUserId: input.userId,
      challengerTheta: learnerTheta,
      performance: decision.performance,
    }),
    ghostSubmission: buildGhostSubmission(newId, decision.performance),
  })

  return { ok: true, matchId, reused: false, isRated: match.is_rated, opponent: decision }
}

const defaultNewMatchId = (): string => crypto.randomUUID()

// ---------------------------------------------------------------------------
// Postgres port
// ---------------------------------------------------------------------------

/**
 * `matches`, `match_participants` and the ghost submission copy all require the SERVICE ROLE:
 * there is deliberately no client INSERT policy on any of them. `bots` is the exception and is
 * only READ here — it is public config, like `worlds`.
 */
export function createMatchmakingQueries(db: SupabaseLike): MatchmakingQueries {
  /** Authors this user has already faced on this item. */
  async function facedAuthorIds(userId: string, itemId: number): Promise<Set<string>> {
    const { data, error } = await db
      .from('match_participants')
      .select('match_id, user_id, matches!inner(item_id)')
      .eq('matches.item_id', itemId)
    if (error) throw new MatchmakingError(`faced-author lookup failed: ${error.message}`)

    const rows = (data ?? []) as { match_id: string; user_id: string | null }[]
    const mine = new Set(rows.filter((r) => r.user_id === userId).map((r) => r.match_id))
    return new Set(
      rows
        .filter((r) => mine.has(r.match_id) && r.user_id !== null && r.user_id !== userId)
        .map((r) => r.user_id as string),
    )
  }

  return {
    async fetchLadderIsRated(ladderSlug) {
      const { data, error } = await db
        .from('ladders')
        .select('is_rated')
        .eq('slug', ladderSlug)
        .maybeSingle()
      if (error) throw new MatchmakingError(`ladders read failed: ${error.message}`)
      if (!data) throw new MatchmakingError(`unknown ladder '${ladderSlug}'`)
      return data.is_rated as boolean
    },

    async fetchBotRoster(worldSlug) {
      // Ordered by sort_order so `roster.bots` is presentable as-is (weakest rung first).
      // No `is_active` filter: retiring a bot whose performances are still in the pool would
      // make those performances unseatable, so retirement is a delete plus a pool rewrite,
      // not a flag. Nothing here is secret — a client with the publishable key may read the
      // same rows through the "bots: readable by signed-in users" policy.
      const { data, error } = await db
        .from('bots')
        .select('slug, name, display_rating, archetype, self_description, avatar_path, sort_order')
        .eq('world_slug', worldSlug)
        .order('sort_order', { ascending: true })
      if (error) throw new MatchmakingError(`bots read failed: ${error.message}`)

      const rows = (data ?? []) as unknown as BotRow[]
      return botRoster(
        worldSlug,
        rows.map((r) => ({
          slug: r.slug,
          name: r.name,
          displayRating: r.display_rating,
          // The CHECK on `bots.archetype` is the authority for this set; the cast mirrors it.
          archetype: r.archetype as BotArchetype,
          selfDescription: r.self_description,
          avatarPath: r.avatar_path,
        })),
      )
    },

    async fetchLearnerTheta(userId, worldSlug, ladderSlug) {
      const { data, error } = await db
        .from('user_ratings')
        .select('theta')
        .eq('user_id', userId)
        .eq('world_slug', worldSlug)
        .eq('ladder_slug', ladderSlug)
        .maybeSingle()
      if (error) throw new MatchmakingError(`user_ratings read failed: ${error.message}`)
      return data ? (data.theta as number) : null
    },

    async findOpenMatchForUser({ userId, worldSlug, ladderSlug }) {
      const { data, error } = await db
        .from('match_participants')
        .select('match_id, matches!inner(id, is_rated, status, world_slug, ladder_slug)')
        .eq('user_id', userId)
        .is('submitted_at', null)
        .eq('matches.world_slug', worldSlug)
        .eq('matches.ladder_slug', ladderSlug)
        .eq('matches.status', 'awaiting_opponent')
        .order('created_at', { ascending: true })
        .limit(1)
      if (error) throw new MatchmakingError(`open-match lookup failed: ${error.message}`)
      const row = (data ?? [])[0]
      if (!row) return null
      const m = Array.isArray(row.matches) ? row.matches[0] : row.matches
      return { matchId: row.match_id as string, isRated: m.is_rated as boolean }
    },

    async fetchPool({ userId, worldSlug, ladderSlug, itemId, limit }) {
      // The pool is "every stored submission for this item", joined to the seat that produced
      // it so we get the author's ability AS OF that performance plus its bot label. Note the
      // explicit constraint name on the embed: submissions -> match_participants is a
      // COMPOSITE foreign key (match_id, seat), which PostgREST cannot disambiguate by table
      // name alone.
      //
      // Two exclusions are applied in SQL as well as in `chooseOpponent`, because doing them
      // here keeps the fetched page useful instead of mostly self:
      //   * `user_id <> $self` — never match a user against their own stored submission;
      //   * authors already faced on this item — no rematch of the same ghost on the same
      //     prompt. That is an (author, item) PROXY for "this exact stored submission", which
      //     is the best the schema allows: a copied ghost submission has no column pointing
      //     back at the submission it was copied from (see the report).
      const { data, error } = await db
        .from('submissions')
        .select(
          'id, match_id, user_id, seat, content, media_path, selected_option, elapsed_ms, submitted_at, ' +
            'match_participants!submissions_seat_fk(is_bot, bot_slug, theta_before), ' +
            'matches!inner(item_id, world_slug, ladder_slug)',
        )
        .eq('matches.item_id', itemId)
        .eq('matches.world_slug', worldSlug)
        .eq('matches.ladder_slug', ladderSlug)
        .order('submitted_at', { ascending: true })
        .limit(limit)
      if (error) throw new MatchmakingError(`pool read failed: ${error.message}`)

      const faced = await facedAuthorIds(userId, itemId)
      // Cast: without generated DB types PostgREST cannot infer a row shape for a select
      // string it has not seen literally, and it guesses wrong on embedded resources.
      return ((data ?? []) as unknown as PoolRow[])
        .map(toPoolPerformance)
        .filter(
          (p: PoolPerformance) =>
            p.authorUserId !== userId &&
            (p.authorUserId === null || !faced.has(p.authorUserId)) &&
            Number.isFinite(p.authorTheta),
        )
    },

    async createGhostMatch({ matchId, match, participants, ghostSubmission }) {
      // ORDER IS LOAD-BEARING: `submissions_seat_fk` references (match_id, seat) on
      // match_participants, so the seats must exist before the ghost's answer can be copied in.
      //
      // These are three round-trips, not one transaction, because PostgREST cannot span
      // tables atomically. A half-built match — seats with no ghost submission — is a match
      // the judge waits on forever, so a failure after step 1 compensates by deleting the
      // match (ON DELETE CASCADE removes whatever was written). The correct fix is a single
      // `create_ghost_match(...)` plpgsql function owning the transaction; that migration
      // belongs to whoever owns `supabase/` (see the report).
      const { error: matchErr } = await db.from('matches').insert({ id: matchId, ...match })
      if (matchErr) throw new MatchmakingError(`matches insert failed: ${matchErr.message}`)

      try {
        const { error: seatErr } = await db.from('match_participants').insert(participants)
        if (seatErr) throw new MatchmakingError(`seat insert failed: ${seatErr.message}`)

        const { error: subErr } = await db.from('submissions').insert(ghostSubmission)
        if (subErr) {
          throw new MatchmakingError(`ghost submission copy failed: ${subErr.message}`)
        }
      } catch (err) {
        await db.from('matches').delete().eq('id', matchId)
        throw err
      }

      return { matchId }
    },
  }
}

/** Shape of one `public.bots` row. Replace with the generated types. */
type BotRow = {
  slug: string
  name: string
  display_rating: number
  archetype: string
  self_description: string
  avatar_path: string | null
  sort_order: number
}

/** Shape of one pool row as PostgREST returns it. Replace with the generated types. */
type PoolRow = {
  id: string
  match_id: string
  user_id: string | null
  seat: number
  content: string | null
  media_path: string | null
  selected_option: string | null
  elapsed_ms: number | null
  submitted_at: string
  match_participants:
    | { is_bot: boolean; bot_slug: string | null; theta_before: number | null }
    | { is_bot: boolean; bot_slug: string | null; theta_before: number | null }[]
    | null
  matches: { item_id: number } | { item_id: number }[] | null
}

export function toPoolPerformance(row: PoolRow): PoolPerformance {
  const seat = Array.isArray(row.match_participants)
    ? row.match_participants[0] ?? null
    : row.match_participants
  const match = Array.isArray(row.matches) ? row.matches[0] ?? null : row.matches
  return {
    submissionId: row.id,
    originMatchId: row.match_id,
    itemId: match?.item_id ?? -1,
    authorUserId: row.user_id,
    isBot: seat?.is_bot ?? row.user_id === null,
    botSlug: seat?.bot_slug ?? null,
    // NaN when the seat has no recorded ability; `fetchPool` filters those out rather than
    // silently treating an unknown opponent as a 900-rated one.
    authorTheta: seat?.theta_before ?? Number.NaN,
    submittedAt: row.submitted_at,
    content: row.content,
    mediaPath: row.media_path,
    selectedOption: row.selected_option,
    elapsedMs: row.elapsed_ms,
  }
}
