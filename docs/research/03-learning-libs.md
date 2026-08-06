# 03 — Learning-Science & Rating Library APIs (verified)

Research date: 2026-08-05. Companion to `02-ml-and-naming.md`, which established the algorithm
choices (FSRS, dynamic-K Elo, Bradley-Terry, Best-LR logistic regression). This document establishes
the **actual shipping APIs** for those choices.

**Method.** Everything in Parts 1–4 was verified by installing the packages and executing them on
Node v25.5.0, plus reading the Rust source of `fsrs-rs` and the Anki protobuf schema. Nothing in
Parts 1–4 is quoted from a blog post or from memory. Signatures are transcribed from the shipped
`.d.ts` files. Anything I could not verify is marked **UNVERIFIED**.

**Target stack** (from `package.json`): Next.js 16.3.0, React 19.2.8, TypeScript 5, Supabase
(`@supabase/supabase-js` 2.112, `@supabase/ssr` 0.12.4) i.e. **Postgres**, `@vercel/queue` 0.4.0 for
background jobs, Vercel AI SDK 7, zod 4. This matters: Vercel serverless functions make **WASM
strongly preferable to native N-API addons**, which drives the optimizer recommendation in Part 4.

---

## 1. Sources consulted

### FSRS — packages actually installed and executed
- npm registry JSON: `https://registry.npmjs.org/ts-fsrs`, `/fsrs-browser`, `/fsrs-rs-nodejs`
- `ts-fsrs@5.4.1` — read `node_modules/ts-fsrs/dist/index.d.ts` (593 lines), `dist/index.mjs`,
  `README.md`, `package.json`; executed against Node 25.5.0
- `ts-fsrs@6.0.0-beta.0` — installed and executed to check for FSRS-7
- `fsrs-browser@6.6.0` — read `fsrs_browser.d.ts`, executed the WASM optimizer in Node
- `fsrs-rs-nodejs@0.9.0` — read `index.d.ts`, executed the native optimizer

### FSRS — source read
- https://github.com/open-spaced-repetition/ts-fsrs (MIT, 738 stars, pushed 2026-08-05)
- https://raw.githubusercontent.com/open-spaced-repetition/fsrs-rs/main/src/training.rs
- https://raw.githubusercontent.com/open-spaced-repetition/fsrs-rs/main/src/dataset.rs
- https://raw.githubusercontent.com/open-spaced-repetition/fsrs-rs/main/src/inference.rs
- https://raw.githubusercontent.com/open-spaced-repetition/fsrs-rs/main/src/error.rs
- https://raw.githubusercontent.com/open-spaced-repetition/fsrs-rs/main/src/convertor_tests.rs
  — **the reference revlog→FSRSItem conversion; the single most important file for Part 3**
- https://raw.githubusercontent.com/open-spaced-repetition/fsrs-rs/main/Cargo.toml (crate `fsrs` 6.6.2)
- https://raw.githubusercontent.com/ankitects/anki/main/proto/anki/stats.proto (`RevlogEntry`)
- https://raw.githubusercontent.com/open-spaced-repetition/srs-benchmark/main/README.md
- GitHub API `/repos/...` for maintenance status of all four FSRS repos

---

## 2. ts-fsrs — verified findings

### 2.1 Identity and health

| Field | Value |
|---|---|
| npm package | **`ts-fsrs`** |
| Latest stable | **5.4.1** (published 2026-05-22) |
| Beta tag | `6.0.0-beta.0` (published 2026-07-26) |
| License | **MIT** |
| Runtime dependencies | **zero** |
| Bundle | 59.2 KB ESM raw, **13.1 KB gzipped**; also CJS + UMD |
| `engines.node` | `>=20.0.0` |
| Types | ships `dist/index.d.ts` (no `@types` needed) |
| Repo | `open-spaced-repetition/ts-fsrs`, monorepo dir `packages/fsrs` |
| Maintenance | 738 stars, 5 open issues, **last push 2026-08-05 (today)** |

**Verdict: exists, is first-party (same org as the FSRS reference implementation and `fsrs-rs`), and
is actively maintained.** Zero deps + 13 KB gzipped + no native code means it runs in Node
serverless, edge runtime, and the browser without qualification.

### 2.2 FSRS version — the headline answer

```
FSRSVersion   = "v5.4.1 using FSRS-6.0"
default_w.length = 21
```

**`ts-fsrs` 5.4.1 implements FSRS-6, with 21 parameters.** The `default_w` array is byte-identical
to the FSRS-6 defaults recorded in `02-ml-and-naming.md`:

```
0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542
```

This **resolves the open question in `02-ml-and-naming.md`**: FSRS-6 has **21** parameters, not 19.
The benchmark table was right and DeepWiki was wrong. Verified three independent ways — `ts-fsrs`
`default_w.length === 21`, `fsrs-browser` `DEFAULT_PARAMETERS().length === 21`, and
`CLAMP_PARAMETERS(2, true).length === 21`.

Also confirmed: `ts-fsrs@6.0.0-beta.0` reports `"v6.0.0-beta.0 using FSRS-6.0"` and
`default_w.length === 21`. **The `6.0.0` is the package version, not the algorithm version.** Do not
assume the beta is FSRS-7.

### 2.3 Enums — exact values

```ts
enum Rating { Manual = 0, Again = 1, Hard = 2, Good = 3, Easy = 4 }
enum State  { New = 0, Learning = 1, Review = 2, Relearning = 3 }

type Grade  = Exclude<Rating, Rating.Manual>   // 1 | 2 | 3 | 4
const Grades: Readonly<Grade[]>                // runtime value: [1, 2, 3, 4]
```

`Rating.Manual = 0` is **not** a gradeable value — `repeat()`/`next()` accept `Grade`, so only 1–4.
`Manual` exists to represent an administrative reschedule in a review log. Store the integer, and
store it as 1–4 for real reviews.

### 2.4 The `Card` object — exact shape

```ts
interface Card {
  due: Date
  stability: number
  difficulty: number
  /** @deprecated removed in 6.0.0 */
  elapsed_days: number
  scheduled_days: number
  learning_steps: number
  reps: number
  lapses: number
  state: State
  last_review?: Date
}
```

A freshly created card (`createEmptyCard(new Date('2026-08-05T00:00:00Z'))`), verified by execution:

```json
{ "due": "2026-08-05T00:00:00.000Z", "stability": 0, "difficulty": 0, "elapsed_days": 0,
  "scheduled_days": 0, "reps": 0, "lapses": 0, "learning_steps": 0, "state": 0 }
```

Note `last_review` is **absent** (not null) on a new card. `CardInput` is the lenient input variant:
`state` accepts `'Review'` or `State.Review`, and dates accept `Date | number | string` (`DateInput`).

Two fields are new-ish and easy to miss: **`learning_steps`** (index into the configured learning
step ladder) and **`scheduled_days`**. Both must be persisted or the scheduler loses its place.

### 2.5 `ReviewLog` — exact shape

```ts
interface ReviewLog {
  rating: Rating
  state: State
  due: Date
  stability: number
  difficulty: number
  /** @deprecated removed in 6.0.0 */ elapsed_days: number
  /** @deprecated removed in 6.0.0 */ last_elapsed_days: number
  scheduled_days: number
  learning_steps: number
  review: Date
}
```

**Critical semantic, verified by execution: `ReviewLog` is the PRE-review snapshot.** On the second
review of a card whose stability had been 2.3065, the emitted log carried `state: 1`,
`stability: 2.3065`, `difficulty: 2.11810397` — the values *before* the update — while
`log.review` is the timestamp of the review and `log.elapsed_days` is the delta_t. The *post*-review
state is in `RecordLogItem.card`. This is exactly the right shape for reconstructing training data,
and it is the opposite of what you'd assume from the field names.

### 2.6 Scheduling — the two entry points

Both exist. They are not alternatives to each other; they serve different UI needs.

```ts
const fsrs: (params?: Partial<FSRSParameters>) => FSRS

// preview ALL FOUR outcomes without committing
repeat(card: CardInput | Card, now: DateInput): IPreview
repeat<R>(card: CardInput | Card, now: DateInput, afterHandler: (r: IPreview) => R): R

// apply ONE known grade
next(card: CardInput | Card, now: DateInput, grade: Grade): RecordLogItem
next<R>(card: CardInput | Card, now: DateInput, grade: Grade, afterHandler: (r: RecordLogItem) => R): R
```

Return types:

```ts
type RecordLogItem = { card: Card; log: ReviewLog }
type RecordLog     = { [key in Grade]: RecordLogItem }        // keys "1" | "2" | "3" | "4"
interface IPreview extends RecordLog { [Symbol.iterator](): IterableIterator<RecordLogItem> }
```

`repeat()` returns an object keyed by grade **and** iterable — verified `Object.keys(preview)` is
`['1','2','3','4']` and `for (const item of preview)` yields four `RecordLogItem`s in Again→Easy
order. Use `repeat()` to render "1d / 3d / 8d / 20d" on the answer buttons; use `next()` to commit.

Other verified methods on `FSRS`:

```ts
get_retrievability(card, now?, format?: false): number   // e.g. 0.97287607
get_retrievability(card, now?, format?: true):  string   // e.g. "97.29%"
rollback(card: CardInput | Card, log: ReviewLogInput): Card
forget(card, now, reset_count?: boolean): RecordLogItem
reschedule<T>(current_card, reviews?: FSRSHistory[], options?): IReschedule<T>
next_state(memory_state: FSRSState | null, t: number, g: number, r?: number): FSRSState
next_interval(s: number, elapsed_days: number): int
useStrategy<T extends StrategyMode>(mode: T, handler: TStrategyHandler<T>): this
```

`reschedule(card, reviews, ...)` replays a review history to rebuild state — **this is the FSRS
version-migration and parameter-change path**, and it is the reason Part 3 matters.

### 2.7 Parameters — `desired_retention` is actually called `request_retention`

```ts
interface FSRSParameters {
  request_retention: number          // NOT desired_retention
  maximum_interval: number
  w: number[] | readonly number[]
  enable_fuzz: boolean
  enable_short_term: boolean
  learning_steps: Steps              // StepUnit[] where StepUnit = `${number}${'m'|'h'|'d'}`
  relearning_steps: Steps
}
```

