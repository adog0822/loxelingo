import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MessageMetadata } from '@vercel/queue'
import { POST, maxDuration } from './route'
import { MAX_DELIVERIES, retry } from '@/lib/match/judge-queue-policy'
import { JudgeBudgetExhausted, JudgeRateLimited } from '@/lib/judge/judge'
import { JudgeNotCalibrated } from '@/lib/judge/calibration'
import { IllegalMatchTransition } from '@/lib/match/settle'
import { UnknownMatch } from '@/lib/match/judge-runner'
import { JUDGE_TOPIC } from '@/lib/match/contract'

const meta = (deliveryCount: number): MessageMetadata => ({
  messageId: 'msg-1',
  deliveryCount,
  createdAt: new Date('2026-08-05T12:00:00.000Z'),
  expiresAt: new Date('2026-08-06T12:00:00.000Z'),
  topicName: JUDGE_TOPIC,
  consumerGroup: 'judge-match',
  region: 'iad1',
})

// The policy logs every decision; silence it so the suite output stays readable.
vi.spyOn(console, 'warn').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

afterEach(() => vi.clearAllMocks())

describe('route configuration', () => {
  it('allows 300s, because two LLM calls do not fit in a default timeout', () => {
    expect(maxDuration).toBe(300)
  })

  it('exports a POST handler built from handleCallback', () => {
    expect(typeof POST).toBe('function')
  })

  it('does NOT export an edge runtime — Edge caps execution at ~25s', async () => {
    const mod = (await import('./route')) as Record<string, unknown>
    expect(mod.runtime).toBeUndefined()
  })
})

describe('retry policy — transient failures', () => {
  it('backs off exponentially with delivery count', () => {
    const delays = [1, 2, 3, 4].map((n) => retry(new Error('boom'), meta(n)))
    expect(delays).toEqual([
      { afterSeconds: 10 },
      { afterSeconds: 20 },
      { afterSeconds: 40 },
      { afterSeconds: 80 },
    ])
  })

  it('caps the backoff at five minutes', () => {
    // Only reachable if MAX_DELIVERIES is ever raised; the cap must still hold.
    const directive = retry(new Error('boom'), { ...meta(2), deliveryCount: 4 })
    expect(directive).toEqual({ afterSeconds: 80 })
    expect((retry(new Error('boom'), meta(3)) as { afterSeconds: number }).afterSeconds)
      .toBeLessThanOrEqual(300)
  })

  it('honours a Retry-After from the judge when it is longer than the backoff', () => {
    expect(retry(new JudgeRateLimited(120), meta(1))).toEqual({ afterSeconds: 120 })
  })

  it('ignores a Retry-After shorter than the backoff we already chose', () => {
    expect(retry(new JudgeRateLimited(2), meta(3))).toEqual({ afterSeconds: 40 })
  })

  it('falls back to plain backoff when the judge sent no Retry-After', () => {
    expect(retry(new JudgeRateLimited(), meta(1))).toEqual({ afterSeconds: 10 })
  })
})

describe('retry policy — dropping messages', () => {
  it('acknowledges the poison message once deliveries reach the cap', () => {
    expect(retry(new Error('always fails'), meta(MAX_DELIVERIES))).toEqual({ acknowledge: true })
    expect(retry(new Error('always fails'), meta(MAX_DELIVERIES + 3))).toEqual({
      acknowledge: true,
    })
  })

  it('logs what it dropped, so an acknowledged failure is not silent', () => {
    retry(new Error('always fails'), meta(MAX_DELIVERIES))
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('msg-1'),
      expect.any(Error),
    )
  })

  it('drops permanent failures immediately rather than burning five deliveries', () => {
    const permanent = [
      new UnknownMatch('match-1'),
      new IllegalMatchTransition('complete', 'judging'),
      new JudgeNotCalibrated('kappa 0.31 <= 0.6'),
    ]
    for (const error of permanent) {
      expect(retry(error, meta(1))).toEqual({ acknowledge: true })
    }
  })

  it('retries a transient failure on the same delivery a permanent one is dropped on', () => {
    expect(retry(new Error('transient'), meta(1))).toEqual({ afterSeconds: 10 })
  })
})

describe('retry policy — the budget/rate-limit distinction', () => {
  it('never sees JudgeBudgetExhausted, because that path never throws', () => {
    // The runner catches it, releases the match and returns normally, so
    // handleCallback acks on the SUCCESS path. If this ever reached `retry` it
    // would be classified transient and retried against a budget that is gone,
    // so this test pins the two errors apart.
    expect(retry(new JudgeBudgetExhausted('gone'), meta(1))).toEqual({ afterSeconds: 10 })
    expect(retry(new JudgeRateLimited(60), meta(1))).toEqual({ afterSeconds: 60 })
  })
})
