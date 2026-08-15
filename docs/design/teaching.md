# The Teaching Loop

**Date:** 2026-08-15
**Status:** Built. `src/lib/teaching/**` and `supabase/migrations/20260815112234_teaching_loop.sql`.
**Authority:** `src/lib/teaching/contract.ts`. Where this document and that file disagree, that
file is right and this one is stale.

learn, teach, the avatar attempts, settle.

---

## 1. The mechanic in one paragraph

The player reads a short segment. They explain it, in their own words, to an avatar that knows
only what they have managed to teach it. The avatar is then handed a REAL task from the item
bank and tries it. Whether it succeeds is the player's score. A bad explanation therefore
produces a specific failure rather than a grade, and the failure has a personality attached:
an avatar low in candour performs a confident wrong answer, and one high in candour says which
sentence it stopped at.

The alternative, asking a model to rate teaching quality directly, was rejected in
`contract.ts`: it is subjective, it has no answer key, and the kappa gate would have nothing to
measure agreement about.

---

## 2. The isolation rule, and how it is held

The attempt prompt may contain the avatar's personality, the player's explanation verbatim, and
the task. It may never contain the answer key, the source segment, the concept name or id,
worked examples, or an earlier attempt at this concept.

This is not a code review rule. It is held by the shape of one type.

`AttemptInput` has six fields and none of them can hold forbidden material. `buildAttemptPrompt`
takes exactly one `AttemptInput` and reads nothing else: no database, no file, no clock, no
environment. So the set of strings that can reach the model is a function of a type, and
widening it means editing the type, which shows up in a diff.

`prompt.test.ts` proves this three ways:

1. **Compile time.** `Extract<keyof AttemptInput, ForbiddenField>` must be `never`, and
   `AttemptInput` must share no key with `LearnSegment`, which is where the source segment and
   its worked examples actually live. Both run under `tsc --noEmit`. Verified to bite: adding
   `answer: string` to `AttemptInput` fails the build.
2. **Closure over the output.** Every line of a built prompt traces to the input, to
   `buildAvatarPrompt`, or to a literal declared in the test. A line carrying interpolated
   content cannot be added to that allow-list, because an allow-list entry is a literal.
3. **Verbatim.** The explanation appears byte for byte, exactly once, uncorrected. A wrong
   explanation survives intact, because summarising it would score our prose rather than the
   player's teaching, and it would score it well.

### What the type does not hold

The model's own prior. A frontier model already knows the reading of 食べる, so a perfectly
isolated prompt does not make the avatar ignorant. The prompt says so in as many words, in a
line `buildAvatarPrompt` was already carrying: "Where you have not been taught something, you
do not have it, however much you want it." How well that instruction holds is measurable and
currently unmeasured. **Run the attempt across the item bank with a plausible but empty
explanation and the pass rate IS the model's prior; that number is the floor under every
score the loop produces.** It belongs in the same gold-set work as the kappa gate.

---

## 3. The stage rule

> Three teachings that land move the avatar up a stage.
> One that misses takes back one of the three.

Six stages, Novice to Expert. One stored number:

```
teaching_net := clamp(teaching_net + (correct ? +1 : -1), 0, 17)
stage        := 1 + teaching_net / 3
```

**Legible without a manual.** It is a progress bar of three. A player at "2 of 3" who misses is
at "1 of 3" and nobody has to be told what happened.

**Not a streak.** A streak rule takes everything from a player two thirds of the way up for one
miss, which makes the honest move, teaching the concept you are shaky on, the expensive one. A
counter costs a miss exactly one third of a step, wherever it lands.

**Regression is possible and gentle.** A stage that only rises records how much a player has
done rather than what their avatar can do. Three consecutive misses cost one stage, never more
than one at a time. The landing is soft: dropping out of stage 3 lands at net 2, the top of
stage 2, so one success returns it. A bad evening costs a step and can be taken straight back;
losing the ability to explain the material keeps costing.

**The cap at 17** is the top of stage 6. Without it an Expert with forty successes banked could
miss thirty times and still read as Expert. Expert is held, not owned.

**On a failed attempt:** `teaching_net` falls by one, floored at 0. The stage falls only if that
crosses a boundary. The session is still recorded, the avatar still says its line, and `theta`
still moves down through `updateLearnerOnly`. Nothing is reset.

