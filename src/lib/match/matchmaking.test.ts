import { describe, expect, it } from 'vitest'

import { DISPLAY_INIT, DISPLAY_SCALE } from '@/lib/engine/elo'
import {
  BAND_STEPS_DISPLAY,
  bandWidthLogits,
  botBySlug,
  botDisplayRating,
  botRoster,
  buildGhostSubmission,
  buildMatchInsert,
  buildParticipants,
  CHALLENGER_SEAT,
  chooseOpponent,
  emptyBotRoster,
  findGhostMatch,
  GHOST_SEAT,
  isRatedMatch,
  MatchmakingError,
  MAX_BAND_DISPLAY,
  nearestBotPerformance,
  POOL_LIMIT,
  type BotDefinition,
  type BotRoster,
  type MatchInsert,
  type MatchmakingQueries,
  type PoolPerformance,
} from './matchmaking'

const T = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString()

/**
 * The rosters, hand-written.
 *
 * These are the ONLY bot definitions in this file, and there is no import of a shared constant,
 * because there is no longer a shared constant to import: the cast lives in `public.bots` and
 * is per-world. That is exactly what these fixtures prove — the policy functions take a roster
 * as a plain value, so every test below runs with no database, and a Japanese test roster is a
 * different five characters from an English one.
 */
const def = (
  slug: string,
  name: string,
  displayRating: number,
  archetype: BotDefinition['archetype'],
): BotDefinition => ({
  slug,
  name,
  displayRating,
  archetype,
  selfDescription: `${name} says one line about themselves.`,
  avatarPath: null,
})

const JA_ROSTER: BotRoster = botRoster('ja', [
  def('satoru', 'Satoru', 940, 'earnest_beginner'),
  def('rin', 'Rin', 1120, 'casual_peer'),
  def('haruki', 'Haruki', 1340, 'precise_literary'),
  def('kaori', 'Kaori', 1580, 'warm_guide'),
  def('tetsuya', 'Tetsuya', 1820, 'master'),
])

const EN_ROSTER: BotRoster = botRoster('en', [
  def('wren-the-copyist', 'Wren, the Copyist', 940, 'earnest_beginner'),
  def('orrin-the-ferryman', 'Orrin, the Ferryman', 1120, 'casual_peer'),
  def('mira-the-cartographer', 'Mira, the Cartographer', 1340, 'precise_literary'),
  def('kestrel-the-archivist', 'Kestrel, the Archivist', 1580, 'warm_guide'),
  def('sable-the-lantern-keeper', 'Sable, the Lantern Keeper', 1820, 'master'),
])

/** Every test that does not care about the cast uses the Japanese one. */
const withJaRoster = (over: Partial<Parameters<typeof chooseOpponent>[2]> = {}) => ({
  roster: JA_ROSTER,
  ...over,
})

const human = (over: Partial<PoolPerformance> & { submissionId: string }): PoolPerformance => ({
  originMatchId: `m-${over.submissionId}`,
  itemId: 1,
  authorUserId: `author-${over.submissionId}`,
  isBot: false,
  botSlug: null,
  authorTheta: 0,
  submittedAt: T(0),
  content: 'an answer',
  mediaPath: null,
  selectedOption: null,
  elapsedMs: 30_000,
  ...over,
})

const bot = (slug: string, theta: number, over: Partial<PoolPerformance> = {}): PoolPerformance =>
  human({
    submissionId: `bot-${slug}`,
    authorUserId: null,
    isBot: true,
    botSlug: slug,
    authorTheta: theta,
    ...over,
  })

/** theta such that the display rating is exactly `display`. */
const thetaFor = (display: number) => (display - DISPLAY_INIT) / DISPLAY_SCALE

describe('rating bands', () => {
  it('a band width in display points converts to logits without redefining the scale', () => {
    // Pins DISPLAY_INIT and DISPLAY_SCALE together: if either moves one-sidedly, this fails.
    for (const points of [0, 100, 200, 400, 800, 1200]) {
      expect(bandWidthLogits(points)).toBeCloseTo(points / DISPLAY_SCALE, 12)
    }
    expect(bandWidthLogits(400)).toBeCloseTo(1, 12)
  })

  it('the widening schedule is monotone and its last step is the cap', () => {
    for (let i = 1; i < BAND_STEPS_DISPLAY.length; i++) {
      expect(BAND_STEPS_DISPLAY[i]!).toBeGreaterThan(BAND_STEPS_DISPLAY[i - 1]!)
    }
    expect(MAX_BAND_DISPLAY).toBe(BAND_STEPS_DISPLAY[BAND_STEPS_DISPLAY.length - 1])
    expect(MAX_BAND_DISPLAY).toBe(800)
  })
})

