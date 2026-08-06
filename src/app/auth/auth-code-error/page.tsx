import Link from 'next/link'

/**
 * Sign-in failure. Voice per the design system: referee, not coach. State what
 * happened, offer the next action, no apology and no exclamation marks.
 */
export default async function AuthCodeErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>
}) {
  const { reason } = await searchParams

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-6">
      <h1 className="text-2xl">Sign-in didn&apos;t complete.</h1>
      <p className="text-[color:var(--ink-700)]">
        The link expired or was already used. Your progress is untouched — start
        the sign-in again from where you left off.
      </p>
      {reason ? (
        <p className="font-mono text-sm text-[color:var(--ink-650)]">{reason}</p>
      ) : null}
      <Link href="/" className="underline underline-offset-4">
        Back
      </Link>
    </main>
  )
}
