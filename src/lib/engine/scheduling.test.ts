import { default_w, State } from 'ts-fsrs';
import { describe, expect, it } from 'vitest';

import {
  assertParameterVector,
  assertRequestRetention,
  DEFAULT_REQUEST_RETENTION,
  FSRS6_PARAM_COUNT,
  gradeReview,
  logLoss,
  makeScheduler,
  newCard,
  previewAll,
  fromCardState,
  Rating,
  recallProbability,
  resolveParameters,
  retrievability,
  SchedulingError,
  toCardState,
  type ReviewContext,
} from './scheduling';

const ctx: ReviewContext = {
  cardId: '101',
  userId: 'user-1',
  durationMs: 4200,
  tz: 'America/New_York',
  dayCutoffHour: 4,
  paramsId: 'params-1',
};

/** Fuzz is on by default; disable it wherever a test asserts an exact interval. */
const deterministic = () => makeScheduler({ enableFuzz: false });

describe('parameters', () => {
  it('knows FSRS-6 has 21 parameters (§2.2, verified three ways)', () => {
    expect(FSRS6_PARAM_COUNT).toBe(21);
    expect(default_w.length).toBe(21);
  });

  it('exposes request_retention, NOT desired_retention (§2.7 naming trap)', () => {
    const params = resolveParameters({ requestRetention: 0.93 });
    expect(params.request_retention).toBe(0.93);
    expect(params).not.toHaveProperty('desired_retention');
    expect(makeScheduler({ requestRetention: 0.93 }).parameters.request_retention).toBe(0.93);
  });

  it('defaults request_retention to 0.9', () => {
    expect(DEFAULT_REQUEST_RETENTION).toBe(0.9);
    expect(resolveParameters().request_retention).toBe(0.9);
  });

  it('rejects a request_retention that would effectively disable review', () => {
    // §2.7 measured a 39x interval swing over 0.70..0.97, so a client sending 0.5 is hostile.
    expect(() => assertRequestRetention(0.5)).toThrow(SchedulingError);
    expect(() => assertRequestRetention(0.999)).toThrow(SchedulingError);
    expect(() => assertRequestRetention(Number.NaN)).toThrow(SchedulingError);
    expect(assertRequestRetention(0.9)).toBe(0.9);
  });

  it('rejects a parameter vector that is not FSRS-6 shaped', () => {
    expect(() => assertParameterVector([1, 2, 3])).toThrow(/exactly 21/);
    const withNaN = [...default_w];
    withNaN[7] = Number.NaN;
    expect(() => assertParameterVector(withNaN)).toThrow(/not finite/);
    expect(assertParameterVector(default_w)).toBe(default_w);
  });

  it('turns fuzz on by default so cards created together do not pile onto one day', () => {
    expect(resolveParameters().enable_fuzz).toBe(true);
  });
});

describe('newCard', () => {
  it('is a State.New card with no review history (§2.4)', () => {
    const now = new Date('2026-08-05T00:00:00Z');
    const card = newCard(now);
    expect(card.state).toBe(State.New);
    expect(card.reps).toBe(0);
    expect(card.lapses).toBe(0);
    expect(card.stability).toBe(0);
    expect(card.difficulty).toBe(0);
    expect(card.learning_steps).toBe(0);
    expect(card.due.toISOString()).toBe(now.toISOString());
    // §2.4 says `last_review` is "absent (not null)". Precisely: in ts-fsrs 5.4.1 the key IS
    // present with the value `undefined`, which is why it vanishes from JSON. Either way it is
    // never `null`, so `?? null` at the persistence boundary is the correct normalisation and
    // `!card.last_review` would be a bug for a different reason (stability 0 is also falsy).
    expect(card.last_review).toBeUndefined();
    expect(card.last_review).not.toBeNull();
    expect(JSON.parse(JSON.stringify(card))).not.toHaveProperty('last_review');
  });

  it('normalises the absent last_review to null when persisted', () => {
    expect(toCardState(newCard(new Date('2026-08-05T00:00:00Z'))).last_review).toBeNull();
  });
});

