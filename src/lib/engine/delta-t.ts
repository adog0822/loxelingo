/**
 * delta-t — calendar-day difference under a user's IANA timezone and day-cutoff hour.
 *
 * Implements `docs/research/03-learning-libs.md` §4.3 verbatim. This is the single most
 * correctness-critical function in the codebase: FSRS training input is
 * `(rating, delta_t_in_days)` and `delta_t` is NOT `(t2 - t1) / 86400000`.
 *
 * Reference implementation (`fsrs-rs/src/convertor_tests.rs`, quoted in §4.3):
 *
 * ```rust
 * fn convert_to_date(timestamp: i64, next_day_starts_at: i64, timezone: Tz) -> NaiveDate {
 *     let timestamp_seconds = timestamp - next_day_starts_at * 3600 * 1000;
 *     let datetime = Utc.timestamp_millis_opt(timestamp_seconds).unwrap().with_timezone(&timezone);
 *     datetime.date_naive()
 * }
 * delta_t = (date_current - date_previous).num_days()
 * ```
 *
 * Two properties of that reference which we reproduce exactly:
 *
 * 1. The cutoff shift is applied to the **absolute instant** (subtract `cutoffHour` hours of
 *    real time) and only *then* is the instant rendered as a civil date in the IANA zone.
 *    A review at 01:00 local with a 4am cutoff therefore lands on the previous calendar day.
 * 2. Because the shift is absolute rather than wall-clock, on a DST-transition day the
 *    effective wall-clock cutoff moves by the offset delta (a 4am cutoff behaves like 3am or
 *    5am on that one day). That is the reference behaviour, not a bug here; deviating from it
 *    would make our `delta_t` disagree with the optimizer's own convertor.
 *
 * Never persist the output of this module. Store absolute instants plus the IANA zone and
 * cutoff hour that were in effect at review time (§4.3), and derive `delta_t` at training time.
 */

export type IanaTimeZone = string;

/** Anki's `next_day_starts_at` default, and ours. */
export const DEFAULT_DAY_CUTOFF_HOUR = 4;

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

export class DeltaTError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeltaTError';
  }
}

/**
 * An absolute instant. Strings are accepted because `timestamptz` arrives from Postgres/JSON as
 * ISO text; they must carry an explicit offset or `Z` (a bare `2026-06-15T09:00` is parsed as
 * local time by the JS engine, which is exactly the ambiguity this module exists to remove).
 */
export type Instant = Date | number | string;

/** An instant paired with the IANA zone that was in effect for the user when it happened. */
export type ZonedInstant = {
  instant: Instant;
  tz: IanaTimeZone;
};

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(tz: IanaTimeZone): Intl.DateTimeFormat {
  const cached = formatterCache.get(tz);
  if (cached) return cached;
  let fmt: Intl.DateTimeFormat;
  try {
    // Parts (not `format()`) so we never depend on a locale's date pattern or on an ICU
    // version happening to render en-CA as YYYY-MM-DD.
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      era: 'short',
    });
  } catch {
    throw new DeltaTError(`Unknown IANA time zone: ${JSON.stringify(tz)}`);
  }
  formatterCache.set(tz, fmt);
  return fmt;
}

/** True if `tz` is a time zone this runtime's ICU understands. */
export function isValidTimeZone(tz: string): boolean {
  try {
    formatterFor(tz);
    return true;
  } catch {
    return false;
  }
}

function assertCutoffHour(cutoffHour: number): void {
  if (!Number.isInteger(cutoffHour) || cutoffHour < 0 || cutoffHour > 23) {
    throw new DeltaTError(`dayCutoffHour must be an integer in [0, 23], got ${cutoffHour}`);
  }
}

function toMillis(instant: Instant): number {
  const ms =
    typeof instant === 'number'
      ? instant
      : typeof instant === 'string'
        ? Date.parse(instant)
        : instant.getTime();
  if (!Number.isFinite(ms)) throw new DeltaTError(`Invalid instant: ${String(instant)}`);
  return ms;
}

/**
 * The user's civil date for `instant`, expressed as a signed integer day index
 * (days since 1970-01-01 in the *civil* calendar — NOT a UTC timestamp).
 *
 * Differences of this value are exactly `chrono`'s `(date_current - date_previous).num_days()`.
 */
export function calendarDay(
  instant: Instant,
  tz: IanaTimeZone,
  cutoffHour: number = DEFAULT_DAY_CUTOFF_HOUR,
): number {
  assertCutoffHour(cutoffHour);
  const shifted = toMillis(instant) - cutoffHour * MS_PER_HOUR;
  const parts = formatterFor(tz).formatToParts(new Date(shifted));

  let year = NaN;
  let month = NaN;
  let day = NaN;
  let bc = false;
  for (const part of parts) {
    if (part.type === 'year') year = Number(part.value);
    else if (part.type === 'month') month = Number(part.value);
    else if (part.type === 'day') day = Number(part.value);
    else if (part.type === 'era') bc = /^b/i.test(part.value);
  }
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new DeltaTError(`Could not extract a civil date for ${new Date(shifted).toISOString()} in ${tz}`);
  }
  // Proleptic year numbering: 1 BC is astronomical year 0, 2 BC is -1, ...
  const astronomicalYear = bc ? 1 - year : year;
  return Math.round(Date.UTC(astronomicalYear, month - 1, day) / MS_PER_DAY);
}

/**
 * `delta_t` in calendar days between two reviews of the same card, for a user in a single zone.
 *
 * Returns 0 for two reviews on the same user-day (those items are dropped from FSRS training —
 * see `training-set.ts`). Can be negative if the inputs are out of order; callers should sort.
 */
export function deltaTDays(
  previous: Instant,
  current: Instant,
  tz: IanaTimeZone,
  cutoffHour: number = DEFAULT_DAY_CUTOFF_HOUR,
): number {
  return calendarDay(current, tz, cutoffHour) - calendarDay(previous, tz, cutoffHour);
}

/**
 * `delta_t` when the user's zone changed between the two reviews (they travelled or moved).
 *
 * Each side is resolved in the zone that was recorded *at that review*, which is why
 * §4.3 insists the `review_log` row stores `tz` per row rather than a single profile field.
 */
export function deltaTDaysAcrossZones(
  previous: ZonedInstant,
  current: ZonedInstant,
  cutoffHour: number = DEFAULT_DAY_CUTOFF_HOUR,
): number {
  return (
    calendarDay(current.instant, current.tz, cutoffHour) -
    calendarDay(previous.instant, previous.tz, cutoffHour)
  );
}

/**
 * `delta_t` for a whole chronological review history of one card.
 *
 * The first element is always 0 — `fsrs-rs` documents "`delta_t` for item first(initial) review
 * must be 0" (§4.1) and violating it is one of the inputs that aborts the Rust optimizer.
 * Each element carries its own zone, so a history that spans a relocation is handled correctly.
 */
export function deltaTSequence(
  reviews: readonly ZonedInstant[],
  cutoffHour: number = DEFAULT_DAY_CUTOFF_HOUR,
): number[] {
  const out = new Array<number>(reviews.length);
  for (let i = 0; i < reviews.length; i++) {
    out[i] = i === 0 ? 0 : deltaTDaysAcrossZones(reviews[i - 1], reviews[i], cutoffHour);
  }
  return out;
}
