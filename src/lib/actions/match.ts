'use server'

import { redirect } from 'next/navigation'
import { ensureSession } from '@/lib/auth/actions'
import { getSessionState } from '@/lib/auth/session'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { WORLD_IDS, langForWorld, type WorldId } from '@/lib/design/worlds'
import { selectTask, createTaskQueries } from '@/lib/match/tasks'
import { findGhostMatch, createMatchmakingQueries } from '@/lib/match/matchmaking'
import { submitAnswer, createSubmitQueries } from '@/lib/match/submit'
import type { LadderId } from '@/lib/judge/rubric'
import type {
  PromptPayload,
  VerdictPayload,
  VerdictSide,
  StartMatchResult,
  SubmitResult,
} from '@/lib/match/api'

/**
 * The only surface the match screens may call.
 *
 * Everything here runs with the SERVICE ROLE, because the tables involved
 * deliberately have no client RLS policies: `items` holds answer keys,
 * `submissions` holds the opponent's unrevealed answer, `matches` and
 * `judgments` are engine-owned. RLS is therefore NOT protecting these reads —
 * every ownership check is done in code below, and each one is commented as
 * such so it is never mistaken for redundant.
 */

const LADDERS = ['duel', 'recall', 'forge'] as const

function isWorldId(v: string): v is WorldId {
  return (WORLD_IDS as readonly string[]).includes(v)
}
function isLadderId(v: string): v is LadderId {
  return (LADDERS as readonly string[]).includes(v)
}

/**
 * WorldId ('zh') is the design-layer identifier; `worlds.slug` ('zh-Hans') is
 * the database one. `langForWorld` already maps between them exactly, so it is
 * the single bridge rather than a second lookup table that could drift.
 */
function slugFor(world: WorldId): string {
  return langForWorld(world)
}

/** Reverse of `slugFor`, for payloads that must hand a WorldId back to the UI. */
function worldFromSlug(slug: string): WorldId | null {
  return WORLD_IDS.find((id) => slugFor(id) === slug) ?? null
}

// ---------------------------------------------------------------------------
// startMatch
// ---------------------------------------------------------------------------

export async function startMatch(
  world: string,
  ladder: string,
): Promise<StartMatchResult> {
  // Re-validate: a Server Action is reachable by direct POST, so the route
  // params having been checked upstream proves nothing about this call.
  if (!isWorldId(world)) return { ok: false, reason: 'unknown_world' }
  if (!isLadderId(ladder)) return { ok: false, reason: 'unknown_ladder' }

  const session = await ensureSession()
  if (!session.ok) {
    // `rate_limited` is the one that will actually happen: guest creation is
    // IP-limited to 30/hour, so a school or office behind one NAT hits it.
    return { ok: false, reason: session.code === 'rate_limited' ? 'rate_limited' : 'no_session' }
  }

  const db = createServiceRoleClient()
  const worldSlug = slugFor(world)

  const { data: worldRow } = await db
    .from('worlds')
    .select('slug, is_launched')
    .eq('slug', worldSlug)
    .maybeSingle()

  if (!worldRow) return { ok: false, reason: 'unknown_world' }
  if (!worldRow.is_launched) return { ok: false, reason: 'world_not_launched' }

  let selection
  try {
    selection = await selectTask(
      { userId: session.data.userId, worldSlug, ladderSlug: ladder },
      { queries: createTaskQueries(db) },
    )
  } catch (error) {
    // selectTask throws when the candidate pool is empty for this world+ladder.
    // Log it: a swallowed throw here previously reported "no items" for a
    // perfectly well-stocked item bank and sent debugging down the wrong path.
    console.error('[startMatch] selectTask failed', { worldSlug, ladder, error })
    return { ok: false, reason: 'no_items' }
  }

  // The prompt is read here rather than inside selectTask, which deals in
  // difficulty and knows nothing about content.
  const { data: item } = await db
    .from('items')
    .select('prompt, constraint_text, time_limit_ms')
    .eq('id', selection.item.itemId)
    .maybeSingle()

  if (!item) return { ok: false, reason: 'no_items' }

  const found = await findGhostMatch(
    {
      userId: session.data.userId,
      worldSlug,
      ladderSlug: ladder,
      itemId: selection.item.itemId,
      promptSnapshot: item.prompt,
      constraintText: item.constraint_text ?? null,
      timeLimitMs: item.time_limit_ms ?? selection.item.timeLimitMs,
      seasonId: null,
    },
    { queries: createMatchmakingQueries(db) },
  )

  if (!found.ok) {
    // NOT `no_items` — an item was selected fine. This means the opponent pool
    // is empty: no stored human performance in any band, and no bot performance
    // either. On a fresh database that is always the unseeded bot pool.
    console.error('[startMatch] no opponent', { worldSlug, ladder, itemId: selection.item.itemId })
    return { ok: false, reason: 'no_opponent' }
  }

  return { ok: true, matchId: found.matchId }
}

