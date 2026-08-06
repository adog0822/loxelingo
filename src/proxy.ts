import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

/**
 * Next.js 16 resolves this file as `proxy` (PROXY_FILENAME in
 * next/dist/lib/constants.js). `middleware.ts` still resolves for backwards
 * compatibility, but `proxy` is the current name — do not rename this back.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Every path except static assets and image files. Session refresh needs
     * to run broadly, but running it on static assets wastes invocations.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|woff2?)$).*)',
  ],
}
