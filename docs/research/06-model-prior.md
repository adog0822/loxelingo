# 06 — The model prior under the teaching score

`src/lib/teaching/attempt.ts` carries this note:

> a frontier model already knows the material an N5 item tests, so a perfectly isolated prompt
> does not by itself make the avatar ignorant [...] run the attempt with an empty-but-plausible
> explanation across the item bank and the pass rate IS the model's prior.

This is that run. The harness is `src/lib/teaching/model-prior.live.test.ts`, which skips unless
`RUN_LIVE=1`.

## Method

Every item on the scored closed-answer surface was measured: `ladder_slug = 'forge'`, 15 items in
world `en` and 25 in world `ja`, 40 in total. That is the whole population rather than a sample,
because those are the only items carrying an answer key.

Each item was attempted 5 times in each of three conditions, for 600 attempts.

| Condition | Explanation given to the avatar |
| --- | --- |
| VACUOUS | `Just do your best with this one.` Contentless, and non-empty because `buildAttemptPrompt` rejects an empty string. The pass rate here is p0, the prior. |
| GOOD | A correct, minimal, one or two sentence explanation of the concept, derived from the item's own `answer.note`. Authored in the test file as a literal map keyed by `external_id`. |
| MISLEADING | A confidently stated wrong rule for that item, also one or two sentences, pointing at a specific wrong answer. |

Everything else was held constant. One avatar throughout (Vane, candour 0, loaded from the
`avatars` row rather than fabricated), one model (`claude-haiku-4-5`, temperature 0.2, as
`attempt.ts` configures it), one path into the model (`buildAttemptPrompt` then `runAttempt`,
exactly as production would call them). Correctness is `isCorrectAnswer` against
`parseAnswerKey(items.answer)`, the same ground truth the ladders use.

The run completed 600 of 600 attempts with 0 errors in 352 seconds at concurrency 6.

A note on resolution. Five samples per cell means a cell rate lands on one of six values, and a
5-for-5 cell has a 95 percent confidence interval of roughly [0.48, 1.00]. Per-item numbers are
therefore coarse. The aggregates are not: 177 correct out of 200 vacuous attempts carries an
interval of about ±0.04.

## 1. Overall p0

**Across all 40 items, 177 of 200 vacuous attempts were correct. p0 = 0.885.**

For comparison, in the same run p_good = 0.930 (186/200) and p_misleading = 0.325 (65/200).

By world:

| World | Items | p0 | p_good | p_misleading |
| --- | --- | --- | --- | --- |
| en | 15 | 0.973 (73/75) | 0.947 (71/75) | 0.360 (27/75) |
| ja | 25 | 0.832 (104/125) | 0.920 (115/125) | 0.304 (38/125) |

By kind:

| Kind | World | Items | p0 | p_good | p_misleading | Mean floor |
| --- | --- | --- | --- | --- | --- | --- |
| capitalisation | en | 1 | 1.00 | 1.00 | 0.00 | 0 |
| countability_choice | en | 2 | 1.00 | 1.00 | 0.50 | 0.25 |
| preposition_cloze | en | 2 | 1.00 | 1.00 | 0.70 | 0.17 |
| spelling | en | 3 | 1.00 | 1.00 | 0.60 | 0 |
| verb_form | en | 3 | 1.00 | 1.00 | 0.07 | 0 |
| kanji_reading | ja | 10 | 0.94 | 0.88 | 0.22 | 0 |
| article_choice | en | 4 | 0.90 | 0.80 | 0.25 | 0.38 |
| conjugation | ja | 10 | 0.86 | 0.92 | 0.44 | 0 |
| particle_choice | ja | 5 | 0.56 | 1.00 | 0.20 | 0.25 |

Five of the nine kinds sit at p0 = 1.00. One kind, `particle_choice`, has real headroom.

The brief's own example holds up. 泳ぐ (`ja-forge-conj-oyogu-te`) came back correct on 4 of 5
vacuous attempts, and 書く (`ja-forge-conj-kaku-te`) on 5 of 5, returning `書いて` every time from
an explanation that said nothing at all.

## 2. The lift table

p0, p_good and p_misleading per item, sorted by p0 descending. `floor` is the guessing floor by
construction, discussed in section 5.

