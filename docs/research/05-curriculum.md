# 05 — Curriculum Spines and the Content Pipeline (EN / JA / ES)

Research date: 2026-08-15. Author: research agent.

**Purpose.** We hand-authored 60 Japanese and 35 English items with a `cold_start_beta` difficulty
prior. That does not scale and has no external level alignment. Spanish has zero content. This
document answers: what curriculum spine can we legally stand on per language, how do we guarantee a
generated item actually sits at the level it claims, and what does the end-to-end pipeline look like.

## Evidence conventions

- **[R]** = reported, with a source URL. The claim was read from that source.
- **[E]** = estimated / inferred by me. Not verified against a primary source.
- Where a licence is quoted, it is quoted. Where I could not find licence text, I say so rather than
  guessing. **Nothing here is legal advice.** The licensing section is a triage aid for counsel,
  not a substitute for counsel.
- Nothing in this document is application code, per the research remit.

## Reading order

Section 1 (licensing) gates everything else. If you read one section, read Section 1 and the
"Legally clean vs. needs a licence" table in Section 8.

---

# 1. Licensing — what we may actually build on

This is the gating question. The pattern is the same in all three languages: **the authoritative
level framework is a copyrighted publication of a national or intergovernmental body, and the
machine-readable derivative that everyone actually uses is either (a) an academic resource under a
non-commercial licence, or (b) an unattributed scrape of a discontinued official list.** Neither
(a) nor (b) is safe for a commercial product. In each language there is exactly one or two
genuinely commercial-clean options, and those are what we should build the spine from.

## 1.1 Summary table

| Language | Authoritative framework | Machine-readable? | Commercial use | Verdict |
|---|---|---|---|---|
| All | CEFR / CEFR Companion Volume (Council of Europe) | Prose PDF, descriptor tables; not a word list | **No** — all rights reserved, written permission required | Use as *concept*, do not redistribute text |
| EN | Cambridge English Vocabulary Profile (English Profile) | Yes, via EVP Online | **No** — terms forbid commercial use | Blocked |
| EN | **CEFR-J Wordlist v1.6 (TUFS, Tono Lab)** | Yes, Excel/CSV | **Yes**, with acknowledgement | **Use this** |
| EN | Octanove Vocabulary Profile C1/C2 v1.0 | Yes, CSV via GitHub | **Yes**, CC BY-SA 4.0 | **Use this** for C1/C2 tail |
| EN | EFLLex (CEFRLex family) | Yes, TSV | **No** — CC BY-NC-SA 4.0 | Blocked (research comparison only) |
| ES | Instituto Cervantes *Plan curricular* | No — HTML prose inventories | **No** — "Reservados todos los derechos" | Use as *structure inspiration*, do not copy |
| ES | ELELex (CEFRLex family) | Yes, TSV | **No** — CC BY-NC-SA 4.0 | Blocked |
| ES | wordfreq `es` + our own CEFR banding | Yes | **Yes** — Apache (code) / CC BY-SA 4.0 (data) | **Fallback spine** |
| JA | JLPT official kanji/vocab/grammar lists | **They do not exist any more** | n/a | Cannot be licensed; does not exist |
| JA | Pre-2010 出題基準 (Test Content Specification) | Only via third-party scrapes | Out of print, rights with Japan Foundation/JEES | Blocked as a *source*; levels usable as *facts* |
| JA | **JMdict / KANJIDIC2 (EDRDG)** | Yes, XML/JSON | **Yes**, CC BY-SA 4.0, commercial explicitly OK | **Use this** |
| JA | Jōyō kanji by school grade (MEXT 告示) | Yes, in KANJIDIC2 `grade` field | Government notification | **Use this** (see 1.5 caveat) |

## 1.2 CEFR itself (Council of Europe) — the framework is closed, the *idea* is free

[R] The CEFR Companion Volume carries a standard Council of Europe all-rights-reserved notice: "no
part of this publication may be translated, reproduced, or transmitted, in any form or by any means,
electronic (internet, etc.) or mechanical, including photocopying, recording or any information
storage or retrieval system, without prior permission in writing from the Directorate of
Communications". Contact for permission is `publishing@coe.int`.
Source: https://rm.coe.int/common-european-framework-of-reference-for-languages-learning-teaching/16809ea0d4

[R] I found **no** Creative Commons licence on the official CEFR or Companion Volume. Claims that
the CEFR is "open" generally refer to articles *about* it, which are separately CC-licensed.

What this means in practice:

- **Safe:** using the *labels* A1–C2 and the *concept* of a six-level scale. Level names are not
  protectable expression. [E]
- **Safe:** writing our own can-do statements in our own words for our own product.
- **Not safe:** shipping the Council of Europe's descriptor tables, illustrative scales, or
  Companion Volume prose into our database or into an LLM prompt that reproduces them to users.
- **Grey:** paraphrasing descriptors closely enough that the paraphrase is a derivative work. Avoid
  by writing descriptors from our own task inventory, then *mapping* them to a level, rather than
  translating CoE text. [E]

We do not need the CEFR text. We need a defensible six-band scale plus per-language word/grammar
inventories. Those come from the resources below.

## 1.3 English — English Vocabulary Profile is blocked; CEFR-J is the answer

**English Vocabulary Profile / English Profile (Cambridge). BLOCKED for commercial use.**

[R] The English Profile terms of use "do not allow other organisations to promote commercial
materials as 'English Profile informed' or allow the use of the English Vocabulary Profile for
commercial purposes." The resource is copyright Cambridge University Press.
Source: https://englishprofile.org/?menu=english-vocabulary-profile
(Note: I could not extract the full verbatim Terms of Use page body through the fetch tool — the
page is JS-rendered. The restriction above is consistently reported. **Action: have someone open
the EVP Terms of Use in a browser and archive the exact text before we rely on the negative.**)

There is a paid/negotiated route: Cambridge licenses dictionary and profile data commercially via
https://dictionary.cambridge.org/license.html [R]. If EVP alignment turns out to be a sales
requirement (e.g. a school district asks "is this Cambridge-aligned?"), that is a commercial
conversation, not a technical blocker. Budget unknown. [E]

**CEFR-J Wordlist v1.6 (Tono Laboratory, Tokyo University of Foreign Studies). COMMERCIAL-CLEAN.**

[R] "The copyright of this wordlist belongs to Tono Laboratory at TUFS, but the list can be used for
both research and commercial purposes with a proper acknowledgement of the source."
Source: http://www.cefr-j.org/download_eng

- Current version 1.6, dated 2020-03-24, distributed as a ZIP (Excel/CSV inside). [R]
- Required attribution format: "The CEFR-J Wordlist Version [X]. Compiled by Yukio Tono, Tokyo
  University of Foreign Studies." Plus version number, download URL, and access date. [R]
- Covers CEFR-J levels roughly A1–B2. CEFR-J subdivides A1 into A1.1/A1.2/A1.3 and A2 into
  A2.1/A2.2 etc., which is *more* granular than we need and maps down cleanly. [E]

**Important caveat on the same page:** the **CEFR-J Grammar Profile and Text Profile are NOT on the
same terms.** [R] They are available for research and educational use, and "In the case of
commercial use, the necessary expenses will be charged after separate consultation."
Source: http://www.cefr-j.org/download_eng

So: **Wordlist and Can-Do Descriptors = commercial OK. Grammar Profile = must negotiate.** This
matters because our grammar spine is the part we most wanted to borrow. Plan for writing our own
grammar spine (Section 2) or paying for the Grammar Profile.

**Octanove Vocabulary Profile C1/C2 v1.0. COMMERCIAL-CLEAN.**

[R] Distributed in https://github.com/openlanguageprofiles/olp-en-cefrj alongside the CEFR-J
Vocabulary Profile v1.5 and CEFR-J Grammar Profile v20180315. The Octanove list "can be used under a
Creative Commons Attribution-ShareAlike 4.0 International License". The repo restates the CEFR-J
terms as "can be used for research and commercial purposes with no charge, provided that you cite
the dataset properly. The copyright belongs to Tono Laboratory at TUFS."

Two cautions on this repo:
1. It ships CEFR-J **v1.5**; the official site is on **v1.6**. Prefer the official download. [R]
2. It ships the CEFR-J **Grammar Profile**, whose official page says commercial use requires paid
   consultation. A GitHub repo restating terms is not a grant from the rightsholder. **Do not treat
   the repo's blanket "research and commercial" line as covering the Grammar Profile.** [E]
   This is exactly the "it is on GitHub is not a licence" trap.

