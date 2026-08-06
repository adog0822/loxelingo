/**
 * training-set — prefix expansion of review histories into FSRS training items.
 *
 * Implements `docs/research/03-learning-libs.md` §4.1, §4.4, §5.2 and §6.
 *
 * §4.4, from `fsrs-rs`'s own doc comment:
 *
 * > Given a list of revlog entries for a single card with length n, we create **n-1 FSRS items**,
 * > where each item contains the history of the preceding reviews.
 *
 * ```rust
 * entries.iter().enumerate()
 *     .skip(1)                                        // start at the SECOND review
 *     .map(|(idx, entry)| entries.iter().take(idx + 1).map(...).collect())
 *     .filter(|(_, item)| item.current().delta_t > 0) // drop same-day reviews
 * ```
 *
 * So `.skip(1)` means **every item has at least two reviews**, and each item is dropped if its
 * *current* (last) review has `delta_t == 0`.
 *
 * ## Why the assertions in this file are not defensive padding
 *
 * §4.4 documents that a single-review item does not produce an error — it **aborts the process**.
 * In `fsrs-rs-nodejs@0.9.0` it panics with `ndarray: index 18446744073709551615 is out of bounds
 * in array of len 19`, a `usize` underflow of `reviews.len() - 1`, and
 * `fatal runtime error: failed to initiate panic` takes the Node process with it. In
 * `fsrs-browser@6.6.0` it is `RuntimeError: unreachable`. Neither is catchable in a way that
 * lets a queue worker survive. So the contract is checked here, in TypeScript, with a named
 * error, rather than failing deep inside WASM.
 *
 * Pure: no I/O, no database. Feed it rows; get flat arrays out.
 */

import { DEFAULT_DAY_CUTOFF_HOUR, deltaTSequence, type IanaTimeZone } from './delta-t';

/** One review, reduced to what the optimizer actually consumes (§4.1). */
export type TrainingReview = {
  /** 1 = Again, 2 = Hard, 3 = Good, 4 = Easy. 0 (Manual) must already be filtered out. */
  rating: number;
  /** Calendar days since the previous review of this card. Must be 0 for the first review. */
  deltaT: number;
};

/** A card's full chronological review history. */
export type CardHistory = {
  cardId: string;
  reviews: TrainingReview[];
};

/** One expanded FSRS training item: a prefix of a card's history, length >= 2. */
export type FsrsItem = {
  cardId: string;
  reviews: TrainingReview[];
};

/** Flat arrays in exactly the layout `fsrs-browser`'s `computeParameters` wants (§5.1). */
export type FlatTrainingSet = {
  /** All items concatenated. */
  ratings: number[];
  /** Parallel to `ratings`. */
  deltaTs: number[];
  /** Review count per ITEM (per prefix), not per card. */
  lengths: number[];
  /** Parallel to `lengths`. Pass it — §4.1: it enables recency weighting for free. */
  cardIds: bigint[];
  /** `lengths.length`. This is what §5.2's thresholds count. */
  itemCount: number;
};

export class TrainingSetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrainingSetError';
  }
}

/** §5.1 verified default `maxSeqLen`. §5.2: items longer than this are dropped by the trainer. */
export const MAX_SEQ_LEN = 256;

function assertReviewSequence(cardId: string, reviews: readonly TrainingReview[]): void {
  for (let i = 0; i < reviews.length; i++) {
    const r = reviews[i];
    if (!Number.isInteger(r.rating) || r.rating < 1 || r.rating > 4) {
      throw new TrainingSetError(
        `card ${cardId} review ${i}: rating must be an integer in 1..4 (0 = Manual must be ` +
          `filtered out before training), got ${r.rating}`,
      );
    }
    if (!Number.isInteger(r.deltaT)) {
      throw new TrainingSetError(`card ${cardId} review ${i}: deltaT must be an integer, got ${r.deltaT}`);
    }
    if (i === 0 && r.deltaT !== 0) {
      throw new TrainingSetError(
        `card ${cardId}: delta_t for the first review of an item must be 0 (fsrs-rs dataset.rs), got ${r.deltaT}`,
      );
    }
    if (i > 0 && r.deltaT < 0) {
      throw new TrainingSetError(
        `card ${cardId} review ${i}: negative deltaT (${r.deltaT}) — reviews are not in chronological order`,
      );
    }
  }
}

/**
 * Expand one card's history into `n-1` prefix items, starting at the SECOND review, dropping
 * any item whose current (last) `delta_t` is 0.
 *
 * A card with fewer than two reviews yields zero items — which is correct, and is exactly the
 * case that crashes the optimizer if you instead emit a one-review item.
 */
export function expandCardHistory(history: CardHistory): FsrsItem[] {
  assertReviewSequence(history.cardId, history.reviews);
  const seq = history.reviews;
  const items: FsrsItem[] = [];
  // k is the prefix LENGTH; k = 2 is the item whose current review is the second one.
  for (let k = 2; k <= seq.length; k++) {
    const prefix = seq.slice(0, k);
    // §4.4/§4.5: same-day reviews are excluded from training. FSRS-6 does not model them
    // (FSRS-7 is the first version that does), so keep logging them but don't train on them.
    if (prefix[prefix.length - 1].deltaT <= 0) continue;
    items.push({ cardId: history.cardId, reviews: prefix });
  }
  return items;
}