| external_id | kind | world | floor | p0 | p_good | p_misleading |
| --- | --- | --- | --- | --- | --- | --- |
| `en-forge-article-second-mention` | article_choice | en | 0.25 | 1.0 | 1.0 | 1.0 |
| `en-forge-preposition-on-monday` | preposition_cloze | en | 0.33 | 1.0 | 1.0 | 1.0 |
| `en-forge-spelling-plan-ing` | spelling | en | 0 | 1.0 | 1.0 | 1.0 |
| `en-forge-uncountable-advice` | countability_choice | en | 0.25 | 1.0 | 1.0 | 1.0 |
| `ja-forge-conj-hanasu-volitional` | conjugation | ja | 0 | 1.0 | 1.0 | 1.0 |
| `ja-forge-conj-kaku-te` | conjugation | ja | 0 | 1.0 | 1.0 | 1.0 |
| `ja-forge-conj-kuru-past` | conjugation | ja | 0 | 1.0 | 1.0 | 1.0 |
| `ja-forge-particle-ni-seven` | particle_choice | ja | 0.25 | 1.0 | 1.0 | 1.0 |
| `en-forge-preposition-depend-on` | preposition_cloze | en | 0 | 1.0 | 1.0 | 0.4 |
| `en-forge-spelling-make-ing` | spelling | en | 0 | 1.0 | 1.0 | 0.4 |
| `en-forge-spelling-study-past` | spelling | en | 0 | 1.0 | 1.0 | 0.4 |
| `ja-forge-kanji-hanabi` | kanji_reading | ja | 0 | 1.0 | 1.0 | 0.4 |
| `ja-forge-kanji-tenki` | kanji_reading | ja | 0 | 1.0 | 1.0 | 0.4 |
| `en-forge-participle-write` | verb_form | en | 0 | 1.0 | 1.0 | 0.2 |
| `ja-forge-conj-iku-te` | conjugation | ja | 0 | 1.0 | 0.2 | 0.2 |
| `ja-forge-conj-kau-past` | conjugation | ja | 0 | 1.0 | 1.0 | 0.2 |
| `ja-forge-conj-miru-neg` | conjugation | ja | 0 | 1.0 | 1.0 | 0.2 |
| `ja-forge-kanji-densha` | kanji_reading | ja | 0 | 1.0 | 1.0 | 0.2 |
| `ja-forge-kanji-gakkou` | kanji_reading | ja | 0 | 1.0 | 0.4 | 0.2 |
| `ja-forge-kanji-taberu` | kanji_reading | ja | 0 | 1.0 | 1.0 | 0.2 |
| `en-forge-article-a-university` | article_choice | en | 0.50 | 1.0 | 0.2 | 0.0 |
| `en-forge-article-an-hour` | article_choice | en | 0.50 | 1.0 | 1.0 | 0.0 |
| `en-forge-capitals-friday` | capitalisation | en | 0 | 1.0 | 1.0 | 0.0 |
| `en-forge-much-luggage` | countability_choice | en | 0.25 | 1.0 | 1.0 | 0.0 |
| `en-forge-past-buy` | verb_form | en | 0 | 1.0 | 1.0 | 0.0 |
| `en-forge-past-teach` | verb_form | en | 0 | 1.0 | 1.0 | 0.0 |
| `ja-forge-conj-matsu-te` | conjugation | ja | 0 | 1.0 | 1.0 | 0.0 |
| `ja-forge-kanji-kariru` | kanji_reading | ja | 0 | 1.0 | 0.4 | 0.0 |
| `ja-forge-kanji-kyou` | kanji_reading | ja | 0 | 1.0 | 1.0 | 0.0 |
| `ja-forge-kanji-renshuu` | kanji_reading | ja | 0 | 1.0 | 1.0 | 0.0 |
| `ja-forge-particle-wo-coffee` | particle_choice | ja | 0.25 | 1.0 | 1.0 | 0.0 |
| `ja-forge-kanji-tegami` | kanji_reading | ja | 0 | 0.8 | 1.0 | 0.8 |
| `ja-forge-conj-nomu-potential` | conjugation | ja | 0 | 0.8 | 1.0 | 0.6 |
| `ja-forge-conj-oyogu-te` | conjugation | ja | 0 | 0.8 | 1.0 | 0.2 |
| `en-forge-article-zero-everest` | article_choice | en | 0.25 | 0.6 | 1.0 | 0.0 |
| `ja-forge-kanji-hitori` | kanji_reading | ja | 0 | 0.6 | 1.0 | 0.0 |
| `ja-forge-particle-de-library` | particle_choice | ja | 0.25 | 0.4 | 1.0 | 0.0 |
| `ja-forge-particle-ga-dekiru` | particle_choice | ja | 0.25 | 0.2 | 1.0 | 0.0 |
| `ja-forge-particle-wa-student` | particle_choice | ja | 0.25 | 0.2 | 1.0 | 0.0 |
| `ja-forge-conj-shizuka-past` | conjugation | ja | 0 | 0.0 | 1.0 | 0.0 |