describe('chooseOpponent — self-match exclusion', () => {
  it('never matches a user against their own stored submission', () => {
    const me = { userId: 'me', theta: 0 }
    const mine = human({ submissionId: 's-mine', authorUserId: 'me', authorTheta: 0 })
    const theirs = human({ submissionId: 's-theirs', authorUserId: 'you', authorTheta: 0.2 })

    const d = chooseOpponent(me, [mine, theirs], withJaRoster())
    expect(d.kind).toBe('human')
    if (d.kind === 'human') expect(d.performance.authorUserId).toBe('you')
  })

  it('falls all the way through to a bot rather than serving a user their own answer', () => {
    const me = { userId: 'me', theta: 0 }
    const d = chooseOpponent(
      me,
      [
        human({ submissionId: 's1', authorUserId: 'me' }),
        human({ submissionId: 's2', authorUserId: 'me', authorTheta: 0.05 }),
        bot('rin', thetaFor(1120)),
      ],
      withJaRoster(),
    )
    expect(d.kind).toBe('bot')
    if (d.kind === 'bot') expect(d.reason).toBe('pool_empty')
  })

  it('excludes authors this learner has already faced on the item', () => {
    const me = { userId: 'me', theta: 0 }
    const d = chooseOpponent(
      me,
      [
        human({ submissionId: 's1', authorUserId: 'rival', authorTheta: 0 }),
        human({ submissionId: 's2', authorUserId: 'stranger', authorTheta: 0.3 }),
      ],
      withJaRoster({ excludeAuthorUserIds: ['rival'] }),
    )
    expect(d.kind).toBe('human')
    if (d.kind === 'human') expect(d.performance.authorUserId).toBe('stranger')
  })
})

describe('chooseOpponent — progressive band widening', () => {
  const me = { userId: 'me', theta: thetaFor(1500) }

  it('uses the tightest band that contains anyone, and takes the nearest inside it', () => {
    const d = chooseOpponent(
      me,
      [
        human({ submissionId: 'near', authorTheta: thetaFor(1540) }), // 40 pts
        human({ submissionId: 'nearer', authorTheta: thetaFor(1510) }), // 10 pts
        human({ submissionId: 'far', authorTheta: thetaFor(1900) }),
      ],
      withJaRoster(),
    )
    expect(d.kind).toBe('human')
    if (d.kind === 'human') {
      expect(d.performance.submissionId).toBe('nearer')
      expect(d.bandStep).toBe(0)
      expect(d.bandDisplayPoints).toBe(100)
      expect(d.gapDisplayPoints).toBeCloseTo(10, 6)
    }
  })

  it('widens step by step when the tight bands are empty', () => {
    // Only opponent is 350 display points away: bands 100 and 200 miss, 400 catches.
    const d = chooseOpponent(
      me,
      [human({ submissionId: 'x', authorTheta: thetaFor(1850) })],
      withJaRoster(),
    )
    expect(d.kind).toBe('human')
    if (d.kind === 'human') {
      expect(d.bandStep).toBe(2)
      expect(d.bandDisplayPoints).toBe(400)
    }
  })

  it('widening is progressive, not a single wide net: a 150-point opponent loses to a 90-point one', () => {
    const d = chooseOpponent(
      me,
      [
        human({ submissionId: 'mid', authorTheta: thetaFor(1650) }), // 150 pts, band 1
        human({ submissionId: 'closest', authorTheta: thetaFor(1450) }), // 50 pts, band 0
      ],
      withJaRoster(),
    )
    expect(d.kind).toBe('human')
    if (d.kind === 'human') {
      expect(d.performance.submissionId).toBe('closest')
      expect(d.bandStep).toBe(0)
    }
  })

  it('circulates the pool: equal-distance candidates break toward the oldest performance', () => {
    const d = chooseOpponent(
      me,
      [
        human({ submissionId: 'fresh', authorTheta: thetaFor(1550), submittedAt: T(30) }),
        human({ submissionId: 'stale', authorTheta: thetaFor(1450), submittedAt: T(1) }),
      ],
      withJaRoster(),
    )
    expect(d.kind).toBe('human')
    if (d.kind === 'human') expect(d.performance.submissionId).toBe('stale')
  })

  it('accepts a candidate exactly on the band edge', () => {
    const d = chooseOpponent(
      me,
      [human({ submissionId: 'edge', authorTheta: thetaFor(1600) })],
      withJaRoster(),
    )
    expect(d.kind).toBe('human')
    if (d.kind === 'human') expect(d.bandDisplayPoints).toBe(100)
  })
})

