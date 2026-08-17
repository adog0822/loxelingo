# 08: Generating items whose default answer is wrong

`docs/research/06-model-prior.md` measured the seeded FORGE bank and found the teaching score
measuring the model rather than the player: p0 = 0.885 across 40 items, 31 of them at p0 = 1.00.
One item behaves, `ja-forge-conj-shizuka-past`, and it behaves because the model's instinct
(静かかった) is wrong and the key is the other answer. `docs/research/07-injection.md` closed with
the same sentence: building items whose default answer is the wrong one is the work that decides
whether the teaching score measures teaching.

This document is the generation half of a generate-and-filter pipeline built on that rule. It ends
at a file of candidates. Measuring p0 belongs to the harness that owns `src/lib/teaching/`, and
nothing here writes to the database.

The pipeline is `scripts/content/generate/`, three stages, runnable end to end. Its README states
how to run it and what each stage does.

## Headline

**5400 items were generated across two rounds and 2208 survive to
`scripts/content/generate/out/candidates.jsonl`.** Every one carries a `lure`: the wrong answer its
divergence family predicts the model will reach for. The bank splits 854 Spanish, 738 English,
616 Japanese, and 1284 of the 2208 are multiple choice.

The honest caveat sits in the last gate. 988 of the 2208 were kept without being adjudicated,
because the Anthropic API rate-limited the run and an item that could not be checked is not an item
known to be broken. Those rows carry `adjudicated: false` and rerunning stage 3 picks them up from
the verdict cache.

## Stage 1: which datasets loaded

Twelve dataset loads were attempted and twelve succeeded. Two of the names in the brief resolve to
something other than a Hub dataset id and are recorded as substitutions rather than as loads.
Counts below are the rows the loader returned and the seeds kept after filtering to the target
levels and deduplicating on surface form.

| Dataset | Rows | Seeds kept | Note |
| --- | --- | --- | --- |
| `Highgroundbkk/anki-words` | 478 | 326 | JLPT-tagged; kept N5 and N4 |
| `xqt/jlpt_n5_vocabulary_tagged` | 653 | 368 | the default `load_dataset` raises `DatasetGenerationCastError` because it concatenates every CSV in the repo into one schema. Loaded per-file and joined on `word_id` |
| `jpercommunity/JLPT-wordlist` `sources/n5.csv` | 718 | 176 | same per-file workaround |
| `jpercommunity/JLPT-wordlist` `sources/n4.csv` | 668 | 551 | |
| `xqt/synthetic_jlpt_n5_kanji_questions` | 80 | 79 | N5 sentences around a target kanji |
| `akira-sasaki/nihongo-dojo-beginner-10k` | 10000 | 24 | Nihongo DoJo beginner. Filtered to `type=kanji_reading` at school grade 3 or below; almost all of what remained was already covered by the JLPT lists |
| `Alex123321/english_cefr_dataset` | 18995 | 3917 | the `english_cefr_dataset` named in the brief; CEFR level and POS per word |
| `UniversalCEFR/cefr_sp_en` | 10004 | 1200 | capped at 1200 sentence seeds |
| `star092304/CEFR-Annotated-WordNet` | 104665 | 4640 | CEFR-Annotated WordNet. Stored as a rater chat template, so the word and the label are parsed out of the prompt and the reply. Sense-level, so the minimum level per word is what enters the inventory |
| `UniversalCEFR/hablacultura_es` | 713 | 304 | |
| `UniversalCEFR/caes_es` | 31149 | 7196 | learner Spanish, level-labelled |
| `UniversalCEFR/kwiqiz_es` | 206 | 0 | loaded cleanly and contributed nothing. 108 of its rows are in the A1 to B1 window, but `caes_es` is read first and had already filled the 2500-texts-per-level cap. Raising `--es-texts-per-level` would pull it in |

**14,888 seeds** were written, at 855 N5, 669 N4, 689 A1, 1844 A2, 2584 B1 for English, and
3512 A1, 2676 A2, 2059 B1 for Spanish.

Substitutions and failures, stated plainly:

* **`open-anki-jlpt-decks` is not on the Hub.** The name resolves to a GitHub project rather than a
  dataset id, and `huggingface.co/api/datasets/open-anki-jlpt-decks` returns 401 because
  `open-anki-jlpt-decks` is read as an org. `jpercommunity/JLPT-wordlist` was substituted: same Anki
  deck lineage, one CSV per JLPT level, 718 N5 and 668 N4 entries.
* **`UniversalCEFR` is an org, not a dataset.** Its 505,807 CEFR-labelled texts are spread across
  per-language repositories. Three Spanish ones and the English one were loaded by name.
* **`jennifertec/cefr-english-teaching-corpus` is gated** and returns
  `DatasetNotFoundError: is a gated dataset on the Hub`. No substitute was needed because
  `Alex123321/english_cefr_dataset` and CEFR-Annotated WordNet already cover English word levels.
