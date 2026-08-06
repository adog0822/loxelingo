import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase auth session on every request.
 *
 * SECURITY — the `headers` second argument to setAll is not optional in
 * practice. @supabase/ssr passes back:
 *
 *   Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0
 *   Expires: 0
 *   Pragma: no-cache
 *
 * A response that sets auth cookies must never be cached by a CDN or reverse
 * proxy. Vercel sits in front of every request here, so dropping these headers
 * risks one user's session token being served from cache to a different user.
 * Most published examples omit this argument. Do not remove it.
 */
export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          )
        },
      },
    },
  )

  // Must run before the response is committed, or the refreshed token is lost.
  // getClaims() verifies locally via JWKS rather than calling the Auth server.
  await supabase.auth.getClaims()

  return response
}
