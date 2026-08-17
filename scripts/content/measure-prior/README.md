# measure-prior

Measures **p0**, the probability the avatar answers an item correctly from a contentless
explanation, across an item bank, and writes the result back to `public.items`.

An item is only worth serving for teaching when the model's default answer is **wrong**.
`docs/research/06-model-prior.md` found that a player typing `Just do your best with this one.`
scores 0.885 on the current bank, and that 31 of 40 items return the right answer on every single
vacuous attempt. Those items cannot be failed, so the `taught` boolean they produce is a constant
rather than a score. This tool is what tells the two apart.

The design, the smoke-run numbers and the measured selection-bias gap are in
`docs/research/09-prior-filter.md`. This file is how to run it.

## Usage

```sh
# Smoke test on 20 items before spending real money. Dry run by default.
node scripts/content/measure-prior/run.mjs --limit 20

# The whole forge bank, writing measurements back to public.items.
node scripts/content/measure-prior/run.mjs --write

# A generated candidate file, once one exists.
node scripts/content/measure-prior/run.mjs --source jsonl \
  --file scripts/content/generate/out/candidates.jsonl --write
```

`ANTHROPIC_API_KEY` is read from `.env.local` (parsed by hand, same as
`src/lib/teaching/model-prior.live.test.ts`; the process environment wins over the file).

| Flag | Default | |
| --- | --- | --- |
| `--source db\|jsonl` | `db` | where candidates come from |
| `--file <path>` | `scripts/content/generate/out/candidates.jsonl` | JSONL candidates |
| `--ladder <slug>` | `forge` | db only |
| `--world <slug>` | all | db only |
| `--limit <n>` | all | stop after n candidates |
| `--avatar <slug>` | `vane` | who attempts. Candour 0, held constant so personality is never a variable |
| `--concurrency <n>` | 6 | in-flight attempts |
| `--checkpoint <path>` | `./out/checkpoint.jsonl` | resumable attempt log |
| `--out <path>` | `./out/report.json` | report |
| `--container <name>` | `supabase_db_loxelingo` | psql container |
| `--write` | off | persist to `public.items`. Without it the run is a dry run |
| `--fresh` | off | discard the checkpoint and start over |

### The JSONL shape

One object per line, the same shape as the `items` row it will become:

```json
{"external_id":"ja-forge-particle-ga-dekiru","world_slug":"ja","kind":"particle_choice","prompt":{"task":"...","options":["は","が","を","に"]},"answer":{"choice":"が"}}
```

Deliberately not a second schema. The generator's output and the item table stay describable by
one sentence, and this tool needs no adapter when the candidates land.

## The two things worth understanding before running it

### 1. Eligibility is a confidence bound, not a point estimate

`docs/research/07-injection.md` measured the same six items at three prompt versions.
`ja-forge-conj-shizuka-past` came back **0/5, then 5/5, then 3/5**. A rule of the form
`p0 < 0.5` would have called that item a perfect discriminator, then dead, then marginal, on the
same item and the same model. Pinning a true p0 to ±0.1 needs roughly 100 samples per item, which
across thousands of candidates is unaffordable.

So the rule does not try to know p0. It asks whether the evidence **rules out** a high p0:

> eligible ⟺ the upper bound of the 95% Wilson interval is below 0.5

At n=20 that means 5 correct or fewer. It is reachable, it makes the sample count a tuning knob
rather than a correctness question, and it fails in the safe direction: an item near the line is
refused for want of evidence rather than admitted on a coin flip. Admitting a secretly-easy item
puts a constant back on the scored surface, which is the failure that destroys the mechanic.
Refusing a good item costs one re-measurement.

### 2. The stage that selects never decides

| Stage | n | Who runs it | What it may do |
| --- | --- | --- | --- |
| 1 screen | 5 | every candidate | **reject only**, at observed p0 ≥ 0.6 |
| 2 confirm | 20 | stage-1 survivors, **fresh draw** | decide |
| 3 rescue | 30 | stage-2 near misses, **fresh draw** | decide |

Screening thousands of candidates at n=5 and keeping what looks low selects partly for luck. An
item whose true p0 is 0.9 shows 2 or fewer correct out of 5 about 0.86% of the time, and because
most items are high-p0 those false positives land in exactly the pool that gets kept. Every stage
therefore decides on its own fresh sample and is never pooled with the stage that selected it
into this one, because pooling narrows the interval by precisely the amount the selection put
there.

A **near miss** is an item whose observed rate cleared the line but whose interval did not. At
n=20 the bar is 5 correct or fewer; at n=30 it loosens to 9 or fewer, so an item that is really
low and drew badly gets a second hearing instead of being discarded.

`mayPersistPrior` in `src/lib/teaching/prior.ts` enforces the one write rule: a screening sample
may record a rejection but never an acceptance. This is not hypothetical, since 0 correct out of 5
has an upper bound of 0.434 and would otherwise admit an item on one lucky draw. The database
enforces the same thing independently, as `items_prior_evidence_bar`.

## Cost

Measured on the smoke run: **1,852 input and 181 output tokens per attempt** on
`claude-haiku-4-5` at $1/$5 per million tokens, so roughly **$0.0027 per attempt**.

Attempts per thousand candidates, and therefore cost, depend entirely on how many survive the
screen:

| Stage-1 survival | Attempts / 1000 | Cost / 1000 |
| --- | --- | --- |
| 0% (every candidate dead) | 5,000 | ~$13.80 |
| 7.5% (measured on the forge bank) | 7,250 | **~$20.00** |
| 20%, half of them near misses | 12,000 | ~$33.10 |

At concurrency 8 the smoke run did 290 attempts in about 135 seconds, so a thousand candidates is
roughly an hour of wall time. Budget for the survival rate you expect rather than the one you
want: a run whose cost comes in far above the table is a run whose screen is passing too much,
which usually means the measurement is broken rather than the bank being good.

## Resuming

Every completed attempt is appended to the checkpoint as it lands, so an interrupted run resumes
at the attempt granularity rather than the item granularity. Re-running the same command replays
the checkpoint and makes zero API calls if nothing is missing.

Each line carries the prompt version and the model id. Lines that do not match the current
configuration are counted and **ignored**, because a checkpoint written under a different prompt
is not a partial result, it is a different measurement. Lines that recorded an error are also
ignored and retried, because scoring our own outage as a miss would depress p0 and make dead items
look teachable.

## Reading the output

`--out` writes the full report. The console summary carries the numbers that matter:

- how many passed stage 1, how many were eligible after stage 2, how many near misses went to
  stage 3, and how many of those were rescued
- the **selection-bias gap**: the mean p0 of stage-1 survivors as measured in stage 1, against the
  same items as measured in stage 2. A large positive gap is the screen's luck being paid back
- cost, in tokens and dollars, and projected per thousand candidates
- every eligible item with its interval

If more than half the bank reads as eligible the tool prints a warning, and it means what it says:
06 put the vacuous pass rate at 0.885, so a majority-eligible bank is far more likely to be a
broken measurement (a mis-parsed answer key, the wrong avatar, an explanation that is not
actually contentless) than an unusually good bank.

## How it runs TypeScript

`run.mjs` loads `.env.local`, then re-launches node with `--experimental-transform-types` and the
resolution hooks in `ts-hooks.mjs`, which teach node the `@/*` alias and extensionless imports.
That is twenty lines standing in for a bundler, and it exists so the tool measures against the
**same** `buildAttemptPrompt` and `runAttempt` that production calls rather than against a copy
that could drift. No dependency is added.