* **MERLIN is on the Hub only as `UniversalCEFR/merlin_de`, `merlin_it` and `merlin_cs`.** There is
  no Spanish or English MERLIN arm, so it contributes nothing to the three target languages and was
  left out.
* **No CEFR-graded Spanish word list exists on the Hub.** Searches for Spanish CEFR vocabulary
  return nothing usable. The Spanish level inventory is therefore built by attestation: lemmatise
  the level-labelled UniversalCEFR Spanish corpora with spaCy and record the earliest level a lemma
  appears at. This is a weaker instrument than the English word lists and the report says so
  wherever a Spanish level number depends on it.

## Stage 2: adversarial generation

Model `claude-haiku-4-5`, matching `TEACHING_MODEL` in `src/lib/teaching/attempt.ts`. The model
that writes the item is the model that will later attempt it, which is deliberate: the generator is
asked for the form the attempting model would reach for first, and stage 4 then measures whether
that guess was right.

Generation is organised around **21 divergence families**, each naming one place where a learner's
instinct and a model's instinct come apart, each carrying a worked exemplar and a demand for a
`lure`. 静か is the template and `naadj-crossover` is its direct generalisation. A family with no
credible lure produces items that die in stage 3 by construction.

Two rounds were run with different random seeds, because the first round showed the tight families
saturating.

| | Calls | Items requested | Unique after id dedup | Tokens in / out | Wall clock |
| --- | --- | --- | --- | --- | --- |
| Round 1 | 503 | 3000 | 2487 | 1,246,630 / 642,077 | 300s |
| Round 2 | 403 | 2400 | 2035 | 998,245 / 515,842 | 259s |
| Merged | 906 | 5400 | **4266** | 2,244,875 / 1,157,919 | 559s |

Zero calls failed in either round. The `external_id` is a content hash over the task text and the
answer, so 878 of the 5400 were exact regenerations of an item the same run had already produced
and collapsed to one row on the way out. Cross-round overlap accounts for a further 256.

## Stage 3: the funnel

Seven gates on the merged 4266, cheapest first.

| Gate | What it checks | Kept | Lost |
| --- | --- | --- | --- |
| generated | merged unique candidates | 4266 | |
| A shape | required fields, the `items_external_id_shape` regex, no collision with the 40 seeded items by id or by content | 4202 | 64 |
| B answer key | the correct option is among the options, primary is in accept, and the lure is not accepted | 4097 | 105 |
| C well formed | the answer is not readable off the material, a sentence item has a blank, a word item is a word, the script matches the world | 3892 | 205 |
| D morphology | SudachiPy for Japanese, spaCy for English and Spanish | 3714 | 178 |
| E level | vocabulary membership against the stage 1 lists, plus the JLPT sentence classifier | 3239 | 475 |
| F duplicates | exact and near duplicate inside a family | 2604 | 635 |
| G adjudication | Haiku at temperature 0 on the item and its key | **2208** | 396 |

**2208 of 4266 survive, 51.8 percent. Against the 5400 items actually generated, 40.9 percent.**

Drop reasons, most frequent first:

| Count | Reason |
| --- | --- |
| 618 | `f1_exact_duplicate` |
| 310 | `e2_jlpt_classifier_above_target` |
| 241 | `g1_stated_answer_is_wrong` |
| 150 | `e3_en_vocabulary_above_target_level` |
| 97 | `c2_answer_appears_in_the_material` |
| 96 | `d8_te_voicing_target_is_not_godan` |
| 76 | `g4_above_the_stated_level` |
| 73 | `b2_lure_is_accepted_by_the_key` |
| 63 | `a5_restates_a_seeded_item` |
| 60 | `c4_glyph_item_carries_a_sentence` |
| 51 | `d2_answer_is_not_a_form_of_the_target` |
| 47 | `c1_em_dash_in_copy` |
| 45 | `g2_second_defensible_answer` |
| 34 | `g3_distractor_is_also_correct` |
| 30 | `d9_answer_lemmatises_to_a_different_word` |
| 28 | `b4_duplicate_options` |
| 17 | `f2_near_duplicate` |
| 10 | `e3_es_vocabulary_above_target_level` |
| 5 | `e1_japanese_vocabulary_outside_n5_n4` |
| 3 | `b3_wrong_option_count` |
| 1 each | `a1_missing_field`, `b5_correct_not_among_options`, `c6_japanese_answer_without_japanese_script`, `d6_target_is_not_godan` |

Five of those are worth reading closely.

**Duplication is the single biggest loss and it is structural rather than sloppy.** 618 exact
duplicates plus the 878 collapsed inside stage 2 mean roughly a quarter of everything generated was
a restatement. The families it concentrates in are the ones whose target list is a closed set:
`stem-change-preterite` lost 125 to duplication, `irregular-participle` 135, `preterite-irregular`
106. There are only so many Spanish -ir stem changers at B1. Volume in those families is bounded by
the language and not by the budget.

