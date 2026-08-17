# 09 — Filtering the item bank on the measured model prior

`docs/research/06-model-prior.md` established that the teaching score, on the current bank, mostly
measures what the model already knows. A player typing `Just do your best with this one.` scored
0.885, and 31 of 40 items returned the correct answer on every vacuous attempt. Those items cannot
be failed, so the `taught` boolean they produce is a constant.

This document is the filter built on that finding: how p0 becomes stored data, how eligibility is
decided, and what a run over the existing 40 forge items actually produced.

The pieces are `supabase/migrations/20260816120000_item_prior.sql`, `src/lib/teaching/prior.ts`
and `scripts/content/measure-prior/`.

## 1. The rule, and why it is not the obvious one

The obvious rule is `p0 < 0.5`: measure the prior, keep the items where it is low.
`docs/research/07-injection.md` is the reason that rule is not usable.

07 re-measured the same six items at three prompt versions. The vacuous rate across them went
**0.333, 0.567, 0.400**, and no pair of those separates statistically. One item,
`ja-forge-conj-shizuka-past`, went **0/5, then 5/5, then 3/5**. A point-estimate rule would have
called that item a perfect discriminator, then dead, then marginal, on the same item and the same
model, with nothing but sampling noise between the three verdicts.

Pinning a true p0 to ±0.1 takes roughly 100 samples per item. Across thousands of candidates that
is not affordable, so precision is off the table. The rule has to be correct at a sample size we
can pay for instead of at one we cannot.

**So the rule does not attempt to know p0. It asks whether the evidence rules out a high p0.**

> An item is eligible when the **upper bound of its 95% Wilson interval is below 0.5**.

Three properties make this the right shape:

* **It is reachable at n = 20.** 4 correct out of 20 gives an upper bound of 0.416, which clears.
  5 out of 20 gives 0.469, which also clears. 6 out of 20 gives 0.519, which does not. So the bar
  at n=20 is a quarter of the sample, which real items do meet.
* **It fails in the safe direction.** 9 correct out of 20 is p0 = 0.45, comfortably under the line
  on a point estimate, and its interval runs to 0.658. The evidence is equally consistent with a
  p0 of 0.65, so the item is refused. Admitting a secretly-easy item puts a constant back on the
  scored surface, which is the failure that destroys the mechanic. Refusing a good one costs a
  re-measurement.
* **It turns the sample count into a tuning knob.** If too few items qualify at n=20, raise n for
  the borderline ones. That is a budget decision rather than a correctness question, which is
  exactly the property the point-estimate rule lacked.

Wilson rather than the normal approximation because the approximation is worst where this bank
lives: 0 correct out of 20 gives [0, 0] under the normal form, claiming a certainty the sample has
not earned. Wilson gives [0, 0.161].

## 2. p0 as stored data

`public.items` gains five columns, and they move together:

| Column | |
| --- | --- |
| `prior_p0` | measured P(correct) from a contentless explanation |
| `prior_samples` | how many attempts that came from |
| `prior_prompt_version` | `ATTEMPT_PROMPT_VERSION` at measurement time |
| `prior_model` | the attempting model id |
| `prior_measured_at` | when |

`items_prior_all_or_nothing` uses `num_nonnulls(...) in (0, 5)`, so a half-written measurement
cannot exist. That matters because of the same 07 finding: the identical six items measured
0.333, 0.567 and 0.400 across prompt versions 2, 3 and 4, so a p0 stored without its version does
not say which prompt produced it. It keeps looking like a valid number while meaning something
else.

`prior_p0_ci_lower` and `prior_p0_ci_upper` are **stored generated columns** over
`public.wilson_bound(prior_p0, prior_samples, ±1)`. They are a pure function of two values in the
same row, so a stored bound can never fall out of step with its inputs, and the number the rule
reads therefore exists in exactly one place.

`is_teachable` is a **view** rather than a generated column, and that difference is deliberate:

```sql
prior_p0 is not null
and prior_p0_ci_upper < public.teachable_max_p0()
and prior_prompt_version = public.attempt_prompt_version()
```

Eligibility depends on the prompt version, which can move. A stored column is computed at write
time, so bumping the version would leave every existing row still asserting the eligibility it
held under the old prompt, and nothing would error. Evaluated at read time, one edit to
`attempt_prompt_version()` retires the whole bank at once, which is the correct blast radius for
a prompt change. (The coordinator has since frozen `ATTEMPT_PROMPT_VERSION` at 4, so this is
insurance rather than a routine event, which is the state you want it in.)

### The mirrored constants and their guard

