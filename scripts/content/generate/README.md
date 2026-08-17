# Item candidate generation

The generation half of a generate-and-filter pipeline for the FORGE item bank. It ends at
`out/candidates.jsonl`. It does not write to the database, and measuring p0 belongs to the harness
that owns `src/lib/teaching/`.

## Why it exists

`docs/research/06-model-prior.md` measured the seeded bank of 40 items. With a contentless
explanation the avatar still answered 88.5 percent of them correctly, and 31 of 40 sat at p0 = 1.00.
On those items the teaching score is a constant, so it ranks a player who types filler the same as
a player who teaches well.

One item behaves: `ja-forge-conj-shizuka-past`. It works because the model's instinct, 静かかった,
is wrong and the key is 静かだった. That is the design rule this pipeline is built on. An item
teaches only where the model's most likely answer is wrong, so every candidate here carries a
`lure`: the wrong answer the family predicts a model will reach for. An item with no credible lure
is thrown away before it costs a measurement.

## Running it

```bash
cd scripts/content
uv venv .venv --python 3.12
uv pip install --python .venv/bin/python \
  datasets sudachipy sudachidict-core spacy anthropic python-dotenv
uv pip install --python .venv/bin/python \
  https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl \
  https://github.com/explosion/spacy-models/releases/download/es_core_news_sm-3.8.0/es_core_news_sm-3.8.0-py3-none-any.whl
uv pip install --python .venv/bin/python transformers torch fugashi unidic-lite

cd generate
../.venv/bin/python stage1_seed.py
../.venv/bin/python stage2_generate.py --scale 1.0 --per-call 6 --concurrency 12
../.venv/bin/python stage3_filter.py --concurrency 12
```

`ANTHROPIC_API_KEY` is read from the process environment, falling back to the repo's `.env.local`.
Stages 2 and 3 call the Anthropic API. Stage 1 and the deterministic gates of stage 3 do not.

Useful flags:

| Flag | Stage | Effect |
| --- | --- | --- |
| `--scale 0.01` | 2 | a cheap smoke run over every family |
| `--only naadj-crossover,ser-estar` | 2 | regenerate one or two families |
| `--no-adjudication` | 3 | deterministic gates only, no API calls |
| `--no-classifier` | 3 | skip the JLPT model, fall back to list membership |
| `--ja-unknown-budget`, `--cefr-slack`, `--jlpt-slack` | 3 | how tight the level gate is |

## The stages

### Stage 1, `stage1_seed.py`

Pulls level-labelled vocabulary and text off the Hugging Face Hub and writes `out/seeds.jsonl`
(one graded seed per line, carrying the dataset it came from) and `out/lexicon.json` (per language,
the words attested at each level, which is what the stage 3 level gate reads). Which datasets
loaded and which did not is recorded in `out/lexicon.json` under `datasets`, so the write-up comes
off the run rather than off memory.

### Stage 2, `stage2_generate.py`

One Claude Haiku call per batch. The model id is `claude-haiku-4-5`, matching
`src/lib/teaching/attempt.ts`, so the model that writes the item is the model that will later
attempt it.

Every call carries one **divergence family** from `families.py`. A family names a specific place
where a learner's instinct and a model's instinct come apart, gives a worked exemplar, and demands
a `lure`. The families are:

| World | Family | The divergence |
| --- | --- | --- |
| ja | `naadj-crossover` | i-adjective inflection applied to a na-adjective, the 静か template |
| ja | `godan-lookalike` | a godan verb whose -いる or -える ending looks ichidan |
| ja | `te-voicing` | 泳いで against 泳いて, one dakuten apart |
| ja | `particle-context` | the frequent particle is wrong in this sentence |
| ja | `irregular-verb` | an irregular form where the regular one is well formed and wrong |
| ja | `transitivity-pair` | transitivity forced by が against を rather than by meaning |
| ja | `rendaku-blocked` | rendaku blocked by Lyman's Law |
| en | `article-sound` | a or an chosen by the letter rather than by the sound |
| en | `preposition-verb` | a fixed preposition against first-language transfer |
| en | `countability-context` | a noun that counts in one sense and not in another |
| en | `irregular-participle` | the past form standing in for the participle |
| en | `stress-doubling` | the doubling rule stated without its stress condition |
| en | `plural-f-exception` | the f to ves rule applied to a noun that keeps its f |
| en | `capitals-interference` | categories English capitalises and other languages do not |
| es | `ser-estar` | the copula the adjective usually takes is the wrong one here |
| es | `preterite-irregular` | a strong preterite against the regular ending |
| es | `stem-change-preterite` | the -ir stem change confined to the third person |
| es | `gender-exception` | agreement against the gender the ending advertises |
| es | `por-para` | por and para where the school gloss picks the wrong one |
| es | `accent-minimal-pair` | one accent separating two real words |
| es | `gustar-agreement` | agreement with the object rather than with the person |

The model returns a compact record through a tool. Python assembles the `prompt` and `answer`
jsonb, so those shapes are correct by construction rather than by the model's care.

### Stage 3, `stage3_filter.py`

Seven gates, cheapest first, every drop recorded with a reason in `out/rejected.jsonl` and counted
in `out/funnel.json`.