describe('card round-trip through storage', () => {
  const now = new Date('2026-08-05T09:00:00Z');

  it('toCardState -> fromCardState preserves every field the scheduler needs', () => {
    const { card } = gradeReview(newCard(now), Rating.Good, now, ctx, deterministic());
    expect(toCardState(fromCardState(card))).toEqual(card);
  });

  it('a rehydrated card schedules identically to the live one, despite elapsed_days being 0', () => {
    // elapsed_days is deprecated and derived from last_review + now, so we never store it (§2.4).
    const scheduler = deterministic();
    const live = scheduler.next(newCard(now), now, Rating.Good).card;
    const later = new Date('2026-08-25T09:00:00Z');

    const fromLive = scheduler.next(live, later, Rating.Good);
    const fromStored = scheduler.next(fromCardState(toCardState(live)), later, Rating.Good);
    expect(fromStored.card.due.toISOString()).toBe(fromLive.card.due.toISOString());
    expect(fromStored.card.stability).toBeCloseTo(fromLive.card.stability, 8);
    expect(fromStored.card.difficulty).toBeCloseTo(fromLive.card.difficulty, 8);
    expect(fromStored.log.elapsed_days).toBe(fromLive.log.elapsed_days);
  });

  it('omits last_review entirely for a never-reviewed card', () => {
    const rehydrated = fromCardState(toCardState(newCard(now)));
    expect('last_review' in rehydrated).toBe(false);
  });
});

