"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

/** How often the screen re-asks the server. Judging is seconds, not minutes. */
const INTERVAL_MS = 5000;

export interface VerdictPollProps {
  /**
   * Stop polling after this long and leave the manual action. A page left open
   * overnight should not keep a request loop running against a match that is
   * never going to settle.
   */
  giveUpAfterMs?: number;
  /** The one line explaining what the reader is looking at. */
  children?: React.ReactNode;
}

/**
 * VerdictPoll
 *
 * The verdict is produced by a queue worker, so the screen can arrive before
 * the judgment does. This re-runs the server render on an interval and offers
 * the same thing as a button, which is the whole component.
 *
 * Deliberately not a spinner and deliberately not a countdown. Nothing spins,
 * nothing pulses, and no elapsed time is shown: a number ticking upward next to
 * "still judging" turns waiting into a measurement of how long you have been
 * made to wait. §4.4 bans the indeterminate spinner as an ambient animation,
 * and §1.5 says nothing moves except a real clock. There is no real clock here.
 */
export function VerdictPoll({ giveUpAfterMs = 5 * 60 * 1000, children }: VerdictPollProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [polling, setPolling] = useState(true);

  const check = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  useEffect(() => {
    if (!polling) return;
    const interval = window.setInterval(check, INTERVAL_MS);
    const stop = window.setTimeout(() => setPolling(false), giveUpAfterMs);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stop);
    };
  }, [check, giveUpAfterMs, polling]);

  return (
    <div className="flex flex-col items-start gap-4" aria-live="polite">
      {children}
      <Button variant="ghost" onClick={check} disabled={pending}>
        {pending ? "Checking" : "Check again"}
      </Button>
    </div>
  );
}