| Gate | What it checks |
| --- | --- |
| A shape | required fields, the `items_external_id_shape` regex, no collision with the 40 seeded items by id or by content |
| B answer key | choice: the correct option is among the options and the lure is a different option. exact: primary is in accept and **the lure is not accepted**. A distractor the key happens to accept would punish a player who taught well |
| C well formed | the answer is not readable off the material, a sentence item has a blank, a word item is a word, the script matches the world |
| D morphology | SudachiPy for Japanese, spaCy for English and Spanish. Is the answer actually a form of the target, and is the target in the word class the family needs |
| E level | vocabulary membership against the stage 1 lists, plus `bennexx/cl-tohoku-bert-base-japanese-v3-jlpt-classifier` on Japanese surfaces |
| F duplicates | exact and near duplicate within the batch, by character or word shingle overlap inside a family |
| G adjudication | one Haiku call per survivor at temperature 0: is the answer right, is a second answer defensible, is any distractor also acceptable, is the level honest |

### Gate G is a correctness gate, not a quality nicety

The p0 filter in `docs/research/09-prior-filter.md` keeps items the avatar answers **wrong** without
teaching. Take an item whose key says は where the truth is が:

* the avatar answers が, which is right in reality
* it is scored against the key, so it is marked wrong
* every sample misses, p0 = 0.0, Wilson upper bound 0.161, top of the eligible list
* it enters the bank, a player teaches が correctly, and the player is marked wrong

A broken key is not merely invisible to the p0 filter. It outscores a correct item, so the filter
**selects for it**. That is why gate G runs before anything is measured, and why an item it never
judged cannot leave through the main file.

## Output

Stage 3 writes two item files and the split is the safety property:

| File | Contents | Safe to measure |
| --- | --- | --- |
| `out/candidates.jsonl` | items gate G judged and passed, every row `eligible_for_prior: true` | yes |
| `out/candidates.pending.jsonl` | items gate G never returned a verdict on, every row `eligible_for_prior: false` | **no** |

A consumer that reads `candidates.jsonl` is correct by default. A consumer that reads
`eligible_for_prior` is correct whichever file it opened. There is no way to read the main file and
silently measure something unverified. Rerunning stage 3 moves rows from pending to eligible as
verdicts arrive; the cache means it only pays for what is still missing.

One JSON object per line, ready for an ingestion step someone else owns:

```json
{
  "external_id": "ja-forge-gen-naadj-crossover-shizuka-past-1a2b3c4d",
  "world_slug": "ja",
  "ladder_slug": "forge",
  "kind": "conjugation",
  "prompt":  { "kind": "glyph", "task": "...", "glyph": "...", "reading": "...", "instruction": "...", "input": { ... } },
  "answer":  { "mode": "exact", "primary": "...", "accept": ["..."], "note": "..." },
  "target_level": "N5",
  "source_dataset": "Highgroundbkk/anki-words",
  "generation_rationale": "na-adjective inflected as an i-adjective",
  "divergence_family": "naadj-crossover",
  "lure": "静かかった",
  "rubric_version": "forge@1",
  "constraint_text": "PLAIN PAST",
  "time_limit_ms": 25000,
  "cold_start_beta": -0.3,
  "source": "loxelingo-generated-v1",
  "license": "proprietary",
  "is_active": true,
  "adjudicated": true,
  "eligible_for_prior": true
}
```

Notes for whoever ingests these:

* `external_id` is `{world}-forge-gen-{family}-{subject}-{hash}`. The `gen` segment appears in no
  seeded id, so the two sets cannot collide. The hash covers the task text and the answer, so the
  same item regenerated gets the same id and any edit to either field gets a new one.
* `lure` is repeated at the end of `answer.note`, because the p0 harness needs the prediction it is
  testing and `note` is the field that travels with the row. `lure` is a guess the generating model
  made about its own errors, not a measurement. The p0 run can convert it into one by recording how
  often the avatar's wrong answer actually equals it; low agreement means the divergence families
  should be reweighted on measured p0 rather than on predicted divergence.
* `eligible_for_prior` is the field to filter on. It is false exactly when gate G returned no
  verdict, and an item in that state has an unverified answer key.
* Three `kind` values are new and all three are Spanish, where the bank has no forge items yet:
  `copula_choice`, `gender_agreement`, `accent_mark`. Nothing in `src/` switches on `items.kind`;
  the renderer switches on `prompt.kind`, which stays `brief` or `glyph`.
* `target_level`, `source_dataset`, `generation_rationale`, `divergence_family` and `lure` have no
  column in `public.items` yet. They are carried on the JSONL for the schema owner to place.

Side files: `out/rejected.jsonl` (every drop with its reason), `out/funnel.json` (the counts behind
`docs/research/08-item-generation.md`), `out/adjudication.jsonl` (the raw gate G verdicts),
`out/seeds.jsonl` and `out/lexicon.json` (stage 1).

`existing_bank.json` is a read-only snapshot of the 40 seeded FORGE items, used by gate A to refuse
a candidate that restates one. Refresh it with:

```bash
docker exec -i supabase_db_loxelingo psql -U postgres -At -c \
  "select jsonb_agg(jsonb_build_object('external_id',external_id,'world_slug',world_slug,'kind',kind,'surface',coalesce(prompt->>'glyph',prompt->>'brief'),'answer',coalesce(answer->>'primary',answer->>'correct'))) from items where ladder_slug='forge';" \
  > existing_bank.json
```