describe('chooseOpponent — the cap and the bot fallback', () => {
  const me = { userId: 'me', theta: thetaFor(1500) }

  it('stops widening at the cap and seats a bot instead of a wildly mismatched human', () => {
    // 900 display points away — beyond the 800-point cap.
    const d = chooseOpponent(
      me,
      [
        human({ submissionId: 'miles-away', authorTheta: thetaFor(2400) }),
        bot('kaori', thetaFor(1580)),
      ],
      withJaRoster(),
    )
    expect(d.kind).toBe('bot')
    if (d.kind === 'bot') {
      expect(d.reason).toBe('band_cap_reached')
      expect(d.performance.isBot).toBe(true)
    }
  })

  it('seats a bot when the pool is empty, and says so', () => {
    const d = chooseOpponent(me, [bot('haruki', thetaFor(1340))], withJaRoster())
    expect(d.kind).toBe('bot')
    if (d.kind === 'bot') expect(d.reason).toBe('pool_empty')
  })

  it('returns none — never a fabricated opponent — when there is no bot either', () => {
    expect(chooseOpponent(me, [], withJaRoster()).kind).toBe('none')
    expect(
      chooseOpponent(me, [human({ submissionId: 's', authorTheta: thetaFor(2400) })], withJaRoster()),
    ).toEqual({
      kind: 'none',
      reason: 'no_opponent_available',
    })
  })

  it('a human just inside the cap still beats a bot', () => {
    const d = chooseOpponent(
      me,
      [
        human({ submissionId: 'edge', authorTheta: thetaFor(2300) }), // exactly 800 pts
        bot('kaori', thetaFor(1580)),
      ],
      withJaRoster(),
    )
    expect(d.kind).toBe('human')
    if (d.kind === 'human') expect(d.bandDisplayPoints).toBe(MAX_BAND_DISPLAY)
  })

  it('picks the roster bot nearest the learner on the DISPLAY scale', () => {
    const bots = JA_ROSTER.bots.map((b) => bot(b.slug, thetaFor(b.displayRating)))
    const chosen = nearestBotPerformance(JA_ROSTER, thetaFor(1600), bots)
    expect(chosen.botSlug).toBe('kaori')
    expect(botDisplayRating(JA_ROSTER, chosen)).toBe(1580)
  })

  it('every roster bot is labeled with a slug and a name, and resolves by slug', () => {
    for (const roster of [JA_ROSTER, EN_ROSTER]) {
      for (const b of roster.bots) {
        expect(b.slug).toMatch(/^[a-z0-9-]+$/)
        expect(b.name.length).toBeGreaterThan(0)
        expect(botBySlug(roster, b.slug)).toEqual(b)
      }
    }
  })
})

