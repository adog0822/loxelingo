import { describe, expect, it } from 'vitest'

import { JUDGE_TOPIC, judgeIdempotencyKey } from '@/lib/match/contract'
import {
  deriveIntegrityFlags,
  IMPLAUSIBLE_CHARS_PER_SECOND,
  isValidIanaTimeZone,
  JUDGE_RETENTION_SECONDS,
  MAX_CONTENT_CHARS,
  serverElapsedMs,
  shouldEnqueue,
  submitAnswer,
  SubmitInputSchema,
  TIME_LIMIT_GRACE_MS,
  type MatchRow,
  type SeatRow,
  type SubmissionInsert,
  type SubmitDeps,
  type SubmitQueries,
} from './submit'

/** The exact `send` shape `submitAnswer` accepts, so the fakes never need `any`. */
type QueueSend = NonNullable<SubmitDeps['send']>

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const MATCH_ID = '11111111-1111-4111-8111-111111111111'
const START = '2026-08-05T12:00:00.000Z'
const NOW = new Date('2026-08-05T12:00:30.000Z') // 30s after the seat was created

type SeatSpec = { seat: 1 | 2; userId: string | null; isBot?: boolean; hasSubmission?: boolean }

/**
 * In-memory `submissions` table with the real `submissions_one_per_seat` unique constraint,
 * so the dedupe path is exercised the way Postgres would exercise it.
 */
function fakeQueries(
  seats: readonly SeatSpec[],
  opts: { status?: MatchRow['status']; timeLimitMs?: number | null } = {},
) {
  const rows = new Map<string, SubmissionInsert & { id: string }>()
  let nextId = 1
  const inserts: SubmissionInsert[] = []
  const marks: { seat: 1 | 2; at: Date }[] = []

  for (const s of seats) {
    if (s.hasSubmission) {
      const key = `${MATCH_ID}:${s.seat}`
      rows.set(key, {
        id: `existing-${s.seat}`,
        match_id: MATCH_ID,
        user_id: s.userId ?? '',
        seat: s.seat,
        content: 'ghost answer',
        media_path: null,
        selected_option: null,
        elapsed_ms: 1000,
        paste_detected: false,
        keystroke_features: null,
        client_tz: null,
        integrity_flags: {},
      })
    }
  }

  const queries: SubmitQueries = {
    async fetchMatch(matchId) {
      if (matchId !== MATCH_ID) return null
      return {
        id: MATCH_ID,
        status: opts.status ?? 'awaiting_opponent',
        timeLimitMs: opts.timeLimitMs === undefined ? 60_000 : opts.timeLimitMs,
      }
    },
    async fetchSeats() {
      return seats.map(
        (s): SeatRow & { hasSubmission: boolean } => ({
          matchId: MATCH_ID,
          seat: s.seat,
          userId: s.userId,
          isBot: s.isBot ?? false,
          createdAt: START,
          submittedAt: rows.has(`${MATCH_ID}:${s.seat}`) ? START : null,
          hasSubmission: rows.has(`${MATCH_ID}:${s.seat}`),
        }),
      )
    },
    async insertSubmission(row) {
      inserts.push(row)
      const key = `${row.match_id}:${row.seat}`
      const existing = rows.get(key)
      if (existing) return { id: existing.id, deduped: true } // SQLSTATE 23505 path
      const id = `sub-${nextId++}`
      rows.set(key, { ...row, id })
      return { id, deduped: false }
    },
    async markSeatSubmitted(_matchId, seat, at) {
      marks.push({ seat, at })
    },
  }

  return { queries, rows, inserts, marks }
}

type SendCall = { topic: string; payload: unknown; opts?: { idempotencyKey?: string; retentionSeconds?: number } }

function fakeSend() {
  const calls: SendCall[] = []
  const send = (async (topic: string, payload: unknown, opts?: SendCall['opts']) => {
    calls.push({ topic, payload, opts })
    return { messageId: `msg-${calls.length}` }
  }) as unknown as QueueSend
  return { send, calls }
}