Mean per-item lift from vacuous to good is +0.045. Mean per-item movement from vacuous to
misleading is -0.56, which is the one healthy signal in the table and is unpacked in section 4.

## 3. Dead items

**31 of 40 items have p0 = 1.00.** Every vacuous attempt on them was correct, five times out of
five. 34 of 40 sit at p0 ≥ 0.8.

These items cannot be failed by a player, because the avatar answers them from its own knowledge
before the explanation is read. The vacuous answers are stable rather than lucky: five identical
strings per item, including `書いて`, `来た`, `話そう`, `はなび`, `planning`, `studied`, `making`,
`some advice`, `The`, `on`.

Only 6 items have p0 ≤ 0.6, meaning only 6 items leave room for teaching to change the outcome at
all:

| external_id | p0 | p_good | Headroom |
| --- | --- | --- | --- |
| `ja-forge-conj-shizuka-past` | 0.0 | 1.0 | +1.0 |
| `ja-forge-particle-ga-dekiru` | 0.2 | 1.0 | +0.8 |
| `ja-forge-particle-wa-student` | 0.2 | 1.0 | +0.8 |
| `ja-forge-particle-de-library` | 0.4 | 1.0 | +0.6 |
| `en-forge-article-zero-everest` | 0.6 | 1.0 | +0.4 |
| `ja-forge-kanji-hitori` | 0.6 | 1.0 | +0.4 |

`ja-forge-conj-shizuka-past` is the one item in the bank that behaves the way the mechanic
assumes. Vacuous produced `静かかった` five times out of five, which is the exact cross-over error
the seed note names. The good explanation produced `静かだった` five times out of five. That item
measures teaching.

## 4. Broken items

Dead and broken are separate failures. A dead item cannot be failed. A broken item cannot be
failed even after the player teaches a rule that is wrong, which means the explanation is not
reaching the answer at all.

**9 of 40 items have p_misleading ≥ 0.8, and 8 of those sit at p_misleading = 1.00:**

| external_id | p0 | p_misleading | Wrong rule taught |
| --- | --- | --- | --- |
| `en-forge-article-second-mention` | 1.0 | 1.0 | articles never change on repeat mention |
| `en-forge-preposition-on-monday` | 1.0 | 1.0 | parts of the day always take `in` |
| `en-forge-spelling-plan-ing` | 1.0 | 1.0 | English never doubles a consonant before `ing` |
| `en-forge-uncountable-advice` | 1.0 | 1.0 | `advice` is an ordinary countable noun |
| `ja-forge-conj-hanasu-volitional` | 1.0 | 1.0 | every verb takes よう in the volitional |
| `ja-forge-conj-kaku-te` | 1.0 | 1.0 | keep the き stem and add て |
| `ja-forge-conj-kuru-past` | 1.0 | 1.0 | 来る is regular, add た to the dictionary form |
| `ja-forge-particle-ni-seven` | 1.0 | 1.0 | times of day take the same particle as places |
| `ja-forge-kanji-tegami` | 0.8 | 0.8 | nothing voices in this compound |

All 9 are also dead. On these the score is fixed at 1.0 across all three conditions, so the item
returns the same verdict whether the player teaches well, teaches nothing, or teaches something
false.

The countervailing evidence is that misleading DOES land on most of the bank. Overall
p_misleading = 0.325 against p0 = 0.885, a drop of 0.56, and 30 of 40 items moved down. On
`en-forge-capitals-friday` the wrong rule produced `I am meeting Sarah on friday in march.` five
times out of five, exactly the error taught. So the avatar is reading the explanation and acting
on it. The problem is asymmetric: the explanation can push the avatar off a correct answer, and
it is rarely needed to reach one.

## 5. The guessing floor

Two sources of floor exist in this bank.

* 9 items carry an `options` array in `items.prompt`, all of them with 4 options, so their floor
  is 0.25. `choicesFromPrompt` reads that count and the harness asserts its own option reader
  agrees with it on every item.
* 3 items enumerate their permitted answers in the task text without carrying an options array.
  `Write a or an` is a two-way choice (floor 0.50) on `en-forge-article-a-university` and
  `en-forge-article-an-hour`, and `Write at, on or in` is a three-way choice (floor 0.33) on
  `en-forge-preposition-on-monday`. These are listed in `CONSTRAINED_FREE_RESPONSE` in the test
  file.

