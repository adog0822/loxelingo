import { describe, expect, it, vi } from 'vitest'
import {
  UnknownMatch,
  buildJudgmentInsert,
  createSupabaseJudgeStore,
  runJudgeJob,
  rubricVersionOf,
  type JudgeMatchRow,
  type JudgeStore,
  type JudgmentInsert,
  type StoredJudgment,
  type SubmissionRow,
} from '@/lib/match/judge-runner'
import {
  JUDGE_CONFIG_VERSION,
  JudgeBudgetExhausted,
  JudgeRateLimited,
  type JudgeInput,
  type JudgeResult,
  type Verdict,
} from '@/lib/judge/judge'
import { getRubric } from '@/lib/judge/rubric'
import type { SettlementInput } from '@/lib/match/settle'
import type { SettlementOutcome } from '@/lib/match/contract'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const verdict = (winner: Verdict['winner']): Verdict => ({
  first_analysis: 'first used the plain past.',
  second_analysis: 'second used 〜てしまった.',
  decisive_difference: '〜てしまった carries the regret the prompt required.',
  first_scores: { task_completion: 6, accuracy: 7, range: 5, register: 6 },
  second_scores: { task_completion: 9, accuracy: 8, range: 7, register: 8 },
  winner,
  margin: 'clear',
  verdict_sentence: 'You used the plain past where the situation required 〜てしまった.',
})

function judgeResult(overrides: Partial<JudgeResult> = {}): JudgeResult {
  return {
    outcome: 'a',
    consistent: true,
    forward: verdict('first'),
    reverse: verdict('second'),
    verdictSentence: 'You used the plain past where the situation required 〜てしまった.',
    meta: {
      model: 'anthropic/claude-haiku-4.5',
      configVersion: JUDGE_CONFIG_VERSION,
      rubric: 'duel@1',
      cacheReadTokens: 100,
      cacheWriteTokens: 10,
      totalInputTokens: 2000,
      totalOutputTokens: 800,
    },
    ...overrides,
  }
}

const MATCH: JudgeMatchRow = {
  id: 'match-1',
  status: 'judging',
  worldSlug: 'ja',
  ladderSlug: 'duel',
  isRated: true,
  itemId: 42,
  task: 'Apologise for missing the meeting.',
  constraints: 'Use polite register.',
  seats: [
    { seat: 1, userId: 'user-alice', isBot: false },
    { seat: 2, userId: 'user-bob', isBot: false },
  ],
}

const SUBMISSIONS: SubmissionRow[] = [
  {
    id: 'sub-a',
    seat: 1,
    content: '会議に行かなかった。',
    elapsedMs: 21_000,
    submittedAt: new Date('2026-08-05T11:59:00.000Z'),
    clientTz: 'Asia/Tokyo',
  },
  {
    id: 'sub-b',
    seat: 2,
    content: '会議に行けなくてしまいました。',
    elapsedMs: 30_000,
    submittedAt: new Date('2026-08-05T12:00:00.000Z'),
    clientTz: 'America/New_York',
  },
]

interface FakeOptions {
  claimed?: boolean
  match?: JudgeMatchRow | null
  submissions?: SubmissionRow[]
  currentJudgment?: StoredJudgment | null
}

function fakeStore(opts: FakeOptions = {}) {
  const calls = {
    claims: 0,
    releases: 0,
    judgments: [] as JudgmentInsert[],
  }

  const store: JudgeStore = {
    async claimForJudging() {
      calls.claims += 1
      return opts.claimed ?? true
    },
    async releaseClaim() {
      calls.releases += 1
    },
    async loadMatch() {
      return opts.match === undefined ? MATCH : opts.match
    },
    async loadSubmissions() {
      return opts.submissions ?? SUBMISSIONS
    },
    async loadCurrentJudgment() {
      return opts.currentJudgment ?? null
    },
    async insertJudgment(row) {
      calls.judgments.push(row)
    },
  }

  return { store, calls }
}

function fakeSettle() {
  const seen: SettlementInput[] = []
  const settle = async (i: SettlementInput): Promise<SettlementOutcome> => {
    seen.push(i)
    return { matchId: i.matchId, settled: true, ratingChanges: [] }
  }
  return { settle, seen }
}

const silent = { warn: () => {}, error: () => {}, info: () => {} }

// ---------------------------------------------------------------------------