describe('the roster is per-world content, not a constant', () => {
  const me = { userId: 'me', theta: thetaFor(1500) }

  it('the same rung is a different character in each world', () => {
    // The whole point of the refactor: `archetype` is the rung and is shared, so a feature can
    // ask for "the 1580" in any world; the NAME is local and must differ.
    for (const archetype of [
      'earnest_beginner',
      'casual_peer',
      'precise_literary',
      'warm_guide',
      'master',
    ] as const) {
      const ja = JA_ROSTER.byArchetype(archetype)!
      const en = EN_ROSTER.byArchetype(archetype)!
      expect(ja.displayRating).toBe(en.displayRating) // the rung is a difficulty: shared
      expect(ja.slug).not.toBe(en.slug) // the cast is local
      expect(ja.name).not.toBe(en.name)
    }
  })

  it('seats the JAPANESE cast in a Japanese match and the ENGLISH cast in an English one', () => {
    const jaPool = JA_ROSTER.bots.map((b) => bot(b.slug, thetaFor(b.displayRating)))
    const enPool = EN_ROSTER.bots.map((b) => bot(b.slug, thetaFor(b.displayRating)))

    const ja = chooseOpponent(me, jaPool, { roster: JA_ROSTER })
    const en = chooseOpponent(me, enPool, { roster: EN_ROSTER })

    expect(ja.kind).toBe('bot')
    expect(en.kind).toBe('bot')
    if (ja.kind === 'bot' && en.kind === 'bot') {
      // Both learners are at 1500, so both meet the warm_guide rung — under different names.
      expect(ja.bot.archetype).toBe('warm_guide')
      expect(en.bot.archetype).toBe('warm_guide')
      expect(ja.bot.name).toBe('Kaori')
      expect(en.bot.name).toBe('Kestrel, the Archivist')
    }
  })

  it('FAILS LOUDLY on a bot from the wrong world rather than seating an unnamed opponent', () => {
    // The bug this guards: a Japanese pool still carrying the old shared English slugs. It
    // used to degrade silently — `botDisplayRating` derived a rating from the seeded theta and
    // the match looked entirely normal, with an English character answering in Japanese.
    const stray = bot('wren-the-copyist', thetaFor(940))
    expect(botBySlug(JA_ROSTER, 'wren-the-copyist')).toBeUndefined()
    expect(() => botDisplayRating(JA_ROSTER, stray)).toThrow(MatchmakingError)
    expect(() => botDisplayRating(JA_ROSTER, stray)).toThrow(/not in the roster for world 'ja'/)
    expect(() => chooseOpponent(me, [stray], { roster: JA_ROSTER })).toThrow(MatchmakingError)
    // Same performance, correct world: seated without complaint.
    expect(botDisplayRating(EN_ROSTER, stray)).toBe(940)
  })

  it('a world with no authored cast still matches humans, and refuses to invent a bot', () => {
    const roster = emptyBotRoster('ko')
    const d = chooseOpponent(
      me,
      [human({ submissionId: 's', authorTheta: thetaFor(1520) })],
      { roster },
    )
    expect(d.kind).toBe('human')
    expect(chooseOpponent(me, [], { roster })).toEqual({
      kind: 'none',
      reason: 'no_opponent_available',
    })
    // ...but a bot performance with no cast behind it is a seeding error, not a fallback.
    expect(() => chooseOpponent(me, [bot('satoru', thetaFor(940))], { roster })).toThrow(
      MatchmakingError,
    )
  })

  it('resolves a rung by archetype without knowing any name', () => {
    expect(JA_ROSTER.byArchetype('master')?.slug).toBe('tetsuya')
    expect(EN_ROSTER.byArchetype('master')?.slug).toBe('sable-the-lantern-keeper')
    expect(botRoster('ja', []).byArchetype('master')).toBeUndefined()
  })
})

describe('is_rated', () => {
  it('a bot match is NEVER rated; a human match on a rated ladder is', () => {
    expect(isRatedMatch({ ladderIsRated: true, opponentIsBot: false })).toBe(true)
    expect(isRatedMatch({ ladderIsRated: true, opponentIsBot: true })).toBe(false)
    expect(isRatedMatch({ ladderIsRated: false, opponentIsBot: false })).toBe(false)
    expect(isRatedMatch({ ladderIsRated: false, opponentIsBot: true })).toBe(false)
  })
})

