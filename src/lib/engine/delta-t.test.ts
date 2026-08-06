import { describe, expect, it } from 'vitest';

import {
  calendarDay,
  DEFAULT_DAY_CUTOFF_HOUR,
  DeltaTError,
  deltaTDays,
  deltaTDaysAcrossZones,
  deltaTSequence,
  isValidTimeZone,
} from './delta-t';

const NY = 'America/New_York';
const SYDNEY = 'Australia/Sydney';
const TOKYO = 'Asia/Tokyo';
const KOLKATA = 'Asia/Kolkata';

/** The naive computation §4.3 exists to replace. Used to prove the two actually differ. */
const naiveDayDiff = (a: string, b: string) =>
  Math.floor((Date.parse(b) - Date.parse(a)) / 86_400_000);

describe('calendarDay', () => {
  it('defaults to Anki\'s 4am cutoff', () => {
    expect(DEFAULT_DAY_CUTOFF_HOUR).toBe(4);
  });

  it('returns a signed day index whose differences are calendar days', () => {
    // Two instants exactly 3 calendar days apart in the same zone, well away from the cutoff.
    const a = calendarDay('2026-06-15T12:00:00-04:00', NY);
    const b = calendarDay('2026-06-18T12:00:00-04:00', NY);
    expect(b - a).toBe(3);
  });

  it('is monotone non-decreasing in the instant', () => {
    let previous = -Infinity;
    for (let hour = 0; hour < 24 * 5; hour++) {
      const day = calendarDay(Date.UTC(2026, 2, 6) + hour * 3_600_000, NY);
      expect(day).toBeGreaterThanOrEqual(previous);
      previous = day;
    }
  });

  it('rejects an unknown IANA zone', () => {
    expect(() => calendarDay(0, 'Mars/Olympus_Mons')).toThrow(DeltaTError);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone(NY)).toBe(true);
  });

  it('rejects a non-integer or out-of-range cutoff hour', () => {
    expect(() => calendarDay(0, NY, 4.5)).toThrow(DeltaTError);
    expect(() => calendarDay(0, NY, -1)).toThrow(DeltaTError);
    expect(() => calendarDay(0, NY, 24)).toThrow(DeltaTError);
  });

  it('accepts Date and epoch-millis instants interchangeably', () => {
    const iso = '2026-06-15T12:00:00-04:00';
    expect(calendarDay(new Date(iso), NY)).toBe(calendarDay(Date.parse(iso), NY));
  });
});

describe('day-cutoff boundary (§4.3: a review at 01:00 with a 4am cutoff is the previous day)', () => {
  const dayOf = (localIso: string, cutoff = 4) => calendarDay(localIso, NY, cutoff);

  it('counts 01:00 local as the previous day', () => {
    // 2026-06-15 01:00 local is on the *2026-06-14* user-day.
    expect(dayOf('2026-06-15T01:00:00-04:00')).toBe(dayOf('2026-06-14T12:00:00-04:00'));
  });

  it('counts 03:59:59 local as the previous day and 04:00:00 as the new day', () => {
    const prevDay = dayOf('2026-06-14T12:00:00-04:00');
    expect(dayOf('2026-06-15T03:59:59-04:00')).toBe(prevDay);
    expect(dayOf('2026-06-15T04:00:00-04:00')).toBe(prevDay + 1);
  });

  it('handles a half-hour-offset zone at the boundary', () => {
    const day14 = calendarDay('2026-06-14T12:00:00+05:30', KOLKATA);
    expect(calendarDay('2026-06-15T03:45:00+05:30', KOLKATA)).toBe(day14);
    expect(calendarDay('2026-06-15T04:15:00+05:30', KOLKATA)).toBe(day14 + 1);
  });

  it('with cutoff 0 is just the local calendar date', () => {
    const day14 = calendarDay('2026-06-14T12:00:00-04:00', NY, 0);
    expect(calendarDay('2026-06-15T00:00:00-04:00', NY, 0)).toBe(day14 + 1);
    expect(calendarDay('2026-06-15T01:00:00-04:00', NY, 0)).toBe(day14 + 1);
  });

  it('a later cutoff pushes early-morning reviews further back', () => {
    // 05:00 local: inside the user-day under a 4am cutoff, previous day under a 6am cutoff.
    const at5am = '2026-06-15T05:00:00-04:00';
    expect(calendarDay(at5am, NY, 4)).toBe(calendarDay('2026-06-15T12:00:00-04:00', NY, 4));
    expect(calendarDay(at5am, NY, 6)).toBe(calendarDay('2026-06-14T12:00:00-04:00', NY, 6));
  });
});

