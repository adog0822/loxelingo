import { describe, expect, it } from 'vitest'

import { DISPLAY_INIT, DISPLAY_SCALE, toDisplayScale } from '@/lib/engine/elo'
import {
  BAND_STEPS_DISPLAY,
  BOT_ROSTER,
  bandWidthLogits,
  botBySlug,
  botDisplayRating,
  buildGhostSubmission,
  buildMatchInsert,
  buildParticipants,
  CHALLENGER_SEAT,
  chooseOpponent,
  findGhostMatch,
  GHOST_SEAT,
  isRatedMatch,
  MatchmakingError,
  MAX_BAND_DISPLAY,
  nearestBotPerformance,
  POOL_LIMIT,
  type MatchInsert,
  type MatchmakingQueries,
  type PoolPerformance,
} from './matchmaking'

const T = (n: number) => new Date(Date.UTC(2026, 0, 1 + n)).toISOString()

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

    const d = chooseOpponent(me, [mine, theirs])
    expect(d.kind).toBe('human')
    if (d.kind === 'human') expect(d.performance.authorUserId).toBe('you')
  })

  it('falls all the way through to a bot rather than serving a user their own answer', () => {
    const me = { userId: 'me', theta: 0 }
    const d = chooseOpponent(me, [
      human({ submissionId: 's1', authorUserId: 'me' }),
      human({ submissionId: 's2', authorUserId: 'me', authorTheta: 0.05 }),
      bot('orrin-the-ferryman', thetaFor(1120)),
    ])
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
      { excludeAuthorUserIds: ['rival'] },
    )
    expect(d.kind).toBe('human')
    if (d.kind === 'human') expect(d.performance.authorUserId).toBe('stranger')
  })
})

describe('chooseOpponent — progressive band widening', () => {
  const me = { userId: 'me', theta: thetaFor(1500) }

  it('uses the tightest band that contains anyone, and takes the nearest inside it', () => {
    const d = chooseOpponent(me, [
      human({ submissionId: 'near', authorTheta: thetaFor(1540) }), // 40 pts
      human({ submissionId: 'nearer', authorTheta: thetaFor(1510) }), // 10 pts
      human({ submissionId: 'far', authorTheta: thetaFor(1900) }),
    ])
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
    const d = chooseOpponent(me, [human({ submissionId: 'x', authorTheta: thetaFor(1850) })])
    expect(d.kind).toBe('human')
    if (d.kind === 'human') {
      expect(d.bandStep).toBe(2)
      expect(d.bandDisplayPoints).toBe(400)
    }
  })

  it('widening is progressive, not a single wide net: a 150-point opponent loses to a 90-point one', () => {
    const d = chooseOpponent(me, [
      human({ submissionId: 'mid', authorTheta: thetaFor(1650) }), // 150 pts, band 1
      human({ submissionId: 'closest', authorTheta: thetaFor(1450) }), // 50 pts, band 0
    ])
    expect(d.kind).toBe('human')
    if (d.kind === 'human') {
      expect(d.performance.submissionId).toBe('closest')
      expect(d.bandStep).toBe(0)
    }
  })

  it('circulates the pool: equal-distance candidates break toward the oldest performance', () => {
    const d = chooseOpponent(me, [
      human({ submissionId: 'fresh', authorTheta: thetaFor(1550), submittedAt: T(30) }),
      human({ submissionId: 'stale', authorTheta: thetaFor(1450), submittedAt: T(1) }),
    ])
    expect(d.kind).toBe('human')
    if (d.kind === 'human') expect(d.performance.submissionId).toBe('stale')
  })

  it('accepts a candidate exactly on the band edge', () => {
    const d = chooseOpponent(me, [human({ submissionId: 'edge', authorTheta: thetaFor(1600) })])
    expect(d.kind).toBe('human')
    if (d.kind === 'human') expect(d.bandDisplayPoints).toBe(100)
  })
})