describe('row construction', () => {
  const base = {
    worldSlug: 'ja',
    ladderSlug: 'duel',
    seasonId: 1,
    itemId: 7,
    promptSnapshot: { text: 'brief' },
    constraintText: 'must use ～ながら',
    timeLimitMs: 90_000,
  }

  it('a new match opens as awaiting_opponent, sourced ghost', () => {
    const m = buildMatchInsert({ ...base, ladderIsRated: true, opponentIsBot: false })
    expect(m).toMatchObject<Partial<MatchInsert>>({
      status: 'awaiting_opponent',
      source: 'ghost',
      is_rated: true,
      item_id: 7,
      prompt_snapshot: { text: 'brief' },
    })
  })

  it('a bot match is created unrated', () => {
    const m = buildMatchInsert({ ...base, ladderIsRated: true, opponentIsBot: true })
    expect(m.is_rated).toBe(false)
  })

  it('labels the bot seat in the data: user_id null, bot_slug set, is_bot true', () => {
    const [challenger, ghost] = buildParticipants({
      matchId: 'm-1',
      challengerUserId: 'me',
      challengerTheta: 0.3,
      performance: bot('tetsuya', 2.3),
    })
    expect(challenger).toMatchObject({
      seat: CHALLENGER_SEAT,
      user_id: 'me',
      is_bot: false,
      bot_slug: null,
      submitted_at: null,
      theta_before: 0.3,
    })
    expect(ghost).toMatchObject({
      seat: GHOST_SEAT,
      user_id: null,
      is_bot: true,
      bot_slug: 'tetsuya',
      theta_before: 2.3,
    })
    // match_participants_bot_xor_user, restated: a bot seat can never carry a user id.
    expect(ghost.is_bot && ghost.user_id === null && ghost.bot_slug !== null).toBe(true)
  })

  it('labels a human ghost seat as human, carrying its ORIGINAL submission time', () => {
    const perf = human({ submissionId: 's', authorUserId: 'ghost', submittedAt: T(3) })
    const [, ghost] = buildParticipants({
      matchId: 'm-1',
      challengerUserId: 'me',
      challengerTheta: 0,
      performance: perf,
    })
    expect(ghost).toMatchObject({ user_id: 'ghost', is_bot: false, bot_slug: null })
    expect(ghost.submitted_at).toBe(T(3))
  })

  it('rejects a performance whose bot label is internally inconsistent', () => {
    const liar = human({ submissionId: 's', authorUserId: 'someone', isBot: true, botSlug: 'x' })
    expect(() =>
      buildParticipants({
        matchId: 'm',
        challengerUserId: 'me',
        challengerTheta: 0,
        performance: liar,
      }),
    ).toThrow(MatchmakingError)

    const unnamedBot = human({ submissionId: 's', authorUserId: null, isBot: true, botSlug: null })
    expect(() =>
      buildParticipants({
        matchId: 'm',
        challengerUserId: 'me',
        challengerTheta: 0,
        performance: unnamedBot,
      }),
    ).toThrow(MatchmakingError)
  })

  it('copies the stored performance verbatim into seat 2', () => {
    const perf = human({
      submissionId: 's',
      content: 'ご飯を食べながら本を読みます',
      selectedOption: null,
      elapsedMs: 41_000,
    })
    expect(buildGhostSubmission('m-9', perf)).toEqual({
      match_id: 'm-9',
      user_id: perf.authorUserId,
      seat: GHOST_SEAT,
      content: 'ご飯を食べながら本を読みます',
      media_path: null,
      selected_option: null,
      elapsed_ms: 41_000,
    })
  })
})

// ---------------------------------------------------------------------------

type Created = Parameters<MatchmakingQueries['createGhostMatch']>[0]

function fakeQueries(
  pool: readonly PoolPerformance[],
  opts: {
    theta?: number | null
    ladderIsRated?: boolean
    open?: { matchId: string; isRated: boolean } | null
    roster?: BotRoster
  } = {},
): MatchmakingQueries & { created: Created[]; poolRequests: number; rosterRequests: string[] } {
  const state = { created: [] as Created[], poolRequests: 0, rosterRequests: [] as string[] }
  return {
    get created() {
      return state.created
    },
    get poolRequests() {
      return state.poolRequests
    },
    get rosterRequests() {
      return state.rosterRequests
    },
    async fetchLadderIsRated() {
      return opts.ladderIsRated ?? true
    },
    async fetchBotRoster(worldSlug) {
      state.rosterRequests.push(worldSlug)
      return opts.roster ?? JA_ROSTER
    },
    async fetchLearnerTheta() {
      return opts.theta === undefined ? 0 : opts.theta
    },
    async findOpenMatchForUser() {
      return opts.open ?? null
    },
    async fetchPool() {
      state.poolRequests++
      return [...pool]
    },
    async createGhostMatch(args) {
      state.created.push(args)
      return { matchId: args.matchId }
    },
  }
}

const input = {
  userId: 'me',
  worldSlug: 'ja',
  ladderSlug: 'duel',
  itemId: 7,
  promptSnapshot: { text: 'brief' },
  constraintText: null,
  timeLimitMs: 90_000,
  seasonId: 1,
}