describe('gradeReview', () => {
  const now = new Date('2026-08-05T09:00:00Z');

  it('rejects Rating.Manual, which is not a gradeable value (§2.3)', () => {
    // Cast through unknown: the type system already forbids this, but a value crossing an API
    // boundary will not have been type-checked.
    expect(() =>
      gradeReview(newCard(now), Rating.Manual as unknown as Rating.Good, now, ctx),
    ).toThrow(SchedulingError);
  });

  it('emits exactly the §4.7 review_log columns and NOTHING named delta_t', () => {
    const { reviewLogRow } = gradeReview(newCard(now), Rating.Good, now, ctx);
    expect(Object.keys(reviewLogRow).sort()).toEqual(
      [
        'card_id',
        'day_cutoff_hour',
        'difficulty_before',
        'due_before',
        'elapsed_days',
        'fsrs_version',
        'is_cram',
        'is_manual',
        'learning_steps_before',
        'params_id',
        'request_retention',
        'review_duration',
        'review_rating',
        'review_state',
        'review_time',
        'scheduled_days_before',
        'stability_before',
        'state_before',
        'tz',
        'user_id',
      ].sort(),
    );
    // delta_t is derived at training time from absolute instants + tz + cutoff (§4.3).
    expect(reviewLogRow).not.toHaveProperty('delta_t');
    expect(reviewLogRow).not.toHaveProperty('deltaT');
  });

  it('carries the five canonical FSRS columns plus the tz/cutoff needed for delta_t', () => {
    const { reviewLogRow: row } = gradeReview(newCard(now), Rating.Good, now, ctx);
    expect(row.card_id).toBe('101');
    expect(row.review_time.toISOString()).toBe(now.toISOString());
    expect(row.review_rating).toBe(Rating.Good);
    expect(row.review_duration).toBe(4200);
    expect(row.tz).toBe('America/New_York');
    expect(row.day_cutoff_hour).toBe(4);
    expect(row.fsrs_version).toBe('FSRS-6');
    expect(row.params_id).toBe('params-1');
    expect(row.request_retention).toBe(0.9);
    expect(row.is_manual).toBe(false);
    expect(row.is_cram).toBe(false);
  });

  it('logs the PRE-review snapshot (§2.5) — review_state is the state BEFORE the review', () => {
    const first = gradeReview(newCard(now), Rating.Good, now, ctx);
    expect(first.reviewLogRow.review_state).toBe(State.New);
    expect(first.reviewLogRow.state_before).toBe(State.New);
    // ...while the returned card carries the POST-review state.
    expect(first.card.state).toBe(State.Learning);

    const second = gradeReview(
      fromCardState(first.card),
      Rating.Good,
      new Date('2026-08-05T09:12:00Z'),
      ctx,
    );
    expect(second.reviewLogRow.review_state).toBe(State.Learning);
    // The logged stability is the value from *before* this second review, i.e. the first card's.
    expect(second.reviewLogRow.stability_before).toBeCloseTo(first.card.stability, 6);
  });

  it('nulls stability/difficulty on a New card instead of tripping over falsy 0 (§6)', () => {
    const { reviewLogRow } = gradeReview(newCard(now), Rating.Good, now, ctx);
    expect(reviewLogRow.stability_before).toBeNull();
    expect(reviewLogRow.difficulty_before).toBeNull();
  });

  it('persists learning_steps and scheduled_days, the two easy-to-miss fields (§2.4)', () => {
    const { card } = gradeReview(newCard(now), Rating.Good, now, ctx);
    expect(card).toHaveProperty('learning_steps');
    expect(card).toHaveProperty('scheduled_days');
    expect(typeof card.learning_steps).toBe('number');
  });

  it('rounds and floors a negative or fractional duration', () => {
    const { reviewLogRow } = gradeReview(newCard(now), Rating.Good, now, { ...ctx, durationMs: -5 });
    expect(reviewLogRow.review_duration).toBe(0);
    const fractional = gradeReview(newCard(now), Rating.Good, now, { ...ctx, durationMs: 1234.6 });
    expect(fractional.reviewLogRow.review_duration).toBe(1235);
  });

  it('records lapses on Again', () => {
    const scheduler = deterministic();
    const learned = gradeReview(newCard(now), Rating.Good, now, ctx, scheduler);
    const relapsed = gradeReview(
      fromCardState(learned.card),
      Rating.Again,
      new Date('2026-08-20T09:00:00Z'),
      ctx,
      scheduler,
    );
    expect(relapsed.card.lapses).toBeGreaterThanOrEqual(learned.card.lapses);
  });
});

describe('previewAll', () => {
  const now = new Date('2026-08-05T09:00:00Z');

  it('returns all four grades in Again -> Easy order (§2.6)', () => {
    const options = previewAll(newCard(now), now, deterministic());
    expect(options.map((o) => o.rating)).toEqual([Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]);
    expect(options.map((o) => o.label)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
  });

  it('gives non-decreasing intervals from Again to Easy', () => {
    const scheduler = deterministic();
    // Take the card through a couple of reviews so it is out of the learning steps.
    let card = newCard(now);
    let result = gradeReview(card, Rating.Good, now, ctx, scheduler);
    card = fromCardState(result.card);
    result = gradeReview(card, Rating.Good, new Date('2026-08-05T09:12:00Z'), ctx, scheduler);
    card = fromCardState(result.card);

    const options = previewAll(card, new Date('2026-08-20T09:00:00Z'), scheduler);
    for (let i = 1; i < options.length; i++) {
      expect(options[i].intervalDays).toBeGreaterThanOrEqual(options[i - 1].intervalDays);
    }
  });

  it('does not commit anything — the same preview twice is identical', () => {
    const scheduler = deterministic();
    const card = newCard(now);
    expect(previewAll(card, now, scheduler)).toEqual(previewAll(card, now, scheduler));
  });
});

describe('interval / retention behaviour', () => {
  it('FSRS intervals increase with stability', () => {
    const scheduler = deterministic();
    let previous = -Infinity;
    for (const stability of [1, 2, 5, 10, 25, 60, 150, 400]) {
      const interval = scheduler.next_interval(stability, 0);
      expect(interval).toBeGreaterThanOrEqual(previous);
      previous = interval;
    }
    expect(scheduler.next_interval(400, 0)).toBeGreaterThan(scheduler.next_interval(1, 0));
  });

  it('a higher request_retention gives shorter intervals (§2.7\'s 39x swing)', () => {
    const intervals = [0.7, 0.8, 0.9, 0.95, 0.97].map(
      (r) => makeScheduler({ requestRetention: r, enableFuzz: false }).next_interval(50, 0),
    );
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeLessThan(intervals[i - 1]);
    }
    expect(intervals[0] / intervals[intervals.length - 1]).toBeGreaterThan(10);
  });

  it('retrievability decays with elapsed time', () => {
    const scheduler = deterministic();
    const now = new Date('2026-08-05T09:00:00Z');
    let card = newCard(now);
    const first = gradeReview(card, Rating.Good, now, ctx, scheduler);
    card = fromCardState(first.card);
    const second = gradeReview(card, Rating.Good, new Date('2026-08-05T09:12:00Z'), ctx, scheduler);
    card = fromCardState(second.card);

    const soon = retrievability(card, new Date('2026-08-06T09:12:00Z'), scheduler);
    const later = retrievability(card, new Date('2026-08-20T09:12:00Z'), scheduler);
    expect(soon).toBeGreaterThan(later);
    expect(soon).toBeLessThanOrEqual(1);
    expect(later).toBeGreaterThan(0);
  });
});