**The JLPT classifier is the second biggest loss and it is partly an artefact.**
`bennexx/cl-tohoku-bert-base-japanese-v3-jlpt-classifier` loaded and behaves sensibly on sentences
(猫が好きです → N5, この問題は極めて複雑な様相を呈している → N2), but it is being asked about
single words in the word families, which is off its training distribution. It is already read with
one level of slack, so an N4 verdict on an N5 item passes and only N3 and above drops. Even so it
accounts for 78 drops in `naadj-crossover` and 61 in `godan-lookalike`. Part of that is real: the
supply of N5 and N4 na-adjectives and ichidan-shaped godan verbs is small, so the generator reaches
past the level for variety. Part of it is the classifier guessing on fragments. `--jlpt-slack` is
the dial.

**241 items were judged wrong by the same model that wrote them.** That is 15 percent of the 1616
adjudicated, and reading the reasons shows a real split. Some are true defects, such as a
`stem-change-preterite` item whose own note contradicted its key. Some are legitimate disagreements
about whether a second answer is defensible: several `countability-context` items were failed over
whether `some` is acceptable where the key wanted `a`. Those are exactly the items that should die,
because an item with two defensible answers punishes a player who taught well.

**73 items had a lure the answer key would have accepted.** This is the failure the brief names by
hand, caught deterministically before any measurement. A further 34 were caught by adjudication as
distractors that are also correct. 107 items in total would have marked a good explanation wrong.

**47 items carried an em-dash**, 45 of them in `irregular-participle`. That family's worked exemplar
was copied from the seeded item `en-forge-participle-write`, which contains one, and the generator
copied the punctuation along with the shape. The exemplar was fixed between rounds and the second
round produced almost none. It is a small reminder that the exemplar is the strongest instruction in
the prompt.

### Per family

| World | Family | Asked | Kept | Largest single loss |
| --- | --- | --- | --- | --- |
| ja | `naadj-crossover` | 432 | 32 | JLPT classifier (78) |
| ja | `godan-lookalike` | 432 | 26 | JLPT classifier (61) |
| ja | `te-voicing` | 360 | 46 | target is not godan (96) |
| ja | `particle-context` | 540 | **387** | answer judged wrong (70) |
| ja | `irregular-verb` | 216 | 17 | exact duplicate (29) |
| ja | `transitivity-pair` | 108 | 94 | answer judged wrong (6) |
| ja | `rendaku-blocked` | 72 | 14 | JLPT classifier (34) |
| en | `article-sound` | 270 | 186 | vocabulary above level (38) |
| en | `preposition-verb` | 360 | **241** | vocabulary above level (60) |
| en | `countability-context` | 270 | 158 | vocabulary above level (35) |
| en | `irregular-participle` | 270 | 14 | exact duplicate (135) |
| en | `stress-doubling` | 234 | 39 | exact duplicate (78) |
| en | `plural-f-exception` | 108 | 11 | exact duplicate (15) |
| en | `capitals-interference` | 108 | 89 | vocabulary above level (17) |
| es | `ser-estar` | 360 | **252** | answer judged wrong (57) |
| es | `preterite-irregular` | 270 | 56 | exact duplicate (106) |
| es | `stem-change-preterite` | 216 | 20 | exact duplicate (125) |
| es | `gender-exception` | 270 | 172 | duplicate options (23) |
| es | `por-para` | 234 | 145 | answer judged wrong (36) |
| es | `accent-minimal-pair` | 162 | 133 | answer judged wrong (12) |
| es | `gustar-agreement` | 108 | 76 | above the stated level (21) |

The shape of that table is the finding. Sentence families scale and word families do not. A family
whose item is a sentence with a blank has an unbounded supply of frames, so `particle-context` and
`ser-estar` and `preposition-verb` return hundreds. A family whose item is one word off a closed
list saturates in the low tens, whatever the budget.

### Distribution of the 2208

| Cut | Counts |
| --- | --- |
| World | es 854, en 738, ja 616 |
| Level | A2 731, B1 496, N4 405, A1 365, N5 211 |
| Mode | choice 1284, exact 924 |
| Adjudicated | 1220 judged and passed, 988 kept unjudged |
| Provenance | 886 built directly on a named graded seed, 1322 built on a family target list with graded seeds supplying the surrounding vocabulary |

`kind` reuses the taxonomy already in `public.items` wherever one fits. Three values are new and all
three are Spanish, where the bank has no forge items at all: `copula_choice` (252),
`gender_agreement` (172), `accent_mark` (133). Nothing in `src/` switches on `items.kind`; the
renderer switches on `prompt.kind`, which stays `brief` or `glyph`.

