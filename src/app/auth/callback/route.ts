import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * OAuth / PKCE callback.
 *
 * Serves BOTH flows, because linkIdentity() reuses the same redirect:
 *   1. signInWithOAuth()  — a brand new sign-in
 *   2. linkIdentity()     — a guest converting to a permanent account
 *
 * In case 2 the existing `auth.users` row is mutated rather than replaced, so
 * `sub` is unchanged and everything keyed on the user id (ratings, cards,
 * review history) survives conversion untouched. That property is what makes
 * play-before-signup possible, and it is asserted by a test rather than assumed.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  // Open-redirect guard: only same-origin relative paths.
  const requested = searchParams.get('next') ?? '/'
  const next =
    requested.startsWith('/') && !requested.startsWith('//') ? requested : '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/auth-code-error?reason=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(
      `${origin}/auth/auth-code-error?reason=${encodeURIComponent(error.message)}`,
    )
  }

  // Behind Vercel's proxy the original host arrives in x-forwarded-host;
  // `origin` would otherwise be the internal deployment URL.
  const forwardedHost = request.headers.get('x-forwarded-host')
  if (process.env.NODE_ENV === 'development') {
    return NextResponse.redirect(`${origin}${next}`)
  }
  if (forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${next}`)
  }
  return NextResponse.redirect(`${origin}${next}`)
}