**EFLLex (CEFRLex). BLOCKED.** See 1.4 — same CC BY-NC-SA 4.0 family licence as ELELex.

**Also-rans, all copyrighted, all free-to-read but not free-to-redistribute:** Cambridge English
KET/PET vocabulary list PDFs (© Cambridge), Oxford 3000/5000 CEFR-aligned lists (© Oxford University
Press), Pearson Global Scale of English Teacher Toolkit (© Pearson). All are usable as a *sanity
check a human performs*, none are usable as a table we ship. [E]

## 1.4 Spanish — the authoritative source is closed and the best open resource is non-commercial

**Instituto Cervantes *Plan curricular del Instituto Cervantes* (Niveles de referencia para el
español). BLOCKED for redistribution.**

[R] The inventories (including *Nociones específicas*, the lexical inventory, split A1-A2 / B1-B2 /
C1-C2) are published free-to-read on the Centro Virtual Cervantes under "Reservados todos los
derechos" — all rights reserved.
Sources:
- https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/09_nociones_especificas_inventario_a1-a2.htm
- https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/09_nociones_especificas_inventario_b1-b2.htm
- https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/09_nociones_especificas_inventario_c1-c2.htm

[R] The *Nociones específicas* inventory is explicitly described by Cervantes as an **open,
orientative** inventory ("inventario abierto", "carácter orientativo") that teachers adapt per level
and per student. Source: https://cvc.cervantes.es/ensenanza/biblioteca_ele/plan_curricular/niveles/09_nociones_especificas_introduccion.htm

That last point is strategically useful. The *Plan curricular*'s value to us is its **topic and
notional taxonomy** (individual identity, food, health, travel, work, ...), not its exact word
lists. A taxonomy of everyday topics is close to unprotectable fact/idea; the specific selection and
arrangement of Cervantes' inventory is protected expression. [E] So:

- **Safe:** reading the *Plan curricular* to decide that our Spanish A1 should cover greetings,
  numbers, family, food, and the present tense of regular verbs.
- **Not safe:** ingesting the *Nociones específicas* HTML into a table and calling it our A1 lexicon.

**ELELex (CEFRLex, UCLouvain CENTAL). BLOCKED for commercial use.**

[R] "This work is licensed under a Creative Commons Attribution-NonCommercial-ShareAlike 4.0
International License." Distributed as a single `ELELex.tsv`, no registration required.
Source: https://cental.uclouvain.be/cefrlex/elelex/download/

This is genuinely painful, because ELELex is exactly what we want: [R] a CEFR-graded lexicon giving,
per lemma + POS, the normalised frequency distribution across A1–C2, estimated from a corpus of
**pedagogical materials for Spanish as a foreign language** — textbooks and graded readers. The
CEFRLex family averages ~13,000 lexical entries per language, including multi-word lemmas.
Sources: https://cental.uclouvain.be/cefrlex/ and https://cental.uclouvain.be/cefrlex/elelex/

The NC clause kills it for a commercial product. Two legitimate routes remain:
1. **Ask CENTAL for a commercial licence.** Academic groups frequently grant these. Low cost, high
   value, worth an email before we build the fallback. [E]
2. **Build our own banding** from wordfreq `es` + a hand-curated A1/A2 core (Section 4/8 fallback).

**Note on the CEFRLex family generally:** DAFlex (German), EFLLex (English), FLELex (French),
NT2Lex (Dutch), SVALex/SweLLex (Swedish), ELELex (Spanish). [R] Same project, and the download
terms I verified on ELELex are CC BY-NC-SA 4.0. I did **not** individually verify each sibling's
licence page; assume NC across the family until checked. [E]

**DELE (Diplomas de Español como Lengua Extranjera).** Instituto Cervantes publishes free
**specifications and model exams (modelos de examen)** per level. These are copyrighted works of the
Instituto Cervantes. [E] Same posture as AP/TOEFL/IELTS in Section 6: read the *specification* to
learn what a B1 task looks like; do not train on or reproduce the papers.

## 1.5 Japanese — the official list does not exist, and that changes the problem

**The single most important fact for Japanese:**

[R] Since the 2010 JLPT revision, **the Japan Foundation / JEES publish no official kanji,
vocabulary, or grammar list for any level.** The pre-2010 *Test Content Specification* (出題基準) has
been withdrawn; the stated rationale is that the goal of study is communication, not memorising
lists. Every "JLPT N3 vocabulary list" on the internet is a third-party reconstruction from the
pre-2010 specification plus observed frequency in recent papers.
Source: https://www.jlpt.jp/sp/e/faq/

This inverts the licensing question. **There is no official list to license.** We therefore cannot
truthfully claim "official JLPT alignment" no matter what we buy, and neither can any competitor.
What we can claim is "JLPT-style levelling", which is what WaniKani, Bunpro, jpdb and everyone else
actually ships. [E] Marketing copy should say "aligned to commonly-used JLPT N5–N1 bands" and not
"official JLPT vocabulary".

**JMdict / KANJIDIC2 (Electronic Dictionary Research and Development Group). COMMERCIAL-CLEAN.**

[R] Both JMdict and KANJIDIC2 are made available by the EDRDG under **Creative Commons
Attribution-ShareAlike 4.0 International**. There is no restriction on commercial use; the files may
be bundled with software and sold, and software using them need not be open-source. The core
condition is attribution and not claiming copyright over the material.
Sources: https://www.edrdg.org/edrdg/licence.html and https://www.edrdg.org/edrdg/license.html

[R] KANJIDIC2 carries a `<misc>` `jlpt` field with values **1 (most advanced) to 4 (most
elementary)** — the **old** four-level JLPT scale — absent for kanji not required at any level.
KANJIDIC2 documentation itself notes the 2010 change to N1–N5 and that "no official kanji lists are
available for the new levels", with old level 2 splitting across N2 and N3.
Source: https://www.edrdg.org/kanjidic/kanjidic2_dtdh.html

So KANJIDIC2 gives us a **legally clean but coarse and stale** kanji difficulty signal: 4 bands, not
5, frozen pre-2010. Usable as a prior, not as ground truth. The old→new mapping is roughly
4→N5, 3→N4, 2→N3/N2 (ambiguous), 1→N1. [R for the split, E for the rest of the mapping]

[R] KANJIDIC2 also carries a `grade` field: the Japanese school grade (1–6 for kyōiku kanji, 8 for
the remaining jōyō kanji, 9/10 for jinmeiyō). This is a much better-defined, non-stale ordering than
the frozen `jlpt` field, and it comes from a Japanese government notification (MEXT 常用漢字表 告示).
Source: https://www.edrdg.org/kanjidic/kanjidic2_dtdh.html

[E] **Caveat I did not verify:** Japanese copyright law excludes laws, regulations and public
notices of state organs from copyright protection (Art. 13). A MEXT 告示 (kokuji) plausibly falls in
that class, which would make the jōyō kanji grade assignment itself uncopyrightable fact. **I did
not verify Article 13's exact scope and I am not qualified to.** In practice this is moot: we get
the same data through KANJIDIC2 under CC BY-SA 4.0, which is a clean grant either way. Take the
KANJIDIC2 route and the constitutional question never arises.

**Third-party JLPT lists (tanos.co.uk, jlptsensei.com, jlpt-vocab-api, various GitHub repos).
BLOCKED / UNSAFE.** These are the reconstructions described above. Typical terms are "free for
personal use" or nothing at all; a GitHub repo with an MIT licence on the *code* says nothing about
the provenance or licence of the *data* it ships. [E] Ingesting these is the highest-risk,
lowest-reward move available to us, because the underlying arrangement traces back to a withdrawn
Japan Foundation publication.

**Japan Foundation JF Standard for Japanese-Language Education (JF日本語教育スタンダード).** This is
the Japan Foundation's own CEFR-aligned framework, with a Can-do database (みんなのCan-doサイト).
[E] I did not verify its terms of use in this pass; access historically requires registration.
**Gap — worth 15 minutes.** If its can-do statements were licensable, it would be the cleanest
JA↔CEFR bridge available and would let us run one unified six-band scale across all three languages.

**Tatoeba.** [E] Sentence corpus, CC BY 2.0 FR on the sentence collection, per-sentence
contributions. Useful for example sentences in all three languages. I did not re-verify the licence
this pass; it is well-established and low-risk, but confirm before shipping.

