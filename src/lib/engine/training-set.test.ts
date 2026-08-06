import { describe, expect, it } from 'vitest';

import {
  assertTrainingItem,
  assertTrainingSet,
  buildTrainingSet,
  degradationTier,
  expandCardHistory,
  historiesFromRows,
  historyFromRows,
  MAX_SEQ_LEN,
  TrainingSetError,
  type CardHistory,
  type RawReviewRow,
} from './training-set';

const NY = 'America/New_York';

const history = (cardId: string, ratings: number[], deltaTs: number[]): CardHistory => ({
  cardId,
  reviews: ratings.map((rating, i) => ({ rating, deltaT: deltaTs[i] })),
});

describe('expandCardHistory — prefix expansion (§4.4)', () => {
  it('turns n reviews into n-1 items, starting at the SECOND review', () => {
    const items = expandCardHistory(history('1', [3, 3, 3, 4], [0, 2, 5, 12]));
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.reviews.length)).toEqual([2, 3, 4]);
  });

  it('makes every item a prefix of the card history', () => {
    const h = history('1', [3, 2, 4, 3], [0, 1, 3, 9]);
    for (const item of expandCardHistory(h)) {
      expect(item.reviews).toEqual(h.reviews.slice(0, item.reviews.length));
    }
  });

  it('never emits an item with fewer than two reviews', () => {
    for (const item of expandCardHistory(history('1', [3, 3, 3, 3, 3], [0, 1, 2, 4, 8]))) {
      expect(item.reviews.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('emits nothing for a single-review card — the case that aborts the Rust optimizer', () => {
    expect(expandCardHistory(history('1', [3], [0]))).toEqual([]);
  });

  it('emits nothing for an empty history', () => {
    expect(expandCardHistory({ cardId: '1', reviews: [] })).toEqual([]);
  });

  it('drops items whose CURRENT review has delta_t = 0 (same-day reviews are excluded)', () => {
    // Reviews 2 and 3 are same-day repeats; only the k=4 prefix survives.
    const items = expandCardHistory(history('1', [1, 3, 3, 3], [0, 0, 0, 7]));
    expect(items).toHaveLength(1);
    expect(items[0].reviews.length).toBe(4);
    // A dropped same-day review still appears as HISTORY inside the surviving item.
    expect(items[0].reviews.map((r) => r.deltaT)).toEqual([0, 0, 0, 7]);
  });

  it('drops every item when every review is same-day', () => {
    expect(expandCardHistory(history('1', [1, 1, 3], [0, 0, 0]))).toEqual([]);
  });

  it('carries the card id onto every item', () => {
    for (const item of expandCardHistory(history('abc-77', [3, 3, 3], [0, 1, 4]))) {
      expect(item.cardId).toBe('abc-77');
    }
  });
});

describe('validation — explicit assertions instead of a WASM abort (§4.4)', () => {
  it('rejects a first review whose delta_t is not 0', () => {
    expect(() => expandCardHistory(history('1', [3, 3], [5, 2]))).toThrow(TrainingSetError);
    expect(() => expandCardHistory(history('1', [3, 3], [5, 2]))).toThrow(/must be 0/);
  });

  it('rejects a rating outside 1..4, including 0 (Manual)', () => {
    expect(() => expandCardHistory(history('1', [0, 3], [0, 2]))).toThrow(/1\.\.4/);
    expect(() => expandCardHistory(history('1', [3, 5], [0, 2]))).toThrow(/1\.\.4/);
    expect(() => expandCardHistory(history('1', [3, 2.5], [0, 2]))).toThrow(/1\.\.4/);
  });

  it('rejects a negative delta_t (reviews out of chronological order)', () => {
    expect(() => expandCardHistory(history('1', [3, 3], [0, -1]))).toThrow(/chronological/);
  });

  it('rejects a non-integer delta_t', () => {
    expect(() => expandCardHistory(history('1', [3, 3], [0, 1.5]))).toThrow(/integer/);
  });

  it('assertTrainingItem refuses a single-review item and says why', () => {
    expect(() =>
      assertTrainingItem({ cardId: '1', reviews: [{ rating: 3, deltaT: 0 }] }),
    ).toThrow(/ABORTS the Rust optimizer/);
  });

  it('assertTrainingItem refuses an item whose current review is same-day', () => {
    expect(() =>
      assertTrainingItem({
        cardId: '1',
        reviews: [
          { rating: 3, deltaT: 0 },
          { rating: 3, deltaT: 0 },
        ],
      }),
    ).toThrow(/same-day items/);
  });

  it('assertTrainingSet accepts everything expandCardHistory produces', () => {
    const items = expandCardHistory(history('1', [3, 3, 1, 3, 4], [0, 1, 0, 6, 15]));
    expect(items.length).toBeGreaterThan(0);
    expect(() => assertTrainingSet(items)).not.toThrow();
  });
});

describe('buildTrainingSet — flat arrays for fsrs-browser computeParameters (§5.1)', () => {
  const histories = [
    history('11', [3, 3, 3, 4], [0, 2, 5, 12]),
    history('12', [3, 1, 3], [0, 1, 3]),
    history('13', [3], [0]), // contributes nothing
  ];

  it('keeps ratings and delta_ts parallel and lengths summing to their length', () => {
    const set = buildTrainingSet(histories);
    expect(set.ratings).toHaveLength(set.deltaTs.length);
    expect(set.lengths.reduce((a, b) => a + b, 0)).toBe(set.ratings.length);
  });

  it('reports one length and one card id per ITEM, not per card', () => {
    const set = buildTrainingSet(histories);
    // 3 items from card 11, 2 from card 12, 0 from card 13.
    expect(set.itemCount).toBe(5);
    expect(set.lengths).toEqual([2, 3, 4, 2, 3]);
    // BigInt(...) rather than the `11n` literal: tsconfig targets ES2017.
    expect(set.cardIds).toEqual([BigInt(11), BigInt(11), BigInt(11), BigInt(12), BigInt(12)]);
    expect(set.cardIds).toHaveLength(set.lengths.length);
  });

  it('concatenates the items in order', () => {
    const set = buildTrainingSet([history('11', [3, 2, 4], [0, 3, 8])]);
    expect(set.ratings).toEqual([3, 2, 3, 2, 4]);
    expect(set.deltaTs).toEqual([0, 3, 0, 3, 8]);
  });

  it('starts every item at delta_t 0 and never ends one at 0', () => {
    const set = buildTrainingSet([history('11', [3, 3, 3, 3], [0, 0, 4, 0])]);
    let offset = 0;
    expect(set.itemCount).toBeGreaterThan(0);
    for (const length of set.lengths) {
      expect(set.deltaTs[offset]).toBe(0);
      expect(set.deltaTs[offset + length - 1]).toBeGreaterThan(0);
      offset += length;
    }
  });

  it('produces an empty set (not a throw) when no card has two reviews', () => {
    const set = buildTrainingSet([history('1', [3], [0]), history('2', [4], [0])]);
    expect(set).toEqual({ ratings: [], deltaTs: [], lengths: [], cardIds: [], itemCount: 0 });
  });

  it('rejects a non-integer card id, since card_ids is a BigInt64Array', () => {
    expect(() => buildTrainingSet([history('card-abc', [3, 3], [0, 1])])).toThrow(/BigInt64Array/);
  });

  it('drops items longer than maxSeqLen, as the trainer would (§5.2)', () => {
    expect(MAX_SEQ_LEN).toBe(256);
    const long = history(
      '1',
      Array.from({ length: 300 }, () => 3),
      Array.from({ length: 300 }, (_, i) => (i === 0 ? 0 : 1)),
    );
    const set = buildTrainingSet(long ? [long] : []);
    expect(Math.max(...set.lengths)).toBeLessThanOrEqual(256);
    // 299 prefixes exist; those of length 257..300 are dropped, leaving 255.
    expect(set.itemCount).toBe(255);

    const unbounded = buildTrainingSet([long], { maxSeqLen: 10_000 });
    expect(unbounded.itemCount).toBe(299);
  });
});

describe('degradationTier — the optimizer\'s graceful-degradation ladder (§5.2)', () => {
  it('returns defaults below 8 expanded items', () => {
    expect(degradationTier(0)).toBe('defaults');
    expect(degradationTier(7)).toBe('defaults');
  });

  it('fits initial stability only between 8 and 63', () => {
    expect(degradationTier(8)).toBe('initial-stability');
    expect(degradationTier(63)).toBe('initial-stability');
  });

  it('does full gradient training at 64 and above', () => {
    expect(degradationTier(64)).toBe('full');
    expect(degradationTier(41_370)).toBe('full');
  });
});

describe('historyFromRows — deriving delta_t at training time (§4.3)', () => {
  const rows = (specs: [string, string][]): RawReviewRow[] =>
    specs.map(([reviewTime, tz]) => ({ cardId: '1', reviewTime: Date.parse(reviewTime), reviewRating: 3, tz }));

  it('emits 0 for the first review and calendar-day diffs thereafter', () => {
    const h = historyFromRows(
      '1',
      rows([
        ['2026-06-15T09:00:00-04:00', NY],
        ['2026-06-16T09:00:00-04:00', NY],
        ['2026-06-20T09:00:00-04:00', NY],
      ]),
      NY,
    );
    expect(h.reviews.map((r) => r.deltaT)).toEqual([0, 1, 4]);
  });

  it('sorts rows chronologically rather than trusting the query', () => {
    const h = historyFromRows(
      '1',
      rows([
        ['2026-06-20T09:00:00-04:00', NY],
        ['2026-06-15T09:00:00-04:00', NY],
        ['2026-06-16T09:00:00-04:00', NY],
      ]),
      NY,
    );
    expect(h.reviews.map((r) => r.deltaT)).toEqual([0, 1, 4]);
  });

  it('handles a DST spring-forward gap, where the naive computation gives 0 days', () => {
    const h = historyFromRows(
      '1',
      rows([
        ['2026-03-07T12:00:00-05:00', NY],
        ['2026-03-08T12:00:00-04:00', NY], // only 23 absolute hours later
      ]),
      NY,
    );
    expect(h.reviews.map((r) => r.deltaT)).toEqual([0, 1]);
    // ...and the resulting item is therefore kept, not dropped as same-day.
    expect(expandCardHistory(h)).toHaveLength(1);
  });

  it('uses each row\'s own zone when the learner relocated', () => {
    const h = historyFromRows(
      '1',
      rows([
        ['2026-06-15T20:00:00-04:00', NY],
        ['2026-06-17T09:00:00+09:00', 'Asia/Tokyo'],
      ]),
      NY,
    );
    expect(h.reviews.map((r) => r.deltaT)).toEqual([0, 2]);
  });

  it('falls back to the default zone for rows with no recorded tz', () => {
    const h = historyFromRows(
      '1',
      [
        { cardId: '1', reviewTime: Date.parse('2026-06-15T09:00:00-04:00'), reviewRating: 3 },
        { cardId: '1', reviewTime: Date.parse('2026-06-18T09:00:00-04:00'), reviewRating: 3 },
      ],
      NY,
    );
    expect(h.reviews.map((r) => r.deltaT)).toEqual([0, 3]);
  });

  it('respects a non-default day cutoff', () => {
    const specs: [string, string][] = [
      ['2026-06-15T20:00:00-04:00', NY],
      ['2026-06-16T02:00:00-04:00', NY],
    ];
    expect(historyFromRows('1', rows(specs), NY, 4).reviews[1].deltaT).toBe(0);
    expect(historyFromRows('1', rows(specs), NY, 0).reviews[1].deltaT).toBe(1);
  });
});

describe('historiesFromRows', () => {
  it('groups by card and derives delta_t per card', () => {
    const raw: RawReviewRow[] = [
      { cardId: '1', reviewTime: Date.parse('2026-06-15T09:00:00Z'), reviewRating: 3 },
      { cardId: '2', reviewTime: Date.parse('2026-06-15T10:00:00Z'), reviewRating: 4 },
      { cardId: '1', reviewTime: Date.parse('2026-06-18T09:00:00Z'), reviewRating: 3 },
      { cardId: '2', reviewTime: Date.parse('2026-06-22T10:00:00Z'), reviewRating: 3 },
    ];
    const histories = historiesFromRows(raw, 'UTC');
    expect(histories.map((h) => h.cardId)).toEqual(['1', '2']);
    expect(histories[0].reviews.map((r) => r.deltaT)).toEqual([0, 3]);
    expect(histories[1].reviews.map((r) => r.deltaT)).toEqual([0, 7]);
  });

  it('round-trips into a valid training set', () => {
    const raw: RawReviewRow[] = [];
    for (let card = 1; card <= 12; card++) {
      for (let day = 0; day < 8; day++) {
        raw.push({
          cardId: String(card),
          reviewTime: Date.UTC(2026, 5, 1 + day * 2, 12),
          reviewRating: 3,
        });
      }
    }
    const set = buildTrainingSet(historiesFromRows(raw, 'UTC'));
    // 12 cards x 7 prefixes each.
    expect(set.itemCount).toBe(84);
    expect(degradationTier(set.itemCount)).toBe('full');
  });
});