/**
 * The contract every item must satisfy before it may be handed to the optimizer (§5.4).
 *
 * Throws `TrainingSetError`. Never returns false — a silent boolean would invite a caller to
 * ignore it, and the consequence of ignoring it is a dead worker process.
 */
export function assertTrainingItem(item: FsrsItem): void {
  if (item.reviews.length < 2) {
    throw new TrainingSetError(
      `card ${item.cardId}: FSRS item has ${item.reviews.length} review(s); every item must have ` +
        `>= 2 (§4.4). A single-review item causes a usize underflow that ABORTS the Rust ` +
        `optimizer process rather than throwing.`,
    );
  }
  assertReviewSequence(item.cardId, item.reviews);
  const current = item.reviews[item.reviews.length - 1];
  if (current.deltaT <= 0) {
    throw new TrainingSetError(
      `card ${item.cardId}: item's current review has delta_t = ${current.deltaT}; same-day items ` +
        `must be dropped (§4.4).`,
    );
  }
}

export function assertTrainingSet(items: readonly FsrsItem[]): void {
  for (const item of items) assertTrainingItem(item);
}

/** Card ids arrive as text from Postgres; `computeParameters` wants a `BigInt64Array`. */
function toBigIntCardId(cardId: string): bigint {
  try {
    return BigInt(cardId);
  } catch {
    throw new TrainingSetError(
      `card id ${JSON.stringify(cardId)} is not an integer; fsrs-browser's card_ids argument is a ` +
        `BigInt64Array, so card ids must be bigint-convertible.`,
    );
  }
}

export type BuildOptions = {
  /**
   * Drop items longer than this. §5.2: `weighted_train_set.retain(|item| item.reviews.len() <=
   * training_config.max_seq_len)` — the trainer silently discards them anyway, so doing it here
   * keeps `itemCount` honest for the §5.2 tier decision.
   */
  maxSeqLen?: number;
};

/**
 * Build the flat training set from many cards' histories.
 *
 * Every item is asserted before it is flattened, so this either returns something safe to pass
 * to WASM or throws a `TrainingSetError` with the offending card id.
 */
export function buildTrainingSet(
  histories: readonly CardHistory[],
  { maxSeqLen = MAX_SEQ_LEN }: BuildOptions = {},
): FlatTrainingSet {
  const ratings: number[] = [];
  const deltaTs: number[] = [];
  const lengths: number[] = [];
  const cardIds: bigint[] = [];

  for (const history of histories) {
    const id = toBigIntCardId(history.cardId);
    for (const item of expandCardHistory(history)) {
      assertTrainingItem(item);
      if (item.reviews.length > maxSeqLen) continue;
      lengths.push(item.reviews.length);
      cardIds.push(id);
      for (const r of item.reviews) {
        ratings.push(r.rating);
        deltaTs.push(Math.max(0, r.deltaT));
      }
    }
  }

  return { ratings, deltaTs, lengths, cardIds, itemCount: lengths.length };
}

/**
 * Bridge from raw `review_log` rows to a `CardHistory`, deriving `delta_t` at training time
 * from absolute instants plus the per-row zone and cutoff (§4.3).
 *
 * Rows are sorted chronologically here so callers don't have to trust their query's ORDER BY.
 */
export type RawReviewRow = {
  cardId: string;
  reviewTime: Date | number;
  reviewRating: number;
  /** IANA zone recorded at review time. Falls back to `defaultTz`. */
  tz?: IanaTimeZone;
};

export function historyFromRows(
  cardId: string,
  rows: readonly RawReviewRow[],
  defaultTz: IanaTimeZone,
  dayCutoffHour: number = DEFAULT_DAY_CUTOFF_HOUR,
): CardHistory {
  const sorted = [...rows].sort((a, b) => Number(a.reviewTime) - Number(b.reviewTime));
  const deltas = deltaTSequence(
    sorted.map((r) => ({ instant: r.reviewTime, tz: r.tz ?? defaultTz })),
    dayCutoffHour,
  );
  return {
    cardId,
    reviews: sorted.map((r, i) => ({ rating: r.reviewRating, deltaT: deltas[i] })),
  };
}

/** Group flat rows into per-card histories with `delta_t` derived. */
export function historiesFromRows(
  rows: readonly RawReviewRow[],
  defaultTz: IanaTimeZone,
  dayCutoffHour: number = DEFAULT_DAY_CUTOFF_HOUR,
): CardHistory[] {
  const byCard = new Map<string, RawReviewRow[]>();
  for (const r of rows) {
    const list = byCard.get(r.cardId);
    if (list) list.push(r);
    else byCard.set(r.cardId, [r]);
  }
  return [...byCard.entries()].map(([cardId, cardRows]) =>
    historyFromRows(cardId, cardRows, defaultTz, dayCutoffHour),
  );
}

/**
 * Which tier of the optimizer's graceful-degradation ladder this item count lands in (§5.2).
 *
 * From `fsrs-rs/src/training.rs::compute_parameters` — the optimizer never fails for lack of
 * data, it degrades, which is a strictly better policy than a hand-rolled "wait for 200 reviews"
 * gate. Reported here only so a job can log which tier it got; do not use it to skip the call.
 */
export type DegradationTier = 'defaults' | 'initial-stability' | 'full';

export function degradationTier(itemCount: number): DegradationTier {
  if (itemCount < 8) return 'defaults'; // 21 default parameters, unchanged
  if (itemCount < 64) return 'initial-stability'; // w0..w3 fitted; w4..w20 left at defaults
  return 'full'; // full gradient training of all 21
}