const validInput = { matchId: MATCH_ID, content: 'これは答えです' }

// ---------------------------------------------------------------------------

describe('input validation', () => {
  it('accepts a well-formed submission', () => {
    expect(SubmitInputSchema.safeParse(validInput).success).toBe(true)
  })

  it('rejects a submission carrying neither content nor a selected option', () => {
    const r = SubmitInputSchema.safeParse({ matchId: validInput.matchId })
    expect(r.success).toBe(false)
    const blank = SubmitInputSchema.safeParse({ matchId: validInput.matchId, content: '   ' })
    expect(blank.success).toBe(false)
  })

  it('rejects a non-uuid match id', () => {
    expect(SubmitInputSchema.safeParse({ ...validInput, matchId: 'm-1' }).success).toBe(false)
  })

  it('rejects unknown keys — a client cannot smuggle its own seat or user id', () => {
    expect(
      SubmitInputSchema.safeParse({ ...validInput, seat: 2, userId: 'someone-else' }).success,
    ).toBe(false)
  })

  it('bounds content length', () => {
    const ok = SubmitInputSchema.safeParse({ ...validInput, content: 'a'.repeat(MAX_CONTENT_CHARS) })
    expect(ok.success).toBe(true)
    const tooLong = SubmitInputSchema.safeParse({
      ...validInput,
      content: 'a'.repeat(MAX_CONTENT_CHARS + 1),
    })
    expect(tooLong.success).toBe(false)
  })

  it('bounds keystroke features and rejects unknown feature keys', () => {
    expect(
      SubmitInputSchema.safeParse({
        ...validInput,
        keystrokeFeatures: { keyCount: 120, meanInterKeyMs: 180 },
      }).success,
    ).toBe(true)
    expect(
      SubmitInputSchema.safeParse({
        ...validInput,
        keystrokeFeatures: { keyCount: 10 ** 9 },
      }).success,
    ).toBe(false)
    expect(
      SubmitInputSchema.safeParse({
        ...validInput,
        keystrokeFeatures: { payload: 'x'.repeat(10) },
      }).success,
    ).toBe(false)
  })

  it('validates the time zone against the runtime zone table, not a regex', () => {
    expect(isValidIanaTimeZone('America/New_York')).toBe(true)
    expect(isValidIanaTimeZone('Asia/Tokyo')).toBe(true)
    expect(isValidIanaTimeZone('UTC')).toBe(true)
    expect(isValidIanaTimeZone('Foo/Bar')).toBe(false) // a regex would accept this
    expect(isValidIanaTimeZone('')).toBe(false)
    expect(isValidIanaTimeZone('x'.repeat(200))).toBe(false)
  })
})