`attempt_prompt_version()`, `teachable_max_p0()` and `prior_confirm_samples()` are SQL mirrors of
`ATTEMPT_PROMPT_VERSION`, `TEACHABLE_MAX_P0` and `PRIOR_CONFIRM_SAMPLES`, written twice because
Postgres cannot call TypeScript. `src/lib/teaching/prior-sql.test.ts` reads the migration and
fails on a one-sided edit.

This is the fourth guard of that shape in the repository, after `display-scale.test.ts`,
`bot-rungs.test.ts` and `altitude-band-sql.test.ts`. All three of those exist because a value was
recorded somewhere that could not see its source. It also checks the shape of the rule rather than
only its constants: that `is_teachable` reads `prior_p0_ci_upper` and not `prior_p0`, that no
threshold is inlined as a literal, and that eligibility is not a generated column.

### The evidence bar, as schema

`items_prior_evidence_bar` refuses any row whose upper bound clears the line unless
`prior_samples >= prior_confirm_samples()`. This is not hypothetical. **0 correct out of 5 has an
upper bound of 0.434**, comfortably under the line, so without this constraint a single lucky
screening draw would admit an item on five samples. `mayPersistPrior` enforces the same rule in
the tool; the database enforces it independently, because the tool is not the only thing that will
ever write to that table.

## 3. Three stages, and why they never pool

| Stage | n | Who runs it | What it may do |
| --- | --- | --- | --- |
| 1 screen | 5 | every candidate | **reject only**, at observed p0 ≥ 0.6 |
| 2 confirm | 20 | stage-1 survivors, fresh draw | decide |
| 3 rescue | 30 | stage-2 near misses, fresh draw | decide |

Screening thousands of candidates at n=5 and keeping what looks low selects partly for luck. An
item whose true p0 is 0.9 shows 2 or fewer correct out of 5 about 0.86% of the time, and because
most items are high-p0 those false positives concentrate in exactly the pool that gets kept. Naive
filtering would hand back a bank of items that got lucky once.

The screen threshold sits at 0.6 rather than at the eligibility line for a reason that runs the
other way: an item whose true p0 is 0.25 still shows 3 or more correct out of 5 about 10% of the
time, so a tighter screen would discard one promising item in ten before it was ever measured.
The screen is a filter on cost, and it is allowed to be wrong in the cheap direction only.

**Each stage decides on its own fresh sample and is never pooled with the stage that selected it
into this one.** Pooling would narrow the interval by precisely the amount the selection put
there, and under a bound-based rule a too-narrow interval is the one error that matters, because
it is the one that admits.

A **near miss** is an item whose observed rate cleared the line but whose interval did not. At
n=20 the bar is 5 correct or fewer; at n=30 it loosens to 9 or fewer (0.30 of the sample against
0.25). So stage 3 buys a truly low item that drew badly a second hearing, at 30 extra attempts.
Those are the near misses most likely to be real, and they are also precisely the items a
point-estimate rule would have admitted without asking.

## 4. The smoke run: 40 forge items at prompt version 4

`node scripts/content/measure-prior/run.mjs --limit 40 --concurrency 8`, one avatar (Vane, candour
0), `claude-haiku-4-5`, 290 attempts, **0 errors**, about 135 seconds.

### Stage 1, all 40 items at n = 5

**185 of 200 vacuous attempts were correct, an observed rate of 0.925.** For comparison 06
measured 0.885 on the same items at prompt version 1.

| Correct out of 5 | Items |
| --- | --- |
| 5 | 34 |
| 4 | 3 |
| 2 | 1 |
| 1 | 1 |
| 0 | 1 |

34 of 40 items answered correctly on every attempt. **3 of 40 passed the screen.**

### Stage 2, three survivors at n = 20 on a fresh draw

| Item | Stage 1 | Stage 2 | 95% interval | |
| --- | --- | --- | --- | --- |
| `en-forge-article-zero-everest` | 0/5 | **0/20** | [0.000, 0.161] | eligible |
| `ja-forge-particle-ga-dekiru` | 1/5 | **2/20** | [0.028, 0.301] | eligible |
| `ja-forge-kanji-hitori` | 2/5 | **6/20** | [0.145, 0.519]* | near miss |

*`hitori` at 6/20 is p0 = 0.30, which clears the line on a point estimate. Its upper bound at that
draw was 0.519, so it went to stage 3 rather than being admitted.

### Stage 3, one near miss at n = 30 on a fresh draw

