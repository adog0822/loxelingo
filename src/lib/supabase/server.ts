import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * Server-side Supabase client for Server Components, Route Handlers and
 * Server Actions.
 *
 * Cookie API: `getAll` / `setAll`. The older `get` / `set` / `remove` shape is
 * deprecated in @supabase/ssr and will be removed in the next major version.
 *
 * Session validation, in order of preference:
 *   1. supabase.auth.getClaims()  — verifies the JWT locally against cached
 *      JWKS. No network round-trip per request. Preferred.
 *   2. supabase.auth.getUser()    — hits the Auth server every call. Safe, slow.
 *   3. supabase.auth.getSession() — NEVER trust this in server code.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Server Components cannot write cookies. Session refresh is
            // handled in src/proxy.ts, so swallowing this is correct.
          }
        },
      },
    },
  )
}

/**
 * Service-role client. BYPASSES ROW LEVEL SECURITY ENTIRELY.
 *
 * Required because the engine writes to tables that deliberately have no client
 * policies at all: `matches`, `match_participants`, `judgments`, `user_ratings`,
 * `item_stats`, `item_presentations`, `items`. Those tables hold answer keys,
 * opponents' unrevealed submissions, and the rating ledger — a client policy on
 * any of them would be a spoiler or a forgery surface.
 *
 * RULES, and they are not stylistic:
 *   1. Server-only. This module must never be imported into a Client Component.
 *      The key is read from a non-`NEXT_PUBLIC_` variable so it cannot be
 *      inlined into a browser bundle even by accident.
 *   2. There is no session and no `auth.uid()` here. Every ownership check you
 *      would have gotten from RLS is now YOUR job, in application code.
 *   3. Prefer `createClient()` above. Reach for this only when the operation is
 *      genuinely a trusted engine write.
 *
 * `persistSession: false` because there is no user to persist and a shared
 * server instance must not accumulate one.
 */
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const secret = process.env.SUPABASE_SECRET_KEY

  if (!url || !secret) {
    throw new Error(
      'createServiceRoleClient() requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY. ' +
        'This client bypasses RLS and must never fall back to the publishable key.',
    )
  }

  return createSupabaseClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
