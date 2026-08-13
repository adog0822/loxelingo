'use server'

import { redirect } from 'next/navigation'
import { ensureSession } from '@/lib/auth/actions'
import { WORLD_IDS, type WorldId } from '@/lib/design/worlds'

/**
 * Enter a world, creating a guest session if needed.
 *
 * This is the play-before-signup entry: no account, no email, no password.
 * A rating is earned first and the account is created later to protect it.
 *
 * Re-validates its own input because Server Functions are reachable by direct
 * POST, not only through the UI.
 */
export async function enterWorld(formData: FormData): Promise<void> {
  const raw = formData.get('world')
  const world = typeof raw === 'string' ? raw : ''

  if (!isWorldId(world)) {
    redirect('/?error=unknown_world')
  }

  const session = await ensureSession()

  if (!session.ok) {
    // Surface the reason rather than failing blank. `rate_limited` is the one
    // that will actually happen: guest creation is IP-limited to 30/hour, so a
    // school or office behind one NAT hits it in normal use.
    //
    // This function moves CODES, never sentences. Every code here is a key in
    // the ERRORS map in src/app/page.tsx, which is the one place a reader-
    // facing string for a failed entry is allowed to exist, and the rules
    // those strings follow are in docs/design/copy.md. Writing a message here
    // would put half the voice in a server action and half in a page, and the
    // half in the server action is the half nobody reviews.
    redirect(`/?error=${session.code}`)
  }

  redirect(`/w/${world}`)
}

function isWorldId(value: string): value is WorldId {
  return (WORLD_IDS as readonly string[]).includes(value)
}