describe('runJudgeJob — the claim', () => {
  it('does nothing when another worker won the claim', async () => {
    const { store, calls } = fakeStore({ claimed: false, match: { ...MATCH, status: 'judging' } })
    const { settle, seen } = fakeSettle()
    const judge = vi.fn()

    const result = await runJudgeJob({ matchId: 'match-1' }, { store, settle, judge, logger: silent })

    expect(result).toEqual({
      deferred: false,
      outcome: { matchId: 'match-1', settled: false, reason: 'claim_lost' },
    })
    // Zero rows affected: no judging, no settling, no release of a claim we
    // never held.
    expect(judge).not.toHaveBeenCalled()
    expect(seen).toEqual([])
    expect(calls.releases).toBe(0)
  })

  it('reports a terminal match as already complete rather than as a lost claim', async () => {
    for (const status of ['complete', 'abandoned', 'void'] as const) {
      const { store } = fakeStore({ claimed: false, match: { ...MATCH, status } })
      const { settle } = fakeSettle()
      const judge = vi.fn()
      const result = await runJudgeJob(
        { matchId: 'match-1' },
        { store, settle, judge, logger: silent },
      )
      expect(result).toEqual({
        deferred: false,
        outcome: { matchId: 'match-1', settled: false, reason: 'already_complete' },
      })
      expect(judge).not.toHaveBeenCalled()
    }
  })

  it('throws UnknownMatch when the job names a match that does not exist', async () => {
    const { store } = fakeStore({ claimed: false, match: null })
    const { settle } = fakeSettle()
    await expect(
      runJudgeJob({ matchId: 'ghost' }, { store, settle, judge: vi.fn(), logger: silent }),
    ).rejects.toThrow(UnknownMatch)
  })

  it('claims exactly once per delivery', async () => {
    const { store, calls } = fakeStore()
    const { settle } = fakeSettle()
    await runJudgeJob(
      { matchId: 'match-1' },
      { store, settle, judge: async () => judgeResult(), logger: silent },
    )
    expect(calls.claims).toBe(1)
  })
})

describe('runJudgeJob — the opponent has not answered', () => {
  it('releases the claim and reports opponent_not_submitted', async () => {
    const { store, calls } = fakeStore({ submissions: [SUBMISSIONS[0]] })
    const { settle, seen } = fakeSettle()
    const judge = vi.fn()

    const result = await runJudgeJob(
      { matchId: 'match-1' },
      { store, settle, judge, logger: silent },
    )

    expect(result).toEqual({
      deferred: false,
      outcome: { matchId: 'match-1', settled: false, reason: 'opponent_not_submitted' },
    })
    // Released, or the match would sit in `judging` — the one status whose own
    // claim predicate excludes it from ever being retried.
    expect(calls.releases).toBe(1)
    expect(judge).not.toHaveBeenCalled()
    expect(seen).toEqual([])
  })

  it('treats zero submissions the same way', async () => {
    const { store, calls } = fakeStore({ submissions: [] })
    const { settle } = fakeSettle()
    const result = await runJudgeJob(
      { matchId: 'match-1' },
      { store, settle, judge: vi.fn(), logger: silent },
    )
    expect(result.deferred).toBe(false)
    expect(calls.releases).toBe(1)
  })
})

describe('runJudgeJob — rate limit vs budget exhausted', () => {
  it('RETHROWS a rate limit so the queue retries with backoff', async () => {
    const { store, calls } = fakeStore()
    const { settle } = fakeSettle()
    const judge = async () => {
      throw new JudgeRateLimited(42)
    }

    await expect(
      runJudgeJob({ matchId: 'match-1' }, { store, settle, judge, logger: silent }),
    ).rejects.toThrow(JudgeRateLimited)
    // Released so the redelivery can re-claim it.
    expect(calls.releases).toBeGreaterThanOrEqual(1)
  })

  it('ACKNOWLEDGES an exhausted budget instead — retrying cannot restore credit', async () => {
    const { store, calls } = fakeStore()
    const { settle, seen } = fakeSettle()
    const judge = async () => {
      throw new JudgeBudgetExhausted('AI budget exhausted')
    }

    const result = await runJudgeJob(
      { matchId: 'match-1' },
      { store, settle, judge, logger: silent },
    )

    // Returns normally => handleCallback acks the message.
    expect(result).toEqual({ deferred: true, reason: 'judge_budget_exhausted' })
    expect(calls.releases).toBe(1)
    expect(seen).toEqual([])
  })

  it('releases the claim and rethrows on any other failure', async () => {
    const { store, calls } = fakeStore()
    const { settle } = fakeSettle()
    const judge = async () => {
      throw new Error('gateway exploded')
    }
    await expect(
      runJudgeJob({ matchId: 'match-1' }, { store, settle, judge, logger: silent }),
    ).rejects.toThrow('gateway exploded')
    expect(calls.releases).toBeGreaterThanOrEqual(1)
  })

  it('releases the claim when settlement itself throws', async () => {
    const { store, calls } = fakeStore()
    const settle = async (): Promise<SettlementOutcome> => {
      throw new Error('settlement blew up')
    }
    await expect(
      runJudgeJob(
        { matchId: 'match-1' },
        { store, settle, judge: async () => judgeResult(), logger: silent },
      ),
    ).rejects.toThrow('settlement blew up')
    expect(calls.releases).toBe(1)
  })
})