## 1.6 Section 1 verdict

We can build a commercially clean spine for **English** (CEFR-J Wordlist + Octanove C1/C2) and for
**Japanese** (KANJIDIC2 `grade` + `jlpt` + JMdict, plus our own grammar spine). **Spanish is the
weak leg**: the authoritative source is all-rights-reserved and the best open resource is
non-commercial. Spanish needs either a licence email to CENTAL or a home-grown banding built on
wordfreq. Do not let Spanish block the other two.

**Three emails worth sending this week, all cheap, none blocking:**
1. CENTAL (UCLouvain) — commercial licence for ELELex, and ideally EFLLex too.
2. Tono Lab (TUFS) — commercial terms for the CEFR-J **Grammar Profile** (the Wordlist is already
   clear).
3. NINJAL — commercial terms for the BCCWJ frequency list (see 4.4; currently research/education
   only).

---

# 2. The level gate ("CEFR checker")

## 2.1 What Duolingo actually does

[R] Duolingo operates a public **CEFR Checker** at `https://cefr-tool.duolingo.com/` (redirects to
`research.duolingo.com`). It is a research/marketing tool, not a documented public API, and I did
not find published terms permitting programmatic use. Treat it as a benchmark to compare against,
not a dependency.

[R] Duolingo's production lesson-generation pipeline templates the prompt with language, CEFR level
and theme filled in by infrastructure, generates multiple exercise candidates, and then has human
Learning Designers select and edit before publication. The reported failure mode is generated
content that "sound[s] a little stilted or unnatural."
Source: https://www.zenml.io/llmops-database/ai-powered-lesson-generation-system-for-language-learning

The key structural lesson: **their gate is not purely automatic.** It is prompt-constrain →
over-generate → automatic scoring → human select/edit. Anyone claiming Duolingo has a fully
automatic level gate is overstating it. [E]

## 2.2 The most directly relevant paper

**Malik et al., "From Tarzan to Tolkien: Controlling the Language Proficiency Level of LLMs for
Content Generation", Findings of ACL 2024** (Stanford + Duolingo).
Sources: https://arxiv.org/abs/2406.03030 , https://aclanthology.org/2024.findings-acl.926/

This is the closest published work to what we are building, and its methodological choice is the
single most useful data point in this whole document:

[R] To score generated text, the authors did **not** use a neural classifier and did **not** use
GPT-4-as-judge. They trained **a standard linear regression over hand-built linguistic features**:
1. word frequency bins (based on Oxford English Corpus rankings),
2. syntactic complexity (sentence length, parse tree depth, dependency counts),
3. POS tag distributions.

[R] That scorer reached **R² = 0.8** on held-out human-CEFR-labelled text. They then measured
generation quality with `ControlError` (squared difference between target and predicted
proficiency), reporting: GPT-4 with the best prompting strategy **0.28 ± 0.02**; CaLM (fine-tuned
LLaMA2-7B) **0.39 ± 0.03**; **CaLM with top-3 sampling 0.15 ± 0.01**.

[R] CaLM = LLaMA2-7B fine-tuned on **TinyTolkien** (2,000 story/proficiency pairs, generated by
prompting GPT-4 over 1,000 plot summaries at 2 levels each), then PPO-tuned with negative
ControlError as the reward. Human raters gave it 4.7/5 for consistency and fluency.

Three things we should take from this:
- A cheap feature-based scorer is good enough to *drive* a generation loop. R²=0.8 is not a
  research triumph, it is a working gate. [E]
- **Over-generate and pick** (top-3 sampling) roughly halved control error versus single-shot. That
  is the highest-leverage, lowest-effort trick available to us, and it needs no model training.
- A 7B fine-tune beat GPT-4 on level control at a fraction of the cost — but only after SFT **and**
  PPO. That is well past our scale. Skip it.

## 2.3 Open CEFR classifiers on Hugging Face

| Model | Base | Licence | Reported metric | Notes |
|---|---|---|---|---|
| `UniversalCEFR/xlm-roberta-base-cefr-all-classifier` | XLM-RoBERTa base, ~0.3B params | **MIT** [R] | F1 **0.9529**, val loss 0.1171 on its own eval set [R] | Multilingual. Model card is largely "More information needed" — no documented languages, level set, or eval protocol. |
| `UniversalCEFR/ModernBERT-base-cefr-all-classifier` | ModernBERT base, ~0.1B params | Not verified [E] | Not verified | Smaller/faster sibling, May 2025. |
| `dksysd/cefr-classifier` | DeBERTa-v3-large | Not verified [E] | Not verified | English only, A1–C2. |
| `AbdulSami/bert-base-cased-cefr` | BERT-base-cased | Not verified [E] | Not verified | English only. |

Sources: https://huggingface.co/UniversalCEFR , https://huggingface.co/UniversalCEFR/xlm-roberta-base-cefr-all-classifier ,
https://huggingface.co/dksysd/cefr-classifier , https://huggingface.co/AbdulSami/bert-base-cased-cefr

**Treat the 0.95 F1 with real suspicion.** [E] It is an eval-set number on held-out data drawn from
the same corpora the model trained on, with no cross-domain or cross-language breakdown published.
Our generated content is a different distribution entirely (short LLM-written exercise items, not
textbook passages). Expect a large drop.

**The licence trap on these models.** [R] UniversalCEFR's *datasets* are largely **CC-BY-NC-SA or
"Unknown"**, and four constituent corpora (EFCAMDAT, APA-LHA, BEA Shared Task 2019, DEPlain) "are
not directly available" and "require users to agree with their Terms of Use before using them for
**non-commercial research**." The *model* is labelled MIT. Whether an MIT label on weights trained
on NC-licensed and ToU-restricted corpora is effective against those upstream restrictions is an
unsettled legal question. [E] **Flag for counsel before this goes into a paid product.**

## 2.4 Published accuracy, realistically

[R] Reported figures in the literature, on *learner-written* text (the classic task, not our task):
- bert-base-cased: F-score ~**69%**.
- Another BERT study: F1 **72.7%**, Pearson **0.86** vs. human raters.
- RNN and BERT approaches on the EFCAMDAT corpus: **0.75** and **0.95** accuracy respectively.
- [R] Most classification errors fall **between neighbouring levels**; unusually short or long texts
  are a known source of misclassification.
Sources: https://link.springer.com/article/10.3103/S0146411624700329 ,
https://www.semanticscholar.org/paper/d34115358b05a4286d3eac61e7d6e9887447a577 ,
https://www.cambridge.org/core/journals/recall/article/abs/predicting-cefr-levels-in-learners-of-english-the-use-of-microsystem-criterial-features-in-a-machine-learning-approach/C915A35CD69168EDFB80DE8F57A4328C

**Honest read for our use case:** [E] a realistic exact-match expectation on 6 classes over short
generated items is **60–75%**, with **adjacent accuracy 90%+**. The wide spread between the 69% and
95% figures is mostly corpus difficulty and evaluation protocol, not model quality. The "unusually
short text" caveat is directly damaging to us: our items are one sentence, sometimes five words.
**A text-level neural classifier is the wrong shape of tool for a five-word item.**

## 2.5 Recommendation: strict lexical gate first, features second, classifier last

Our items are short, our volume is small, and our failure mode that actually hurts a learner is
**one out-of-band word**, not a subtly-B2-ish register. A text classifier cannot tell us *which*
word to fix, so it cannot drive a re-prompt. Therefore:

**Tier 1 (build this): strict database lookup after lemmatization. Hard gate.**
- Tokenize → lemmatize → look up each lemma in our level database → the item's level is the **max**
  level over its content lemmas (plus a small allowance for proper nouns and numerals).
- Reject if any lemma exceeds target level, or if any lemma is **unknown** to the database.
- Deterministic, explainable, sub-millisecond, and — critically — it returns *the offending word*,
  which is exactly what the re-prompt needs: "rewrite without `ubicación`; use A2 vocabulary."
- Cost: effectively zero. Accuracy on the thing we care about (out-of-band vocabulary): near 100%
  **by construction**, because it defines the standard rather than predicting it. [E]
- This is what makes level claims *guaranteeable* rather than *probable*. That was the ask.

**Tier 2 (build this second): feature-based regression, soft score.**
- Replicate Tarzan-to-Tolkien: frequency bins + sentence length + parse depth + POS distribution →
  linear/ridge regression or gradient boosting → continuous 1–6 score.