The rule is written twice, here in `stage.ts` and as CHECK constraints in the migration, because
Postgres cannot call TypeScript. `stage.test.ts` reads the migration and fails on a one-sided
edit, the same arrangement `display-scale.test.ts` uses for the rating scale.

---

## 4. Two rating tracks, deliberately separate

| | moves | on |
|---|---|---|
| PvP rating | `user_ratings.theta` | a judged match |
| Teaching | `user_avatars.theta` | a graded attempt |

One records what you can perform under a clock against another human. The other records what
you could explain well enough that somebody else could do it. Collapsing them would let a
strong player's standing be topped up by teaching, and let a patient teacher's standing be read
as duelling strength.

The maths is `updateLearnerOnly` from `src/lib/engine/elo.ts`, unmodified: the avatar is the
learner, the task is the item, and `lessons_taught` is the observation count that decays K. No
new rating maths is derived. `TeachingStore` is the module's entire database surface and it
names three operations, none of which can reach `user_ratings`.

---

## 5. The kappa gate

`TEACHING_RESPECTS_CALIBRATION_GATE = true`. Ratings stay frozen until the active configuration
clears kappa > 0.6 against a human-labelled gold set, exactly as matches do. Teaching introduces
a second scored surface, so it inherits the gate rather than working around it: an uncalibrated
scorer writing to a progression ladder corrupts it silently and unrecoverably.

The gate is evaluated by calling `assertJudgeCalibrated`, the same function the match loop
calls. The threshold is not restated in this module and cannot drift from it. An ABSENT report
is a failed gate, not a skipped one.

Where this differs from `settleMatch`, which throws: a teaching session with a frozen rating is
still a complete, useful session. The avatar attempted, the player saw the specific failure, the
stage moved. So the gate returns `noSettleReason: 'not_calibrated'` and withholds exactly one
write, the one to `theta`.

`lessons_taught` moves while the gate holds, because the stage moved and
`user_avatars_untaught_pairing_sits_at_origin` requires a pairing at stage 1 to have zero
lessons. The cost is one observation of K decay that did not move theta. The alternative is a
progress bar that lies.

---

## 6. Scoring

The avatar's answer is checked against `items.answer` by the rule the closed ladders already
encode:

```
{ "mode": "exact",  "primary": "泳いで", "accept": ["泳いで", "およいで"] }
{ "mode": "choice", "correct": "は" }
```

An answer is correct when it is one of the authored strings. The `accept` array IS the tolerance
mechanism, and it carries the content author's judgement one item at a time.

Two normalisations and no more: Unicode NFC, and trimming the ends. No case folding, no
punctuation stripping, no edit distance, no kana folding. Each of those is a judgement about
what counts as the same answer, the seed already expresses those judgements in `accept`, and a
normaliser here would overrule them for teaching only. Case is not cosmetic in every world
either: German `sie` and `Sie` are different words.

`answer-key.ts` currently lives under `src/lib/teaching/` because there is no TypeScript grader
anywhere else yet: FORGE and RECALL reach a result through the comparative judge, and
`items.answer` is read by nothing in `src/`. The moment a closed ladder grades in TypeScript,
the two must become one shared module. **Move it, do not duplicate it.**

`AttemptResult.saidItUnderstood` is never consulted for score. A low-candour avatar is expected
to misreport it, and a ladder that can be talked up is not a ladder.

---

## 7. A worked example, end to end

Item `ja-forge-conj-oyogu-te`. Task: **Write the て form of 泳ぐ (およぐ).** Answer key:
`{"mode":"exact","primary":"泳いで","accept":["泳いで","およいで"]}`.

Avatar: **Vane**, candour 0. `COMPOSITE_READINGS.bluffs` fires, which is the point: a confident
wrong answer is the interesting failure.

### The good explanation

> ぐ verbs take いで in the て form. The voicing on the ぐ carries into the ending, so it is で and
> not て.
> 泳ぐ becomes 泳いで. Compare 書く, which is a く verb: it takes いて, so 書いて.

### The bad explanation

> For the て form you swap the last kana for いて. 書く becomes 書いて. Same idea for the rest of
> them.

### The two prompts