describe('integrity signals', () => {
  it('measures elapsed time from the seat clock, never below zero', () => {
    expect(serverElapsedMs(START, NOW)).toBe(30_000)
    expect(serverElapsedMs(START, new Date('2026-08-05T11:59:00Z'))).toBe(0)
    expect(serverElapsedMs('not a date', NOW)).toBe(0)
  })

  it('records the client stopwatch and the gap, without using it', () => {
    const f = deriveIntegrityFlags({
      serverElapsedMs: 30_000,
      clientElapsedMs: 9_000,
      timeLimitMs: 60_000,
      contentLength: 40,
    })
    expect(f.client_elapsed_ms).toBe(9_000)
    expect(f.client_elapsed_delta_ms).toBe(21_000)
  })

  it('flags an over-limit answer with how late it was', () => {
    const late = deriveIntegrityFlags({
      serverElapsedMs: 70_000,
      timeLimitMs: 60_000,
      contentLength: 100,
    })
    expect(late.over_time_limit).toBe(true)
    expect(late.late_by_ms).toBe(10_000)
  })

  it('does not flag an answer inside the latency grace', () => {
    const f = deriveIntegrityFlags({
      serverElapsedMs: 60_000 + TIME_LIMIT_GRACE_MS - 1,
      timeLimitMs: 60_000,
      contentLength: 100,
    })
    expect(f.over_time_limit).toBeUndefined()
  })

  it('flags an impossible typing rate even when the client reports no paste', () => {
    const f = deriveIntegrityFlags({
      serverElapsedMs: 1_000,
      timeLimitMs: null,
      contentLength: IMPLAUSIBLE_CHARS_PER_SECOND + 50,
    })
    expect(f.implausible_typing_rate).toBe(true)
    expect(f.chars_per_second).toBeGreaterThan(IMPLAUSIBLE_CHARS_PER_SECOND)
    expect(f.paste_detected_client).toBeUndefined()
  })

  it('does not flag an ordinary typing rate', () => {
    const f = deriveIntegrityFlags({
      serverElapsedMs: 30_000,
      timeLimitMs: 60_000,
      contentLength: 120,
    })
    expect(f.implausible_typing_rate).toBeUndefined()
    expect(f.chars_per_second).toBeCloseTo(4, 6)
  })

  it('records a client paste report as a one-way flag', () => {
    expect(
      deriveIntegrityFlags({
        serverElapsedMs: 30_000,
        timeLimitMs: null,
        contentLength: 10,
        pasteDetected: true,
      }).paste_detected_client,
    ).toBe(true)
    expect(
      deriveIntegrityFlags({
        serverElapsedMs: 30_000,
        timeLimitMs: null,
        contentLength: 10,
        pasteDetected: false,
      }).paste_detected_client,
    ).toBeUndefined()
  })
})

describe('shouldEnqueue', () => {
  it('is true only when both distinct seats have a submission', () => {
    expect(
      shouldEnqueue([
        { seat: 1, hasSubmission: true },
        { seat: 2, hasSubmission: true },
      ]),
    ).toBe(true)
    expect(
      shouldEnqueue([
        { seat: 1, hasSubmission: true },
        { seat: 2, hasSubmission: false },
      ]),
    ).toBe(false)
    expect(shouldEnqueue([{ seat: 1, hasSubmission: true }])).toBe(false)
    expect(
      shouldEnqueue([
        { seat: 1, hasSubmission: true },
        { seat: 1, hasSubmission: true },
      ]),
    ).toBe(false)
    expect(shouldEnqueue([])).toBe(false)
  })
})