describe('chooseOpponent — the cap and the bot fallback', () => {
  const me = { userId: 'me', theta: thetaFor(1500) }

  it('stops widening at the cap and seats a bot instead of a wildly mismatched human', () => {
    // 900 display points away — beyond the 800-point cap.
    const d = chooseOpponent(me, [
      human({ submissionId: 'miles-away', authorTheta: thetaFor(2400) }),
      bot('kestrel-the-archivist', thetaFor(1580)),
    ])
    expect(d.kind).toBe('bot')
    if (d.kind === 'bot') {
      expect(d.reason).toBe('band_cap_reached')
      expect(d.performance.isBot).toBe(true)
    }
  })

  it('seats a bot when the pool is empty, and says so', () => {
    const d = chooseOpponent(me, [bot('mira-the-cartographer', thetaFor(1340))])
    expect(d.kind).toBe('bot')
    if (d.kind === 'bot') expect(d.reason).toBe('pool_empty')
  })

  it('returns none — never a fabricated opponent — when there is no bot either', () => {
    expect(chooseOpponent(me, []).kind).toBe('none')
    expect(chooseOpponent(me, [human({ submissionId: 's', authorTheta: thetaFor(2400) })])).toEqual({
      kind: 'none',
      reason: 'no_opponent_available',
    })
  })

  it('a human just inside the cap still beats a bot', () => {
    const d = chooseOpponent(me, [
      human({ submissionId: 'edge', authorTheta: thetaFor(2300) }), // exactly 800 pts
      bot('kestrel-the-archivist', thetaFor(1580)),
    ])
    expect(d.kind).toBe('human')
    if (d.kind === 'human') expect(d.bandDisplayPoints).toBe(MAX_BAND_DISPLAY)
  })

  it('picks the roster bot nearest the learner on the DISPLAY scale', () => {
    const bots = BOT_ROSTER.map((b) => bot(b.slug, thetaFor(b.displayRating)))
    const chosen = nearestBotPerformance(thetaFor(1600), bots)
    expect(chosen.botSlug).toBe('kestrel-the-archivist')
    expect(botDisplayRating(chosen)).toBe(1580)
  })

  it('falls back to the seeded theta when a bot slug is not in the roster', () => {
    const orphan = bot('deprecated-bot', thetaFor(1234))
    expect(botBySlug('deprecated-bot')).toBeUndefined()
    expect(botDisplayRating(orphan)).toBeCloseTo(toDisplayScale(thetaFor(1234)), 6)
  })

  it('every roster bot is labeled with a slug and a name', () => {
    for (const b of BOT_ROSTER) {
      expect(b.slug).toMatch(/^[a-z0-9-]+$/)
      expect(b.name.length).toBeGreaterThan(0)
      expect(botBySlug(b.slug)).toEqual(b)
    }
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
      performance: bot('sable-the-lantern-keeper', 2.3),
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
      bot_slug: 'sable-the-lantern-keeper',
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
  opts: { theta?: number | null; ladderIsRated?: boolean; open?: { matchId: string; isRated: boolean } | null } = {},
): MatchmakingQueries & { created: Created[]; poolRequests: number } {
  const state = { created: [] as Created[], poolRequests: 0 }
  return {
    get created() {
      return state.created
    },
    get poolRequests() {
      return state.poolRequests
    },
    async fetchLadderIsRated() {
      return opts.ladderIsRated ?? true
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
    const q = fakeQueries([bot('mira-the-cartographer', thetaFor(1340))])
    const res = await findGhostMatch(input, { queries: q, newMatchId: () => 'm-bot' })
    expect(res).toMatchObject({ ok: true, isRated: false })
    if (res.ok && !res.reused) expect(res.opponent.kind).toBe('bot')
    expect(q.created[0]!.match.is_rated).toBe(false)
    expect(q.created[0]!.participants[1]!.is_bot).toBe(true)
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