- Catches what Tier 1 misses: grammar that is too complex even though every word is A1
  ("Had I known, I would have gone" is all-A1 words and firmly B2).
- Trains in seconds on a few thousand labelled examples; no GPU. Serialise coefficients to JSON and
  evaluate them in TypeScript — no Python needed at inference. [E]
- Use as a **soft** signal: warn/re-roll, do not hard-reject.

**Tier 3 (do not build yet): fine-tuned transformer classifier.**
- Only worth it once we have thousands of in-domain labelled items *of our own*, which we do not.
- Blocked anyway on the NC-data provenance question in 2.3.
- Revisit when we add free-text/passage content, where short-text weakness stops mattering.

**Plus the free win from the paper: over-generate 3–5 candidates and select the best-scoring one.**
[R] top-3 sampling cut ControlError from 0.39 to 0.15 in the CaLM setting. Costs 3–5× tokens on a
cheap model, which at our scale is noise, and requires no ML work at all.

**Cost sanity check** [E]: at our scale (thousands of items, not millions), a hosted GPU classifier
is unjustifiable — it is the most expensive and least explainable of the three tiers. Tier 1 + Tier 2
runs on the existing web dyno with no new infrastructure line item, which is also why Section 3's
runtime question matters so much.

---

# 3. Tokenization and lemmatization — the runtime decision

Everything in Section 2 Tier 1 depends on lemmatization: you cannot look up `corrieron` or `走った`
in a level database without reducing them to `correr` and `走る` first. So the tool choice here
decides whether we stay on one runtime or add a second.

## 3.1 Japanese

| Tool | Language | Licence | Speed (word-count task) | Dictionary |
|---|---|---|---|---|
| **fugashi** (MeCab wrapper) | Python (Cython over C++) | **MIT** [R] | **294 ms** [R] | UniDic / IPADIC, swappable [R] |
| **SudachiPy** | Python | **Apache-2.0** [R] | **10,103 ms** (~34× slower than fugashi) [R] | SudachiDict, 3 splitting modes A/B/C [R] |
| **Janome** | pure Python, no C deps | **Apache-2.0** [R] | **16,496 ms** (~56× slower) [R] | bundled IPADIC [R] |
| **kuromoji.js** | **pure JavaScript** | Apache-2.0 [E] | not benchmarked here | bundled gzipped IPADIC [R] |

Sources: https://github.com/polm/ja-tokenizer-benchmark , https://aclanthology.org/2020.nlposs-1.7.pdf ,
https://qiita.com/kfjt/items/8b2f4a04e4befff18e19 , https://www.npmjs.com/package/kuromoji

Notes that matter:
- [R] MeCab's own dictionaries are separately licensed; fugashi is MIT but the **dictionary** you
  bundle (IPADIC, UniDic) has its own terms. UniDic and IPADIC are broadly permissive (BSD-style /
  triple-licensed) [E] but **verify the specific dictionary package before shipping.** This is the
  same "code licence ≠ data licence" trap as everywhere else in this document.
- [R] SudachiPy's selling point is business-grade accuracy, robust handling of number/date
  expressions (`2024年4月1日` as one token), and three segmentation granularities. Its cost is
  ~34× fugashi's runtime. At our volume that is irrelevant — 10 seconds for a corpus we run once.
- [R] Janome's selling point is zero external dependencies (pure Python, pip-installs anywhere).
  Useful if the batch job runs somewhere with no compiler.
- **fugashi and SudachiPy and Janome are all Python. There is no supported Node binding for any of
  them.** [E]
- [R] **kuromoji.js** is a pure-JS port of Kuromoji with a bundled gzipped dictionary; `tokenize()`
  returns POS, **basic form (基本形)**, reading and pronunciation. Basic form is exactly the lemma we
  need. Multiple maintained forks exist (`@patdx/kuromoji` with split browser/Node loaders,
  `kuromoji-es` as an ES module with CDN dictionary loading, `@sglkc/kuromoji`, typed forks).
  **This is the one way to do Japanese lemmatization inside Node with no second runtime.**
- Accuracy expectation [E]: kuromoji.js ships IPADIC, which is older and less accurate than UniDic
  or SudachiDict, particularly on modern vocabulary and proper nouns. For gating short generated
  sentences with controlled vocabulary, that gap is unlikely to bite. For corpus-scale analysis it
  would.

## 3.2 Spanish and English

| Tool | Runtime | Licence | Notes |
|---|---|---|---|
| **spaCy** (library) | Python | **MIT** [R] | Full pipeline: tokenizer, POS, lemmatizer, parser (parse depth is a Section 2 Tier-2 feature). |
| `en_core_web_sm` v3.7.1 | Python | **MIT** [R] | Trained on OntoNotes 5, which Explosion licensed commercially on our behalf; WordNet 3.0 licence also listed. |
| `es_core_news_sm` v3.7.0 | Python | **GNU GPL 3.0** [R] | **Verified in `meta.json`.** Inherited from **UD Spanish AnCora v2.8, which is GPL 3.0**. Other sources in the model are CC BY 4.0 (WikiNER) and MIT (spaCy lookups data). |

Sources (verified directly): `https://raw.githubusercontent.com/explosion/spacy-models/master/meta/en_core_web_sm-3.7.1.json`
and `.../es_core_news_sm-3.7.0.json`

**This is a real finding and it changes the Spanish plan.** [R] The spaCy Spanish small pipeline is
**GPL-3.0**, not MIT. Model licences in spaCy are per-model and genuinely differ (I also confirmed
[R] `it_core_news_sm-2.2.5` is CC BY-NC-SA 3.0, and older `en_core_web_sm` v1.2.0 was CC BY-SA 3.0).

Consequences [E], and they are less bad than they first look:
- GPL obligations attach on **distribution**, not on internal use. If `es_core_news_sm` runs only in
  our **offline pipeline** (Section 3.3) and is never shipped to a user or embedded in a distributed
  artefact, we are using GPL software privately — the standard, well-understood position. **This is
  a second, independent reason to keep the gate in the build pipeline.**
- If we ever wanted Spanish lemmatization *shipped* — bundled in a client, an on-device model, a
  distributed binary — GPL-3.0 becomes a live problem.
- Escape hatches if we need one: **simplemma** for Spanish (MIT code; check the ES data licence), or
  training our own spaCy Spanish pipeline on **UD_Spanish-GSD** instead of AnCora (GSD is
  CC BY-SA-family rather than GPL [E] — verify). Neither is needed for v1.
| **simplemma** | Python | **MIT** code [R]; data licences **vary per language** [R] | 54 languages incl. EN + ES, dictionary lookup only, no POS needed. [R] Some data derives from Michal Měchura's lemmatization lists under **ODbL** (share-alike for databases). |
| `compromise`, `wink-nlp`, `natural` | **Node** | MIT [E] | English-centric. Spanish lemmatization support is weak-to-absent. [E] |

Sources: https://github.com/explosion/spacy-models , https://spacy.io/models ,
https://github.com/explosion/spacy-models/blob/master/meta/en_core_web_sm-2.2.5.json ,
https://github.com/adbar/simplemma

[R] spaCy publishes per-model speed in its `meta.json` (e.g. ~6,869 CPU words/sec for a small
Italian model). Small models are on that order; that is thousands of items per second, far beyond
anything we need. [R for the Italian figure, E for generalising it]

**The critical asymmetry:** Japanese has a viable pure-JS option (kuromoji.js). **Spanish does
not.** [E] There is no maintained, accurate Spanish lemmatizer for Node comparable to spaCy or
simplemma. Options for Spanish-in-Node are (a) a stemmer instead of a lemmatizer, which conflates
distinct lemmas and will produce wrong level lookups, or (b) **export simplemma's Spanish
lemmatization dictionary to a static JSON/SQLite artefact and do pure lookup in TypeScript.** Option
(b) is genuinely viable because simplemma *is* just a dictionary — but it inherits ODbL share-alike
on the derived database. [E]

## 3.3 The verdict: do not put lemmatization in the request path at all

The question "Node or a second Python service?" has a better answer than either: **the level gate is
a build-time job, not a request-time one.**

Our content is generated in batches by an offline pipeline and written to the database with its
level already validated and stored. A learner request reads a row. It does not tokenize anything.
So:

