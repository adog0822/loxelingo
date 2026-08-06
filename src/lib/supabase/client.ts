import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-side Supabase client.
 *
 * Do NOT pass a `cookies` option here — createBrowserClient falls back to
 * document.cookie automatically.
 *
 * Uses the modern publishable key (sb_publishable_...). The legacy `anon` JWT
 * is deprecated and scheduled for removal at the end of 2026.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  )
}
