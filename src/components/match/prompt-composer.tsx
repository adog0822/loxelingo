"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import { Button, buttonClassName } from "@/components/ui/button";
import { MatchTimer } from "@/components/ui/match-timer";
import { ScriptText } from "@/components/ui/script-text";
import type { WorldId } from "@/lib/design/worlds";
import type { InputSpec, IntegritySignals, SubmissionDraft } from "./types";

/** A single insertion larger than this is not a keystroke. */
const BULK_INSERT_CHARS = 8;

/** A gap longer than this is a pause worth counting, not typing rhythm. */
const LONG_PAUSE_MS = 2000;

interface TypingTrace {
  keydowns: number;
  backspaces: number;
  firstKeyAt: number | null;
  lastKeyAt: number | null;
  interKeyTotalMs: number;
  interKeyCount: number;
  longestPauseMs: number;
  pausesOver2s: number;
  bulkInsertions: number;
  previousLength: number;
  pasteDetected: boolean;
}

function newTrace(): TypingTrace {
  return {
    keydowns: 0,
    backspaces: 0,
    firstKeyAt: null,
    lastKeyAt: null,
    interKeyTotalMs: 0,
    interKeyCount: 0,
    longestPauseMs: 0,
    pausesOver2s: 0,
    bulkInsertions: 0,
    previousLength: 0,
    pasteDetected: false,
  };
}

/**
 * Words for Latin, code points for CJK. Splitting Japanese or Chinese on
 * whitespace returns 1 for every sentence, so a word counter there would
 * be a number that is always wrong.
 */