**Naming trap:** in `ts-fsrs` the retention knob is **`request_retention`**. In `fsrs-rs` /
`fsrs-browser` / `fsrs-rs-nodejs` the same concept is spelled **`desired_retention`** (a function
argument, not a stored parameter). Both appear in the FSRS ecosystem; do not typo across the
boundary. Verified defaults:

```
request_retention   = 0.9      maximum_interval = 36500
enable_fuzz         = false    enable_short_term = true
learning_steps      = ['1m','10m']    relearning_steps = ['10m']
S_MIN = 0.001   S_MAX = 36500   INIT_S_MAX = 100
FSRS5_DEFAULT_DECAY = 0.5      FSRS6_DEFAULT_DECAY = 0.1542
```

`request_retention` is honoured — verified by scheduling the same card at several values:

| `request_retention` | `scheduled_days` |
|---|---|
| 0.70 | 233 |
| 0.80 | 83 |
| 0.90 | 25 |
| 0.95 | 10 |
| 0.97 | 6 |

That is a **39× interval swing** across the plausible range. It confirms the `02-` recommendation to
expose this as the single user-facing knob, and it also means you must validate it server-side —
a client sending `0.5` would effectively disable review.

Three ways to construct, all verified equivalent:

```ts
const f = fsrs()                                   // all defaults
const f = fsrs({ request_retention: 0.9 })         // partial override
const p = generatorParameters({ maximum_interval: 1000 }); const f = fsrs(p)   // full object
```

`generatorParameters()` fills a complete `FSRSParameters` — use it when persisting parameters.
Validate parameters from storage/network with zod at the boundary (the README explicitly advises
this, and `checkParameters()` throws rather than returning a result).

### 2.8 Two TSDoc errors in ts-fsrs — trust the source, not the comments

Both found by reading `dist/index.mjs` against the TSDoc, and confirmed numerically.

**(a) The forgetting curve has no `9·S`.** The TSDoc claims
`R(t,S) = (1 + FACTOR × t/(9·S))^DECAY`. The actual implementation is:

```js
computeDecayFactor = (decayOrParams) => {
  const decay = typeof decayOrParams === "number" ? -decayOrParams : -decayOrParams[20];
  const factor = Math.exp(Math.pow(decay, -1) * Math.log(0.9)) - 1;
  return { decay, factor: roundTo(factor, 8) };
};
function forgetting_curve(decayOrParams, elapsed_days, stability) {
  const { decay, factor } = computeDecayFactor(decayOrParams);
  return roundTo(Math.pow(1 + factor * elapsed_days / stability, decay), 8);
}
```

So the real FSRS-6 curve is, with `w20` the 21st parameter:

```
decay  = -w20                            = -0.1542   (default)
factor = exp(ln(0.9) / decay) - 1        =  0.98034649
R(t,S) = (1 + factor · t / S) ^ decay
```

Verified: `forgetting_curve(default_w, 10, 10) === 0.9` and `forgetting_curve(default_w, 100, 100)
=== 0.9`, i.e. `R(S,S) = 0.90` exactly — which is the definition of stability. The TSDoc's `9·S`
form yields 0.9842, so it is simply wrong for FSRS-6 (it is a leftover from FSRS-4.5, where
`factor = 19/81` and `decay = -0.5` were constants).

**(b) `w19` is missing from the TSDoc.** `next_short_term_stability`'s comment shows only
`S'_s(S,G) = S · e^{w17·(G-3+w18)}`. The source is:

```js
next_short_term_stability(s, g) {
  const w = this.param.w;
  const sinc = Math.pow(s, -w[19]) * Math.exp(w[17] * (g - 3 + w[18]));
  const maskedSinc = g >= Rating.Hard ? Math.max(sinc, 1) : sinc;
  return roundTo(clamp(s * maskedSinc, S_MIN, 36500), 8);
}
```

i.e. `S'_s = S · S^(-w19) · e^(w17·(G-3+w18))`, clamped so that Hard/Good/Easy never *decrease*
stability. This matches the `S^(-w19)` diminishing-returns term described in `02-ml-and-naming.md`.

### 2.9 Parameter map for FSRS-6 (21 params), transcribed from source

| Index | Role |
|---|---|
| `w0..w3` | initial stability per grade: `S_0(G) = w_{G-1}`, floored at 0.1 |
| `w4, w5` | initial difficulty: `D_0(G) = w4 - e^{(G-1)·w5} + 1`, clamped to [1,10] |
| `w6` | difficulty delta: `Δd = -w6·(g-3)`, then linear damping |
| `w7` | mean reversion toward `D_0(4)`: `D' = w7·D_0(4) + (1-w7)·next_d` |
| `w8, w9, w10` | recall stability `S'_r = S·(e^{w8}·(11-D)·S^{-w9}·(e^{w10·(1-R)}-1)·…+1)` |
| `w11..w14` | forget stability `S'_f = w11·D^{-w12}·((S+1)^{w13}-1)·e^{w14·(1-R)}` |
| `w15, w16` | Hard penalty (`G=2`) and Easy bonus (`G=4`) multipliers on `S'_r` |
| `w17, w18, w19` | short-term stability `S'_s = S·S^{-w19}·e^{w17·(G-3+w18)}` |
| `w20` | **forgetting-curve decay** (`decay = -w20`) — the FSRS-6 addition |

`w20` is what makes FSRS-6 better than FSRS-5: the *shape* of each user's forgetting curve is fitted,
not fixed.

---

## 3. FSRS version support across the whole ecosystem

Every number here was obtained by executing the package or reading its source, not from docs.

| Package / crate | Version | FSRS version | Params | Scheduler | Optimizer | Runtime |
|---|---|---|---|---|---|---|
| **`ts-fsrs`** | 5.4.1 | **FSRS-6** | **21** | yes | **no** | pure TS, anywhere |
| `ts-fsrs` | 6.0.0-beta.0 | FSRS-6 | 21 | yes | no | pure TS |
| **`fsrs-browser`** | 6.6.0 | **FSRS-6** | **21** | yes | **yes** | WASM |
| `fsrs` (Rust crate) | 6.6.2 | FSRS-6 | 21 | yes | yes | Rust |
| **`fsrs-rs-nodejs`** | 0.9.0 | **FSRS-5** | **19** | yes | yes | native N-API |
| FSRS-7 | — | — | 35 | research only | research only | Python |

### Is there an FSRS-7 implementation? No.

**FSRS-7 does not exist in any shipping library, in any language.** It exists only as research code
in `srs-benchmark`. Two pieces of decisive evidence:

1. `srs-benchmark/README.md` line 52 describes the Rust port as: *"FSRS-rs: the Rust port of
   **FSRS-6** with recency weighting."* The benchmark itself labels `fsrs-rs` as FSRS-6.
2. `fsrs-rs` `Cargo.toml` on `main` is version **6.6.2**, and `fsrs-browser@6.6.0`'s
   `DEFAULT_PARAMETERS()` returns **21** floats identical to the FSRS-6 defaults.

The benchmark README does describe FSRS-7 (35 params, fractional intervals, 8-parameter dual
forgetting curve, the only version giving realistic same-day recall predictions), and lists
variants — `FSRS-7 recency` (log loss 0.3414), plain `FSRS-7` (0.3437), `FSRS-7 sched. penalties`
(0.3438), plus `preset` and `deck` variants. But those are Python benchmark implementations.

**So `ts-fsrs` does not lag the shipping state of the art at all — it *is* the shipping state of the
art (FSRS-6), and it's the same algorithm version as the Rust implementation Anki uses.** The gap to
FSRS-7 is ~0.002 log loss (0.3437 vs 0.3460), which is not worth engineering against today.

### Is `fsrs-rs` via WASM or a Node binding a practical alternative?

**Not for scheduling — `ts-fsrs` is strictly better there** (pure TS, zero deps, 13 KB, no init
step, runs on edge). Use the Rust builds only for the optimizer. Verified specifics:

**`fsrs-browser@6.6.0`** (BSD-3-Clause, 337 KB `.wasm` + 33 KB JS glue) — FSRS-6, includes the
optimizer. Two real packaging obstacles in Node, both verified:

1. `package.json` has `"module"` and `"types"` but **no `"main"` and no `"exports"`**, so
   `import 'fsrs-browser'` fails with `ERR_MODULE_NOT_FOUND`. You must import the file path
   (`./node_modules/fsrs-browser/fsrs_browser.js`).
2. It pulls in `snippets/wasm-bindgen-rayon-.../workerHelpers.js`, which touches `self` and
   `self.addEventListener` **at module top level** → `ReferenceError: self is not defined` in Node.

Both are shimmable, and **it then works**: see Part 5 for a measured benchmark. `initThreadPool()`
is optional (a browser-only speedup requiring COOP/COEP for `SharedArrayBuffer`); the single-threaded
path is fine and fast.

**`fsrs-rs-nodejs@0.9.0`** (MIT) — has the nicest API of the three, and `evaluate()` for measuring
log loss, but:
- It is **FSRS-5 with 19 parameters** (`DEFAULT_PARAMETERS.length === 19`, values
  `[0.4026, 1.1839, 3.173, 15.691, …]`), i.e. **one algorithm version behind**.
- npm latest is **0.9.0 from 2025-03-22 — ~17 months stale**, though the repo was pushed 2026-06-15
  (fixes exist but are unreleased).
- It is a **native N-API addon** with 13 per-platform optional deps. On Vercel this is a deployment
  liability; `ts-fsrs` + WASM avoids the question entirely.
- **Footgun:** malformed input causes a Rust `panic!` that **aborts the Node process** rather than
  raising a catchable JS error (verified: `thread '<unnamed>' panicked at …dataset.rs:60` and
  `fatal runtime error: failed to initiate panic`). See Part 4.4 — validate before calling.

**Recommendation: `ts-fsrs` for all scheduling; `fsrs-browser` (WASM) for optimization.** Skip
`fsrs-rs-nodejs` unless it ships an FSRS-6 release.

---