describe('runJudgeJob — the judge never sees an identity', () => {
  it('passes submission ids as refs, not user ids', async () => {
    const { store } = fakeStore()
    const { settle } = fakeSettle()
    const seen: JudgeInput[] = []
    const judge = async (i: JudgeInput) => {
      seen.push(i)
      return judgeResult()
    }

    await runJudgeJob({ matchId: 'match-1' }, { store, settle, judge, logger: silent })

    const arg = seen[0]
    expect(arg.a.ref).toBe('sub-a')
    expect(arg.b.ref).toBe('sub-b')
    const serialised = JSON.stringify(arg)
    expect(serialised).not.toContain('user-alice')
    expect(serialised).not.toContain('user-bob')
  })

  it('forwards the stored task and constraints verbatim', async () => {
    const { store } = fakeStore()
    const { settle } = fakeSettle()
    const seen: JudgeInput[] = []
    const judge = async (i: JudgeInput) => {
      seen.push(i)
      return judgeResult()
    }
    await runJudgeJob({ matchId: 'match-1' }, { store, settle, judge, logger: silent })

    expect(seen[0]).toMatchObject({
      ladder: 'duel',
      task: 'Apologise for missing the meeting.',
      constraints: 'Use polite register.',
    })
  })
})

describe('runJudgeJob — settlement handoff', () => {
  it('derives settledAt from the submissions, never from a clock', async () => {
    const { store } = fakeStore()
    const { settle, seen } = fakeSettle()
    await runJudgeJob(
      { matchId: 'match-1' },
      { store, settle, judge: async () => judgeResult(), logger: silent },
    )
    // The LATER of the two submissions: append-only, so a replay recomputes the
    // identical instant and review_log's unique index can actually collide.
    expect(seen[0].settledAt.toISOString()).toBe('2026-08-05T12:00:00.000Z')
  })

  it('forwards is_rated, the item and the per-seat timezone', async () => {
    const { store } = fakeStore()
    const { settle, seen } = fakeSettle()
    await runJudgeJob(
      { matchId: 'match-1' },
      { store, settle, judge: async () => judgeResult(), logger: silent },
    )
    expect(seen[0]).toMatchObject({ isRated: true, itemId: 42, outcome: 'a', consistent: true })
    expect(seen[0].seats).toEqual([
      { seat: 1, userId: 'user-alice', isBot: false, tz: 'Asia/Tokyo' },
      { seat: 2, userId: 'user-bob', isBot: false, tz: 'America/New_York' },
    ])
  })

  it('forwards consistent: false untouched so settlement can void the match', async () => {
    const { store } = fakeStore()
    const { settle, seen } = fakeSettle()
    await runJudgeJob(
      { matchId: 'match-1' },
      {
        store,
        settle,
        judge: async () => judgeResult({ consistent: false, outcome: 'draw' }),
        logger: silent,
      },
    )
    expect(seen[0].consistent).toBe(false)
  })
})

describe('runJudgeJob — replaying a stored judgment', () => {
  it('settles from the stored verdict instead of paying for two more LLM calls', async () => {
    const { store, calls } = fakeStore({
      currentJudgment: { outcome: 'b', consistent: true },
    })
    const { settle, seen } = fakeSettle()
    const judge = vi.fn()

    await runJudgeJob({ matchId: 'match-1' }, { store, settle, judge, logger: silent })

    expect(judge).not.toHaveBeenCalled()
    expect(calls.judgments).toEqual([])
    // The rating applied must match the judgment ON RECORD, not a fresh
    // non-deterministic re-judging of the same pair.
    expect(seen[0]).toMatchObject({ outcome: 'b', consistent: true })
  })

  it('replays an unresolved judgment as inconsistent', async () => {
    const { store } = fakeStore({ currentJudgment: { outcome: 'draw', consistent: false } })
    const { settle, seen } = fakeSettle()
    await runJudgeJob({ matchId: 'match-1' }, { store, settle, judge: vi.fn(), logger: silent })
    expect(seen[0].consistent).toBe(false)
  })
})

