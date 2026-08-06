'use server'

import { createClient } from '@/lib/supabase/server'
import { getSessionState, requireUserId } from '@/lib/auth/session'
import { AuthError } from '@supabase/supabase-js'

/**
 * Guest-first auth.
 *
 * The funnel is: play a match with no account, earn a rating, then convert.
 * Conversion mutates the existing `auth.users` row, so the user id is stable
 * and the rating survives. See src/app/auth/callback/route.ts.
 *
 * Every function here re-verifies the session itself. Server Functions are
 * reachable by direct POST, so UI gating is not authorization.
 */

export type AuthFailure =
  /** signInAnonymously is IP-limited to 30/hour. Expected, not exceptional:
   *  one school or office behind NAT, or a viral spike, will hit it. */
  | 'rate_limited'
  /** Anonymous sign-ins are disabled in project settings. */
  | 'guests_disabled'
  /** Manual linking is disabled in project settings — linkIdentity needs it. */
  | 'linking_disabled'
  | 'already_permanent'
  | 'not_signed_in'
  | 'unknown'

export type AuthResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: AuthFailure; message: string }

function classify(error: AuthError): { ok: false; code: AuthFailure; message: string } {
  const status = error.status ?? 0
  const text = error.message.toLowerCase()

  if (status === 429 || text.includes('rate limit')) {
    return {
      ok: false,
      code: 'rate_limited',
      message:
        'Too many new sessions from this network right now. Try again shortly, or sign in.',
    }
  }
  if (text.includes('anonymous') && text.includes('disabled')) {
    return { ok: false, code: 'guests_disabled', message: 'Guest play is unavailable.' }
  }
  if (text.includes('manual linking') || text.includes('linking is disabled')) {
    return { ok: false, code: 'linking_disabled', message: 'Account linking is unavailable.' }
  }
  return { ok: false, code: 'unknown', message: error.message }
}

/**
 * Ensure a session exists so the player can start immediately.
 *
 * Idempotent: returns the current user if one is already signed in, guest or
 * permanent. Only creates a guest when there is no session at all, which keeps
 * repeat visits off the rate limit.
 *
 * `captchaToken` should be supplied in production (Turnstile / hCaptcha).
 * Without it the 30/hour IP ceiling is the only thing between a scripted
 * client and unlimited account creation.
 */
export async function ensureSession(
  captchaToken?: string,
): Promise<AuthResult<{ userId: string; isGuest: boolean; created: boolean }>> {
  const existing = await getSessionState()
  if (existing.status !== 'anonymous') {
    return {
      ok: true,
      data: {
        userId: existing.userId,
        isGuest: existing.status === 'guest',
        created: false,
      },
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInAnonymously({
    options: { captchaToken },
  })

  if (error) return classify(error)

  const userId = data.user?.id
  if (!userId) {
    return { ok: false, code: 'unknown', message: 'No user returned.' }
  }

  return { ok: true, data: { userId, isGuest: true, created: true } }
}

/**
 * Begin OAuth conversion for a signed-in guest.
 *
 * Returns a URL for the caller to redirect to; we deliberately do not redirect
 * from inside the action so the caller controls navigation.
 *
 * Uses linkIdentity rather than signInWithOAuth: signInWithOAuth would create
 * a NEW user and silently orphan the guest's rating and review history.
 */
export async function beginOAuthConversion(
  provider: 'google' | 'apple' | 'discord',
  next: string = '/',
): Promise<AuthResult<{ url: string }>> {
  const state = await getSessionState()
  if (state.status === 'anonymous') {
    return { ok: false, code: 'not_signed_in', message: 'No session to convert.' }
  }
  if (state.status === 'permanent') {
    return { ok: false, code: 'already_permanent', message: 'Already signed in.' }
  }

  const supabase = await createClient()
  const redirectTo = `${requireSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`

  const { data, error } = await supabase.auth.linkIdentity({
    provider,
    options: { redirectTo },
  })

  if (error) return classify(error)
  if (!data?.url) {
    return { ok: false, code: 'unknown', message: 'No authorization URL returned.' }
  }

  return { ok: true, data: { url: data.url } }
}

/**
 * Begin email conversion for a signed-in guest.
 *
 * Two steps by design: the address must be verified before a password can be
 * set, so this only sends the confirmation. `is_anonymous` flips to false on
 * confirmation.
 */
export async function beginEmailConversion(email: string): Promise<AuthResult<null>> {
  const state = await getSessionState()
  if (state.status === 'anonymous') {
    return { ok: false, code: 'not_signed_in', message: 'No session to convert.' }
  }
  if (state.status === 'permanent') {
    return { ok: false, code: 'already_permanent', message: 'Already signed in.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ email })

  if (error) return classify(error)
  return { ok: true, data: null }
}

/** Set a password. Only valid after the email has been confirmed. */
export async function setPassword(password: string): Promise<AuthResult<null>> {
  await requireUserId()

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })

  if (error) return classify(error)
  return { ok: true, data: null }
}

export async function signOut(): Promise<AuthResult<null>> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  if (error) return classify(error)
  return { ok: true, data: null }
}

/**
 * Absolute site origin for OAuth redirects.
 *
 * Must be absolute and must match an allowed redirect URL in Supabase.
 * VERCEL_PROJECT_PRODUCTION_URL is stable across deployments; VERCEL_URL is
 * per-deployment and would break preview OAuth against a fixed allowlist.
 */
function requireSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/$/, '')

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (production) return `https://${production}`

  if (process.env.NODE_ENV === 'development') return 'http://localhost:3000'

  throw new Error(
    'NEXT_PUBLIC_SITE_URL must be set so OAuth redirects resolve to a stable origin.',
  )
}