## 4. Review-logging schema — what the optimizer actually requires

This is the part that is expensive to get wrong, because you cannot backfill it.

### 4.1 The minimal training record

From `fsrs-rs/src/dataset.rs`, the entire training input is:

```rust
pub struct FSRSItem   { pub reviews: Vec<FSRSReview> }
pub struct FSRSReview {
    /// 1 = Again, 2 = Hard, 3 = Good, 4 = Easy
    pub rating: u32,
    /// The number of days that passed.
    /// # Warning: `delta_t` for item first(initial) review must be 0
    pub delta_t: u32,
}
```

**That is it. The optimizer needs, per card, an ordered sequence of `(rating, delta_t_in_days)`.**
Stability, difficulty, state, due date and interval are all *derived* — the optimizer recomputes
them from scratch for each candidate parameter set. Storing them is useful for debugging and for
serving, but is **not** training input.

Optionally you may also pass `card_ids: BigInt64Array`, which enables recency weighting and
`TimeSeriesSplit` cross-validation. Pass it — it is free if you have the ids.

### 4.2 The canonical on-disk schema — `RevlogCsv`

`fsrs-rs/src/convertor_tests.rs` defines the format the FSRS project itself uses for review logs
(`tests/data/revlog.csv`, and the same columns as the HuggingFace
`open-spaced-repetition/anki-revlogs-10k` dataset behind `srs-benchmark`):

```rust
pub struct RevlogCsv {
    // card_id,review_time,review_rating,review_state,review_duration
    pub card_id: i64,
    pub review_time: i64,      // epoch MILLISECONDS
    pub review_rating: u32,    // 1..4  (0 = manual)
    pub review_state: u32,     // 0,1 => Learning; 2 => Review; 3 => Relearning; 4 => Filtered; 5 => Manual
    pub review_duration: u32,  // milliseconds spent answering
}
```

**Five columns. Design the Postgres table to emit exactly these, plus a user id.** If you can dump
`(card_id, review_time, review_rating, review_state, review_duration)` you can train with any FSRS
implementation, now or in five years, and you can also submit to / compare against `srs-benchmark`.

### 4.3 `delta_t` is NOT `(t2 - t1) / 86400000`

The single most important correctness detail, from `convertor_tests.rs`:

```rust
fn convert_to_date(timestamp: i64, next_day_starts_at: i64, timezone: Tz) -> NaiveDate {
    let timestamp_seconds = timestamp - next_day_starts_at * 3600 * 1000;
    let datetime = Utc.timestamp_millis_opt(timestamp_seconds).unwrap().with_timezone(&timezone);
    datetime.date_naive()
}

for i in 1..entries.len() {
    let date_current  = convert_to_date(entries[i].id,     next_day_starts_at, timezone);
    let date_previous = convert_to_date(entries[i - 1].id, next_day_starts_at, timezone);
    entries[i].last_interval = (date_current - date_previous).num_days() as i32;
}
```

`delta_t` is the difference in **calendar days**, where "day" is defined by the user's **timezone**
and a **day-cutoff hour** (`next_day_starts_at`, Anki's default is 4 = 4am). A review at 01:00 counts
as the previous day. Consequences for the schema:

- store `review_time` as an **absolute instant** (`timestamptz` / epoch ms) — never a precomputed
  `delta_t`, because the cutoff and timezone can change retroactively;
- store the **user's timezone** and **day-cutoff hour** per user (and ideally the IANA tz *at
  review time*, since users travel and move);
- compute `delta_t` at training time, not at write time.

### 4.4 Prefix expansion — `n` reviews become `n-1` training items

From the doc comment on `convert_to_fsrs_items`:

> *Given a list of revlog entries for a single card with length n, we create **n-1 FSRS items**,
> where each item contains the history of the preceding reviews.*

```rust
entries.iter().enumerate()
    .skip(1)                                     // <-- start at the SECOND review
    .map(|(idx, entry)| {
        let reviews = entries.iter().take(idx + 1)
            .map(|r| FSRSReview { rating: r.button_chosen as u32,
                                  delta_t: r.last_interval.max(0) as u32 })
            .collect();
        (entry.id, FSRSItem { reviews })
    })
    .filter(|(_, item)| item.current().delta_t > 0)   // drop same-day reviews
```

So each `FSRSItem` is a **prefix of the card's history**, and `.skip(1)` means **every item has at
least two reviews** (≥1 history review plus the current one).

**This is a real footgun and I hit it.** Passing single-review items produced, in
`fsrs-rs-nodejs@0.9.0`, a process-aborting panic (`ndarray: index 18446744073709551615 is out of
bounds in array of len 19` — a `usize` underflow of `reviews.len() - 1`), and in `fsrs-browser@6.6.0`
a `RuntimeError: unreachable`. Rebuilding the expansion from `k = 2` made both train cleanly.
Verified sweep on `fsrs-rs-nodejs`:

| cards | expanded items | result |
|---|---|---|
| 20 | 124 | trains, returns defaults unchanged |
| 60 | 364 | trains, parameters changed |
| 150 | 894 | trains, parameters changed |
| 600 | 3536 | trains, log loss 0.386 |

### 4.5 Which log entries get excluded

Also from the reference convertor — these are the rules your dump query must be able to express:

```rust
// keep only from the card's most recent fresh start
fn remove_revlog_before_last_first_learn(entries) -> …   // scans backwards for the last run of Learning
// drop cram/filtered reviews that didn't affect scheduling
fn filter_out_cram(entries)   { entries.filter(|e| e.review_kind != Filtered || e.ease_factor != 0) }
// drop administrative entries
fn filter_out_manual(entries) { entries.filter(|e| e.review_kind != Manual && e.button_chosen != 0) }
```

plus `.filter(|(_, item)| item.current().delta_t > 0)` — **same-day reviews are excluded from
training** (this is the "excluding same-day reviews" caveat on every number in the `srs-benchmark`
table). Log them anyway: FSRS-7 is the first version that models them, and you want the data when it
ships.

So you must record enough to *reconstruct* these filters: a `review_state`/kind, whether the entry
was a manual reschedule, and whether the card was reset.

### 4.6 The Anki reference schema, for cross-checking

`ankitects/anki/proto/anki/stats.proto`:

```protobuf
message RevlogEntry {
  enum ReviewKind { LEARNING = 0; REVIEW = 1; RELEARNING = 2; FILTERED = 3; MANUAL = 4; RESCHEDULED = 5; }
  int64  id = 1;             // review timestamp, epoch MILLISECONDS (also the PK)
  int64  cid = 2;            // card id
  int32  usn = 3;            // sync sequence number
  uint32 button_chosen = 4;  // the rating, 0..4
  int32  interval = 5;       // new interval
  int32  last_interval = 6;  // previous interval
  uint32 ease_factor = 7;    // SM-2 ease, permille
  uint32 taken_millis = 8;   // answer duration
  ReviewKind review_kind = 9;
}
message Dataset { repeated RevlogEntry revlogs = 1; …; int64 next_day_at = 4; }
```

Note `Dataset.next_day_at` — the day cutoff is part of the dataset, confirming 4.3. Note also that
`RevlogEntry.id` doubles as the review timestamp *and* the primary key, which is how Anki guarantees
one row per review; and `ReviewKind` has **six** values, including `RESCHEDULED = 5` which the
`review_state` CSV mapping does not cover.

### 4.7 Recommended Postgres schema

Designed so that (a) the five canonical CSV columns fall out of a single `SELECT`, and (b) the
timezone/cutoff data needed for `delta_t` is preserved.

```sql
-- Append-only. Never UPDATE, never DELETE. This table is the asset.
create table review_log (
  id             bigserial primary key,
  user_id        uuid        not null references auth.users(id),
  card_id        bigint      not null references card(id),

  -- === the five canonical FSRS columns ===
  review_time    timestamptz not null,            -- absolute instant; -> epoch ms
  review_rating  smallint    not null check (review_rating between 1 and 4),
  review_state   smallint    not null check (review_state between 0 and 5),
  review_duration integer    not null default 0,  -- ms spent answering

  -- === needed to compute delta_t correctly (see 4.3) ===
  tz             text        not null,            -- IANA zone AT REVIEW TIME, e.g. 'America/New_York'
  day_cutoff_hour smallint   not null default 4,  -- Anki's "next day starts at"

  -- === derived state, for serving + debugging (NOT training input) ===
  state_before      smallint not null,            -- ts-fsrs ReviewLog.state
  stability_before  real,                         -- ts-fsrs ReviewLog.stability
  difficulty_before real,                         -- ts-fsrs ReviewLog.difficulty
  scheduled_days_before integer not null default 0,
  learning_steps_before smallint not null default 0,
  due_before        timestamptz,

  -- === provenance: which model produced this scheduling decision ===
  fsrs_version   text        not null default 'FSRS-6',
  params_id      bigint      references fsrs_params(id),   -- exact w[] used
  request_retention real     not null,

  -- === flags so 4.5's filters can be reconstructed ===
  is_manual      boolean     not null default false,
  is_cram        boolean     not null default false,       -- didn't affect scheduling
  elapsed_days   integer,                                  -- as computed at write time (audit only)

  created_at     timestamptz not null default now()
);

create index on review_log (user_id, card_id, review_time);
create index on review_log (user_id, review_time);
-- one row per review, idempotent under client retry
create unique index on review_log (card_id, review_time);

-- The parameter sets you have ever served. Never mutate a row; insert a new one.
create table fsrs_params (
  id            bigserial primary key,
  user_id       uuid references auth.users(id),   -- null = global default
  fsrs_version  text    not null,                 -- 'FSRS-6'
  w             real[]  not null,                 -- length 21 for FSRS-6
  trained_at    timestamptz not null default now(),
  train_items   integer,                          -- expanded item count
  log_loss      real,                             -- from evaluate(); gate on this
  rmse_bins     real,
  is_active     boolean not null default false,
  check (array_length(w, 1) = 21 or fsrs_version <> 'FSRS-6')
);
```

Why `params_id` on every review row: when you re-optimize, you need to know which parameters
generated each past scheduling decision, or you cannot tell a model regression from a behaviour
change. This is one `bigint` per row and it is the difference between being able to run a clean
before/after and not.