| Item | Stage 2 | Stage 3 | 95% interval | |
| --- | --- | --- | --- | --- |
| `ja-forge-kanji-hitori` | 6/20 = 0.30 | **11/30 = 0.367** | [0.219, 0.545] | refused |

### Result

**2 of 40 items are eligible at v4.** `en-forge-article-zero-everest` and
`ja-forge-particle-ga-dekiru`.

That is the number to expect, and the two items are the ones the prior work points at. 06 listed
`en-forge-article-zero-everest` among the six with any headroom at all, and 07 found it steady at
0.0 across all three of its runs, 15 vacuous attempts wrong out of 15. It came back 0/20 here,
which is 35 consecutive vacuous misses across four independent runs. `ja-forge-particle-ga-dekiru`
measured 0.2 in 06 and 0.10 here. `ja-forge-particle-de-library`, which 07 found reliably dead at
0.8 to 1.0, was screened out at 4/5.

If a future run over the generated bank reports a large fraction of its candidates as eligible,
that is not good news about the bank. The tool prints a warning above 50% and the warning should
be believed: a mis-parsed answer key, the wrong avatar, or an explanation that is not actually
contentless all produce exactly that shape.

## 5. The selection-bias gap

The number to watch is the mean p0 of stage-1 survivors as measured in stage 1, against the same
items measured in stage 2. If the screen is picking up lucky draws, survivors come back higher.

| | |
| --- | --- |
| Stage-1 survivors | 3 |
| Their mean p0 in stage 1 | 0.200 |
| Their mean p0 in stage 2 | 0.133 |
| **Gap** | **−0.067** |

**Three items is not enough to measure a selection effect, and this number should not be read as
one.** With n = 3 the gap is noise around zero, and its sign here happens to be the wrong one for
the story. It is reported because the brief asked for it and because the instrumentation is what
matters at this scale: the run over the generated bank will have hundreds of survivors, and the
same figure will mean something then.

What the run does show is the effect at the level of a single item, which is where it is visible.
`ja-forge-kanji-hitori` measured 2/5 (0.40) at the screen, 6/20 (0.30) at stage 2, and 11/30
(0.367) at stage 3. Its three draws span 0.30 to 0.40, and the deciding one was the highest of the
three. Under a point-estimate rule it would have been admitted at stage 2 on a rate of 0.30 and it
is very likely not a discriminator. That single item is the argument for both the bound and the
third stage, made concretely.

## 6. Cost

Measured: **1,852 input and 181 output tokens per attempt**, or about **$0.0027 per attempt** on
`claude-haiku-4-5` at $1 and $5 per million tokens. The smoke run cost $0.80 for 290 attempts.

Cost per thousand candidates is entirely a function of how many survive the screen:

| Stage-1 survival | Attempts / 1000 | Cost / 1000 |
| --- | --- | --- |
| 0% | 5,000 | ~$13.80 |
| 7.5% (measured here) | 7,250 | **~$20.00** |
| 20%, half of them near misses | 12,000 | ~$33.10 |

Stage 3 is cheap at these ratios. On this run it was one item, 30 attempts, about 10% of the total
call volume, and it changed a verdict. On a bank with a 20% survival rate and half of those
becoming near misses it is a quarter of the cost, which is still a reasonable price for not
admitting the items the rule is least sure about.

At concurrency 8 a thousand candidates is roughly an hour of wall time.

## 7. What this does not settle

* **The measurement is per model.** Every figure here is `claude-haiku-4-5`. `prior_model` is
  stored so a swap invalidates the bank rather than silently reinterpreting it, but nothing yet
  refuses to serve an item measured against a different model, because `is_teachable` gates on the
  prompt version alone.
* **Nothing reads `is_teachable` yet.** The view exists and the data is in it; wiring item
  selection to it is the next change, and until that lands the filter is a measurement rather than
  a gate.
* **A bank of 2 is not a bank.** The filter works. What it says about the existing 40 items is
  that they cannot support the mechanic, which was 06's conclusion and is now measured against a
  stricter rule. The generated bank is what this tooling was built for.
* **95% is a choice.** `PRIOR_WILSON_Z` sets it, and a 90% bound would admit more items on the
  same evidence. It is a knob nobody should turn without saying why in this document.

## Reproducing

```sh
node scripts/content/measure-prior/run.mjs --limit 40 --concurrency 8 --write
```

The checkpoint under `scripts/content/measure-prior/out/` holds all 290 attempts including every
answer string, so re-running the same command replays it and makes no API calls. That directory is
a local cache and is gitignored; the figures above are the record. See
`scripts/content/measure-prior/README.md` for the flags.