The remaining 28 items are open response and their floor is treated as 0.

Read against the floor rather than against zero:

| Group | Items | Mean floor | p0 |
| --- | --- | --- | --- |
| Floored (options or enumerated) | 12 | 0.299 | 0.783 (47/60) |
| Open response | 28 | 0 | 0.929 (130/140) |

**37 of 40 items have p0 above their own floor.** The three that do not are
`ja-forge-conj-shizuka-past` (p0 = 0.0, floor 0), `ja-forge-particle-ga-dekiru` (p0 = 0.2, floor
0.25) and `ja-forge-particle-wa-student` (p0 = 0.2, floor 0.25).

So the floor explains close to none of it. The floored items sit 0.485 above their own floor on
average, and the group with the higher p0 is the open-response group, whose floor is zero.
p0 = 0.885 is knowledge rather than chance.

## 6. Conclusion

**On this bank, the teaching score does not measure teaching. It measures the model's prior.**

The numbers behind that sentence:

* A player who types `Just do your best with this one.` scores 0.885. A player who teaches
  correctly scores 0.930. The whole dynamic range between contentless input and correct teaching
  is 4.5 points.
* 31 of 40 items return a correct answer on every vacuous attempt. 6 items have any headroom at
  all. One item discriminates cleanly.
* 8 items return the correct answer on every attempt in all three conditions, including after
  being taught a false rule.

The `taught` boolean that `settleTeachingSession` writes to `user_avatars.theta` and to the stage
counter is, on 31 of 40 items, a constant. `applyTeachingResult` will advance a player who types
filler at very nearly the rate it advances a player who teaches well, and the ladder built on top
of it will rank those two players the same.

### Which kinds survive

`particle_choice` survives. It has p0 = 0.56 against a 0.25 floor, p_good = 1.00, and
p_misleading = 0.20. Three of its five items are among the six with real headroom. What
distinguishes it is that the answer turns on a choice the model can be argued out of, rather than
on a form the model has memorised.

`conjugation` is split. Nine of its ten items sit at p0 ≥ 0.8, and one, the な-adjective past,
sits at 0.0. The distinguishing feature is the same: `静か` is the only conjugation item whose
default answer is the wrong one, so the prior works against the key instead of with it.

`kanji_reading` does not survive, and it cannot be repaired by rewording. p0 = 0.94, and a reading
is a lookup rather than a rule, so a correct explanation of the concept necessarily contains most
of the answer. There is no explanation of 電車 that teaches でんしゃ without saying でんしゃ.
Under the isolation rule these items can only ever measure whether the model already knows the
word.

`spelling`, `verb_form`, `capitalisation`, `countability_choice` and `preposition_cloze` do not
survive. Those five kinds sit at p0 = 1.00 across all 11 of their items. `article_choice` is close
behind at p0 = 0.90, with `en-forge-article-zero-everest` the only one of its four that moves.

### Two secondary observations

**A correct explanation sometimes lowers the score.** Four items scored lower under GOOD than
under VACUOUS: `en-forge-article-a-university` (1.0 to 0.2), `ja-forge-conj-iku-te` (1.0 to 0.2),
`ja-forge-kanji-gakkou` (1.0 to 0.4) and `ja-forge-kanji-kariru` (1.0 to 0.4). The failures are
over-application of the rule as stated. Told that 借りる is a kun-yomi verb whose kanji carries
the first beat, the avatar produced `かりりる` on three of five attempts. This means p_good is not
a clean ceiling: it measures the interaction between one player's wording and one model, and the
GOOD column above is my prose as much as it is the item.

**The avatar's self-report tracks the presence of an explanation rather than its truth.**
`said_it_understood` came back true on 94 percent of GOOD attempts, 70 percent of VACUOUS, and 68
percent of MISLEADING. It is close to identical for a contentless explanation and a false one,
which is consistent with `contract.ts` treating it as flavour rather than score.

## Reproducing

```
RUN_LIVE=1 MODEL_PRIOR_OUT=/tmp/model-prior.json \
  npx vitest run --config vitest.config.mts src/lib/teaching/model-prior.live.test.ts
```

The test skips without `RUN_LIVE=1` and is inert in the normal suite. `MODEL_PRIOR_OUT` receives
the full per-attempt record, including every answer string, for re-analysis.