// ---------------------------------------------------------------------------
// getPrompt
// ---------------------------------------------------------------------------

type PromptJson = {
  task?: unknown
  glyph?: unknown
  options?: unknown
  instruction?: unknown
  input?: { label?: unknown; multiline?: unknown; countLimit?: unknown; countUnit?: unknown }
}

export async function getPrompt(matchId: string): Promise<PromptPayload | null> {
  const session = await getSessionState()
  if (session.status === 'anonymous') return null

  const db = createServiceRoleClient()

  const { data: match } = await db
    .from('matches')
    .select('id, world_slug, ladder_slug, prompt_snapshot, constraint_text, time_limit_ms, created_at, status')
    .eq('id', matchId)
    .maybeSingle()

  if (!match) return null

  // OWNERSHIP CHECK — not redundant. The service role bypasses RLS entirely, so
  // without this any signed-in user could read any match by guessing an id.
  const { data: seat } = await db
    .from('match_participants')
    .select('seat')
    .eq('match_id', matchId)
    .eq('user_id', session.userId)
    .maybeSingle()

  if (!seat) return null

  const world = worldFromSlug(match.world_slug)
  if (!world || !isLadderId(match.ladder_slug)) return null

  const prompt = (match.prompt_snapshot ?? {}) as PromptJson

  // `prompt.task` is a STRING at the top level; judge-runner requires that, and
  // the PromptTask object fields sit flat alongside it.
  const task = typeof prompt.task === 'string' ? prompt.task : ''

  const options = Array.isArray(prompt.options)
    ? prompt.options.filter((o): o is string => typeof o === 'string')
    : null

  const countUnit =
    prompt.input?.countUnit === 'character' || prompt.input?.countUnit === 'word'
      ? prompt.input.countUnit
      : null

  const skyRating = await maxLadderRating(db, session.userId, match.world_slug)

  return {
    matchId: match.id,
    world,
    ladder: match.ladder_slug,
    task,
    constraint: match.constraint_text ?? null,
    glyph: typeof prompt.glyph === 'string' ? prompt.glyph : null,
    options: options && options.length > 0 ? options : null,
    input: {
      label: typeof prompt.input?.label === 'string' ? prompt.input.label : 'Your answer',
      multiline: prompt.input?.multiline === true,
      countLimit:
        typeof prompt.input?.countLimit === 'number' ? prompt.input.countLimit : null,
      countUnit,
    },
    timeLimitMs: match.time_limit_ms ?? null,
    // The server's own clock. A client-chosen start is a client-chosen limit.
    startedAt: match.created_at,
    skyRating,
  }
  // NOTE: `items.answer` is never selected above, and PromptPayload has no field
  // for it. A leak would have to be a deliberate type change, not a slip.
}

/** The sky renders the MAX of a world's ladders, so one bad ladder never darkens it. */
async function maxLadderRating(
  db: ReturnType<typeof createServiceRoleClient>,
  userId: string,
  worldSlug: string,
): Promise<number | null> {
  const { data } = await db
    .from('user_ratings')
    .select('rating')
    .eq('user_id', userId)
    .eq('world_slug', worldSlug)

  if (!data || data.length === 0) return null
  const ratings = data.map((r) => r.rating).filter((r): r is number => typeof r === 'number')
  return ratings.length === 0 ? null : Math.max(...ratings)
}

// ---------------------------------------------------------------------------
// submitToMatch
// ---------------------------------------------------------------------------

export async function submitToMatch(
  matchId: string,
  formData: FormData,
): Promise<SubmitResult> {
  const session = await getSessionState()
  if (session.status === 'anonymous') return { ok: false, reason: 'not_participant' }

  const db = createServiceRoleClient()

  const raw = {
    matchId,
    content: formData.get('content'),
    selectedOption: formData.get('selectedOption') ?? null,
    elapsedMs: numberOrNull(formData.get('elapsedMs')),
    pasteDetected: formData.get('pasteDetected') === 'true',
    keystrokeFeatures: jsonOrNull(formData.get('keystrokeFeatures')),
    clientTz: stringOrNull(formData.get('clientTz')),
  }

  // submitAnswer performs the enqueue itself (its deps default `send` to the
  // queue client) and only enqueues once both seats are in, so there is no
  // second enqueue here.
  const result = await submitAnswer(session.userId, raw, {
    queries: createSubmitQueries(db),
  })

  if (result.ok) {
    // `queued_for_judging` is submitAnswer's way of saying both seats are in and
    // the judging job went on the queue. Anything else means we are still
    // waiting on the opponent.
    return { ok: true, bothSubmitted: result.matchStatus === 'queued_for_judging' }
  }

  switch (result.code) {
    case 'not_a_participant':
      return { ok: false, reason: 'not_participant' }
    case 'match_not_open':
      return { ok: false, reason: 'match_closed' }
    case 'invalid_input':
      return { ok: false, reason: 'invalid' }
    default:
      // enqueue_failed: the answer IS stored, only the judging job did not
      // enqueue. Reporting failure would invite a retry that the append-only
      // submissions table would reject, stranding the user. The sweeper picks
      // these up; the honest answer to the player is that the answer landed.
      return { ok: true, bothSubmitted: false }
  }
}