describe('recallProbability — the FSRS-6 forgetting curve', () => {
  it('satisfies R(S, S) = 0.9 exactly, which is the DEFINITION of stability (§2.8a)', () => {
    // The ts-fsrs TSDoc's `9*S` denominator is WRONG (a leftover from FSRS-4.5); it would give
    // 0.9842 here. Trust the source, not the comments.
    expect(recallProbability(default_w, 10, 10)).toBeCloseTo(0.9, 8);
    expect(recallProbability(default_w, 100, 100)).toBeCloseTo(0.9, 8);
    expect(recallProbability(default_w, 1, 1)).toBeCloseTo(0.9, 8);
  });

  it('is 1 at t = 0 and decreasing in t', () => {
    expect(recallProbability(default_w, 0, 10)).toBeCloseTo(1, 8);
    let previous = Infinity;
    for (const t of [0, 1, 5, 10, 50, 200]) {
      const r = recallProbability(default_w, t, 10);
      expect(r).toBeLessThanOrEqual(previous);
      previous = r;
    }
  });

  it('is increasing in stability at fixed elapsed time', () => {
    let previous = -Infinity;
    for (const s of [1, 2, 5, 20, 100]) {
      const r = recallProbability(default_w, 10, s);
      expect(r).toBeGreaterThan(previous);
      previous = r;
    }
  });
});

describe('logLoss (the promotion gate substitute for fsrs-rs evaluate())', () => {
  it('is lower for a model that predicts the observed outcomes', () => {
    const confidentAndRight = logLoss([
      { w: default_w, elapsedDays: 1, stability: 100, recalled: true },
      { w: default_w, elapsedDays: 1, stability: 100, recalled: true },
    ]);
    const confidentAndWrong = logLoss([
      { w: default_w, elapsedDays: 1, stability: 100, recalled: false },
      { w: default_w, elapsedDays: 1, stability: 100, recalled: false },
    ]);
    expect(confidentAndRight).toBeLessThan(confidentAndWrong);
    expect(confidentAndRight).toBeGreaterThan(0);
  });

  it('is finite even at the extremes (no Infinity from log(0))', () => {
    const loss = logLoss([{ w: default_w, elapsedDays: 0, stability: 1e6, recalled: false }]);
    expect(Number.isFinite(loss)).toBe(true);
  });

  it('requires at least one sample', () => {
    expect(() => logLoss([])).toThrow(SchedulingError);
  });
});