function countUnits(value: string, unit: InputSpec["countUnit"]): number {
  if (unit === "character") {
    return Array.from(value.replace(/\s+/gu, "")).length;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length;
}

export interface PromptComposerProps {
  world: WorldId;
  matchId: string;
  input: InputSpec;
  timeLimitMs: number;
  /** Server-issued. A client-chosen start is a client-chosen time limit. */
  startedAtEpochMs: number;
  /** Where the verdict for this match will live. */
  verdictHref: string;
}

/**
 * PromptComposer
 * docs/design/design-system.md §6.2
 *
 * The whole client boundary of the prompt screen: the timer, the field,
 * the counter, the one action, and the integrity signals. Everything
 * else on that route (the constraint line, the task, the glyph, the sky)
 * is server-rendered, because none of it changes while the clock runs.
 *
 * Nothing here animates. The bar depletes. That is all.
 */
export function PromptComposer({
  world,
  matchId,
  input,
  timeLimitMs,
  startedAtEpochMs,
  verdictHref,
}: PromptComposerProps) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [held, setHeld] = useState(false);
  const trace = useRef<TypingTrace>(newTrace());
  const heldRef = useRef(false);
  // The timer's expiry and the keyboard shortcut both need the newest
  // closure over the field's value, so they go through a ref.
  const submitRef = useRef<() => void>(() => {});

  const fieldId = `answer-${matchId}`;
  const counterId = `${fieldId}-count`;

  const count = input.countLimit === null ? 0 : countUnits(value, input.countUnit);
  const withinLimit =
    input.countLimit !== null && count > 0 && count <= input.countLimit;

  /**
   * Collect the integrity signals the submissions table expects:
   * `elapsed_ms`, `paste_detected`, `keystroke_features`, `client_tz`.
   *
   * THE SERVER MUST NEVER TREAT ANY OF THIS AS AUTHORITATIVE. It is
   * produced on a machine the user controls, so all of it is forgeable:
   * the elapsed time can be understated, the paste flag can be avoided
   * by never firing a clipboard event, and the typing shape can be
   * synthesised. The authoritative clock is `matches.started_at` against
   * the server's own receipt time inside the settling transaction, and
   * `submissions.integrity_flags` must be computed server-side from what
   * the server itself observed. These values may only ever contribute to
   * a score. They may never void a match, move a rating, or be shown to
   * a user as an accusation.
   *
   * The typing shape is deliberately coarse: counts and aggregates, no
   * key identities and no per-keystroke timeline, so it cannot
   * reconstruct what was typed or fingerprint how someone types.
   */
  const collectIntegrity = useCallback((): IntegritySignals => {
    const t = trace.current;
    const now = Date.now();
    return {
      elapsedMs: Math.max(0, now - startedAtEpochMs),
      pasteDetected: t.pasteDetected,
      keystrokeFeatures: {
        keydowns: t.keydowns,
        backspaces: t.backspaces,
        typingWindowMs:
          t.firstKeyAt === null || t.lastKeyAt === null ? 0 : t.lastKeyAt - t.firstKeyAt,
        meanInterKeyMs:
          t.interKeyCount === 0 ? null : Math.round(t.interKeyTotalMs / t.interKeyCount),
        longestPauseMs: Math.round(t.longestPauseMs),
        pausesOver2s: t.pausesOver2s,
        bulkInsertions: t.bulkInsertions,
        finalLength: Array.from(value).length,
      },
      clientTz:
        typeof Intl === "undefined"
          ? null
          : (Intl.DateTimeFormat().resolvedOptions().timeZone ?? null),
    };
  }, [startedAtEpochMs, value]);

  const submit = useCallback(() => {
    if (heldRef.current) return;
    heldRef.current = true;

    const draft: SubmissionDraft = {
      matchId,
      content: value,
      integrity: collectIntegrity(),
    };

    // TODO(data): hand `draft` to the submit server action, which writes
    // one row into `submissions` (append-only, one per seat) and claims
    // `awaiting_opponent -> judging` when both seats have answered. The
    // action, not this component, decides what happens next.
    void draft;

    setHeld(true);
  }, [collectIntegrity, matchId, value]);

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      submitRef.current();
      return;
    }

    const t = trace.current;
    const now = Date.now();
    if (event.key === "Backspace" || event.key === "Delete") t.backspaces += 1;
    if (event.key.length === 1 || event.key === "Backspace" || event.key === "Enter") {
      t.keydowns += 1;
      if (t.lastKeyAt !== null) {
        const gap = now - t.lastKeyAt;
        t.interKeyTotalMs += gap;
        t.interKeyCount += 1;
        if (gap > t.longestPauseMs) t.longestPauseMs = gap;
        if (gap > LONG_PAUSE_MS) t.pausesOver2s += 1;
      }
      if (t.firstKeyAt === null) t.firstKeyAt = now;
      t.lastKeyAt = now;
    }
  }, []);

  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  const onChange = useCallback((event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = event.target.value;
    const t = trace.current;
    if (Array.from(next).length - t.previousLength > BULK_INSERT_CHARS) {
      t.bulkInsertions += 1;
    }
    t.previousLength = Array.from(next).length;
    setValue(next);
  }, []);

  const onPaste = useCallback(() => {
    trace.current.pasteDetected = true;
  }, []);

  const fieldStyle: CSSProperties = {
    width: "100%",
    background: "transparent",
    border: "none",
    color: "var(--text-primary)",
    fontFamily: "inherit",
    fontSize: "var(--t-body-lg)",
    resize: "none",
  };

  if (held) {
    return (
      <div className="flex w-full flex-col items-start gap-4" aria-live="polite">
        <MatchTimer
          durationMs={timeLimitMs}
          startedAtEpochMs={startedAtEpochMs}
          paused
          label="Time remaining"
        />
        <p className="t-title-2" style={{ color: "var(--text-primary)" }}>
          Answer held.
        </p>
        <p className="t-body" style={{ color: "var(--text-secondary)" }}>
          It is final: an answer under a time limit that can be edited afterwards is not a
          rated answer. Judging is not connected yet, so no verdict follows from this one.
        </p>
        {/* TODO(data): the submit action decides where this goes. It is a
            sample verdict until the pipeline lands. */}
        <Link href={verdictHref} className={buttonClassName("ghost", "md")}>
          See a sample verdict
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-stretch gap-6">
      {/* 2px bar across the top of the viewport. The only moving thing on
          this screen. */}
      <MatchTimer
        durationMs={timeLimitMs}
        startedAtEpochMs={startedAtEpochMs}
        onExpire={() => submitRef.current()}
        label="Time remaining"
      />

      <div className="flex flex-col gap-2 text-left">
        {/* Label above the field. Never placeholder-as-label. */}
        <label
          htmlFor={fieldId}
          className="t-body-sm"
          style={{ color: "var(--text-tertiary)" }}
        >
          {input.label}
        </label>

        {/*
          The field lives inside ScriptText so that the answer is typed
          and rendered with the world's `lang` and font stack, inherited
          by the control. ScriptText is the only sanctioned way to put
          target-language text on screen and it takes a world, not a
          `lang`, because `lang="ja"` and `lang="zh-Hans"` select
          different glyph shapes for the same codepoints.
        */}
        <ScriptText
          world={world}
          tier="text"
          as="div"
          style={{
            background: "var(--surface-1)",
            borderRadius: "var(--r-1)",
            // One bottom hairline. Functional, so --ink-600, and it
            // becomes the earned light on focus.
            borderBottom: `1px solid ${focused ? "var(--accent-text)" : "var(--border)"}`,
            padding: "12px 16px",
            transition: "border-color var(--dur-fast) var(--ease-out-quint)",
          }}
        >
          {input.multiline ? (
            <textarea
              id={fieldId}
              rows={4}
              value={value}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby={input.countLimit === null ? undefined : counterId}
              style={fieldStyle}
            />
          ) : (
            <input
              id={fieldId}
              type="text"
              value={value}
              onChange={onChange}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby={input.countLimit === null ? undefined : counterId}
              style={fieldStyle}
            />
          )}
        </ScriptText>

        {/* Only when the constraint is a count. Turns to the earned light
            when it is satisfied. */}
        {input.countLimit === null ? null : (
          <span
            id={counterId}
            data-numeric=""
            aria-live="off"
            className="t-mono self-end"
            style={{ color: withinLimit ? "var(--accent-text)" : "var(--text-tertiary)" }}
          >
            {count} / {input.countLimit}
          </span>
        )}
      </div>

      <div className="flex justify-start">
        <Button
          variant="primary"
          onClick={() => submitRef.current()}
          aria-keyshortcuts="Meta+Enter Control+Enter"
        >
          Submit
        </Button>
      </div>
    </div>
  );
}