function numberOrNull(v: FormDataEntryValue | null): number | null {
  if (typeof v !== 'string' || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function stringOrNull(v: FormDataEntryValue | null): string | null {
  return typeof v === 'string' && v !== '' ? v : null
}
function jsonOrNull(v: FormDataEntryValue | null): unknown {
  if (typeof v !== 'string' || v === '') return null
  try {
    return JSON.parse(v)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// getVerdict
// ---------------------------------------------------------------------------

export async function getVerdict(matchId: string): Promise<VerdictPayload | null> {
  const session = await getSessionState()
  if (session.status === 'anonymous') return null

  const db = createServiceRoleClient()

  const { data: match } = await db
    .from('matches')
    .select('id, world_slug, ladder_slug, prompt_snapshot, status')
    .eq('id', matchId)
    .maybeSingle()
  if (!match) return null

  const { data: seats } = await db
    .from('match_participants')
    .select('seat, user_id, is_bot, bot_slug, result, rating_before, rating_after')
    .eq('match_id', matchId)
  if (!seats || seats.length === 0) return null

  const mine = seats.find((s) => s.user_id === session.userId)
  // OWNERSHIP CHECK — service role bypasses RLS; see getPrompt.
  if (!mine) return null
  const theirs = seats.find((s) => s.seat !== mine.seat)

  const { data: submissions } = await db
    .from('submissions')
    .select('seat, content')
    .eq('match_id', matchId)

  const mySubmission = submissions?.find((s) => s.seat === mine.seat) ?? null

  // SPOILER GATE. The opponent's answer is readable only once yours is in.
  // The schema enforces this for client reads; on the service role it is ours.
  const theirSubmission = mySubmission
    ? (submissions?.find((s) => s.seat !== mine.seat) ?? null)
    : null

  const { data: judgment } = await db
    .from('judgments')
    .select('order_ab_reasoning, position_disagreement, is_current')
    .eq('match_id', matchId)
    .eq('is_current', true)
    .maybeSingle()

  const world = worldFromSlug(match.world_slug)
  if (!world || !isLadderId(match.ladder_slug)) return null

  const promptTask = (match.prompt_snapshot ?? {}) as PromptJson
  const positionInconsistent = judgment?.position_disagreement === true

  const you: VerdictSide = {
    label: 'You',
    isBot: false,
    isYou: true,
    content: mySubmission?.content ?? '',
    result: (mine.result ?? 'pending') as VerdictSide['result'],
  }

  const opponent: VerdictSide = {
    label: theirs?.is_bot ? (theirs.bot_slug ?? 'Bot') : 'Opponent',
    isBot: theirs?.is_bot ?? false,
    isYou: false,
    content: theirSubmission?.content ?? '',
    result: (theirs?.result ?? 'pending') as VerdictSide['result'],
  }

  const before = mine.rating_before
  const after = mine.rating_after
  const ratingChange =
    !positionInconsistent && typeof before === 'number' && typeof after === 'number'
      ? { before, after }
      : null

  return {
    matchId: match.id,
    world,
    ladder: match.ladder_slug,
    task: typeof promptTask.task === 'string' ? promptTask.task : '',
    you,
    opponent,
    reason: judgment?.order_ab_reasoning ?? '',
    positionInconsistent,
    ratingChange,
    noSettleReason: null,
    trialsItem: null,
  }
}

/**
 * Form action: begin a match and go to it.
 *
 * MUST be invoked from a form/POST, never during a Server Component render.
 * `startMatch` calls `ensureSession()`, which provisions a guest and needs to
 * WRITE the session cookie — and cookie writes only work in a Server Action or
 * Route Handler. In a Server Component the write throws, our server client
 * swallows it (correctly, for that context), and the result is a guest created
 * in Supabase whose session is never persisted: every navigation mints another
 * orphan user and lands on a 404. That is exactly the bug this shape prevents.
 *
 * It is also the better product behaviour. A match is timed from `started_at`,
 * so it must begin on a deliberate act rather than on navigation, back-button,
 * or a link prefetch.
 */
export async function beginMatch(formData: FormData): Promise<void> {
  const world = String(formData.get('world') ?? '')
  const ladder = String(formData.get('ladder') ?? '')

  const result = await startMatch(world, ladder)
  if (!result.ok) redirect(`/w/${world}/${ladder}?error=${result.reason}`)
  redirect(`/w/${world}/${ladder}/${result.matchId}`)
}