The canonical dump then is exactly:

```sql
select card_id,
       (extract(epoch from review_time) * 1000)::bigint as review_time,
       review_rating,
       review_state,
       review_duration
from review_log
where user_id = $1
  and not is_manual
  and not is_cram
order by card_id, review_time;
```

---

## 5. The FSRS optimizer — how you actually train parameters

### 5.1 Is there a JS/TS path? Yes — WASM, and it is fast

`ts-fsrs` has **no optimizer** (scheduler only). But `fsrs-browser@6.6.0` exposes the full FSRS-6
Rust optimizer compiled to WASM, and **I ran it in Node**. Measured on this machine:

| cards | expanded items | flat review rows | train time |
|---|---|---|---|
| 600 | 3,536 | ~21k | 22 ms |
| 5,000 | 41,370 | 246,802 | **249 ms** |

Single-threaded, no `initThreadPool()`. 21 parameters out. That is quick enough to re-optimize every
user on a schedule without thinking about it.

The exact signature (from `fsrs_browser.d.ts`):

```ts
export class Fsrs {
  constructor(parameters?: Float32Array | null);
  computeParameters(
    ratings: Uint32Array,      // flat, all items concatenated
    delta_ts: Uint32Array,     // flat, parallel to ratings
    lengths: Uint32Array,      // review count per ITEM (prefix), not per card
    progress: Progress | null | undefined,
    enable_short_term: boolean,
    card_ids?: BigInt64Array | null,
    num_relearning_steps?: number | null,
    training_config?: TrainingConfig | null,
  ): Float32Array;
  memoryState(ratings: Uint32Array, delta_ts: Uint32Array, starting_state?: Float32Array | null): Float32Array;
  nextInterval(stability: number | null | undefined, desired_retention: number, rating: number): number;
  nextStates(stability?, difficulty?, desired_retention: number, days_elapsed: number): any;
}
export function DEFAULT_PARAMETERS(): Float32Array;
export function checkAndFillParameters(parameters?: Float32Array | null): Float32Array;
export function initThreadPool(num_threads: number): Promise<any>;   // browser only
```

Verified `TrainingConfig` defaults: `numEpochs = 5`, `batchSize = 512`, `learningRate = 0.04`,
`maxSeqLen = 256`, `gamma = 1`. Constructor is `new TrainingConfig()` or
`TrainingConfig.withValues(num_epochs, batch_size, seed, learning_rate, max_seq_len, gamma)`.

Note: the optimizer **writes per-epoch loss to stdout** (`epoch: 1 loss: 0.171…`,
`best_loss: 0.170…`). Harmless but noisy in logs.

### 5.2 The graceful-degradation ladder — exact thresholds

From `fsrs-rs/src/training.rs::compute_parameters`, this is the real behaviour and it is better than
the docs suggest — it *never* fails for lack of data, it degrades:

```rust
if train_set.len() < 8 { return Ok(DEFAULT_PARAMETERS.to_vec()); }
…
let (initial_stability, initial_rating_count) = initialize_stability_parameters(…)?;
let initialized_parameters = initial_stability.chain(DEFAULT_PARAMETERS[4..]).collect();
if train_set.len() == dataset_for_initialization.len() || train_set.len() < 64 {
    return Ok(initialized_parameters);
}
// …otherwise full gradient training via `burn`
```

| expanded items after filtering | what you get |
|---|---|
| `< 8` | the 21 default parameters, unchanged |
| `< 64` (or all items are 2-review) | `w0..w3` (initial stability) fitted from data; `w4..w20` left at defaults |
| `>= 64` | full gradient training of all 21 parameters |

This is a **strictly better policy than a hand-rolled "wait for 200 reviews" gate**, so just call the
optimizer and use what it returns. `train_set.len()` counts **expanded items**, not cards — with
~7 reviews per card that's roughly 11 cards for the initial-stability tier and ~64 items ≈ 11–13
cards for full training. Note also `weighted_train_set.retain(|item| item.reviews.len() <=
training_config.max_seq_len)` — cards with **more than 256 reviews are dropped entirely** from
training.

`FSRSError::NotEnoughData` is only raised by `evaluate()` / `universal_metrics()` /
`evaluate_with_time_series_splits()` on a genuinely **empty** item list.

### 5.3 Other paths, for completeness

- **Python** — `fsrs-optimizer` on PyPI, and `srs-benchmark` itself. This is where FSRS-7 lives and
  where new versions land first. Worth having in a scripts/ dir for offline research, not in the
  request path.
- **Rust** — crate `fsrs` 6.6.2 (BSD-3-Clause), built on `burn` 0.17.1. The reference. Use if you
  ever want a dedicated training service.
- **`fsrs-rs-nodejs`** — cleanest API and the only one exposing `evaluate()` directly, but FSRS-5 and
  stale (see 3). Its `computeParameters` is `async` and takes real objects rather than flat arrays:

```ts
computeParameters(trainSet: Array<FSRSItem>, enableShortTerm: boolean,
  progressJsFn?: (err, value: {current:number,total:number,percent:number}) => void,
  timeout?: number): Promise<Array<number>>
evaluate(trainSet: Array<FSRSItem>): { logLoss: number, rmseBins: number }
```

`evaluate()` is the thing to copy: **it is how you prove optimized parameters beat defaults.**
`fsrs-browser` does not expose it, so implement the equivalent yourself — log loss over held-out
reviews using `ts-fsrs`'s `forgetting_curve()` — and gate promotion on it.

### 5.4 Recommended pipeline

```
Every review  ──► POST /api/review
                    ├─ ts-fsrs next(card, now, grade)   (in-process, ~µs)
                    ├─ UPDATE card  (new state)
                    └─ INSERT review_log  (append-only, incl. params_id)   ← never skip

Nightly / on Nth review ──► @vercel/queue job, per user
                    ├─ SELECT the 5 canonical columns for this user
                    ├─ group by card_id, order by review_time
                    ├─ compute delta_t via (tz, day_cutoff_hour) calendar-day diff
                    ├─ expand to prefixes from k = 2      ← MUST start at 2
                    ├─ fsrs-browser computeParameters(...) → 21 floats
                    ├─ hold out the most recent ~20% by time; compare log loss
                    │     new params vs currently-active params
                    └─ if better: INSERT fsrs_params (is_active = true); else keep current
```

Notes on this shape:
- Use `@vercel/queue` (already a dependency) — do not optimize inside the review request.
- Split **by time, not randomly** — `srs-benchmark` uses `TimeSeriesSplit` precisely so the model is
  never given future information. A random split will flatter you.
- Pass `card_ids` to `computeParameters` to get recency weighting for free.
- **Validate before calling**: every item must have ≥2 reviews, ratings in 1..4, first `delta_t` 0.
  A bad input can abort the worker process rather than throw.
- Keep the `w` array versioned and never mutate — `reschedule()` lets you replay history onto new
  parameters, but only if you still know the old ones.

---

## 6. Copy-ready: scheduling a review with ts-fsrs

Executed and verified. `npm i ts-fsrs` (5.4.1, zero deps).

```ts
// lib/srs/scheduler.ts
import {
  fsrs, createEmptyCard, generatorParameters, Rating, State,
  default_w, type Card, type Grade, type FSRSParameters,
} from 'ts-fsrs'

/** Build a scheduler. `w` comes from fsrs_params; fall back to FSRS-6 defaults. */
export function makeScheduler(opts?: { requestRetention?: number; w?: number[] }) {
  return fsrs(generatorParameters({
    request_retention: opts?.requestRetention ?? 0.9,  // NOT desired_retention
    w: opts?.w ?? default_w,                           // 21 floats for FSRS-6
    enable_fuzz: true,                                 // avoid review-day pile-ups
    enable_short_term: true,
    maximum_interval: 36500,
    learning_steps: ['1m', '10m'],
    relearning_steps: ['10m'],
  }))
}

export type ReviewContext = {
  cardId: bigint
  userId: string
  durationMs: number
  tz: string             // IANA zone, e.g. 'America/New_York'
  dayCutoffHour: number  // 4
  paramsId: number       // FK into fsrs_params
}

/** Apply one grade. Returns the new card state AND the append-only log row. */
export function gradeReview(
  stored: Card, grade: Grade, now: Date, ctx: ReviewContext, scheduler = makeScheduler(),
) {
  const { card, log } = scheduler.next(stored, now, grade)

  return {
    card: {
      due: card.due,
      stability: card.stability,
      difficulty: card.difficulty,
      scheduled_days: card.scheduled_days,
      learning_steps: card.learning_steps,   // easy to forget; scheduler needs it
      reps: card.reps,
      lapses: card.lapses,
      state: card.state,
      last_review: card.last_review ?? null,
    },
    // NOTE: `log` is the PRE-review snapshot (see 2.5)
    reviewLogRow: {
      card_id: ctx.cardId,
      user_id: ctx.userId,
      review_time: log.review,          // absolute instant -> timestamptz
      review_rating: log.rating,        // 1..4
      review_state: log.state,          // state BEFORE this review
      review_duration: ctx.durationMs,
      tz: ctx.tz,
      day_cutoff_hour: ctx.dayCutoffHour,
      state_before: log.state,
      // use an explicit New check: stability 0 is falsy, so `|| null` would be a bug
      stability_before: log.state === State.New ? null : log.stability,
      difficulty_before: log.state === State.New ? null : log.difficulty,
      scheduled_days_before: log.scheduled_days,
      learning_steps_before: log.learning_steps,
      due_before: log.due,
      elapsed_days: log.elapsed_days,    // audit only; recompute at training time
      fsrs_version: 'FSRS-6',
      params_id: ctx.paramsId,
      request_retention: scheduler.parameters.request_retention,
      is_manual: false,
      is_cram: false,
    },
  }
}

/** For the answer buttons: all four outcomes, without committing. */
export function previewAll(stored: Card, now: Date, scheduler = makeScheduler()) {
  const preview = scheduler.repeat(stored, now)
  return [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy].map((g) => ({
    rating: g as Grade,
    label: Rating[g],
    due: preview[g as Grade].card.due,
    intervalDays: preview[g as Grade].card.scheduled_days,
  }))
}

export const newCard = (now = new Date()) => createEmptyCard(now)
```

