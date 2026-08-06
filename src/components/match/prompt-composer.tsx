"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { submitToMatch } from "@/lib/actions/match";
import type { PromptPayload, SubmitResult } from "@/lib/match/api";
import { SUBMIT_FIELDS, type IntegritySignals } from "./types";

/** A single insertion larger than this is not a keystroke. */
const BULK_INSERT_CHARS = 8;

/** A gap longer than this is a pause worth counting, not typing rhythm. */
const LONG_PAUSE_MS = 2000;

type SubmitFailure = Extract<SubmitResult, { ok: false }>["reason"];

/**
 * Why the answer did not land. Referee voice: what happened, in the present
 * tense, with no apology. Each names the specific condition the server hit, so
 * none of these is a generic failure line.
 */
const FAILURE_LINES: Readonly<Record<SubmitFailure, string>> = {
  not_participant:
    "This match belongs to someone else. Nothing was recorded against it.",
  already_submitted:
    "An answer for this seat is already in. Submissions are append-only and cannot be replaced.",
  match_closed:
    "This match stopped accepting answers before yours arrived. It is already judged or abandoned.",
  invalid:
    "The server did not accept that answer. An empty answer, or one past the stated limit, is refused rather than scored.",
};

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
function countUnits(value: string, unit: PromptPayload["input"]["countUnit"]): number {
  if (unit === "character") {
    return Array.from(value.replace(/\s+/gu, "")).length;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length;
}

/** Idle, then exactly one of the three terminal states. */
type Landing =
  | { kind: "idle" }
  | { kind: "waiting" }
  | { kind: "failed"; reason: SubmitFailure };

export interface PromptComposerProps {
  world: WorldId;
  matchId: string;
  input: PromptPayload["input"];
  /** Closed-answer options. Null for open production. */
  options: readonly string[] | null;
  /** Null when the item is untimed. No bar is drawn and nothing auto-submits. */
  timeLimitMs: number | null;
  /** From `PromptPayload.startedAt`. A client-chosen start is a client-chosen limit. */
  startedAtEpochMs: number;
  /** Where the verdict for this match lives. */
  verdictHref: string;
}

/**
 * PromptComposer
 * docs/design/design-system.md §6.2
 *
 * The whole client boundary of the prompt screen: the timer, the field, the
 * counter, the one action, and the integrity signals. Everything else on that
 * route (the constraint line, the task, the glyph, the sky) is server-rendered,
 * because none of it changes while the clock runs.
 *
 * Nothing here animates. The bar depletes. That is all.
 *
 * The answer travels as a real `<form>` so the field value reaches the server
 * action as `FormData` without this component serialising it by hand. The
 * integrity signals are appended in the action, at the moment of submit, which
 * is the only moment they are complete.
 */
export function PromptComposer({
  world,
  matchId,
  input,
  options,
  timeLimitMs,
  startedAtEpochMs,
  verdictHref,
}: PromptComposerProps) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [landing, setLanding] = useState<Landing>({ kind: "idle" });
  const trace = useRef<TypingTrace>(newTrace());
  const formRef = useRef<HTMLFormElement>(null);
  // The answer is final the moment it lands, so a second submit is not a
  // retry: it is a duplicate the server would refuse. Held in a ref because
  // the timer's expiry callback does not re-read state.
  const sentRef = useRef(false);

  const fieldId = `answer-${matchId}`;
  const counterId = `${fieldId}-count`;

  const count = input.countLimit === null ? 0 : countUnits(value, input.countUnit);
  const withinLimit = input.countLimit !== null && count > 0 && count <= input.countLimit;

  /**
   * Collect the integrity signals the submissions table expects:
   * `elapsed_ms`, `paste_detected`, `keystroke_features`, `client_tz`.
   *
   * THE SERVER MUST NEVER TREAT ANY OF THIS AS AUTHORITATIVE. It is produced on
   * a machine the user controls, so all of it is forgeable: the elapsed time
   * can be understated, the paste flag can be avoided by never firing a
   * clipboard event, and the typing shape can be synthesised. The authoritative
   * clock is `matches.started_at` against the server's own receipt time inside
   * the settling transaction, and `submissions.integrity_flags` must be
   * computed server-side from what the server itself observed. These values may
   * only ever contribute to a score. They may never void a match, move a
   * rating, or be shown to a user as an accusation.
   *
   * The typing shape is deliberately coarse: counts and aggregates, no key
   * identities and no per-keystroke timeline, so it cannot reconstruct what was
   * typed or fingerprint how someone types.
   */
  const collectIntegrity = useCallback(
    (content: string): IntegritySignals => {
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
          finalLength: Array.from(content).length,
        },
        clientTz:
          typeof Intl === "undefined"
            ? null
            : (Intl.DateTimeFormat().resolvedOptions().timeZone ?? null),
      };
    },
    [startedAtEpochMs],
  );

  /**
   * The submit action. Runs in a transition because React passes it to
   * `<form action>`, so the button is disabled by `useFormStatus` semantics for
   * free and a double click cannot produce two POSTs.
   */
  const send = useCallback(
    async (formData: FormData) => {
      if (sentRef.current) return;
      sentRef.current = true;

      const content = String(formData.get(SUBMIT_FIELDS.content) ?? "");
      const integrity = collectIntegrity(content);

      formData.set(SUBMIT_FIELDS.elapsedMs, String(integrity.elapsedMs));
      formData.set(SUBMIT_FIELDS.pasteDetected, String(integrity.pasteDetected));
      formData.set(
        SUBMIT_FIELDS.keystrokeFeatures,
        JSON.stringify(integrity.keystrokeFeatures),
      );
      if (integrity.clientTz !== null) {
        formData.set(SUBMIT_FIELDS.clientTz, integrity.clientTz);
      }

      const result = await submitToMatch(matchId, formData);

      if (!result.ok) {
        // A refused answer is terminal. `already_submitted` and `match_closed`
        // both mean the seat is spent, and `not_participant` means it never was
        // ours, so none of these becomes a retry affordance.
        setLanding({ kind: "failed", reason: result.reason });
        return;
      }

      if (result.bothSubmitted) {
        router.push(verdictHref);
        return;
      }

      setLanding({ kind: "waiting" });
    },
    [collectIntegrity, matchId, router, verdictHref],
  );

  const requestSubmit = useCallback(() => {
    if (sentRef.current) return;
    formRef.current?.requestSubmit();
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        requestSubmit();
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
    },
    [requestSubmit],
  );

  const onChange = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const next = event.target.value;
      const t = trace.current;
      if (Array.from(next).length - t.previousLength > BULK_INSERT_CHARS) {
        t.bulkInsertions += 1;
      }
      t.previousLength = Array.from(next).length;
      setValue(next);
    },
    [],
  );

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

  /* ---------------------------------------------------------------- */
  /* After the answer lands                                            */
  /* ---------------------------------------------------------------- */

  if (landing.kind === "failed") {
    return (
      <div className="flex w-full flex-col items-start gap-4" aria-live="polite">
        <p className="t-title-2" style={{ color: "var(--text-primary)" }}>
          The answer was not accepted.
        </p>
        <p className="t-body" style={{ color: "var(--text-secondary)" }}>
          {FAILURE_LINES[landing.reason]}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={verdictHref} className={buttonClassName("ghost", "md")}>
            See this match
          </Link>
          <Link href={`/w/${world}`} className={buttonClassName("quiet", "md")}>
            Back to the world
          </Link>
        </div>
      </div>
    );
  }

  if (landing.kind === "waiting") {
    // Calm, and not anxious. No countdown, no spinner, no "waiting for
    // opponent" that implies they are late. The state is a fact and there is
    // nothing the reader is being asked to do.
    return (
      <div className="flex w-full flex-col items-start gap-4" aria-live="polite">
        {timeLimitMs === null ? null : (
          <MatchTimer
            durationMs={timeLimitMs}
            startedAtEpochMs={startedAtEpochMs}
            paused
            label="Time remaining"
          />
        )}
        <p className="t-title-2" style={{ color: "var(--text-primary)" }}>
          Your answer is in.
        </p>
        <p className="t-body" style={{ color: "var(--text-secondary)" }}>
          It is final. An answer under a time limit that can be edited afterwards is not a
          rated answer. Your opponent has not answered yet, so there is nothing to judge and
          no rating moves until both answers are in. Nothing is expected of you until then.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={verdictHref} className={buttonClassName("ghost", "md")}>
            Go to the verdict
          </Link>
          <Link href={`/w/${world}`} className={buttonClassName("quiet", "md")}>
            Back to the world
          </Link>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /* The prompt                                                        */
  /* ---------------------------------------------------------------- */

  return (
    <form ref={formRef} action={send} className="flex w-full flex-col items-stretch gap-6">
      {/* 2px bar across the top of the viewport. The only moving thing on this
          screen, and only when the item is timed. */}
      {timeLimitMs === null ? null : (
        <MatchTimer
          durationMs={timeLimitMs}
          startedAtEpochMs={startedAtEpochMs}
          onExpire={requestSubmit}
          label="Time remaining"
        />
      )}

      {options === null ? (
        <div className="flex flex-col gap-2 text-left">
          {/* Label above the field. Never placeholder-as-label. */}
          <label htmlFor={fieldId} className="t-body-sm" style={{ color: "var(--text-tertiary)" }}>
            {input.label}
          </label>

          {/*
            The field lives inside ScriptText so that the answer is typed and
            rendered with the world's `lang` and font stack, inherited by the
            control. ScriptText is the only sanctioned way to put
            target-language text on screen and it takes a world, not a `lang`,
            because `lang="ja"` and `lang="zh-Hans"` select different glyph
            shapes for the same codepoints.
          */}
          <ScriptText
            world={world}
            tier="text"
            as="div"
            style={{
              background: "var(--surface-1)",
              borderRadius: "var(--r-1)",
              // One bottom hairline. Functional, so --ink-600, and it becomes
              // the earned light on focus.
              borderBottom: `1px solid ${focused ? "var(--accent-text)" : "var(--border)"}`,
              padding: "12px 16px",
              transition: "border-color var(--dur-fast) var(--ease-out-quint)",
            }}
          >
            {input.multiline ? (
              <textarea
                id={fieldId}
                name={SUBMIT_FIELDS.content}
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
                name={SUBMIT_FIELDS.content}
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
      ) : (
        /*
          A closed-answer item. One radio per option, no cards, no letters
          down the side, no lettered pills: the options are the answer, so
          they are set in the world's face at reading size and nothing else
          competes with them.
        */
        <fieldset className="flex flex-col gap-2 text-left" onKeyDown={onKeyDown}>
          <legend className="t-body-sm" style={{ color: "var(--text-tertiary)" }}>
            {input.label}
          </legend>
          {options.map((option, index) => {
            const optionId = `${fieldId}-${index}`;
            return (
              <label
                key={option}
                htmlFor={optionId}
                className="flex items-baseline gap-3"
                style={{
                  background: "var(--surface-1)",
                  borderRadius: "var(--r-1)",
                  padding: "12px 16px",
                  cursor: "pointer",
                }}
              >
                <input
                  id={optionId}
                  type="radio"
                  name={SUBMIT_FIELDS.content}
                  value={option}
                  checked={value === option}
                  onChange={() => setValue(option)}
                />
                <ScriptText
                  world={world}
                  tier="text"
                  className="t-body-lg"
                  style={{ color: "var(--text-primary)" }}
                >
                  {option}
                </ScriptText>
              </label>
            );
          })}
        </fieldset>
      )}

      <div className="flex justify-start">
        <Button
          type="submit"
          variant="primary"
          aria-keyshortcuts="Meta+Enter Control+Enter"
        >
          {/* Not "Submit". The design system requires specific labels, and this
              action is irreversible: submissions have no UPDATE policy, so the
              answer is final the moment it lands. The label has to say that. */}
          Lock in answer
        </Button>
      </div>
    </form>
  );
}