describe('submitAnswer', () => {
  const now = () => NOW

  it('leaves the match awaiting_opponent and sends nothing when only one seat has answered', async () => {
    const f = fakeQueries([
      { seat: 1, userId: 'me' },
      { seat: 2, userId: 'you' },
    ])
    const q = fakeSend()
    const res = await submitAnswer('me', validInput, { queries: f.queries, send: q.send, now })

    expect(res).toMatchObject({ ok: true, seat: 1, enqueued: false, matchStatus: 'awaiting_opponent' })
    expect(q.calls).toHaveLength(0)
    expect(f.inserts).toHaveLength(1)
  })

  it('enqueues exactly once, on the right topic and key, when the second seat lands', async () => {
    const f = fakeQueries([
      { seat: 1, userId: 'me' },
      { seat: 2, userId: 'ghost', hasSubmission: true },
    ])
    const q = fakeSend()
    const res = await submitAnswer('me', validInput, { queries: f.queries, send: q.send, now })

    expect(res).toMatchObject({ ok: true, enqueued: true, matchStatus: 'queued_for_judging' })
    expect(q.calls).toHaveLength(1)
    expect(q.calls[0]!.topic).toBe(JUDGE_TOPIC)
    expect(q.calls[0]!.payload).toEqual({ matchId: validInput.matchId })
    expect(q.calls[0]!.opts?.idempotencyKey).toBe(judgeIdempotencyKey(validInput.matchId))
    expect(q.calls[0]!.opts?.retentionSeconds).toBe(JUDGE_RETENTION_SECONDS)
  })

  it('a retried submission creates no second row and re-sends under the SAME key', async () => {
    const f = fakeQueries([
      { seat: 1, userId: 'me' },
      { seat: 2, userId: 'ghost', hasSubmission: true },
    ])
    const q = fakeSend()

    const first = await submitAnswer('me', validInput, { queries: f.queries, send: q.send, now })
    const retry = await submitAnswer('me', validInput, { queries: f.queries, send: q.send, now })

    expect(first).toMatchObject({ ok: true, deduped: false })
    expect(retry).toMatchObject({ ok: true, deduped: true })
    if (first.ok && retry.ok) expect(retry.submissionId).toBe(first.submissionId)

    // One row, because submissions_one_per_seat rejected the second insert.
    expect([...f.rows.keys()]).toEqual([`${MATCH_ID}:2`, `${MATCH_ID}:1`])
    // Two sends, ONE distinct queue message: the key is identical, so the queue dedupes.
    expect(q.calls).toHaveLength(2)
    expect(new Set(q.calls.map((c) => c.opts?.idempotencyKey)).size).toBe(1)
    // The seat timestamp is written once only.
    expect(f.marks).toHaveLength(1)
  })

  it('both players submitting produces two enqueue attempts under one key', async () => {
    // A live/direct-challenge match: neither seat has answered yet.
    const f = fakeQueries([
      { seat: 1, userId: 'alice' },
      { seat: 2, userId: 'bob' },
    ])
    const q = fakeSend()

    const a = await submitAnswer('alice', validInput, { queries: f.queries, send: q.send, now })
    expect(a).toMatchObject({ enqueued: false })

    const b = await submitAnswer('bob', validInput, { queries: f.queries, send: q.send, now })
    expect(b).toMatchObject({ enqueued: true })

    // Bob retries; the row dedupes, the send repeats under the same key.
    const bAgain = await submitAnswer('bob', validInput, { queries: f.queries, send: q.send, now })
    expect(bAgain).toMatchObject({ ok: true, deduped: true, enqueued: true })

    expect(f.rows.size).toBe(2)
    expect(q.calls).toHaveLength(2)
    expect(new Set(q.calls.map((c) => c.opts?.idempotencyKey)).size).toBe(1)
  })

  it('ignores client-supplied timing and stores the server measurement', async () => {
    const f = fakeQueries([
      { seat: 1, userId: 'me' },
      { seat: 2, userId: 'you' },
    ])
    const q = fakeSend()
    await submitAnswer(
      'me',
      { ...validInput, clientElapsedMs: 1 },
      { queries: f.queries, send: q.send, now },
    )
    const row = f.inserts[0]!
    expect(row.elapsed_ms).toBe(30_000) // server clock, not the client's "1ms"
    expect(row.integrity_flags.client_elapsed_ms).toBe(1)
    expect(row.integrity_flags.client_elapsed_delta_ms).toBe(29_999)
  })

  it('takes the seat from the database, never from the caller', async () => {
    const f = fakeQueries([
      { seat: 1, userId: 'someone-else' },
      { seat: 2, userId: 'me' },
    ])
    const q = fakeSend()
    const res = await submitAnswer('me', validInput, { queries: f.queries, send: q.send, now })
    expect(res).toMatchObject({ ok: true, seat: 2 })
    expect(f.inserts[0]!.user_id).toBe('me')
  })

  it('refuses a user who does not hold a seat, without confirming the match exists', async () => {
    const f = fakeQueries([
      { seat: 1, userId: 'alice' },
      { seat: 2, userId: 'bob' },
    ])
    const q = fakeSend()
    const intruder = await submitAnswer('mallory', validInput, {
      queries: f.queries,
      send: q.send,
      now,
    })
    const missing = await submitAnswer('alice', { ...validInput, matchId: '22222222-2222-4222-8222-222222222222' }, {
      queries: f.queries,
      send: q.send,
      now,
    })
    expect(intruder).toEqual({ ok: false, code: 'not_a_participant', message: 'no such match for this user' })
    // Indistinguishable from the intruder case, deliberately.
    expect(missing).toEqual(intruder)
    expect(f.inserts).toHaveLength(0)
  })

  it('cannot be used to answer for a bot seat', async () => {
    const f = fakeQueries([
      { seat: 1, userId: null, isBot: true },
      { seat: 2, userId: 'me' },
    ])
    const q = fakeSend()
    const res = await submitAnswer('me', validInput, { queries: f.queries, send: q.send, now })
    expect(res).toMatchObject({ ok: true, seat: 2 })
  })

  it('refuses once judging has begun — an answer is final', async () => {
    for (const status of ['judging', 'complete', 'abandoned', 'void'] as const) {
      const f = fakeQueries([{ seat: 1, userId: 'me' }, { seat: 2, userId: 'you' }], { status })
      const q = fakeSend()
      const res = await submitAnswer('me', validInput, { queries: f.queries, send: q.send, now })
      expect(res).toMatchObject({ ok: false, code: 'match_not_open' })
      expect(f.inserts).toHaveLength(0)
      expect(q.calls).toHaveLength(0)
    }
  })

  it('rejects malformed input before touching the database', async () => {
    const f = fakeQueries([{ seat: 1, userId: 'me' }, { seat: 2, userId: 'you' }])
    const q = fakeSend()
    const res = await submitAnswer('me', { matchId: 'nope' }, { queries: f.queries, send: q.send, now })
    expect(res).toMatchObject({ ok: false, code: 'invalid_input' })
    expect(f.inserts).toHaveLength(0)
  })

  it('drops an unparseable time zone and flags it, rather than storing garbage', async () => {
    const f = fakeQueries([{ seat: 1, userId: 'me' }, { seat: 2, userId: 'you' }])
    const q = fakeSend()
    await submitAnswer(
      'me',
      { ...validInput, clientTz: 'Foo/Bar' },
      { queries: f.queries, send: q.send, now },
    )
    expect(f.inserts[0]!.client_tz).toBeNull()
    expect(f.inserts[0]!.integrity_flags.invalid_client_tz).toBe(true)
  })

  it('stores a valid time zone verbatim', async () => {
    const f = fakeQueries([{ seat: 1, userId: 'me' }, { seat: 2, userId: 'you' }])
    const q = fakeSend()
    await submitAnswer(
      'me',
      { ...validInput, clientTz: 'Asia/Tokyo', pasteDetected: true },
      { queries: f.queries, send: q.send, now },
    )
    expect(f.inserts[0]!.client_tz).toBe('Asia/Tokyo')
    expect(f.inserts[0]!.paste_detected).toBe(true)
  })

  it('never accepts a media path from a client (RECALL is playback-only)', async () => {
    const f = fakeQueries([{ seat: 1, userId: 'me' }, { seat: 2, userId: 'you' }])
    const q = fakeSend()
    // `media_path` is not even in the input schema; strict mode rejects the attempt.
    const smuggled = await submitAnswer(
      'me',
      { ...validInput, mediaPath: 'private/evidence.wav' },
      { queries: f.queries, send: q.send, now },
    )
    expect(smuggled).toMatchObject({ ok: false, code: 'invalid_input' })

    await submitAnswer('me', validInput, { queries: f.queries, send: q.send, now })
    expect(f.inserts[0]!.media_path).toBeNull()
  })

  it('reports an enqueue failure without rolling back the committed answer', async () => {
    const f = fakeQueries([
      { seat: 1, userId: 'me' },
      { seat: 2, userId: 'ghost', hasSubmission: true },
    ])
    const failing = (async () => {
      throw new Error('queue unavailable')
    }) as unknown as QueueSend
    const res = await submitAnswer('me', validInput, { queries: f.queries, send: failing, now })

    expect(res).toMatchObject({ ok: false, code: 'enqueue_failed', message: 'queue unavailable' })
    // The row survives: an answer must not become re-writable by forcing a queue error.
    expect(f.rows.has(`${MATCH_ID}:1`)).toBe(true)

    // The retry path then repairs it, with no second row.
    const q = fakeSend()
    const retry = await submitAnswer('me', validInput, { queries: f.queries, send: q.send, now })
    expect(retry).toMatchObject({ ok: true, deduped: true, enqueued: true })
    expect(f.rows.size).toBe(2)
  })
})