They are **identical except for the explanation**. Same avatar, same task, same stances, same
house rules, same eighty-three lines around it. That is the design: the only variable between a
score of taught and a score of missed is what the player wrote.

Both carry, in order: the student framing with no language named and no concept named; Vane's
look, hook, bearing and measure derived from the vector; the attempt directives; BOTH taught
stances with the model choosing between them; the explanation verbatim under its own heading;
the task; the output rules; Vane's voice guide; the house rules from `copy.md` §1.

Neither carries: 泳いで, および, the concept `ja-grammar-te-form`, the seed's note about ぐ
carrying its voicing, or any worked example of the te form. `AttemptInput` has no field for any
of them.

### What the avatar does with each

The two prompts above are real: they were generated by `buildAttemptPrompt` from the real Vane
row and are eighty-three and eighty-four lines. What follows is the PREDICTED attempt. No model
call was made, because no key was wired when this was built. Treat the answers below as the
mechanic's designed behaviour, not as an observation.

**Taught well.** The explanation names the rule, names the voicing, and gives the exact verb.
Vane answers **泳いで**. `isCorrectAnswer` matches `primary`. `taught: true`, `teaching_net`
9 to 10, stage holds at Practitioner with one more banked, theta rises by K times the surprise.
Vane takes the credit smoothly and asks for something harder, which is `reactions.taught_well`
doing its job.

**Taught badly.** The explanation gives one worked example, on a く verb, and generalises with
"same idea for the rest of them". The voicing is absent, so the avatar has that gap. Vane is
candour 0 and its `taught_badly` stance is "withhold the fact that you missed it, produce
something confident": it answers **泳いて**, one voicing mark short, with no hedge attached.

`isCorrectAnswer` finds 泳いて in neither `primary` nor `accept`. `taught: false`. `teaching_net`
9 to 8, stage holds at Practitioner one step lower. `saidItUnderstood` comes back **true** and is
recorded and ignored: the row carries `attempt_said_understood = true` beside
`was_correct = false`, which is the pair a later reader wants.

The player is shown 泳いて. That is the whole argument for this mechanic over a graded rubric:
they are not told their explanation was incomplete, they are shown the exact character their
explanation failed to produce.

---

## 8. What is recorded

`teaching_sessions`, append-only, one row per graded attempt: the concept, the avatar, the
explanation verbatim, the attempt, whether it was correct, stage and counter before and after,
theta before and after, and the model plus both config versions.

A row exists **exactly when an attempt was graded**. `explanation_empty` and `attempt_failed`
record nothing, because neither has anything to attribute a scoring change to, and an outage is
not a miss. `already_settled` means the row is already there. So `no_settle_reason` is either
null or `'not_calibrated'`.

Append-only is enforced three ways: no client write policy or grant, a BEFORE UPDATE OR DELETE
trigger that raises and binds `service_role` too, and a unique index on
`(user_id, world_slug, avatar_slug, item_id, taught_at)`. `taught_at` is derived from the session
and never from a clock; a wall-clock value would make that index decorative. Same rule as
`review_log`'s `(card_id, review_time)`.

---

## 9. Open, and where it is written down

* **The model's prior is unmeasured.** §2. It is the floor under every score.
* **No attempt has been run against a live model.** `runAttempt` is covered through a seam in
  `attempt.test.ts` (prompt slot, field order, option constraint, error mapping) and never
  against Anthropic. §7's answers are predicted.
* **`scripts/content/verify-teaching.sql` has never run.** Docker was down when this was built.
  The migration was checked against the real Postgres grammar with `pgsql-parser`, SQL and
  plpgsql bodies both, and nothing beyond that.
* **`scripts/content/verify-avatars.sql` step 9 now fails.** It sets `stage = 4` without a
  counter, and `user_avatars_stage_matches_net` rejects that. It needs `teaching_net = 9`
  beside it. That script is outside this work's ownership and was left alone.
* **The explanation is player-controlled text in a model prompt.** A player cannot see the task,
  so they cannot write the answer into it, but they can write instructions to the model. The
  contract does not address this.
* **`AttemptInput` carries the trait vector twice**, on `avatar.traits` and beside it as
  `traits`. `buildAttemptPrompt` throws when the two disagree rather than picking a winner. If
  one of them was meant to be a tuning override, the contract should say so.