Verified trajectory from the code above (`request_retention` 0.9, fuzz on):

```
2026-08-05T09:00Z Good  -> Learning  due 2026-08-05T09:10   0d  S= 2.31 D=2.12
2026-08-05T09:12Z Good  -> Review    due 2026-08-07T09:12   2d  S= 2.31 D=2.11
2026-08-13T10:00Z Hard  -> Review    due 2026-08-29T10:00  16d  S=14.62 D=4.75
2026-09-01T10:00Z Good  -> Review    due 2026-10-19T10:00  48d  S=52.39 D=4.74
get_retrievability(..., '2026-09-20') === "95.42%"
```

### Copy-ready: the optimizer job

```ts
// lib/srs/optimize.ts  — runs in a @vercel/queue worker, never in the request path
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

type RawReview = { card_id: string; review_time: Date; review_rating: number }

/** delta_t = calendar-day difference under the user's tz + day cutoff (see 4.3). */
function toCalendarDay(t: Date, tz: string, dayCutoffHour: number): number {
  const shifted = new Date(t.getTime() - dayCutoffHour * 3600_000)
  // en-CA gives YYYY-MM-DD
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(shifted)
  return Math.floor(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000)
}

export async function optimizeForUser(rows: RawReview[], tz: string, dayCutoffHour = 4) {
  // 1. group by card, chronological
  const byCard = new Map<string, RawReview[]>()
  for (const r of rows) {
    const list = byCard.get(r.card_id) ?? []
    list.push(r)
    byCard.set(r.card_id, list)
  }

  // 2. flat arrays with PREFIX EXPANSION FROM k = 2 (see 4.4 — k=1 crashes the WASM)
  const ratings: number[] = [], deltaTs: number[] = [], lengths: number[] = [], cardIds: bigint[] = []
  for (const [cardId, listRaw] of byCard) {
    const list = [...listRaw].sort((a, b) => +a.review_time - +b.review_time)
    const seq = list.map((r, i) => ({
      rating: r.review_rating,
      delta_t: i === 0 ? 0 : toCalendarDay(r.review_time, tz, dayCutoffHour)
                           - toCalendarDay(list[i - 1].review_time, tz, dayCutoffHour),
    }))
    if (seq.some((s) => s.rating < 1 || s.rating > 4)) continue  // validate: a panic aborts the process
    for (let k = 2; k <= seq.length; k++) {
      const pre = seq.slice(0, k)
      if (pre[pre.length - 1].delta_t <= 0) continue             // same-day reviews excluded
      lengths.push(pre.length)
      cardIds.push(BigInt(cardId))
      for (const s of pre) { ratings.push(s.rating); deltaTs.push(Math.max(0, s.delta_t)) }
    }
  }
  if (lengths.length === 0) return null

  // 3. load the WASM optimizer. Two shims required (see 3):
  //    (a) no "main"/"exports" in package.json -> import the file path
  //    (b) wasm-bindgen-rayon touches `self` at module scope
  ;(globalThis as any).self ??= { addEventListener() {}, removeEventListener() {}, postMessage() {} }
  const require = createRequire(import.meta.url)
  const dir = require.resolve('fsrs-browser/package.json').replace(/package\.json$/, '')
  const mod = await import(`${dir}fsrs_browser.js`)
  await mod.default({ module_or_path: await readFile(`${dir}fsrs_browser_bg.wasm`) })

  // 4. train. Single-threaded; initThreadPool() is a browser-only speedup.
  const w = new mod.Fsrs(null).computeParameters(
    new Uint32Array(ratings), new Uint32Array(deltaTs), new Uint32Array(lengths),
    null,                        // progress
    true,                        // enable_short_term
    new BigInt64Array(cardIds),  // enables recency weighting
    1,                           // num_relearning_steps
    null,                        // TrainingConfig: epochs 5, batch 512, lr 0.04, maxSeqLen 256
  )
  return { w: Array.from(w), trainItems: lengths.length }   // w.length === 21
}
```

Measured: **249 ms for 41,370 expanded items (246,802 review rows)**, single-threaded in Node.

**Before promoting the result**, score it against the currently-active parameters on a
**time-based** held-out slice (most recent ~20% of reviews), using log loss:

```ts
import { forgetting_curve } from 'ts-fsrs'

/** Mean binary cross-entropy of predicted recall vs observed (rating > 1). */
export function logLoss(samples: { w: number[]; elapsedDays: number; stability: number; recalled: boolean }[]) {
  const eps = 1e-15
  let sum = 0
  for (const s of samples) {
    const p = Math.min(1 - eps, Math.max(eps, forgetting_curve(s.w, s.elapsedDays, s.stability)))
    sum += -(s.recalled ? Math.log(p) : Math.log(1 - p))
  }
  return sum / samples.length
}
```

Promote only if the new parameters' held-out log loss is lower. `fsrs-browser` does not expose
`evaluate()` (only `fsrs-rs-nodejs` does), so this is the substitute.

---

## 7. Elo — library survey and dynamic-K formulations

### 7.1 Is there an npm library worth using? No. Write ~25 lines.

All metadata from the npm registry / `api.npmjs.org`.

| npm package | latest | last publish | weekly dl | license | types | verdict |
|---|---|---|---|---|---|---|
| `elo-rating` | 1.0.1 | 2016-07-15 | 297 | MIT | none | dead, 10 years stale, no repo field |
| `elo-rank` | 1.0.4 | 2020-01-17 | 1,531 | MIT | none | right shape, **but see the rounding bug** |
| `glicko2` | 1.2.1 | 2024-06-21 | 22,946 | MIT | hand-written `.d.ts` | wrong model; stateful registry |
| `ts-trueskill` | 5.1.0 | 2024-11-01 | 3,690 | MIT | yes | wrong model; pulls `mathjs` + `uuid` |
| `openskill` | 5.0.1 | 2026-06-08 | 7,448 | MIT | yes | maintained, but team-ranking model |
| `skillrating` | — | — | — | — | — | **does not exist on npm** (404) |

`elo-rank@1.0.4` is the only one with the right shape, and this is the **entire** package:

```js
class EloRank {
  constructor(k) { this.k = k || 32; }
  getExpected(a, b) { return 1/(1+Math.pow(10,((b-a)/400))); }
  updateRating(expected, actual, current) {
    return Math.round(current + this.k*(actual-expected));   // <-- disqualifying
  }
}
```

**That `Math.round` is fatal for our use.** On the logit scale our updates are ~0.05–1.0, so every
single update would round to zero. It is also one-sided (no item difficulty) and K is a fixed
instance field.

**Recommendation: write it ourselves.** Four concrete reasons:
1. Every package models the wrong thing — we need *two-sided* Elo (learner θ **and** item difficulty
   updated jointly from the same observation) with a *count-dependent* K. Glicko-2/TrueSkill/OpenSkill
   are competitive-play models whose uncertainty machinery is not the pedagogical uncertainty function.
2. The only right-shaped package is ~12 lines of logic and has an integer-rounding bug at our scale.
3. Dependency cost is real: `openskill` drags in `ramda` + two `@stdlib` packages; `ts-trueskill`
   pulls in `mathjs`.
4. The math is fully specified in published papers — there is no hidden expertise to buy.

If you later want a learner-vs-learner *competitive* leaderboard, `openskill@5.0.1` is the only
actively-maintained, properly-typed option. Revisit then.

### 7.2 The dynamic-K literature — exact formulations with citations

**Papoušek, Pelánek & Stanislav (2014)** — "Adaptive Practice of Facts in Domains with Varied Prior
Knowledge," *Proc. 7th Int. Conf. on Educational Data Mining (EDM 2014)*, London, pp. 6–13.
<https://educationaldatamining.org/EDM2014/uploads/procs2014/long%20papers/6_EDM-2014-Full.pdf>

```
P(correct | s,c) = 1 / (1 + exp(-(theta_s - b_c)))
theta_i := theta_i + K · (R - P(R = 1))
U(n)    = a / (1 + b·n)          with  a = 1,  b = 0.05   (grid search)
```

`n` is the 0-indexed answer count. **The paper explicitly says the exact choice of `a, b` is "not
important"** — many values perform similarly. This is the source of the `a/(1+b·n)` form.