describe('findGhostMatch', () => {
  it('creates a match plus two seats plus the copied ghost submission', async () => {
    const q = fakeQueries([human({ submissionId: 's1', authorUserId: 'ghost', authorTheta: 0.1 })])
    const res = await findGhostMatch(input, { queries: q, newMatchId: () => 'm-fixed' })

    expect(res).toMatchObject({ ok: true, matchId: 'm-fixed', reused: false, isRated: true })
    expect(q.created).toHaveLength(1)
    const c = q.created[0]!
    expect(c.match.status).toBe('awaiting_opponent')
    expect(c.participants).toHaveLength(2)
    expect(c.participants.map((p) => p.seat)).toEqual([CHALLENGER_SEAT, GHOST_SEAT])
    expect(c.participants[0]!.user_id).toBe('me')
    expect(c.ghostSubmission.match_id).toBe('m-fixed')
    expect(c.ghostSubmission.seat).toBe(GHOST_SEAT)
  })

  it('creates an UNRATED match when the seat goes to a bot', async () => {
    const q = fakeQueries([bot('haruki', thetaFor(1340))])
    const res = await findGhostMatch(input, { queries: q, newMatchId: () => 'm-bot' })
    expect(res).toMatchObject({ ok: true, isRated: false })
    if (res.ok && !res.reused) expect(res.opponent.kind).toBe('bot')
    expect(q.created[0]!.match.is_rated).toBe(false)
    expect(q.created[0]!.participants[1]!.is_bot).toBe(true)
  })

  it('fetches the roster for THE MATCH’S WORLD and seats that world’s cast', async () => {
    const q = fakeQueries([bot('wren-the-copyist', thetaFor(940))], { roster: EN_ROSTER })
    const res = await findGhostMatch({ ...input, worldSlug: 'en' }, {
      queries: q,
      newMatchId: () => 'm-en',
    })
    expect(q.rosterRequests).toEqual(['en'])
    expect(res.ok).toBe(true)
    if (res.ok && !res.reused && res.opponent.kind === 'bot') {
      expect(res.opponent.bot.name).toBe('Wren, the Copyist')
    }
  })

  it('does not ask for a roster when the open match is reused', async () => {
    const q = fakeQueries([human({ submissionId: 's1' })], {
      open: { matchId: 'm-open', isRated: true },
    })
    await findGhostMatch(input, { queries: q })
    expect(q.rosterRequests).toEqual([])
  })

  it('an unrated ladder is unrated even against a human', async () => {
    const q = fakeQueries([human({ submissionId: 's1', authorTheta: 0 })], { ladderIsRated: false })
    const res = await findGhostMatch(input, { queries: q, newMatchId: () => 'm' })
    expect(res).toMatchObject({ ok: true, isRated: false })
  })

  it('is idempotent: a retry reuses the open match and creates nothing', async () => {
    const q = fakeQueries([human({ submissionId: 's1' })], {
      open: { matchId: 'm-open', isRated: true },
    })
    const res = await findGhostMatch(input, { queries: q })
    expect(res).toMatchObject({ ok: true, matchId: 'm-open', reused: true, opponent: null })
    expect(q.created).toHaveLength(0)
    // It does not even go looking for an opponent.
    expect(q.poolRequests).toBe(0)
  })

  it('reports no_opponent_available instead of inventing one', async () => {
    const q = fakeQueries([])
    const res = await findGhostMatch(input, { queries: q })
    expect(res).toEqual({ ok: false, reason: 'no_opponent_available' })
    expect(q.created).toHaveLength(0)
  })

  it('treats a learner with no rating row as theta 0 and seats them accordingly', async () => {
    const q = fakeQueries([human({ submissionId: 's1', authorTheta: 0.05 })], { theta: null })
    const res = await findGhostMatch(input, { queries: q, newMatchId: () => 'm' })
    expect(res.ok).toBe(true)
    expect(q.created[0]!.participants[0]!.theta_before).toBe(0)
  })

  it('bounds the pool it asks for', async () => {
    let limit = -1
    const q = fakeQueries([human({ submissionId: 's1' })])
    const spy: MatchmakingQueries = {
      ...q,
      async fetchPool(args) {
        limit = args.limit
        return q.fetchPool(args)
      },
    }
    await findGhostMatch(input, { queries: spy, newMatchId: () => 'm' })
    expect(limit).toBe(POOL_LIMIT)
  })
})