describe('same-day reviews return 0', () => {
  it('two reviews hours apart on the same user-day', () => {
    expect(deltaTDays('2026-06-15T09:00:00-04:00', '2026-06-15T21:00:00-04:00', NY)).toBe(0);
  });

  it('a review before the cutoff belongs to the previous user-day, so 20:00 -> 02:00 is 0', () => {
    // Different *calendar* dates, same *user*-day. This is the whole reason the cutoff exists.
    expect(deltaTDays('2026-06-15T20:00:00-04:00', '2026-06-16T02:00:00-04:00', NY)).toBe(0);
    // ...and once past 04:00 it becomes 1.
    expect(deltaTDays('2026-06-15T20:00:00-04:00', '2026-06-16T10:00:00-04:00', NY)).toBe(1);
  });

  it('is 0 for the identical instant', () => {
    const t = '2026-06-15T09:00:00-04:00';
    expect(deltaTDays(t, t, NY)).toBe(0);
  });

  it('is negative for out-of-order input (callers must sort)', () => {
    expect(deltaTDays('2026-06-18T12:00:00-04:00', '2026-06-15T12:00:00-04:00', NY)).toBe(-3);
  });
});

describe('DST: spring forward (northern hemisphere, 23-hour day)', () => {
  // America/New_York switches EST -> EDT on 2026-03-08.
  const before = '2026-03-07T12:00:00-05:00';
  const after = '2026-03-08T12:00:00-04:00';

  it('counts one calendar day even though only 23 hours of absolute time elapsed', () => {
    expect(Date.parse(after) - Date.parse(before)).toBe(23 * 3_600_000);
    expect(deltaTDays(before, after, NY)).toBe(1);
  });

  it('is exactly the case where the naive (t2 - t1) / 86400000 computation is wrong', () => {
    expect(naiveDayDiff(before, after)).toBe(0);
    expect(deltaTDays(before, after, NY)).toBe(1);
  });

  it('spans the transition correctly over a week', () => {
    expect(deltaTDays('2026-03-05T12:00:00-05:00', '2026-03-12T12:00:00-04:00', NY)).toBe(7);
  });

  it('keeps 02:30 local (a time that does not exist) on the right user-day', () => {
    // 07:30Z on transition day; local clocks jump 02:00 EST -> 03:00 EDT, so this instant reads
    // 03:30 EDT. Under a 4am cutoff it still belongs to the previous user-day.
    expect(calendarDay('2026-03-08T07:30:00Z', NY)).toBe(calendarDay('2026-03-07T12:00:00-05:00', NY));
  });
});

describe('DST: fall back (northern hemisphere, 25-hour day)', () => {
  // America/New_York switches EDT -> EST on 2026-11-01. 01:00-01:59 local occurs twice.
  it('resolves the ambiguous repeated hour to a single consistent user-day', () => {
    const firstPass = '2026-11-01T01:30:00-04:00'; // EDT
    const secondPass = '2026-11-01T01:30:00-05:00'; // EST, one hour later in absolute time
    expect(Date.parse(secondPass) - Date.parse(firstPass)).toBe(3_600_000);
    // Both are before the 4am cutoff, so both belong to the 2026-10-31 user-day.
    const oct31 = calendarDay('2026-10-31T12:00:00-04:00', NY);
    expect(calendarDay(firstPass, NY)).toBe(oct31);
    expect(calendarDay(secondPass, NY)).toBe(oct31);
    expect(deltaTDays(firstPass, secondPass, NY)).toBe(0);
  });

  it('counts one calendar day across the 25-hour day', () => {
    expect(deltaTDays('2026-10-31T12:00:00-04:00', '2026-11-01T12:00:00-05:00', NY)).toBe(1);
  });

  it('still counts one day when only 23 absolute hours elapsed across the boundary', () => {
    const before = '2026-11-01T12:00:00-05:00';
    const after = '2026-11-02T11:00:00-05:00';
    expect(Date.parse(after) - Date.parse(before)).toBe(23 * 3_600_000);
    expect(naiveDayDiff(before, after)).toBe(0);
    expect(deltaTDays(before, after, NY)).toBe(1);
  });
});