- **Content pipeline (offline / CI / worker): Python.** Use the best tools with no compromise —
  SudachiPy or fugashi for Japanese, spaCy for English and Spanish (parse depth and POS
  distributions from spaCy also feed the Section 2 Tier-2 feature scorer for free). This runs as a
  scheduled job or a CLI, not a service. **No always-on Python service. No second production
  runtime. No new deploy target.** The "second runtime" cost people fear is a *service* cost, and we
  do not incur it.
- **Web app (Next.js): TypeScript only.** Reads precomputed `level`, `lemmas[]`, `max_lemma_level`
  columns. Zero NLP dependencies.

**When would we actually need runtime lemmatization in Node?** Only for **user-generated free text** —
e.g. grading a learner's typed answer by lemma rather than string match, or levelling text a user
pastes in. That is a real future feature but it is not v1. If and when it lands:
- Japanese → **kuromoji.js**, in-process, no service. [R]
- English → `wink-nlp` or a lemma dictionary export. [E]
- Spanish → simplemma dictionary exported to JSON, pure lookup. [E]

So the honest answer to "does this force a second runtime": **no, provided the gate stays in the
build pipeline.** The moment we need it at request time for Spanish, we either export a dictionary
or stand up a small Python endpoint. Design the gate now as a **pure function over (text, language)
returning (level, offending_lemmas[])** so it can be re-implemented on either side of the wire
without changing callers. That is the one architectural commitment worth making today.

---

# 4. Frequency lists

Frequency is the backbone of the Tier-2 scorer and the fallback spine for Spanish. It is also where
licence assumptions most often go unchecked, because "it's just a word count" feels like fact rather
than expression.

## 4.1 wordfreq — the default, with two serious caveats

- [R] Code: **Apache licence**. Data files: "may be redistributed under a **Creative Commons
  Attribution-ShareAlike 4.0** license." Both permit commercial use. Attribution + share-alike on
  the data. Source: https://github.com/rspeer/wordfreq
- [R] Aggregates Wikipedia, Google Books, Reddit, Twitter, SUBTLEX, OpenSubtitles (OPUS 2018), and
  the Leeds Internet Corpus, combined with a "figure-skating metric" that discards the highest and
  lowest source estimates per word.
- [R] **Caveat 1 — the project is frozen.** "The word frequencies are a snapshot of language usage
  through about 2021… the data is unlikely to be updated again." The author's stated reason: "The
  world where I had a reasonable way to collect reliable word frequencies is not the world we live
  in now" — i.e. the post-2022 web is contaminated with generative text.
  **Assessment [E]: for our purpose this is close to harmless.** We are levelling A1–B2 core
  vocabulary, which is the most stable part of any language. A 2021 snapshot misdates slang and
  tech terms; it does not misdate `comer`, `casa`, `食べる`.
- **Caveat 2 — coverage tiers.** [R] wordfreq splits languages into "large" and "small" wordlist
  tiers, with ~14–19 languages in the large tier including **Spanish** and **English**. My fetch
  placed **Japanese in the small tier**; I consider that **likely a summarisation error** and it
  contradicts my prior. **[E] Verify Japanese's tier directly from the README before relying on
  it.** If Japanese is genuinely small-tier, prefer a Japanese-specific list (4.4).

## 4.2 SUBTLEX family — good data, per-language licences that differ sharply

- [R] **SUBTLEX-US**: 51M words from US film and TV subtitles. wordfreq's documentation states that
  "Permission has been obtained from Marc Brysbaert to distribute these wordlists to be used for any
  purpose, not just for academic use… these terms are similar to the Creative Commons
  Attribution-ShareAlike license." That is a permission granted *to wordfreq's author*, which is why
  **consuming SUBTLEX-US via wordfreq is safer than downloading it from CRR directly.** [E]
- [R] **SUBTLEX-DE is CC BY-NC-ND 3.0** — non-commercial *and* no-derivatives. This is the proof
  that the SUBTLEX family does not share one licence. **Never generalise from one SUBTLEX to
  another.**
- [R] **SUBTLEX-ESP**: 41M words from contemporary films/TV screened 1990–2009. Distributed via OSF
  at https://osf.io/xp6sz/ . **I did not find an explicit licence statement.** [E] **Gap — check the
  OSF component's licence field before use.** Until then, get Spanish frequency through wordfreq
  rather than direct.
- Domain caveat [E]: subtitle corpora over-represent conversational, emotional and profane
  vocabulary and under-represent formal/academic registers. For A1–B1 spoken-style content that bias
  is actually *helpful*; for B2+ written content it is misleading.

## 4.3 OpenSubtitles / OPUS

[R] wordfreq includes OPUS OpenSubtitles 2018. Caveats [E]:
- The underlying subtitles are **fan-produced translations of copyrighted films**. OPUS distributes
  the *aligned corpus* for research; the copyright status of the source subtitles is murky and OPUS
  does not clear it. Deriving aggregate frequency counts is far from redistributing subtitle text,
  and is the standard practice, but it is not zero-risk.
- Quality varies wildly by language: machine-translated and OCR'd subtitle files are in the corpus.
- **Recommendation:** consume it as one of wordfreq's blended sources, never as a standalone list we
  redistribute.

## 4.4 Japanese-specific frequency

- [R] **BCCWJ word list** (Balanced Corpus of Contemporary Written Japanese, NINJAL) — the standard
  100M-word reference corpus; the frequency list is public and "free for use for **research or
  educational purposes**", with a usage manual, ~536k entries, distributed as `.xlsx`.
  Source: https://clrd.ninjal.ac.jp/bccwj/en/freq-list.html
  **[E] "Research or educational purposes" is very likely NOT a commercial grant.** LoxeLingo is a
  commercial product even if the use is educational in character. **Blocked pending clarification;
  worth an email to NINJAL, same as CENTAL.**
- [R] **Wiktionary Japanese frequency lists** — https://en.wiktionary.org/wiki/Wiktionary:Frequency_lists/Japanese .
  Wiktionary content is CC BY-SA 4.0. [E] Usable commercially with attribution + share-alike, but
  these lists are typically derived from subtitle corpora and are of uneven quality.
- Community lists (jpdb, Yomitan frequency dictionaries, "Netflix frequency list") [E]: widely used
  by learners, essentially all built from scraped copyrighted media, generally no licence at all.
  **Do not ingest.** Same category as the third-party JLPT lists in 1.5.

## 4.5 What to actually use

| Language | Primary frequency source | Licence posture |
|---|---|---|
| English | wordfreq `en` (large tier) | Clean — Apache / CC BY-SA 4.0, attribute |
| Spanish | wordfreq `es` (large tier) | Clean — same |
| Japanese | wordfreq `ja`, **tier to be verified**; else Wiktionary CC BY-SA | Clean; BCCWJ blocked pending clarification |

Use **Zipf frequency** (wordfreq's `zipf_frequency`, a log10 scale where ~7 is extremely common and
~1 is vanishingly rare) rather than raw counts. It is the right shape for binning into level bands
and is comparable across languages. [E]

---

# 5. Hugging Face datasets

Short version: **the CEFR dataset ecosystem on HF is real, well-organised, and almost entirely
non-commercial.** The JLPT ecosystem on HF is the opposite — permissively labelled but of hobby
quality and unknown provenance. Neither gives us a spine for free.

## 5.1 The useful ones

| Dataset id | Size | Content | Licence | Verdict |
|---|---|---|---|---|
| `UniversalCEFR/*` (25 datasets) | **505,807 texts total**, 13 languages [R] | Standardised CEFR-labelled texts; incl. EN, ES, DE, NL, CS, IT, FR, ET, PT, AR, HI, RU, CY [R] | Mostly **CC-BY-NC-SA** or "Unknown" [R] | **Non-commercial. Research/benchmark only.** |
| `UniversalCEFR/cefr_sp_en` | **10,004 rows** [R] | Sentence-level CEFR, fields `text` / `cefr_level` / `lang` / `source_name` / `license` [R] | **cc-by-nc-sa-4.0** [R] | Blocked for product. See 5.2. |
| `UniversalCEFR/ModernBERT-base-cefr-all-classifier` | 0.1B params [R] | Multilingual CEFR classifier | Not verified [E] | Benchmark |
| `UniversalCEFR/xlm-roberta-base-cefr-all-classifier` | 0.3B params [R] | Multilingual CEFR classifier, F1 0.9529 on own eval [R] | **MIT** on weights [R] | Usable *if* the NC-training-data question clears (see 2.3) |
| `bea2019st/wi_locness` | — | Write & Improve + LOCNESS learner English, CEFR-levelled submissions [R] | BEA-2019 shared task ToU; [R] UniversalCEFR flags it as requiring ToU agreement for **non-commercial research** | **Blocked** |
| `codesue/kelly` | 8,425 lemmas [R] | **Swedish only**, CEFR A1–C2 per lemma [R] | **CC BY 4.0** [R] | Clean but wrong language. Useful as a **template for the schema we should build for Spanish.** |
| `edesaras/CEFR-Sentence-Level-Annotations`, `CarlosPov/CEFR_expert`, `sebastiaan/test-cefr` | — | Community CEFR sets | Not verified [E] | Unverified provenance |
| `lysandre/anki-words` | **478 words** [R] | JA vocab with JLPT N5–N1 labels, exported from an Anki deck [R] | Not verified [E] | **Too small and unattributed to be a spine.** Anki decks are the same laundered pre-2010 lists from 1.5. |
| `ronantakizawa/japanese-text-difficulty` | — | JA text difficulty incl. kanji difficulty metrics [R] | Not verified [E] | Possibly useful as *eval* data; verify provenance |