## Is adversarial generation producing items likely to have low p0

Partly. Splitting the 2208 by what the item asks the model to do gives three groups, and only two of
them are worth measuring first.

**Group 1, competing answers: 1284 items, all the choice families.** `particle-context` 387,
`ser-estar` 252, `gender-exception` 172, `countability-context` 158, `por-para` 145,
`transitivity-pair` 94, `gustar-agreement` 76. This is the group with the best prior. The one kind
in the seeded bank with real headroom was `particle_choice`, at p0 = 0.56 against a floor of 0.25,
and 06 diagnosed why: the answer turns on a choice the model can be argued out of rather than on a
form it has memorised. Every family here is built the same way. They are also the families where a
correct explanation has something to say, since the rule is contextual and the item cannot be solved
by recall. The floor is the cost: four options means 0.25 by construction, and the p0 harness should
read these against that floor rather than against zero.

**Group 2, the model's default is arguably wrong: 330 items.** `accent-minimal-pair` 133,
`preterite-irregular` 56, `te-voicing` 46, `naadj-crossover` 32, `godan-lookalike` 26,
`stem-change-preterite` 20, `irregular-verb` 17. This is the 静か template and its relatives. The
prior is good in principle and the numbers are small, because these are exactly the families the
language bounds. 32 na-adjective items is not a bank, it is a seed for one. My honest read is that
`naadj-crossover` and `stem-change-preterite` are the two most likely to reproduce the one item that
works, and that `te-voicing` will disappoint: 泳いで was already answered correctly on 4 of 5 vacuous
attempts in 06, so a frontier model has the voicing rule and a minimal pair does not take it away.

**Group 3, expected to die: 594 items.** `preposition-verb` 241, `article-sound` 186,
`capitals-interference` 89, `stress-doubling` 39, `irregular-participle` 14, `rendaku-blocked` 14,
`plural-f-exception` 11. Every one of these sits in a kind that 06 measured at p0 = 1.00 across all
its items: `spelling`, `verb_form`, `capitalisation`, `preposition_cloze`. The items here are harder
than the seeded ones, in that each is a counter-example to an over-general rule rather than a plain
application of a rule. `offering` against `offerring` is a better item than `making` against
`makeing`. But "harder for a learner" and "harder for a frontier model" are different axes, and 06
is unambiguous that this axis is not the one that moves p0. I expect this group to come back at
p0 above 0.9 and I would measure it last, at a small sample, purely to confirm the pattern rather
than to find survivors. `rendaku-blocked` is flagged in `families.py` as expected to die for the
separate reason 06 gives about `kanji_reading`: a reading is a lookup, and there is no explanation
of a reading that does not contain it.

Two things weaken this prediction and both should be said out loud.

**The generator and the attempter are the same model, and the lure is an introspective guess.**
Asking Haiku which wrong answer Haiku would produce is the only version of this question a model can
be asked, and it is not the same as measuring. The lure is a hypothesis carried on the row for stage
4 to test, and the first thing worth computing from the p0 run is how often the avatar's wrong
answer actually equals the `lure`. If that agreement is low, the whole adversarial framing is
weaker than it looks and the families should be reweighted on measured p0 instead of on predicted
divergence.

**A five-sample p0 does not identify an item.** 07 section 8 demonstrated this three times on
`ja-forge-conj-shizuka-past`, which would have been filtered as a perfect discriminator at one
prompt version, discarded as dead at the next, and kept as marginal at the third. With 2208
candidates and roughly 100 samples needed for ±0.1 on a single item, the p0 stage cannot afford to
measure everything at the resolution that would let it rank items. A cheap screening pass at 3 to 5
samples to remove the certain 1.00s, then a deeper pass on what survives, is the shape that fits the
budget. The group split above is a way to order that work.

## What the schema owner needs

`out/candidates.jsonl` carries five fields with no column in `public.items`: `target_level`,
`source_dataset`, `generation_rationale`, `divergence_family` and `lure`, plus `adjudicated` from
gate G. `lure` is also appended to `answer.note`, so the prediction reaches stage 4 even if the
extra fields are dropped on ingestion. `external_id` is
`{world}-forge-gen-{family}-{subject}-{hash}`; the `gen` segment appears in no seeded id, all 2208
match the database's `items_external_id_shape` regex, all 2208 are unique, and none collides with
the 40.

## Reruns

`out/adjudication.jsonl` is a verdict cache keyed by `external_id`, and stage 3 only calls for items
missing from it. Rerunning `stage3_filter.py` finishes the 988 that the rate limit left unjudged
without repaying for the 1616 already done. Gate G also takes a wall-clock budget, so the stage
terminates under rate limiting rather than stalling: under load a single verdict cost minutes of
backoff, and 988 items at that rate would have run for hours.