describe('DST: southern hemisphere (transitions in the opposite calendar direction)', () => {
  it('handles Sydney losing an hour in October', () => {
    // AEST +10:00 -> AEDT +11:00 on 2026-10-04.
    const before = '2026-10-03T12:00:00+10:00';
    const after = '2026-10-04T12:00:00+11:00';
    expect(Date.parse(after) - Date.parse(before)).toBe(23 * 3_600_000);
    expect(deltaTDays(before, after, SYDNEY)).toBe(1);
  });

  it('handles Sydney gaining an hour in April', () => {
    // AEDT +11:00 -> AEST +10:00 on 2026-04-05.
    const before = '2026-04-04T12:00:00+11:00';
    const after = '2026-04-05T12:00:00+10:00';
    expect(Date.parse(after) - Date.parse(before)).toBe(25 * 3_600_000);
    expect(deltaTDays(before, after, SYDNEY)).toBe(1);
  });

  it('a zone with no DST at all is unaffected', () => {
    expect(deltaTDays('2026-03-07T12:00:00+09:00', '2026-03-08T12:00:00+09:00', TOKYO)).toBe(1);
    expect(deltaTDays('2026-11-01T12:00:00+05:30', '2026-11-02T12:00:00+05:30', KOLKATA)).toBe(1);
  });
});

describe('a user crossing timezones', () => {
  it('resolves each review in the zone recorded at that review', () => {
    const inNewYork = { instant: '2026-06-15T20:00:00-04:00', tz: NY };
    const inTokyo = { instant: '2026-06-17T09:00:00+09:00', tz: TOKYO };

    // Tokyo is a day ahead: the second review is on the learner's 2026-06-17, two user-days later.
    expect(deltaTDaysAcrossZones(inNewYork, inTokyo)).toBe(2);
    // Had we wrongly reused the origin zone for both, we would have got 1 and under-credited
    // the interval by a full day.
    expect(deltaTDays(inNewYork.instant, inTokyo.instant, NY)).toBe(1);
  });

  it('can produce 0 when travel moves the clock backwards across the cutoff', () => {
    // 05:00 in New York on 2026-06-16 is a new user-day; the same instant in Los Angeles is
    // 02:00, which is still the previous user-day under a 4am cutoff.
    const t = '2026-06-16T05:00:00-04:00';
    const dayNy = calendarDay(t, NY);
    const dayLa = calendarDay(t, 'America/Los_Angeles');
    expect(dayNy - dayLa).toBe(1);
  });

  it('handles a westward flight where a later instant is an earlier local time', () => {
    const departure = '2026-06-15T22:00:00+01:00'; // 21:00Z
    const arrival = '2026-06-15T19:00:00-07:00'; // 02:00Z on 2026-06-16, i.e. 5 hours later
    expect(Date.parse(arrival) - Date.parse(departure)).toBe(5 * 3_600_000);
    // Local wall time went *backwards* (22:00 -> 19:00), so both reviews are the same user-day.
    expect(
      deltaTDaysAcrossZones(
        { instant: departure, tz: 'Europe/London' },
        { instant: arrival, tz: 'America/Los_Angeles' },
      ),
    ).toBe(0);
  });
});

describe('deltaTSequence', () => {
  it('always emits 0 first (fsrs-rs requires delta_t = 0 for an item\'s initial review)', () => {
    const seq = deltaTSequence([
      { instant: '2026-06-15T09:00:00-04:00', tz: NY },
      { instant: '2026-06-16T09:00:00-04:00', tz: NY },
      { instant: '2026-06-20T09:00:00-04:00', tz: NY },
    ]);
    expect(seq).toEqual([0, 1, 4]);
  });

  it('emits 0 for an empty or single-review history', () => {
    expect(deltaTSequence([])).toEqual([]);
    expect(deltaTSequence([{ instant: 0, tz: NY }])).toEqual([0]);
  });

  it('carries per-review zones through a relocation mid-history', () => {
    const seq = deltaTSequence([
      { instant: '2026-06-15T09:00:00-04:00', tz: NY },
      { instant: '2026-06-16T09:00:00-04:00', tz: NY },
      // Moved to Tokyo; 2026-06-18 09:00 there is 2026-06-17 20:00 in New York.
      { instant: '2026-06-18T09:00:00+09:00', tz: TOKYO },
    ]);
    expect(seq).toEqual([0, 1, 2]);
  });

  it('marks same-day repeats as 0 so training-set expansion can drop them', () => {
    const seq = deltaTSequence([
      { instant: '2026-06-15T09:00:00-04:00', tz: NY },
      { instant: '2026-06-15T09:10:00-04:00', tz: NY },
      { instant: '2026-06-17T09:00:00-04:00', tz: NY },
    ]);
    expect(seq).toEqual([0, 0, 2]);
  });
});