Sources: https://huggingface.co/UniversalCEFR , https://huggingface.co/datasets/UniversalCEFR/cefr_sp_en ,
https://huggingface.co/datasets/codesue/kelly , https://huggingface.co/datasets/bea2019st/wi_locness ,
https://huggingface.co/datasets/lysandre/anki-words , https://huggingface.co/datasets/ronantakizawa/japanese-text-difficulty

## 5.2 CEFR-SP: the one dataset worth chasing

**CEFR-SP** (Arase, Uchida & Kajiwara, *CEFR-Based Sentence-Difficulty Annotation and Assessment*,
EMNLP 2022) is ~**17k English sentences annotated with CEFR levels by English-education
professionals**. [R] Sources: https://arxiv.org/abs/2210.11766 , https://github.com/yukiar/CEFR-SP

Why it matters more than anything else in this section: **it is sentence-level.** Every other CEFR
corpus is document-level, and Section 2.4 established that document-level classifiers degrade badly
on short text. Our items *are* short text. A sentence-level gold standard is the correct training
and evaluation set for our Tier-2 scorer.

**RESOLVED — and the answer is partly good news.** I read the original data README directly at
`https://raw.githubusercontent.com/yukiar/CEFR-SP/main/CEFR-SP/README.md`. CEFR-SP is **not one
licence**. It is sampled from three corpora and, in the authors' words, "Each subset is distributed
under the same license of the original corpus":

| Sub-corpus | Licence [R] | Commercial |
|---|---|---|
| **Wiki-Auto portion** | **CC BY-SA 3.0** | **YES**, with attribution + share-alike |
| SCoRE portion | CC BY-NC-SA 4.0 | No |
| Newsela-Auto portion | Not distributed at all — you must first obtain Newsela dataset access (request at newsela.com/data), then send the authors proof of that access [R] | No, gated |

So: **the Wiki-Auto subset of CEFR-SP is commercially usable sentence-level CEFR gold data.** That
is exactly the training/eval set the Tier-2 scorer needs, and it is legally clean. The
UniversalCEFR `cefr_sp_en` republication tagged **cc-by-nc-sa-4.0** [R] is the aggregator applying
its most-restrictive constituent across the whole thing — a good illustration of 5.4. **Take the
data from the original repo and use the Wiki-Auto split only; do not take the UniversalCEFR
mirror.**

[R] Note also that the authors split train/validation/test **by data source**, so the Wiki-Auto
subset is a coherent split rather than a random slice — usable as-is, though it means our scorer is
trained on Wikipedia-derived register only. [E] Expect some domain shift to our conversational
generated items; mitigate by also evaluating on our own gated corpus (8.2 item 4).

## 5.3 What does not exist on HF

- **No commercially-licensed Spanish CEFR vocabulary or DELE dataset.** [E] I found none. The
  Spanish CEFR data on HF is inside UniversalCEFR under NC terms. `codesue/kelly` is Swedish. This
  confirms Section 1.4: Spanish has no free lunch.
- **No credible JLPT dataset with clean provenance.** [E] What exists is Anki-deck exports of the
  withdrawn pre-2010 lists. The clean Japanese path remains KANJIDIC2 + JMdict (Section 1.5),
  which are *not* on HF and do not need to be.
- **No graded-reader corpus we can use.** [E] Graded readers are commercial publishing (Penguin
  Readers, Oxford Bookworms, Macmillan Readers); the corpora built from them in academia are
  precisely the NC-licensed CEFRLex/UniversalCEFR sources.

## 5.4 One-line rule for HF datasets

The `license:` tag on a HF dataset card is set by the **uploader**, not by the rightsholder. For
anything we ship, trace the tag to the originating paper or repository. UniversalCEFR is unusually
honest about this — it explicitly carries a per-row `license` field and flags four corpora as
requiring separate ToU agreement — and that honesty is what tells us most of the ecosystem is NC.

---

# 6. Exams: AP, TOEFL, IELTS, DELE, JLPT

The product owner suggested training on College Board AP papers 2020–2025 and looking at TOEFL and
IELTS. **The technical part is easy and the legal part is fatal.** Handling this honestly now is
much cheaper than handling it after launch.

## 6.1 The position, plainly

Past exam papers are **copyrighted literary works**. Publishing them free-to-read is not a licence;
it is publication. There is no exam board in this list that has released its item bank under terms
permitting a commercial third party to train on it or reproduce it.

**College Board (AP) — explicitly prohibits exactly what was proposed.** [R]
- "All College Board tests, including AP Exams, test-related documents and materials, and test
  preparation materials are copyrighted works owned by College Board."
- **"College Board does not grant permission for its copyrighted content, including practice test
  questions, to be used in conjunction with generative AI or similar technologies."**
- Teachers may download released exam materials and copy them **for classroom use only**; any
  further distribution violates College Board copyright policy.
- Permission requires the Copyright and Trademark Permission Request Form.
Sources: https://apstudents.collegeboard.org/exam-policies-guidelines/terms-conditions ,
https://apstudents.collegeboard.org/exam-policies-guidelines/exam-security-policies ,
https://privacy.collegeboard.org/copyright-trademark/request-instructions ,
https://apcentral.collegeboard.org/courses/past-exam-questions
(**[E] I did not verify which of these pages carries the generative-AI sentence verbatim — archive
the exact page before quoting it in any internal decision doc.** The substance is not in doubt.)

That generative-AI clause is unusually direct and post-dates the LLM boom. "We fine-tuned on AP
Spanish free-response prompts" is a sentence that, if it appeared in our repo or our marketing,
would be a straightforward contract/copyright problem, not a grey area. **Do not do it.**

**ETS (TOEFL) and the IELTS partners (British Council / IDP / Cambridge)** are the same posture:
all-rights-reserved item banks, aggressive trademark enforcement, and licensed-only reuse. [E] I did
not fetch their specific terms this pass — **gap** — but the default assumption should be identical
to College Board's until proven otherwise, and the strategic conclusion does not change either way.

**Instituto Cervantes (DELE)** — model exams and specifications are free-to-read, © Instituto
Cervantes. Same posture. [E] (Consistent with the "Reservados todos los derechos" finding in 1.4.)

**JLPT** — the interesting case: [R] there is no official list to infringe (1.5). Official *sample
questions* (問題例) published by the Japan Foundation are copyrighted, but the level *concept* is
free because the Foundation deliberately declines to define it in list form.

## 6.2 What IS legitimately usable

The distinction that matters: **specifications and criteria describe a standard; papers instantiate
it.** We want the standard, not the instances.

- **Published band descriptors and scoring rubrics.** IELTS publishes public band descriptors for
  Writing and Speaking; ETS publishes TOEFL scoring guides; College Board publishes AP scoring
  guidelines and course/exam descriptions. These are published *precisely so that third parties can
  align to them*. [E] They are still copyrighted text — **read them, apply the criteria, write our
  own rubric in our own words. Do not paste them into a prompt or a database.**
- **Public exam specifications / course-and-exam descriptions.** Task types, timings, topic domains,
  skill weightings. Facts about a test's structure are not protectable expression. [E] "AP Spanish
  Language has an email-reply task and a cultural-comparison speaking task" is a fact we may state
  and design around.