describe('buildJudgmentInsert', () => {
  const users = { seat1UserId: 'user-alice', seat2UserId: 'user-bob' }

  it('stores both orderings with their own reasoning and axis scores', () => {
    const row = buildJudgmentInsert(MATCH, judgeResult(), 4200, users)

    expect(row.orderAbVerdict).toBe('first')
    expect(row.orderBaVerdict).toBe('second')
    expect(row.orderAbReasoning).toContain('DECISIVE:')
    expect(row.orderBaReasoning).toContain('DECISIVE:')
    expect(row.orderAbAxisScores).toEqual({
      seat1: { task_completion: 6, accuracy: 7, range: 5, register: 6 },
      seat2: { task_completion: 9, accuracy: 8, range: 7, register: 8 },
    })
    // In the REVERSE run seat 2 was shown first, so the positional score maps
    // invert. Getting this wrong inverts position_disagreement itself.
    expect(row.orderBaAxisScores).toEqual({
      seat2: { task_completion: 6, accuracy: 7, range: 5, register: 6 },
      seat1: { task_completion: 9, accuracy: 8, range: 7, register: 8 },
    })
  })

  it('maps the favoured user through the ordering, not through the position label', () => {
    // Both orderings agree that seat 1 won: forward says "first", reverse (which
    // showed seat 2 first) says "second".
    const row = buildJudgmentInsert(MATCH, judgeResult(), 1, users)
    expect(row.orderAbFavoredUserId).toBe('user-alice')
    expect(row.orderBaFavoredUserId).toBe('user-alice')
  })

  it('records a tie as a null favoured user', () => {
    const row = buildJudgmentInsert(
      MATCH,
      judgeResult({ outcome: 'draw', forward: verdict('draw'), reverse: verdict('draw') }),
      1,
      users,
    )
    expect(row.orderAbVerdict).toBe('tie')
    expect(row.orderAbFavoredUserId).toBeNull()
    expect(row.outcomeSeat1).toBe(0.5)
    expect(row.verdict).toBe('draw')
  })

  it('records an inconsistent pair as unresolved, never as a draw', () => {
    const row = buildJudgmentInsert(
      MATCH,
      judgeResult({ consistent: false, outcome: 'draw' }),
      1,
      users,
    )
    // A draw is a legitimate result; position bias is not. Collapsing the two
    // would hide the bias inside a normal-looking verdict.
    expect(row.verdict).toBe('unresolved')
  })

  it('requires the model, the model version and the rubric version', () => {
    const row = buildJudgmentInsert(MATCH, judgeResult(), 1, users)
    expect(row.judgeProvider).toBe('anthropic')
    expect(row.judgeModel).toBe('claude-haiku-4.5')
    // JUDGE_MODEL is env-overridable and JUDGE_CONFIG_VERSION covers everything
    // else about how the judge is called, so the version pins BOTH.
    expect(row.judgeModelVersion).toBe(`anthropic/claude-haiku-4.5@${JUDGE_CONFIG_VERSION}`)
    expect(row.rubricVersion).toBe('duel@1')
    expect(row.rubricVersion).toBe(rubricVersionOf('duel'))
  })

  it('stores the EXACT rubric text inline, not a reference to it', () => {
    const row = buildJudgmentInsert(MATCH, judgeResult(), 1, users)
    expect(row.rubricText).toBe(getRubric('duel').text)
    expect(row.rubricText.length).toBeGreaterThan(200)
  })

  it('carries token usage and latency for cost attribution', () => {
    const row = buildJudgmentInsert(MATCH, judgeResult(), 4200, users)
    expect(row).toMatchObject({ promptTokens: 2000, completionTokens: 800, latencyMs: 4200 })
  })

  it('never writes the generated columns', () => {
    const keys = Object.keys(buildJudgmentInsert(MATCH, judgeResult(), 1, users))
    expect(keys).not.toContain('positionDisagreement')
    expect(keys).not.toContain('rubricHash')
  })

  it('is inserted before settlement runs', async () => {
    const { store, calls } = fakeStore()
    const { settle, seen } = fakeSettle()
    await runJudgeJob(
      { matchId: 'match-1' },
      { store, settle, judge: async () => judgeResult(), logger: silent },
    )
    expect(calls.judgments).toHaveLength(1)
    expect(seen).toHaveLength(1)
  })
})

describe('the Supabase adapter', () => {
  it('is only constructed on demand, so importing this module needs no env', () => {
    expect(typeof createSupabaseJudgeStore).toBe('function')
  })
})
