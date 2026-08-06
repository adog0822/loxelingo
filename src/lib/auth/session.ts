import { createClient } from '@/lib/supabase/server'
import type { JwtPayload } from '@supabase/supabase-js'

/**
 * Session helpers built on `getClaims()`.
 *
 * Why getClaims() and not getUser()/getSession():
 *  - getClaims() verifies the JWT locally against cached JWKS. No network
 *    round-trip per call, so it is safe to use on every request.
 *  - getUser() calls the Auth server every time.
 *  - getSession() reads the cookie without verifying it. Supabase's own
 *    docs say never to trust it in server code.
 */

export type Claims = JwtPayload

/** Verified claims, or null if there is no valid session. */
export async function getClaims(): Promise<Claims | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) return null
  return data.claims
}

/** The authenticated user id (`sub`), or null. Guests included. */
export async function getUserId(): Promise<string | null> {
  const claims = await getClaims()
  const sub = claims?.sub
  return typeof sub === 'string' ? sub : null
}

/**
 * True when this session belongs to an unconverted guest.
 *
 * Read from the `is_anonymous` JWT claim — NOT from the Postgres role.
 * Guests carry the `authenticated` role exactly like permanent users, which is
 * why `auth.role() = 'authenticated'` is never a valid guest check.
 */
export async function isGuest(): Promise<boolean> {
  const claims = await getClaims()
  return claims?.is_anonymous === true
}

export type SessionState =
  | { status: 'anonymous' }
  | { status: 'guest'; userId: string }
  | { status: 'permanent'; userId: string; email?: string }

/** The full session state in a single verified read. */
export async function getSessionState(): Promise<SessionState> {
  const claims = await getClaims()
  const sub = claims?.sub

  if (!claims || typeof sub !== 'string') return { status: 'anonymous' }
  if (claims.is_anonymous === true) return { status: 'guest', userId: sub }

  return {
    status: 'permanent',
    userId: sub,
    email: typeof claims.email === 'string' ? claims.email : undefined,
  }
}

/**
 * Assert an authenticated user (guest or permanent) and return the id.
 *
 * Server Functions are reachable by direct POST, not only through the UI, so
 * every mutating action must call this itself. UI gating is not authorization.
 */
export async function requireUserId(): Promise<string> {
  const userId = await getUserId()
  if (!userId) throw new Error('Unauthorized')
  return userId
}

/** Assert a converted (non-guest) user. For features guests may not reach. */
export async function requirePermanentUserId(): Promise<string> {
  const state = await getSessionState()
  if (state.status !== 'permanent') throw new Error('Unauthorized')
  return state.userId
}