- **Score-concordance tables** (e.g. published CEFR↔TOEFL↔IELTS mappings). Factual mappings. [E]
- **Our own items written to the same specification.** Unlimited. This is what every legitimate test
  prep company does.
- **Publicly stated official statistics** — pass rates, level definitions, candidate numbers.

## 6.3 What is not

- Training, fine-tuning, embedding, or RAG-indexing any past paper, practice test, or released item.
- Reproducing prompts, passages, or answer options, even reworded closely.
- Claiming alignment in a way that implies endorsement ("Official AP prep", "Cambridge-approved").
  Trademark, separate from copyright, and enforced. [R] College Board: "Use of any College Board
  trademark is not permitted without express written consent."
- Scraping a third-party site that hosts past papers. Their infringement is not our licence.

## 6.4 The reframe worth putting to the product owner

We do not need the papers. We need the **construct**: what a B1 learner is expected to *do*. That is
in the free specifications, the free band descriptors, and the CEFR-J / KANJIDIC spines in Section 1.
The papers would give us surface examples of that construct, which an LLM can generate for us at
zero legal risk once it knows the construct and is constrained by the Section 2 gate.

Framed as product strategy rather than compliance: **an item bank we wrote ourselves is an asset we
own.** One derived from AP papers is a liability we rent, cannot defend in diligence, and cannot
sell. The legal answer and the business answer point the same way.

---

# 7. Recommended pipeline, end to end

## 7.1 The curriculum spine per language

A "spine" here means: an ordered inventory of **lexical items** and **grammar points**, each stamped
with a level, that both drives generation and defines the gate. One table per language, one shared
schema.

**English — best position of the three.**
- Lexicon: **CEFR-J Wordlist v1.6** (A1–B2, commercial-clean with attribution) + **Octanove
  Vocabulary Profile C1/C2 v1.0** (CC BY-SA 4.0). [R] Collapse CEFR-J's sub-levels (A1.1/A1.2/A1.3)
  up to A1/A2/B1/B2.
- Grammar: **write our own.** The CEFR-J Grammar Profile requires paid consultation [R]. An English
  A1–B2 grammar spine is ~150–250 points and is a week of work for one competent person, or an
  afternoon of LLM drafting plus a careful human pass. [E] It is also the part most worth owning.
- Frequency: wordfreq `en`.

**Japanese — clean but coarse; needs the most hand-work.**
- Kanji: **KANJIDIC2** `grade` (school grade 1–6, 8, 9/10) as the primary ordering, `jlpt` (old 1–4)
  as a secondary prior. CC BY-SA 4.0, commercial explicit. [R]
- Vocabulary: **JMdict** for lemmas, readings and senses (CC BY-SA 4.0) [R], levelled by a
  **composite score**: kanji grade of constituent characters + wordfreq/Wiktionary frequency +
  our own N5–N1 band assignment. **We assign the bands; we do not import someone's.** This is not
  a workaround, it is the only honest option given 1.5 — nobody has an official list.
- Grammar: **write our own**, N5–N1. Japanese grammar points are highly conventionalised
  (〜てから, 〜たことがある, 〜ばよかった…); a 200–300 point spine is well-trodden ground and every
  competitor has hand-built theirs. [E]
- Attribution obligation: a visible credits page naming EDRDG and the CC BY-SA 4.0 terms. Cheap.
- **Share-alike caveat [E]:** CC BY-SA 4.0 is copyleft *for the database/adaptation*, not for our
  application code. Keep JMdict-derived tables in a separately-identifiable artefact so the
  share-alike obligation attaches there and not to the whole product. Confirm with counsel.

**Spanish — the weak leg; needs a decision.**
- Preferred: **licence ELELex from CENTAL** (CC BY-NC-SA today; ask for commercial terms). [R]
- Fallback if refused: build our own banding — **wordfreq `es` Zipf bands** as the skeleton, then a
  hand-curated A1/A2 core (~1,000–1,500 lemmas) written by a Spanish teacher, using the *Plan
  curricular*'s topic taxonomy as inspiration but not its word lists (1.4). [E]
- Grammar: write our own, informed by the *Plan curricular*'s structure. Spanish grammar
  progression (present → preterite/imperfect → subjunctive) is standard and uncontroversial.
- **[E] Realistic cost of the fallback: 2–4 weeks of one qualified Spanish teacher's time.** That is
  the price of ELELex being NC. It is not a blocker; it is a line item. And the result is an owned
  asset (6.4).

**Shared schema sketch** (data model, not code):
`lemma`, `language`, `pos`, `level` (A1–C2 or N5–N1), `zipf_freq`, `source` (which licensed spine it
came from), `source_licence`, `first_taught_unit`. Grammar points get `pattern_id`, `level`,
`prerequisite_ids`, `example`. Carrying `source` and `source_licence` per row is not bureaucracy —
it is what lets us prove provenance in diligence and rip out a source if a licence changes.

## 7.2 The pipeline

```
[1] SPINE            curriculum tables per language (7.1), levelled, provenance-stamped
                       ↓
[2] SELECT           pick target level + grammar point + topic + N target lemmas
                       ↓
[3] GENERATE         LLM prompt: level, grammar point, topic, allowed-lemma hints,
                     explicit "use only vocabulary at or below <level>"
                     → over-generate K=3–5 candidates   [R: top-3 sampling cut ControlError 0.39→0.15]
                       ↓
[4] GATE 1  (hard)   tokenize → lemmatize → look up every content lemma in the spine
                     REJECT if any lemma > target level, or unknown to the spine
                     → returns the offending lemmas
                       ↓
[5] GATE 2  (soft)   feature scorer: freq bins + sentence length + parse depth + POS dist
                     → continuous level estimate  [R: R²≈0.8 achievable]
                     score all surviving candidates, rank
                       ↓
[6] SELECT BEST      highest-ranked candidate within band
       │
       └─ if 0 candidates survive → RE-PROMPT with the offending lemmas named
          ("rewrite without `ubicación`, `sin embargo`; A2 vocabulary only")
          → max 3 retries, then flag for human review
                       ↓
[7] HUMAN QA         sample review (start at 100%, taper to ~10% as trust builds)
                       ↓
[8] PERSIST          write item + level + lemmas[] + max_lemma_level + scorer_score
                     + model/prompt version + gate version
                       ↓
[9] SERVE            Next.js reads a row. No NLP at request time. (Section 3.3)
```

**Notes on the design:**

- **Steps 1–8 run offline in Python. Step 9 is TypeScript.** No second production runtime
  (Section 3.3).
- **Gate 1 is the guarantee, Gate 2 is the polish.** Gate 1 is definitional: an item is A2 iff every
  content lemma is in the A2-or-below spine. That is a claim we can defend to a school district, and
  it is why we build the strict lookup before anything statistical.
- **"Unknown lemma → reject" is deliberate and will be annoying at first.** It surfaces spine gaps
  rather than silently passing unlevelled words. Route rejections to a review queue; every one is
  either a spine gap to fill or a genuine out-of-band word. This queue is how the spine improves.
- **Version-stamp everything.** `gate_version`, `spine_version`, `prompt_version`, `model_id` per
  row. When the spine changes, we re-gate affected items rather than regenerating the corpus.
- **Retire `cold_start_beta`.** The existing 60 JA + 35 EN hand-authored items should be run through
  the gate retroactively. Expect some to fail; that is the point. Keep the human-authored text, take
  the machine's level. This also gives us the first honest measurement of how far off the
  hand-priors were. [E]
- **Where the LLM should and should not be trusted:** trusted to write natural sentences given
  constraints; **not** trusted to self-assess level (that is what step 4/5 are for) and **not**
  trusted to invent the spine. The spine is the human/licensed artefact; the LLM is a sentence
  generator inside it.

---

# 8. Legal split, fallback, and what to do next

## 8.1 Legally clean vs. needs a licence

**CLEAN — build on these today, with attribution.**