**Pelánek (2016)** — "Applications of the Elo rating system in adaptive educational systems,"
*Computers & Education*. DOI [10.1016/j.compedu.2016.03.017](https://doi.org/10.1016/j.compedu.2016.03.017).
Author manuscript: <http://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf>

The canonical two-sided update, verbatim in structure:

```
P(correct_si = 1) = 1 / (1 + exp(-(theta_s - d_i)))

theta_s := theta_s + K · (correct_si - P(correct_si = 1))
d_i     := d_i     + K · (P(correct_si = 1) - correct_si)
```

**Initialization: θ and d are both 0** (stated explicitly). Multiple-choice variant with `k` options:

```
P(correct_si = 1) = 1/k + (1 - 1/k) / (1 + exp(-(theta_s - d_i)))
```

Uncertainty functions surveyed in §2.3, with the constants each paper reports:

```
U(n) = a / (1 + b·n)             a = 1, b = 0.05                     [Papoušek+ 2014]
U(n) = w0 / (1 + a·exp(b·n))     w0 = 0.2, b = 50, a ∈ [0.01, 0.15]   [Wauters+ 2011]
U := U - 1/40 + (1/30)·D         U init 1, D = days since last        [Klinkenberg+ 2011]
```

Fixed `K = 0.4` is cited as prior practice (Antal 2013; Wauters+ 2012).

> **Correction to an assumption in `02-ml-and-naming.md`:** the two sides do **not** use different
> constants in the published equations — they share one `K`. The case study (outlinemaps.org, >1200
> items, >100k students, >15M answers) uses `a=1, b=0.05` for **both** sides. Pelánek *recommends*
> separate functions, because items accrue far more answers than learners do, but never instantiates
> separate constants. Using per-side counts (as our code does) is a faithful reading of that
> recommendation, not of a printed formula.

**Vermeiren, Hofman, Bolsinova, van der Maas & Van Den Noortgate (2025)** — "Balancing stability and
flexibility: investigating a dynamic K value approach for the Elo rating system in adaptive learning
environments," *User Modeling and User-Adapted Interaction* 36(1):4. DOI
[10.1007/s11257-025-09439-z](https://doi.org/10.1007/s11257-025-09439-z); PMC12682724.

This is **orthogonal** to the decaying-K family: K is driven by the *sign-trend* of recent prediction
errors via exponential smoothing, so **it can rise as well as fall** — it recovers after a plateau,
which a monotonically decaying K cannot. Production variant (Eqs. 15–18), as deployed in Math Garden:

```
T_i,t = (1-α)·T_i,t-1 + α·sign(S_ij,t - E(S_ij,t))       # learner
T_j,t = (1-α)·T_j,t-1 + α·sign(E(S_ij,t) - S_ij,t)       # item

K_i,t = max(0.2,   |T_i,t|^M + K_start)   if t <= 20
K_i,t = max(0.2,   |T_i,t|^M)             if t >  20
K_j,t = max(0.001, |T_j,t|^M)
```

**Exact constants: α = 0.2, K_start = 0.5, M = 5**, K clamped above at **1**. `T_0 = 0`, `T` bounded
in [-1,1]. Here the two sides *genuinely* differ: different floors, and the cold-start `K_start`
boost applies to learners only. A footnote states these were set by live A/B testing and "might not
apply to every context." Their head-to-head (Fig. 6) used decaying-K `a=1, b=0.15` vs adaptive
`α=0.1`, on Math Garden addition data, Sept 2022, 26,694 learners, target success rate 0.75.

**Recommendation: ship the decaying-K form (7.3) in v1.** It is simpler, has two well-understood
constants, and my simulation (below) shows it already beats constant K. Keep the adaptive-K variant
in reserve for the specific failure it addresses — a returning learner whose ability jumped while
their K had already decayed to nothing.

### 7.3 Copy-ready: dynamic-K two-sided Elo

I implemented this and validated it by simulation rather than trusting a formula transcription.
**Verified: dynamic K beats every constant K tested**, on held-out log loss.

Simulation: 300 learners and 120 items with known ground-truth ability/difficulty drawn from
U(-2, 2), 120,000 reviews, metrics on the last 50%.

| Configuration | held-out log loss | corr(θ̂, θ) | corr(β̂, β) |
|---|---|---|---|
| **dynamic K, `a=1.0, b=0.05`** | **0.4869** | 0.9237 | 0.9750 |
| constant K = 0.05 | 0.4904 | 0.9290 | — |
| constant K = 0.2 | 0.5079 | 0.9197 | — |
| constant K = 0.5 | 0.5444 | 0.8979 | — |

Note constant K = 0.05 achieves marginally better ability *correlation* but worse *log loss* —
dynamic K wins on the metric that actually matters for item selection, because it converges fast
early and stops thrashing late.

**Work on the logit scale (θ − β), not the 400-point chess scale.** The 400/logarithm-base-10
apparatus in chess Elo is a presentation convention; for an educational system the natural
parameterisation is a Rasch/1PL logit, which composes directly with the logistic-regression
knowledge tracer in Part 8 and with Bradley-Terry in Part 9.

```ts
// lib/rating/elo.ts
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

/**
 * Uncertainty-decaying step size:  K(n) = a / (1 + b·n)
 * Large when an entity is new, shrinking as evidence accumulates. This is the
 * "Elo-as-Glicko-lite" recommendation from 02-ml-and-naming.md — it carries the
 * uncertainty benefit of Glicko-2 without needing rating periods.
 */
export const K = (n: number, a: number, b: number) => a / (1 + b * n)

export type Rating = { theta: number; n: number }   // learner-skill ability
export type ItemRating = { beta: number; n: number } // item difficulty

export type EloConfig = {
  aUser: number; bUser: number   // 1.0, 0.05  -> K: 1.000 at n=0, 0.091 at n=200
  aItem: number; bItem: number   // 1.0, 0.05  (use a smaller `a` for items primed from content)
}

export const DEFAULT_ELO: EloConfig = { aUser: 1.0, bUser: 0.05, aItem: 1.0, bItem: 0.05 }

/** One observation. Updates BOTH sides. Mutates and returns the new values. */
export function eloUpdate(
  user: Rating, item: ItemRating, correct: boolean, cfg: EloConfig = DEFAULT_ELO,
) {
  const p = sigmoid(user.theta - item.beta)     // predicted P(correct)
  const err = (correct ? 1 : 0) - p

  const nextTheta = user.theta + K(user.n, cfg.aUser, cfg.bUser) * err
  const nextBeta  = item.beta  - K(item.n, cfg.aItem, cfg.bItem) * err   // note the MINUS

  return {
    user: { theta: nextTheta, n: user.n + 1 },
    item: { beta: nextBeta,  n: item.n + 1 },
    predicted: p,
    surprise: Math.abs(err),   // useful for flagging mis-calibrated items
  }
}
```

The sign asymmetry is the whole model: a correct answer raises the learner's ability *and lowers the
item's difficulty*, because the same observation is evidence about both. `n` must be persisted per
entity — it is what makes K decay.

Three things from `02-ml-and-naming.md` that this code assumes you will also do:

1. **Prime `beta` from item content**, not 0 — regress difficulty on word frequency/Zipf rank,
   length, CEFR level of constituent lexemes (Duolingo's EMNLP 2021 approach). Then set the item's
   initial `n` to a small pseudo-count (say 5) so the prior isn't instantly washed out.
2. **Reserve ~5% of presentations as non-adaptive random exploration** and calibrate item difficulty
   from that slice only. Adaptive selection makes Elo estimates non-convergent; this is the cheap fix.
3. **Cap the effective K floor** so long-lived items can still drift (e.g. `Math.max(K(n), 0.02)`),
   otherwise an item calibrated a year ago can never respond to a changed population.

---

## 8. Bradley-Terry — reference implementations and the algorithm

### 8.1 Is there a usable npm package? No.

Searched `bradley-terry` (310 results), `bradley terry`, `pairwise ranking`, `paired comparison`.
Nothing implements BT MLE as a reusable library. The closest match:

| package | latest | last publish | weekly dl | why not |
|---|---|---|---|---|
| `estimating-rasch-model` | 5.1.0 | 2018-12-12 | 20 | Conditional MLE for Rasch/BTL — **GPL-3.0 (viral), disqualifying for a commercial app**; no types; 8 years stale |
| `@twaldin/agentelo` | 0.3.0 | 2026-04-25 | — | a CLI app, not a library |
| `pairwise-ranker` | 1.0.1 | 2025-06-26 | — | deterministic sorting, not a statistical model |
| `@kriton/results-engine`, `deepthonk` | — | — | — | end-user apps |

**Implement it. ~50 lines.** The GPL-3.0 license on the only technically relevant option settles it
independently of quality.

### 8.2 Chatbot Arena's actual code — the widely-cited sklearn version is gone

Verified against FastChat `main` at commit `587d5cfa1609a43d192cedb8441cac3c17db105d`:
- <https://raw.githubusercontent.com/lm-sys/FastChat/main/fastchat/serve/monitor/rating_systems.py> (385 lines)
- <https://raw.githubusercontent.com/lm-sys/FastChat/main/fastchat/serve/monitor/elo_analysis.py> (549 lines)

> **Two corrections to the premise widely repeated in blog posts (and in our own research brief):**
> 1. **FastChat no longer uses `sklearn.LogisticRegression`.** It was removed in commit
>    `e208d5677c` ("Accelerate Bradley Terry MLE model fitting (#3523)", 2024-09-23), which created
>    `rating_systems.py` and replaced the fit with **`scipy.optimize.minimize(..., jac=True,
>    method="L-BFGS-B")` using an analytic gradient**, initialized at all-zeros, **unregularized**.
> 2. **`compute_mle_elo` never existed in FastChat.** That is the arena *notebook* /
>    `arena-hard-auto` name. FastChat's names are `compute_elo_mle_with_tie` (old) and
>    `compute_bt` / `fit_bt` (current).

Current signatures:

```python
def bt_loss_and_grad(ratings, matchups, outcomes, weights, alpha=1.0): ...
def fit_bt(matchups, outcomes, weights, n_models, alpha, tol=1e-6): ...
def compute_bt(df, base=10.0, scale=400.0, init_rating=1000, tol=1e-6): ...
def compute_bootstrap_bt(battles, num_round, base=10.0, scale=400.0,
                         init_rating=1000.0, tol=1e-6, num_cpu=None): ...
def scale_and_offset(ratings, models, scale=400, init_rating=1000,
                     baseline_model="mixtral-8x7b-instruct-v0.1", baseline_rating=1114): ...
```

**There is no design matrix any more.** `preprocess_for_bt` compresses battles to unique
`(model_a, model_b, outcome)` triples plus occurrence weights:

- `matchups`: int32 `(U,2)`, ids from `pd.factorize(pd.concat([df.model_a, df.model_b]))` so indices
  are shared across both columns
- `outcomes`: float64 `(U,)` ∈ {0.0, 0.5, 1.0}
- `weights`: float64 `(U,)` = counts
- **Ties are NOT duplicated** — a tie is one row with `outcome = 0.5`. Both `tie` and
  `tie (bothbad)` map to 0.5.
- `alpha = math.log(base)` multiplies the rating difference (this replaced the old `log(BASE)`
  design-matrix scaling).

```python
def bt_loss_and_grad(ratings, matchups, outcomes, weights, alpha=1.0):
    matchup_ratings = ratings[matchups]
    logits = alpha * (matchup_ratings[:, 0] - matchup_ratings[:, 1])
    probs = expit(logits)
    # this form naturally counts a draw as half a win and half a loss
    loss = -((np.log(probs) * outcomes + np.log(1.0 - probs) * (1.0 - outcomes)) * weights).sum()
    matchups_grads = -alpha * (outcomes - probs) * weights
    model_grad = np.zeros_like(ratings)
    np.add.at(model_grad, matchups[:, [0, 1]],
              matchups_grads[:, None] * np.array([1.0, -1.0], dtype=np.float64))
    return loss, model_grad
```

Final scaling, confirming the constants:

```python
scaled_ratings = (ratings * scale) + init_rating          # 400·theta + 1000
if baseline_model in models:                              # "mixtral-8x7b-instruct-v0.1"
    scaled_ratings += baseline_rating - scaled_ratings[..., [baseline_idx]]   # anchor to 1114
```

The older anchor was `llama-13b` at 800. **No `gpt-3.5-turbo` anchor exists anywhere in FastChat
history — UNVERIFIED / not found.** For the record, the historical sklearn call was
`LogisticRegression(fit_intercept=False, penalty=None)`, i.e. **unregularized, so the `C` value was
irrelevant**; the even older pre-`#3088` version left default L2 `C=1.0` on and genuinely duplicated
ties (`df = pd.concat([df, df])`, A-win → both copies Y=1, tie → first Y=1, second Y=0).

**Tie convention: half a win plus half a loss. Not Rao-Kupper, not Davidson.** The Chatbot Arena
paper (arXiv 2403.04132) never states a tie rule — it defines `H_t ∈ [0,1]` and fits with binary
cross-entropy, and BCE at `h = 0.5` *is* identically half-win/half-loss. Independently corroborated
by arXiv 2412.18407 (ICLR 2025): "treating a tie as halfway between a win and a loss, modifying the
outcome matrix as `W ← W + (1/2)T`". **That paper also reports the cost: half-tie BT produces no tie
prediction at all, and its win-probability matrix visibly diverges from observed data.** If tie rate
is high in our judge outputs, prefer an explicit tie model (Rao-Kupper, below).

### 8.3 The MM / Zermelo algorithm — Hunter (2004)

**Citation:** David R. Hunter, "MM algorithms for generalized Bradley-Terry models," *The Annals of
Statistics* 32(1):384–406, 2004. DOI
[10.1214/aos/1079120141](https://doi.org/10.1214/aos/1079120141). Not on arXiv.

Model (Eq. 1) and log-likelihood (Eq. 2 — note the **double sum over all i,j**, not `i<j`):

```
P(i beats j) = γ_i / (γ_i + γ_j)
l(γ) = Σ_i Σ_j [ w_ij·ln(γ_i) - w_ij·ln(γ_i + γ_j) ]
```

`w_ij` = times i beat j, `w_ii = 0`. Scale-invariant, so the constraint is `Σ_i γ_i = 1`.

**Eq. 3 — the simultaneous (Jacobi) update, which is what our code implements:**

```
γ_i^(k+1) = W_i · [ Σ_{j≠i}  N_ij / (γ_i^(k) + γ_j^(k)) ]^(-1)
```

where `W_i` = total wins by i and `N_ij = w_ij + w_ji` = number of pairings. Eq. 4 is the cyclic
(Gauss-Seidel) variant, which uses already-updated `γ_j^(k+1)` for `j < i`. Both are MM algorithms;
both converge under Assumption 1.

**Normalization:** renormalize each sweep — Hunter: *"This renormalization step is to be understood
as part of each algorithm described in this paper."* His convention is `Σ γ = 1`; our code uses
geometric mean 1, which is equivalent up to a constant factor (the model is scale-invariant) and is
better conditioned for the `log` ratio convergence test.

**Assumption 1, verbatim:**

> In every possible partition of the individuals into two nonempty subsets, some individual in the
> second set beats some individual in the first set at least once.

Hunter's graph gloss: nodes = individuals, directed edge (i,j) = a win by i over j; Assumption 1 ⟺
there is a path from i to j for all i,j — i.e. **strong connectivity of the win digraph**. Ford
(1957) showed the cyclic algorithm converges to the **unique** MLE under it; Zermelo (1929) derived a
similar result. Related: Assumption 3 is the weaker undirected-connectivity condition; Lemma 1(a) —
the log-likelihood is upper compact **iff** Assumption 1; Lemma 2(a) — the reparameterized likelihood
is strictly concave **iff** Assumption 3.

**Ties — Davidson (1970), Hunter Eq. 7/16:**

```
P(i>j) : P(j>i) : P(i~j)  =  γ_i : γ_j : θ·sqrt(γ_i·γ_j)
```

all over `γ_i + γ_j + θ·sqrt(γ_i·γ_j)`.

> ⚠ **Hunter's printed `θ^(k+1)` update on p. 391 appears to contain a typo — do not implement as
> printed.** The `[...]^(-1)` exponent present in Eqs. 3, 4 and 15 is missing and `4T` multiplies
> rather than divides, so as printed θ grows without bound. If you need an explicit tie model, use
> **Rao-Kupper (1967)** (Hunter Eq. 6 / MM update Eq. 15, with threshold `θ > 1`, `s_ij = w_ij + t_ij`
> and a closed-form quadratic θ step) — that one has no apparent typo.

> **Correction to my own regularization note (see 8.5):** there is **no** regularized or Bayesian
> variant in Hunter (2004) — grepping the full text for `Bayes|prior|posterior|regulariz|penal|
> Dirichlet|shrink|smooth` returns zero hits. Hunter's remedy when Assumption 1 fails is
> **deletion** (his NASCAR example drops 4 always-last drivers). For regularized BT, cite **Caron &
> Doucet, "Efficient Bayesian Inference for Generalized Bradley-Terry Models"** instead.

### 8.4 Copy-ready: Bradley-Terry solve (MM / Zermelo iteration)

Implemented and **numerically validated three ways**, including against the exact closed form.

```ts
// lib/rating/bradley-terry.ts

/**
 * Bradley-Terry MLE by the MM (minorization-maximization) / Zermelo iteration.
 *
 * Model:  P(i beats j) = p_i / (p_i + p_j)
 * Update: p_i  <-  W_i / Σ_{j≠i} [ N_ij / (p_i + p_j) ]
 *   where W_i = total wins by i, N_ij = total comparisons between i and j.
 *
 * `wins[i][j]` = number of times i beat j. Count a tie as 0.5 to each side
 * (this is what Chatbot Arena's design matrix does — see 9.x).
 *
 * Identifiability: strengths are only defined up to a common scale factor, so we
 * renormalize to geometric mean 1 each sweep. The MLE is finite iff the
 * comparison digraph is STRONGLY CONNECTED (every item both beat someone and lost
 * to someone, transitively). Otherwise strengths diverge to 0 / ∞ — verified below.
 */
export function bradleyTerryMM(
  wins: number[][], { maxIter = 1000, tol = 1e-10 }: { maxIter?: number; tol?: number } = {},
) {
  const n = wins.length
  let p = new Array<number>(n).fill(1)

  const N = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => wins[i][j] + wins[j][i]))
  const W = wins.map((row) => row.reduce((a, b) => a + b, 0))

  let iter = 0
  for (; iter < maxIter; iter++) {
    const pNew = new Array<number>(n)
    for (let i = 0; i < n; i++) {
      let denom = 0
      for (let j = 0; j < n; j++) {
        if (i === j || N[i][j] === 0) continue
        denom += N[i][j] / (p[i] + p[j])
      }
      pNew[i] = denom > 0 ? W[i] / denom : p[i]
    }
    // renormalize to geometric mean 1
    const logs = pNew.map((v) => Math.log(Math.max(v, 1e-300)))
    const m = logs.reduce((a, b) => a + b, 0) / n
    for (let i = 0; i < n; i++) pNew[i] = Math.exp(logs[i] - m)

    let diff = 0
    for (let i = 0; i < n; i++) diff = Math.max(diff, Math.abs(Math.log(pNew[i] / p[i])))
    p = pNew
    if (diff < tol) break
  }
  return { strengths: p, iterations: iter + 1 }
}

/** Present BT strengths on a familiar Elo-like scale. Chatbot Arena uses SCALE=400, BASE=10. */
export const toEloScale = (p: number[], scale = 400, init = 1000) =>
  p.map((v) => init + scale * Math.log10(v))

/** Implied win probability between two items under the fitted model. */
export const btProb = (p: number[], i: number, j: number) => p[i] / (p[i] + p[j])
```

### Validation (all executed)

**Test 1 — exact closed form, 2 items.** With i beating j 7 times out of 10, the MLE ratio must be
exactly `w/(n−w) = 7/3`. Result: `2.333333` vs expected `2.333333`. **Exact.**

**Test 2 — transitive triple.** A beat B 8/10, B beat C 8/10, A beat C 9/10 → strengths
`[3.474, 1.000, 0.288]`, Elo-scaled `[1216.3, 1000.0, 783.7]`, converged in 55 iterations. Implied
`P(A>B) = 0.777` (observed 0.800), `P(B>C) = 0.777` (0.800), `P(A>C) = 0.923` (0.900) — the model
correctly shrinks toward transitivity rather than overfitting each pair.

**Test 3 — ground-truth recovery.** 6 items with known strengths, full round robin of 400
comparisons per pair:

```
recovered: [2.449, 1.834, 1.298, 0.849, 0.576, 0.351]
truth    : [2.572, 1.714, 1.286, 0.857, 0.600, 0.343]
```

53 iterations, max relative error **6.9%**, ordering perfectly preserved.

**Test 4 — the failure mode, confirmed.** With a disconnected comparison graph (A undefeated over B;
C undefeated over D; no edges between the pairs), strengths diverge to `1e+300 / 1e-300`. This is not
a bug — it is Ford's condition. **Practical consequence: before solving, check that your comparison
graph is strongly connected, or add a small regularization / prior (e.g. seed every pair with a
fractional tie, the "+0.5 phantom match" trick) so the MLE is always finite.** For LLM-judge
aggregation this matters, because a brand-new candidate answer has no losses yet.

### 8.5 Making the solve unconditionally safe

Two options, and you should ship one of them:

```ts
/**
 * (a) Add a phantom half-win in each direction so the MLE is always finite.
 * This is a symmetric Beta-prior-style smoothing. NOTE: this is NOT in Hunter (2004),
 * which has no Bayesian variant — for the principled treatment see
 * Caron & Doucet, "Efficient Bayesian Inference for Generalized Bradley-Terry Models".
 */
export function withSmoothing(wins: number[][], alpha = 0.5) {
  const n = wins.length
  return wins.map((row, i) => row.map((v, j) => (i === j ? 0 : v + alpha)))
}
```

```ts
/**
 * (b) Hunter's own remedy: detect the violation and drop/partition.
 * Assumption 1 holds iff the win digraph has exactly ONE strongly connected component.
 * Run Tarjan's SCC over edges (i -> j) for each i that beat j at least once.
 * If >1 component: rate within each component separately, or drop never-winning items.
 */
```

Option (a) is right for LLM-judge aggregation — a brand-new candidate answer has no losses yet, so
Assumption 1 is violated routinely and you want a finite answer anyway. Option (b) is right if you
ever expose these as public rankings, because silent smoothing shrinks extreme ratings toward the
mean and you should know when that is load-bearing.

---

## 9. Logistic regression in TypeScript — library survey and architecture

### 9.1 The libraries

| npm package | latest | last publish | weekly dl | license | types | online/`partial_fit` | sparse |
|---|---|---|---|---|---|---|---|
| `ml-logistic-regression` | 2.0.0 | **2020-05-03** | 163,561 | MIT | **none** (`@types/…` is 404) | **no** | **no** |
| `ml-matrix` | 6.14.0 | 2026-07-13 | 1,605,334 | MIT | yes | n/a | no (dense) |
| `@tensorflow/tfjs` | 4.22.0 | **2024-10-21** | 538,481 | Apache-2.0 | yes | yes (`trainOnBatch`) | limited |
| `@tensorflow/tfjs-node` | 4.22.0 | 2024-10-21 | — | Apache-2.0 | yes | yes | limited |
| `onnxruntime-node` | 1.27.0 | 2026-06-19 | 4,144,543 | MIT | yes | **inference only** | n/a |

Sizes (npm `unpackedSize`, an upper bound since it includes all platform binaries):
`@tensorflow/tfjs` ≈ **147 MB**, `onnxruntime-node` ≈ **271 MB**, `ml-matrix` ≈ 1.1 MB.

Also surfaced and rejected: `js-regression` (2017), `@kobra-dev/js-regression` (2021), `learningjs`
(2014), `logistic-regression` (2019), `logisticegression` (typo-squat), `@titorelli/logistic-regression`
(native addon), `@tpmjs/tools-logistic-regression`.

### 9.2 `ml-logistic-regression` is not maintained, and would not work anyway

`github.com/mljs/logistic-regression`: not archived, but **last push 2022-03-03**, 18 stars, 4 open
issues — the oldest, *"Retrieve probabilities?"*, open since **2018-07-31**. Only 4 versions ever
published. The 163k weekly downloads are transitive/CI traffic, not evidence of care.

Real API, from `src/logreg.js` (untyped):

```ts
new LogisticRegression(options?: {
  numSteps?: number;       // default 50000
  learningRate?: number;   // default 5e-4
  classifiers?: any[]; numberClasses?: number;
})
.train(X: Matrix, Y: Matrix): void   // ml-matrix instances; Y = column vector of int labels
.predict(Xtest: Matrix): number[]    // HARD LABELS ONLY — no probabilities
.toJSON(): object
static load(model: object): LogisticRegression
```

Disqualifying, from the source: **full-batch gradient ascent with a hardcoded 50,000 iterations and
no convergence check** (each step does `features.transpose().mmul(errorSignal)` over the whole dense
matrix); **no probability output** (that is the 8-year-old open issue, and we need calibrated
probabilities, not labels); no automatic intercept; no regularization; **no warm-start** (`train`
re-zeros the weights every call). Its internals are also inverted in a surprising way —
`transformClassesForOneVsAll` maps the target class to 0 and others to 1, and `predict` takes the
**minimum** score, so `testScores(X)` returns P(*not* class i).

### 9.3 Recommended architecture

**Train in-process with hand-rolled sparse online SGD. Take none of these dependencies.**

1. **Serving is already free.** Best-LR inference is `sigmoid(b + Σ wᵢ·xᵢ)` over a handful of active
   features. Shipping 271 MB of `onnxruntime-node` to evaluate a dot product is a ~10⁴× install-weight
   overhead for zero benefit — and both tfjs and ORT are native/server-only, so they would also
   foreclose ever running this on edge.
2. **Batch-elsewhere-and-serve-coefficients has a fatal latency property for this product.** A
   language app wants the learner's model to reflect *this session*. A nightly job means a new
   learner sits on the cold-start prior all day — exactly the problem the Elo layer exists to solve.
3. **No JS library supports what we actually need** (warm-start / `partial_fit` on sparse input).
4. **Sparse online SGD is ~20 lines**, which is what production KT systems do anyway.

**The hybrid I'd actually ship:** periodically batch-fit the *global* skill/item coefficients offline
(Python + sklearn, where you get L-BFGS, proper regularization and cross-validation), export them as
JSON, and run online SGD in Node **only on the per-learner terms**, warm-started from the exported
global weights. Offline statistical rigor plus within-session adaptivity; the Node side stays
dependency-free. Seed the AdaGrad accumulators with a pseudo-count when warm-starting, or the first
few online examples will overwrite the batch-fitted weights.

**Learning rate: per-coordinate AdaGrad.** Correct for sparse one-hot features specifically because
each feature gets an effective rate ∝ `1/sqrt(Σg²)` — rare skills keep a large step while frequent
ones anneal automatically, which a global `1/sqrt(t)` schedule cannot do.

### 9.4 Copy-ready: online logistic regression for knowledge tracing

Implemented and validated. Best-LR feature set from Gervet et al. (per-skill one-hot + `sqrt` of
per-skill success/fail counts + user-level totals), trained by **per-coordinate AdaGrad SGD**, which
removes the learning-rate-schedule tuning problem for sparse features.

Simulation: 40 skills, 400 learners, 200,000 interactions, ground truth
`z = ability − difficulty + 0.35·log1p(practice)`. **Prequential** evaluation (predict, then update)
over the last 40%:

| | log loss |
|---|---|
| online Best-LR (this code) | **0.1952** |
| baseline `p = 0.5` | 0.6931 |

Learned 122 features — exactly `40 skills × 3 + 2` totals, as designed. Recovered weight signs are
the textbook PFA pattern: `succ_skill = +0.966`, `fail_skill = −1.189`.

```ts
// lib/kt/sparse-logreg.ts

export type Feature = [key: string, value: number]

/** Sparse logistic regression with per-coordinate AdaGrad. Serve = one dot product. */
export class SparseLogReg {
  private w = new Map<string, number>()
  private g2 = new Map<string, number>()
  private b = 0
  private gb2 = 0
  constructor(private opts: { lr?: number; l2?: number } = {}) {
    this.opts.lr ??= 0.15
    this.opts.l2 ??= 1e-6
  }

  predict(x: Feature[]): number {
    let z = this.b
    for (const [k, v] of x) z += (this.w.get(k) ?? 0) * v
    return 1 / (1 + Math.exp(-z))
  }

  /** Predict-then-update. Returns the pre-update prediction (use it for prequential logging). */
  update(x: Feature[], y: 0 | 1): number {
    const p = this.predict(x)
    const err = p - y
    const { lr, l2 } = this.opts as Required<typeof this.opts>

    this.gb2 += err * err
    this.b -= (lr * err) / (Math.sqrt(this.gb2) + 1e-8)

    for (const [k, v] of x) {
      const g = err * v + l2 * (this.w.get(k) ?? 0)
      const g2 = (this.g2.get(k) ?? 0) + g * g
      this.g2.set(k, g2)
      this.w.set(k, (this.w.get(k) ?? 0) - (lr * g) / (Math.sqrt(g2) + 1e-8))
    }
    return p
  }

  /** Serialize to Postgres (jsonb) / KV. Coefficients only; g2 can be reset on reload. */
  export(): { b: number; w: Record<string, number> } {
    return { b: this.b, w: Object.fromEntries(this.w) }
  }
  static from(s: { b: number; w: Record<string, number> }, opts?: { lr?: number; l2?: number }) {
    const m = new SparseLogReg(opts)
    ;(m as any).b = s.b
    ;(m as any).w = new Map(Object.entries(s.w))
    return m
  }
}

/** Best-LR features. `counts` are running tallies you already maintain per (user, skill). */
export function bestLrFeatures(skillId: string, counts: {
  skillSucc: number; skillFail: number; totSucc: number; totFail: number
}): Feature[] {
  return [
    [`bias_skill:${skillId}`, 1],
    [`succ_skill:${skillId}`, Math.sqrt(counts.skillSucc)],
    [`fail_skill:${skillId}`, Math.sqrt(counts.skillFail)],
    ['succ_total', Math.sqrt(counts.totSucc)],
    ['fail_total', Math.sqrt(counts.totFail)],
  ]
}
```

The transform on counts is not incidental — some concave transform is what encodes diminishing
returns from repeated practice, and using raw counts measurably degrades fit.

> **UNVERIFIED — the one real gap in this document.** I did **not** verify the exact Best-LR feature
> specification against the primary source (Gervet, Koedinger, Schneider & Mitchell, "When is Deep
> Learning the Best Approach to Knowledge Tracing?", *JEDM* 12(3), 2020). My code uses
> `sqrt(count)`; the PFA literature also uses `log(1 + count)`, and the two are not equivalent.
> **Before locking the feature extractor, confirm against that paper:** (a) the exact one-hot set
> (skill only, or skill + item?), (b) whether counts are `sqrt`- or `log(1+n)`-transformed, (c)
> whether total-across-all-skills counts are included, and (d) whether lag/time features are part of
> Best-LR proper or of the "Best-LR+" variant. The scaffolding above is correct regardless; only the
> feature list is at issue, and it is a one-line change.

**Where the output goes.** This model produces `P(learner knows lemma)`, which is exactly the
per-learner probabilistic vocabulary state that the coverage-band content selector in
`02-ml-and-naming.md` §(e) consumes:

```
coverage(text, learner) = Σ_tokens P(knows lemma(token)) / |tokens|      target 0.95 – 0.98
```

---