| Asset | Licence | Obligation |
|---|---|---|
| CEFR-J Wordlist v1.6 (EN, A1–B2) | Research + commercial with acknowledgement [R] | Cite version, compiler, URL, access date |
| CEFR-J Can-Do Descriptors | Research + commercial with acknowledgement [R] | Same |
| Octanove Vocabulary Profile C1/C2 | CC BY-SA 4.0 [R] | Attribute; share-alike on the derived DB |
| JMdict (JA lemmas/senses) | CC BY-SA 4.0, commercial explicitly OK [R] | Attribute EDRDG; share-alike on derived DB |
| KANJIDIC2 (`grade`, `jlpt`, readings) | CC BY-SA 4.0, commercial explicitly OK [R] | Same |
| wordfreq (code + data, all 3 languages) | Apache / CC BY-SA 4.0 [R] | Attribute |
| SUBTLEX-US *via wordfreq* | Permission granted to wordfreq, ~CC BY-SA [R] | Consume via wordfreq, not direct |
| `codesue/kelly` (Swedish) | CC BY 4.0 [R] | Schema template only |
| spaCy library | MIT [R] | — |
| `en_core_web_sm` v3.7.1 | MIT [R] | — |
| `es_core_news_sm` v3.7.0 | **GPL-3.0** [R] | Offline pipeline use only; do **not** distribute |
| CEFR-SP **Wiki-Auto split only** | CC BY-SA 3.0 [R] | Attribute; share-alike on derived DB |
| fugashi | MIT [R] | Check bundled dictionary separately |
| SudachiPy, Janome | Apache-2.0 [R] | — |
| simplemma (code) | MIT [R] | Per-language data licences vary; some ODbL |
| kuromoji.js | Apache-2.0 [E] | — |
| CEFR level labels A1–C2, JLPT band names N5–N1 | Not protectable expression [E] | Don't imply endorsement |
| Exam specifications, band descriptors *as criteria we re-express* | Facts/criteria [E] | Write our own words |

**NEEDS A LICENCE — do not ship without one.**

| Asset | Blocker | Route |
|---|---|---|
| English Vocabulary Profile (Cambridge) | Terms forbid commercial use [R] | Commercial licence via Cambridge |
| CEFR / Companion Volume text | All rights reserved [R] | `publishing@coe.int`; we don't need it |
| CEFR-J **Grammar Profile** / Text Profile | "expenses charged after separate consultation" [R] | Email Tono Lab |
| ELELex (ES) | CC BY-NC-SA 4.0 [R] | Email CENTAL, UCLouvain |
| EFLLex + rest of CEFRLex | CC BY-NC-SA 4.0 [R, verified on ELELex] | Same email |
| UniversalCEFR datasets incl. `cefr_sp_en` | CC-BY-NC-SA / ToU-restricted [R] | Research use only |
| BEA-2019 W&I+LOCNESS, EFCAMDAT, APA-LHA, DEPlain | ToU: non-commercial research [R] | Blocked |
| BCCWJ word list (JA) | "research or educational purposes" [R] | Email NINJAL |
| Instituto Cervantes *Plan curricular* inventories | All rights reserved [R] | Use taxonomy as inspiration only |
| CEFR-SP **SCoRE split** | CC BY-NC-SA 4.0 [R] | Blocked |
| CEFR-SP **Newsela-Auto split** | Requires Newsela data access + author approval [R] | Newsela agreement |
| `it_core_news_sm` and other spaCy models | Per-model; some CC BY-NC-SA 3.0 [R] | **Always check `meta.json`** |
| AP / TOEFL / IELTS / DELE past papers | © exam boards; College Board explicitly bars generative-AI use [R] | Do not use. Ever. |
| Third-party JLPT lists, Anki decks, jpdb/Yomitan freq dicts | No licence / laundered provenance [E] | Do not ingest |

## 8.2 Fallback if the best datasets are unusable

Assume every "needs a licence" row is refused. We are still fine, in this order:

1. **English:** unaffected. CEFR-J Wordlist + Octanove already cover A1–C2 lexically. Only the
   grammar spine is hand-written. **English ships regardless.**
2. **Japanese:** unaffected. KANJIDIC2 + JMdict + wordfreq are clean, and there is no official JLPT
   list to be denied. Vocabulary banding and grammar spine are hand-built. **Japanese ships
   regardless** — Japanese's apparent weakness (no official list) turns out to be its licensing
   strength.
3. **Spanish:** the only genuine casualty. Fallback = wordfreq `es` Zipf bands + a hand-curated
   ~1,500-lemma A1/A2 core + hand-written grammar spine. [E] 2–4 weeks of qualified teacher time.
   Ship Spanish one release behind EN/JA rather than shipping it on unlicensed data.
4. **The Tier-2 feature scorer:** first choice is the **CEFR-SP Wiki-Auto split** (CC BY-SA 3.0,
   clean — see 5.2). If that proves too domain-shifted, train it on **our own gated corpus**. Once Gate 1 has stamped a few thousand items with a defensible level, those items are
   labelled training data we own outright. Circular but sound: Gate 1 is definitional, so its labels
   are correct *by construction* on the vocabulary dimension, and the scorer only needs to
   generalise to the syntax dimension. [E]
5. **If everything statistical fails:** Gate 1 alone — strict lemma lookup — is already a stronger
   level guarantee than `cold_start_beta` and stronger than most competitors ship. Everything else
   is refinement.

**The load-bearing insight: we do not need anyone's CEFR *data*. We need a levelled lemma list per
language and a lemmatizer. Both are obtainable cleanly in EN and JA today, and in ES with hand-work.**

## 8.3 Gaps in this research — explicitly

Two gaps flagged during this research were **closed before publishing** and are recorded here so the
method is auditable:
- ~~CEFR-SP licence~~ → **RESOLVED**: per-sub-corpus. Wiki-Auto = CC BY-SA 3.0 (usable), SCoRE = NC,
  Newsela = gated. See 5.2.
- ~~`es_core_news_sm` licence~~ → **RESOLVED**: **GPL-3.0**, inherited from UD Spanish AnCora. See 3.2.

Still open, flagged honestly rather than papered over:
1. **English Vocabulary Profile Terms of Use verbatim.** Page is JS-rendered; I relied on consistent
   secondary reporting. Archive the real page. *(Low risk — every source agrees, and the finding is
   a prohibition, so the cost of being wrong is that we were over-cautious.)*
2. **wordfreq's Japanese tier** (large vs small wordlist). My fetch said "small"; I believe that is a
   summarisation error. Check the README. *(Affects Japanese frequency quality, not legality.)*
3. **SUBTLEX-ESP licence** on OSF (https://osf.io/xp6sz/). *(Moot if we consume via wordfreq.)*
4. **Japan Foundation JF Standard / Minna no Can-do terms.** If licensable, it is the cleanest
   JA↔CEFR bridge and would let one six-band scale span all three languages. *(Upside, not blocker.)*
5. **MeCab/UniDic/IPADIC dictionary licences** if we go the fugashi route. *(Avoidable — SudachiPy is
   Apache-2.0 end to end and fast enough at our volume.)*
6. **UD_Spanish-GSD licence**, as the non-GPL alternative for a self-trained Spanish pipeline.
7. **ETS and IELTS terms** not fetched directly; assumed equivalent to College Board. *(Conclusion in
   Section 6 does not change either way.)*
8. **Tatoeba licence** not re-verified this pass.
9. **The exact page carrying College Board's generative-AI prohibition** — substance confirmed,
   exact URL not pinned.
10. **CC BY-SA share-alike scope** on a database embedded in a proprietary app, and the interaction
    between CC BY-SA 3.0 (CEFR-SP Wiki-Auto) and CC BY-SA 4.0 (JMdict, wordfreq) in one product.
    Counsel question, not a research question.

## 8.4 Recommended next actions, in order

1. **Pull the CEFR-SP Wiki-Auto split** from the original repo (CC BY-SA 3.0, commercially clean) as
   the training and evaluation set for the Tier-2 scorer. Do not use the UniversalCEFR mirror.
2. **Send three emails**: CENTAL/UCLouvain (ELELex commercial terms), Tono Lab/TUFS (CEFR-J Grammar
   Profile commercial terms), NINJAL (BCCWJ commercial terms). All three are cheap, none block
   progress while pending, and any "yes" measurably improves the product.
3. **Tell the product owner: AP/TOEFL/IELTS past papers are off the table.** Cite 6.1. Redirect to
   6.2/6.4 — specifications and band descriptors, items we author ourselves.
4. **Build Gate 1 for English first** on CEFR-J Wordlist, and retro-gate the existing 35 EN items.
   That single exercise validates the whole architecture and tells us how wrong `cold_start_beta` was.
5. **Then Japanese** (KANJIDIC2 + JMdict + hand-built bands), retro-gating the 60 JA items.
6. **Then Spanish**, on whichever spine the CENTAL answer leaves us with.
7. **Close the gaps in 8.3 before any external level claim appears in marketing copy.**
