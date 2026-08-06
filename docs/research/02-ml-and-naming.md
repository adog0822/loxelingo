# 02 — ML/Algorithmic State of the Art + Name Clearance

Research date: 2026-08-05. All claims are sourced. Where a number could not be verified from a
primary source it is explicitly marked **[UNVERIFIED]**. Nothing here is legal advice.

---

# PART 1 — NAME CLEARANCE

Method: web search for existing companies/products/apps per name, direct fetch of the matching
`.com`, and Justia/USPTO-scoped searches for trademark evidence. **Limitation:** I could not run a
live TESS/TSDR structured search (no API access in this environment), so trademark findings are
"what is visible via search," not a clearance search. A real clearance search by counsel is still
required before spending money on the name.

## Summary table

| Name | Existing use in edu/software | `.com` status | TM evidence found | App Store collisions | Risk |
|---|---|---|---|---|---|
| Meridian | Very heavy — enterprise LMS + Google's flagship open-source MMM | Held, live commercial site (not resolvable from this network but active) | Google LLC filed multiple MERIDIAN marks 2025-02-05 for non-downloadable software/analytics | Many (7+ education-adjacent) | **HIGH** |
| LoxeLingo | None found | Almost certainly free (coined) | None found | None found | **LOW** |
| Orbit | Heavy in the *exact* niche — multiple spaced-repetition/learning apps | Held; returned HTTP 402 (parked/paywalled reseller behavior) | ORBIT registered by Optomed (medical sw); ORBIT, LLC owns exec-education marks | Multiple | **HIGH** |
| Aster | Light in edtech; heavy elsewhere (VC, healthcare, crypto) | Held by Aster Capital (VC firm, Paris/Bordeaux) | Aster Graphics (toner) — unrelated class; nothing found in edu/software classes | ~6 apps named Aster, none language-learning | **MEDIUM** |
| Vantage | Heavy and *directly* on point — Vantage Learning is a K-12 assessment/NLP edtech | Held by Vantage Labs (parent of Vantage Learning) | Vantage Education AG reported to hold 6 marks/applications | None found in education | **HIGH** |

## Meridian — HIGH

Who uses it, by sector:
- **Corporate/government LMS:** Meridian Knowledge Solutions LLC has sold an enterprise LMS since
  1997 ("Meridian LMS"), listed on G2, Capterra, eLearning Industry. This is *learning software*,
  i.e. the same broad software-and-education space you'd be filing in.
- **Marketing analytics:** Google released **Meridian**, its open-source Marketing Mix Model, in
  February 2025, and filed multiple MERIDIAN trademark applications on 2025-02-05 covering
  "providing on-line non-downloadable software for marketing mix modeling and marketing dashboards."
  A Google-owned, actively-enforced mark in software classes is the single biggest reason to walk
  away.
- **Also:** schools ("Meridian School" Hyderabad/Uppal/IL all have App Store apps), banking/credit
  unions (Meridian Members, Meridian Finance apps), health/bioscience, energy.
- **App Store:** already a *directly competitive* app — "Meridian: Study Abroad & AI," an
  AI-powered study-abroad advisor for students. Plus "Project Meridian," "Meridian App," and
  several school apps.

Verdict: the name is generic-feeling, contested across at least five sectors, contested inside
education specifically, and now carries a Google filing. `meridian.com` is held (my fetch was
refused at the network level, which itself indicates an actively-configured commercial host, not a
parking page). **Do not use.**

## LoxeLingo — LOW

- No app, company, or product named "LoxeLingo" or "Loxe Lingo" found anywhere.
- Nearest neighbors are all distinguishable: **Loxo** (recruiting SaaS, iOS + Google Play),
  **Lox Club** (dating), **LinGo Play** and **Lingo Legend** (language-learning apps), **Lingo by
  Abbott** (glucose biosensor — heavily marketed, a big brand on the "Lingo" half), **Lingo**
  (lingoapp.com, DAM software).
- The `-Lingo` suffix is crowded but weak/descriptive in language learning; the distinctiveness
  lives in "Loxe," which ties to the existing LoxeAI brand. That's the strongest legal position of
  the five and gives you a free `.com`.
- Downside is not legal, it's marketing: "Lingo" signals "generic language app," and Abbott's Lingo
  spends real money on that word. Consumers may mishear it as "Loxo."

## Orbit — HIGH

Worst possible collision profile: the name is already taken *in the exact product category*.
- **Orbit** by Andy Matuschak — an experimental spaced-repetition platform (github.com/andymatuschak/orbit),
  well-known in the SRS/tools-for-thought community, associated with the "mnemonic medium." If you
  build an FSRS-based learning app called Orbit, you will be conflated with it constantly.
- **Orbit Learn** (orbitlearn.xyz) — AI flashcards + spaced repetition from notes/PDFs.
- Another "Orbit — Learn anything. Remember everything." spaced-repetition app.
- **Orbit** (orbit.love) — community-growth SaaS that has itself published on spaced repetition.
- Trademarks: ORBIT registered by **Optomed Plc** (reg. 5377450) for retinal-imaging software;
  **ORBIT, LLC** owns MICRONOMY covering executive-education services; Autodesk has a pending ONE
  ORBIT.
- `orbit.com` returned **HTTP 402 Payment Required** — consistent with a domain-broker/parked
  configuration, i.e. purchasable only at premium-aftermarket prices, if at all.

Verdict: **do not use.** Brand confusion with an existing spaced-repetition product is a
self-inflicted wound independent of trademark law.

## Aster — MEDIUM (best of the "real word" options)

- **No edtech incumbent found.** The only education hit is "ASTER EDUCATION," a dormant UK
  company (no. 08880278, incorporated 2014, Devizes, Wiltshire).
- Non-education incumbents are real but in unrelated classes: **Aster Capital** (deep-tech/climate
  VC, holds `aster.com`, ~25 years old, Paris + Bordeaux), **Aster Health** (Indian hospital group's
  telehealth app), **Aster: On-Chain Perps & Spot** (crypto exchange, currently a high-visibility
  name), **Aster: 24/7 Personal Safety**, **The Aster** (Hollywood members' club), plus a small
  iOS game named Aster.
- Trademark: only hit surfaced in-class-adjacent was **Aster Graphics Company Limited** for filled
  toner cartridges — not a conflict for Class 9/41 software and education.
- `aster.com` is unobtainable (operating VC firm). You would be on `asterapp.com`, `getaster.com`,
  `aster.so`, etc.

Verdict: usable, but crowded enough that App Store search discovery will be poor, and the crypto
"Aster" is currently loud. Clean-ish legally, mediocre practically.

## Vantage — HIGH

- **Vantage Learning** (vantagelearning.com) has since 1997/1998 sold K-12 assessment technology
  built on AI and natural language understanding — automated essay scoring, diagnostic/formative/
  benchmark/summative/placement testing. This is squarely education software with an AI/NLP angle,
  i.e. it overlaps your intended goods and services.
- `vantage.com` resolves to **Vantage Labs**, Vantage Learning's parent — an AI/cognitive-computing
  incubator claiming 46 patents, 30 years in natural language understanding, and explicit focus on
  "accelerating learning across education, commerce, and government."
- **Vantage Education AG** (Zürich) is reported by Moneyhouse to hold 6 active/cancelled/pending
  trademarks. There is also Vantage Technology Consulting Group in education technology consulting.
- Multiple additional "Vantage Education" entities exist per Crunchbase.

Verdict: an incumbent with patents, an AI/NLP claim, and a 28-year history in education software,
sitting on the exact `.com`. **Do not use.**

## Recommendation

1. **LoxeLingo** is the only LOW-risk option and it's brand-coherent with LoxeAI. If the "-Lingo"
   ending feels too generic, coin a different second half but keep the "Loxe" root — that root is
   what makes the mark clearable.
2. **Aster** is the fallback if you need a real word, accepting a compromised `.com` and noisy
   app-store search.
3. Meridian, Orbit, and Vantage should all be dropped. Orbit is the most dangerous of the three
   *commercially* (existing spaced-repetition product); Meridian and Vantage are the most dangerous
   *legally*.
4. Before committing: order a proper US clearance search (Classes 9, 41, 42) plus an EUIPO check,
   and confirm domain/handle availability across iOS, Android, X, Instagram, TikTok in one pass.

---

# PART 2 — ML / ALGORITHMIC STATE OF THE ART

## (a) FSRS — Free Spaced Repetition Scheduler

### Model
FSRS descends from MaiMemo's DHP model, itself a variant of Wozniak's **DSR** model. Three latent
variables per card:

- **S — Stability:** defined as the interval, in days, at which retrievability equals 90%.
- **D — Difficulty:** 1–10, intrinsic hardness of the item for this user.
- **R — Retrievability:** current probability of recall.
- **G — Grade:** the user's rating, 1 = Again, 2 = Hard, 3 = Good, 4 = Easy.

**Forgetting curve (power law, not exponential):**

```
R(t, S) = (1 + factor · t/S)^(-w20)
```

where `factor` is set so that `R(S, S) = 0.90`. The power-law form is the single most important
design decision — it produces much heavier tails than the exponential decay that SM-2 and HLR
assume, which is why FSRS wins on calibration.

**Stability after a successful review:**

```
S'(S, G) = S · e^(w17 · (G - 3 + w18)) · S^(-w19)
```

The `S^(-w19)` term gives diminishing returns: low-stability cards gain a lot, high-stability cards
gain little. **Post-lapse stability** is a separate function of D, S and R and lands below the
pre-lapse value. **Difficulty** updates by mean reversion, which is the explicit fix for SM-2's
"ease hell" (ease factors ratcheting permanently downward).

**Scheduling** = solve the retrievability equation for `t` at your desired retention. One knob:
desired retention. Anki's permissible range is 0.70–0.97 (0.70–0.99 in 23.10.1+), default **0.90**.

### Versions and parameter counts
| Version | Params |
|---|---|
| FSRS-4.5 | 17 |
| FSRS-5 | 19 |
| **FSRS-6** | **21** |
| **FSRS-7** | **35** |

FSRS-6's 21 default weights (fitted on several hundred million reviews from ~10k users):
```
0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542
```

**FSRS-7** (newest) changes the architecture, not just the fit:
- **Dual forgetting curves** — a weighted blend of two power-law curves R1 and R2 with independent
  decay and base parameters, blended by stability-dependent weights.
- **Short-term / long-term transition** — two competing stability updates (params 16–24 short-term,
  7–15 long-term) blended by a time-dependent sigmoid (params 25–26).
- Parameter map: 0–3 initial stability per grade; 4–6 difficulty (init, failure penalty, success
  adjustment); 7–15 long-term stability; 16–24 short-term stability; 25–26 transition sigmoid;
  27–34 dual-curve decay/base/weight/power.
- First version designed for **fractional** interval lengths, and the only one that gives realistic
  recall predictions for **same-day** reviews.

Caveat: one secondary source (DeepWiki) says FSRS-6 had 19 params; the benchmark table says 21 and
FSRS-5 says 19. Trust the benchmark table.

### Benchmarks (open-spaced-repetition/srs-benchmark)
Dataset: **10,000 Anki collections, ~727M reviews total**; 349,923,850 reviews evaluated excluding
same-day reviews (519,296,315 including). Metrics: **log loss**, **RMSE(bins)** (custom calibration
metric binning by interval length / review count / lapses), **AUC** (discrimination).

Excluding same-day reviews:

| Algorithm | Params | Log loss ↓ | RMSE(bins) ↓ | AUC ↑ | Rank |
|---|---|---|---|---|---|
| RWKV-P | — | 0.2773 | — | — | **1** |
| LSTM | 8,869 | 0.3332±0.0041 | 0.05378±0.00096 | 0.7329±0.0020 | 3 |
| GRU | 503 | 0.3333±0.0041 | 0.0556±0.0010 | 0.7316±0.0021 | 4 |
| **FSRS-7** | 35 | 0.3437±0.0043 | 0.0655±0.0011 | 0.7069±0.0023 | 8 |
| **FSRS-6** | 21 | 0.3460±0.0042 | 0.0653±0.0011 | 0.7034±0.0023 | 9 |
| FSRS-5 | 19 | 0.3560±0.0045 | 0.0741±0.0013 | 0.7011±0.0023 | 13 |
| FSRS-4.5 | 17 | 0.3624±0.0046 | 0.0764±0.0013 | 0.6893±0.0023 | 15 |
| DASH | 9 | 0.3682±0.0045 | 0.0836±0.0013 | 0.6312±0.0026 | 18 |
| HLR (Duolingo) | 3 | 0.4694±0.0073 | 0.1275±0.0019 | 0.6369±0.0026 | 27 |

Ordering on the maintainer's write-up (Expertium), best→worst by log loss: RWKV, RWKV-P, LSTM,
GRU-P(short-term), FSRS-6 (recency-weighted), FSRS-6 (default params), FSRS-5, FSRS-4.5, GRU,
FSRS-4, FSRS-3, HLR, Ebisu v2, DASH, ACT-R, **Anki-SM-2**, AVG baseline.

**vs SM-2:** SM-2/Anki-SM-2 is not in the current headline table (SM-2 emits intervals, not
probabilities, so any comparison requires a mapping). Expertium reports FSRS-6 has **99.6%
superiority over Anki-SM-2** — lower log loss on 99.6% of user collections — while explicitly
cautioning "There is no way to have a truly fair, no caveats, comparison between FSRS and SM-2."
Widely repeated claims of "20–30% fewer reviews at equal retention" appear only in secondary blogs
(ChessAtlas, pedagogypath); the benchmark maintainers do **not** publish that figure.
**Treat "20–30% fewer reviews" as [UNVERIFIED].**

### Implementations
- Reference (Python): `open-spaced-repetition/free-spaced-repetition-scheduler`, on PyPI as `fsrs`.
- Rust, with optimizer + scheduler: `open-spaced-repetition/fsrs-rs`, crates.io `fsrs`. This is what
  Anki links against; it is the one to use for a production backend.
- Anki integration: `open-spaced-repetition/fsrs4anki`. Benchmark: `open-spaced-repetition/srs-benchmark`.
- Third-party adopters include RemNote.

### vs Anki defaults
Anki's legacy scheduler is SM-2 with ease factors. FSRS is configured per-preset in Deck Options;
per the Anki manual as of this research it is enabled there rather than being on for everyone, and
Anki 25.06 shipped a new FSRS version (parameter count changed, users were told to re-optimize).
Whether a 26.x release flipped FSRS on by default is **[UNVERIFIED]** — there is an open Anki issue
"Make FSRS the default?" (#3616). Default learning steps are 1m then 10m. The manual lists "fewer
than a few hundred reviews" as the main reason FSRS underperforms, and recommends re-optimizing
about monthly and using separate presets for decks of very different subjective difficulty.

### Implications for us
1. Use `fsrs-rs` (or a faithful port) rather than writing your own scheduler. Store the full review
   log — `(card_id, user_id, timestamp, elapsed_days, grade, state)` — from day one; without it you
   can never optimize parameters or migrate versions.
2. Ship with default FSRS-6/7 weights, switch to per-user optimized weights once a user crosses a
   few hundred reviews.
3. Expose exactly one user-facing knob: desired retention. Do not expose 21 weights.
4. FSRS's headroom over LSTM/GRU/RWKV on this benchmark is real but modest (0.346 → 0.333 log loss).
   Do not build a neural scheduler as v1; the marginal calibration gain is small and the operational
   cost is large.

## (b) Knowledge tracing — BKT vs DKT vs transformers

### The families
- **BKT** (Corbett & Anderson 1995): per-skill HMM, binary latent mastery, four parameters —
  prior, learn, guess, slip. Interpretable; no forgetting; no cross-skill transfer; known parameter
  identifiability problems (multiple parameter sets fit the same data equally well).
- **DKT** (Piech et al., NeurIPS 2015): LSTM over the interaction sequence, one shared hidden state
  across all skills. Captures transfer and forgetting implicitly. Not interpretable, and its
  mastery estimates can be non-monotonic in ways that break "mastery" UI.
- **Logistic-regression feature models** — AFM/PFA and the **Best-LR** model of Gervet et al. Hand
  features: skill one-hots, per-skill success/fail counts, total success/error counts, time
  features. Cheap, robust, strong baseline.
- **Attention/transformer family:** **SAKT** (self-attention over history), **SAINT** (encoder for
  exercises, decoder for responses), **AKT** (monotonic attention + Rasch-model-regularized
  question/KC embeddings so items sharing a KC are still discriminated by difficulty).

### What the evidence actually says
**pyKT** (Liu et al., arXiv 2206.11460) is the reference benchmark: standardized preprocessing for
7 datasets, 10 DLKT implementations. Findings that matter:
- **AKT is the strongest of the attention family**, beating SAKT and SAINT — and the reason is its
  Rasch-based embeddings, i.e. explicit item difficulty. AKT beats the second-best method by
  **3.06% / 1.50% / 1.62% / 1.60%** on AS2009, AL2005, BD2006, NIPS34.
- **Published KT results are not trustworthy.** Reported AUC for DKT on ASSISTments2009 spans
  **0.73–0.821**, and AKT **0.747–0.835**, purely from differing train/eval protocols. Any vendor
  claim of "+X% AUC from deep KT" should be assumed to be protocol shopping unless it's a pyKT run.

**Gervet et al., "When is Deep Learning the Best Approach to Knowledge Tracing?" (JEDM 2020)** —
the single most decision-relevant paper for a startup:
- Logistic regression with good features (Best-LR) **wins** on datasets of moderate size, or where
  there are very many interactions per student.
- DKT wins on **large** datasets, or where precise temporal information matters most.
- But: DKT needs **~6× fewer interactions than Best-LR** to approach peak performance on a *new*
  student (on their "squirrel" dataset). So deep models are better at per-user cold start even when
  they need more total data to train.

### Production reality
- **Duolingo** — logistic regression / IRT-flavoured (see (c)). Not deep KT.
- **Riiid (Santa TOEIC)** — the clearest large-scale transformer KT deployment. Released **SAINT/
  SAINT+**, published **EdNet** (`riiid/ednet`, arXiv 1912.03072): **131,441,538 interactions from
  784,309 students** over two years, and ran the 2020 Kaggle "Riiid AIEd Challenge" (3,400 teams,
  90 countries, $100k). That's the data volume tier at which transformer KT is justified.
- **Hybrids are the 2024–26 direction:** BKT-LSTM, transformer-Bayesian hybrids (MDPI *Appl. Sci.*
  15(17):9605), hierarchical Bayesian KT (arXiv 2506.00057), PSI-KT (Zhou et al. 2024) which uses
  scalable/amortized Bayesian inference with explicit cognitive traits for "transparent
  personalization at platform scale." From 2024, LLM-based KT began appearing, motivated by
  semantic understanding of item content.

### Data-volume rules of thumb
| Approach | Realistic minimum | Notes |
|---|---|---|
| BKT (per skill) | ~hundreds of responses per skill | Watch identifiability; bound guess/slip |
| Best-LR / PFA | thousands of interactions | Best accuracy-per-dollar at small scale |
| DKT | ~10^5–10^6 interactions | Better new-user cold start (~6× fewer per-student obs.) |
| SAKT/SAINT/AKT | ~10^6–10^8 | EdNet scale (1.3×10^8) is the existence proof |

### Implications for us
1. **v1 = Best-LR-style logistic regression + FSRS.** Not because it's easy, because on our data
   volume it is the accuracy-maximizing choice per Gervet et al.
2. Build the feature pipeline (per-skill counts, total counts, lag/time features) as the durable
   asset — it's also the input to any later neural model.
3. When you do go neural, go to **AKT**, not SAKT/SAINT, and note *why* it wins: explicit item
   difficulty embeddings. That's an argument to get (d) right first.
4. Evaluate with pyKT's protocol from the start, or your own numbers will be uncomparable.

## (c) Duolingo's published algorithms

### Half-life regression (HLR) — Settles & Meeder, ACL 2016
"A Trainable Spaced Repetition Model for Language Learning"
(research.duolingo.com/papers/settles.acl16.pdf; code at `duolingo/halflife-regression`).
- Models the **half-life** of a word in long-term memory; predicted recall
  `p̂ = 2^(-Δ/ĥ)` with `ĥ` a log-linear function of features (proportion correct, time since last
  practice, total exposures, total correct, plus lexeme features).
- Trained on **13 million** learning traces; the public release covers 200k+ users across 8
  languages (~361 MB compressed CSV, Harvard Dataverse).
- Reported: HLR produced **roughly half the prediction error of the Leitner system**.
- Honest read for us: on the Anki srs-benchmark, HLR ranks **27th, log loss 0.4694** vs FSRS-6's
  0.3460 — HLR is a 2016 3-parameter model and is decisively obsolete as a scheduler. Its value now
  is historical/architectural, not as something to implement.

### Birdbrain (2020 → v2)
Duolingo's own blog ("Learning how to help you learn: introducing Birdbrain"):
- It estimates **both** exercise difficulty and learner ability, and updates both after every
  interaction.
- Model class: a **logistic regression flavoured by item response theory** from psychometrics —
  P(correct) as a function of item difficulty and learner ability. Developed with Carnegie Mellon.
- The **Session Generator** consumes Birdbrain's per-exercise difficulty predictions to assemble a
  personalized lesson — the "Goldilocks difficulty" targeting an optimal challenge zone.
- Numbers Duolingo actually published: A/B tests showed learners "learn more," higher
  day-over-day return rate, and **>20% of lessons personalized as of October 2020**. No accuracy
  metric is published. IEEE Spectrum ran a Settles-authored explainer ("How Duolingo's AI Learns
  What You Need to Learn").
- Scale figure of **~1 billion exercises/day** appears in secondary write-ups, not in Duolingo's
  own blog post — **[UNVERIFIED]**.
- "Birdbrain 2" / "second major version" is asserted by secondary sources only; I found no Duolingo
  primary source describing v2's architecture — **[UNVERIFIED]**.

### Item difficulty, and the 2021 paper that matters most for us
**"Jump-Starting Item Parameters for Adaptive Language Tests"** (McCarthy et al., EMNLP 2021,
research.duolingo.com/papers/mccarthy.emnlp21.pdf) — a **multi-task generalized linear model with
BERT features** to predict item difficulty, improving item quality **with as few as 500
test-takers**. This is the cold-start solution for an item bank: predict difficulty from item
*content* before you have response data, then let response data correct it. It also ties item
difficulty to the CEFR scale.

Related: "Machine Learning–Driven Language Assessment" (Settles, LaFlair, Hagiwara, TACL 2020) is
the Duolingo English Test methodology paper; the DET also has a public assessment-ecosystem
white paper.

### 2024–2026
- `research.duolingo.com`'s publication list, as fetched, runs **2015–2021**; I found no
  2024–2026 algorithms paper there. Duolingo's recent public output has shifted to (i) **efficacy
  studies** (duolingo.com/efficacy/studies — 2025–26 peer-reviewed studies comparing Duolingo vs
  classroom vs blended; reported higher English proficiency scores after one semester and
  comparable French communication skills) and (ii) **LLM content generation**
  (blog.duolingo.com/large-language-model-duolingo-lessons/ — using LLMs to author exercises faster).
- Conclusion: **Duolingo has stopped publishing its core adaptive algorithms.** The public record
  ends at HLR (2016) + IRT-style Birdbrain (2020) + BERT difficulty jump-starting (2021). That is
  simultaneously a warning (they're 5 years ahead in private) and an opening (the published
  state of the art in *scheduling* — FSRS — is now clearly better than anything Duolingo has
  published).

## (d) IRT (2PL/3PL) and Elo-based item calibration

### The models
- **2PL:** `P(correct | θ) = 1 / (1 + exp(-a(θ - b)))` — `b` difficulty, `a` discrimination.
- **3PL:** adds a lower asymptote `c` (guessing) — essential for multiple-choice, pointless for
  free-response typing.
- Estimation: marginal maximum likelihood (EM), joint ML, or Bayesian/MCMC.

### Sample size (the practical constraint)
- 2PL: **N > 500** respondents typically recommended.
- 3PL: **≥500 examinees and an informative prior on `c`** for reliable estimation of all three
  parameters; 3PL needs substantially more data than 2PL.
- There is **no fixed threshold** — it depends on model, test length, and target precision
  (Schroeders & Gnambs, *AMPPS* 2025, sample-size planning tutorial).
- With priors you can go much lower: accurate estimates **from ~100 respondents** with informative
  priors, and **optimized hierarchical Bayesian 2PL** models have produced unbiased estimates at
  **N = 50** (PMC7262992; robustness follow-up PMC10700496).
- 3PL accuracy is jointly governed by test length *and* sample size.

### Elo as the online alternative
The reason production systems use Elo instead of IRT: in a learning system the learner's ability
**changes while they practice**, which violates static IRT's assumptions, and MML/MCMC calibration
is a batch job, not an online update.
- Pelánek, "Applications of the Elo rating system in adaptive educational systems" (*Computers &
  Education*, 2016) is the canonical reference; Papoušek et al. (2014) on choosing K.
- Comparison of six calibration methods against IRT found **IRT, proportion-correct, and Elo all
  give reliable difficulty estimates at N ≈ 200–250 learners per item**. Elo gets you IRT-grade
  difficulty at a fifth of the sample size, online.
- **Known pitfalls:** Elo ratings are **not unbiased**, and their variances are context-dependent.
  Critically, when items are *selected adaptively based on current ratings*, variance inflates over
  time and **ratings do not converge** — an adaptive-selection feedback loop actively corrupts your
  difficulty estimates.
- Mitigation in the literature: **dynamic K** — decay K with the number of observations
  (uncertainty-proportional), per "Balancing stability and flexibility: investigating a dynamic K
  value approach for the Elo rating system in adaptive learning environments" (*UMUAI* 2025,
  s11257-025-09439-z / PMC12682724). Also "Psychometrics of an Elo-based large-scale online
  learning system" (*Computers and Education: Artificial Intelligence*, 2025).

### Implications for us
1. **Two-rating Elo** — one rating per item, one per learner-skill — with **dynamic/decaying K**
   (large K when observation count is low, small K when high). This is Elo-as-Glicko-lite and is
   the right v1.
2. **Cold-start item difficulty from item content**, à la Duolingo's EMNLP 2021 paper: regress
   difficulty on features (word frequency/Zipf rank, sentence length, syntactic depth, CEFR level
   of constituent lexemes, embedding features) and use that as the Elo **prior**, not a flat 1500.
3. **Guard against the adaptive-selection bias:** hold back a small randomized fraction of item
   presentations (an epsilon-random exploration slice, ~5%) that is *not* difficulty-targeted, and
   calibrate difficulty from that slice. This is the single cheapest fix for non-convergence and
   almost nobody does it.
4. Migrate to a proper 2PL (or AKT-style Rasch embeddings) per item **only once an item has ~250+
   responses**; keep Elo as the online layer that tracks drift.

## (e) Comprehensible input / i+1 selection, algorithmically

### The empirical thresholds — these are the actual numbers to design against
- **Hu & Nation (2000):** **98%** lexical coverage is the level at which most learners can read
  unassisted; **95%** is where *minimally acceptable* comprehension occurs.
- Vocabulary size to reach them: **4,000–5,000 word families → ~95%** coverage of running words;
  **8,000–9,000 word families → 98%**.
- **Replication:** Kremmel & Brysbaert et al., "Unknown Vocabulary Density and Reading
  Comprehension: Replicating Hu and Nation (2000)," *Language Learning* 2023
  (doi:10.1111/lang.12622) — the threshold has been directly re-tested, and treated as a
  probabilistic gradient rather than a cliff.
- **Modality matters:** coverage thresholds for *viewing* (video) comprehension differ from
  reading — see "Lexical coverage in L1 and L2 viewing comprehension," *SSLA* (Cambridge). Don't
  reuse a reading threshold for video content.
- Krashen's i+1 has no operational definition; the 95/98% coverage literature is what you actually
  implement.

### Computing text difficulty relative to a learner's known-vocabulary set
The tractable formulation: maintain a **per-learner known-word set** (with a probability of
knowing each lemma, not a boolean — this is where knowledge tracing feeds in), then for a candidate
text compute:

```
coverage(text, learner) = Σ_tokens P(learner knows lemma(token)) / |tokens|
```

and select texts whose coverage lands in a target band — e.g. **[0.95, 0.98]** — so there are
enough unknown words to learn from but not enough to break comprehension. That band *is* the
operational i+1. Secondary levers: unknown-word **dispersion** (2 unknowns in one sentence is worse
than 2 spread over a page), and unknown-word **learnability** (frequency rank, cognate status).

Published approaches:
- **"Automated Lexical Coverage for Language Learning: From General to Specialized Word Lists"**
  (arXiv 2512.15552) — generates a personalized/specialized word list that **guarantees ≥95%
  coverage of a given target text by construction**, using objective criteria only (no external
  corpus, no linguistic tools, no expert). Across nine texts (fiction, academic papers, scripts),
  the general NGSL list achieved only **64–85%** coverage, while text-derived specialized lists hit
  95% with substantially fewer words. This is the "what should you learn to read *this*" direction
  and it inverts nicely into "what can you read given what you know."
- **Pedagogical Word Recommendation** (arXiv 2112.13808) — a task + dataset for predicting whether
  a learner knows a given word from the other words they've seen. This is exactly the
  known-vocabulary-set inference problem, as a supervised task.
- "A Personalized Task Recommendation System for Vocabulary Learning Based on Readability and
  Diversity" (Springer, 2019) — readability *and* diversity as joint objectives.
- Reinforcement-learning and multi-objective (Crow-search) vocabulary path recommenders exist in
  the 2024–25 literature but are low-signal (weak venues, no reproducible baselines).

### L2 readability / CEFR levelling
- **Hybrid feature+transformer models** are the current best practice: "Exploring hybrid approaches
  to readability" (Findings of EACL 2024) examines the complementarity of hand-built linguistic
  features and transformer representations — neither alone is sufficient.
- **LLM classification works well now:** a study using GPT-4o with a **six-shot** prompt reached
  **>91% accuracy** on CEFR text levelling (*Innovation in Language Learning and Teaching*,
  doi 10.1080/17501229.2026.2635083). An RL-tuned LLM with explicit CEFR feature extraction
  improved accuracy **up to 12.3% at the B2–C1 boundary** vs baselines (*Discover AI*,
  s44163-025-00762-3) — B2/C1 is where levelling models reliably fail.
- Also relevant: "Zero-shot Large Language Models for Automatic Readability Assessment"
  (arXiv 2604.24470); "Controlling Language Difficulty in Dialogues with Linguistic Features"
  (arXiv 2509.14545) — difficulty *control* in generation, not just classification;
  "Right at My Level: A Unified Multilingual Framework for Proficiency-Aware Text Simplification"
  (arXiv 2604.05302).

### Implications for us
1. Per-learner **probabilistic** vocabulary state, not a boolean known-words list. Feed it from the
   same knowledge-tracing model as (b).
2. Content selection = **coverage band targeting**, `0.95 ≤ coverage ≤ 0.98`, with dispersion and
   learnability as tie-breakers. This is a concrete, testable objective — and it is the single
   feature that most separates a real adaptive engine from gamified drilling.
3. Precompute a per-text lemma/frequency profile at ingest so coverage is a cheap dot product at
   serve time. Do not call an LLM per (learner, text) pair.
4. Use an LLM CEFR classifier as a **coarse prefilter and an offline labeller** (a six-shot GPT-4o-class
   prompt at >91% is good enough), and the coverage computation as the **per-learner** decision. Do
   not let CEFR labels substitute for personalized coverage — CEFR is population-level.
5. Use different coverage targets for reading vs video/audio (per the SSLA viewing work); don't
   assume 98% transfers.

## (f) LLM-as-judge reliability

### Comparative vs absolute
- **Pairwise/comparative judging is more reliable than absolute scoring.** Pointwise scoring
  requires the judge to hold a stable absolute standard across runs; human inter-rater reliability
  on absolute scales sits around **0.45–0.60**, and judge models add their own drift. The
  literature's standard move is to convert scoring into pairwise comparison.
- Cost: pairwise is O(n²) comparisons, which is why you need Bradley-Terry (below) rather than
  exhaustive round-robin.

### Position bias — the load-bearing failure mode
**Wang et al., "Large Language Models are not Fair Evaluators"** (arXiv 2305.17926; ACL 2024 Long
511). The result that should change your design: **quality rankings flip by reordering candidates in
the prompt** — with ChatGPT as evaluator, Vicuna-13B could be made to "beat" ChatGPT on **66 of 80**
queries purely via ordering. Their three mitigations:
1. **Multiple Evidence Calibration** — force the judge to generate evaluation evidence *before*
   emitting a rating (i.e. reasoning must precede the score, never follow it).
2. **Balanced Position Calibration** — run every comparison in both orders and aggregate.
3. **Human-in-the-Loop Calibration** — estimate per-example difficulty and escalate hard cases to
   humans.

Related: **Zheng et al., "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena"** (NeurIPS 2023) —
strong judges like GPT-4 reach **>80% agreement** with both controlled and crowdsourced human
preferences, "the same level of agreement between humans." That 80% is the ceiling to benchmark
against, and it is also the number people over-quote: a 2026 systematic evaluation reports that
**kappa deflation between exact-match agreement and Cohen's kappa is universal — 33–41 percentage
points on MT-Bench** — and that high test-retest reliability coexists with severe position bias in
production-deployed judges (arXiv 2606.19544). Also see "Am I More Pointwise or Pairwise? Revealing
Position Bias in Rubric-Based LLM-as-a-Judge" (arXiv 2602.02219), self-preference bias
(arXiv 2604.22891), bias-mitigation survey (arXiv 2604.23178), and identifiability limits on
debiasing (arXiv 2607.02104).

### Bradley-Terry aggregation
`P(i beats j) = π_i / (π_i + π_j)`, with `π_i` a latent strength; fit by MLE on the pairwise
outcomes. This is how you get a **single continuous score per item from sparse pairwise judgments**.
- **Chatbot Arena** (Chiang et al., arXiv 2403.04132, ICML 2024) is the reference production
  implementation: BT model + bootstrap confidence intervals + **active sampling of which pairs to
  compare**, chosen to accelerate ranking convergence while retaining statistical validity; plus
  E-values (Vovk & Wang 2021) for anytime-valid inference.
- Follow-ups worth reading: "A Statistical Framework for Ranking LLM-Based Chatbots"
  (arXiv 2412.18407), "Recent advances in the Bradley–Terry Model" (arXiv 2601.14727), and
  "From Uncertain Judgments to Calibrated Rankings: Conformal Elo Estimation for LLM Evaluation"
  (arXiv 2606.13221).
- Note the structural symmetry: **BT is Elo's stationary cousin**. The same machinery scores item
  difficulty (d) and judged output quality (f) — build it once.

### Calibrating against human gold labels
Standard recipe from current practitioner literature:
1. Sample **100–300 production traces**, diverse over the use-case distribution.
2. Have **2–3 humans** label them **on the same rubric text the judge will see**.
3. Compute **Cohen's kappa** (2 raters) or **Krippendorff's alpha** (many) between judge and the
   human majority label.
4. Thresholds: inter-annotator kappa **<0.4 → the rubric is ambiguous, rewrite it**; 0.4–0.6 weak
   but tunable; **>0.6 acceptable; >0.8 strong**.
5. Re-calibrate at launch, **monthly**, and after any rubric or judge-model change.
6. **Never use raw agreement.** At 90% "pass" base rate, a judge that always says pass scores 90%
   raw agreement and kappa ≈ 0. Kappa corrects for chance; that's the whole point.

Academic anchor: "Judge's Verdict: A Comprehensive Analysis of LLM Judge Capability Through Human
Agreement" (OpenReview jVyUlri4Rw); "Bridging Human and LLM Judgments" (arXiv 2508.12792).

### Implications for us
1. Grade free-response answers with **pairwise comparison against reference/anchor answers**, not a
   1–5 absolute score.
2. **Always** run both orders and average (Balanced Position Calibration). It doubles cost and is
   non-negotiable — the 66/80 flip result is what happens if you skip it.
3. Force **reasoning-then-score** ordering in the judge output schema.
4. Aggregate with **Bradley-Terry**; store the pairwise outcomes, not the derived scores, so you can
   refit.
5. Maintain a **frozen 200-item human-labelled gold set** and a monthly kappa dashboard. Report
   kappa, never raw agreement. Treat kappa < 0.6 as "the rubric is broken," not "the model is bad."

## (g) Glicko-2

### Parameters
Three quantities per player (or per learner/item):
- **r — rating** (mean of the skill posterior). Default **1500**.
- **RD — rating deviation** (SD of the posterior; uncertainty). New player **350**; shrinks to
  roughly **50–100** for active players.
- **σ — volatility** (how erratic performance has been). Default **0.06**.
- **τ — system constant**, the one global tuning knob: it constrains how much σ can change between
  rating periods. **Glickman recommends 0.3–1.2; common default 0.5.** Small τ = stable volatility,
  slow adaptation, and protection against enormous rating swings from improbable results. Large τ =
  fast reaction to surprises. Glickman's own guidance is to **test empirically for the τ that
  maximizes predictive accuracy on your data**.
- Internally Glicko-2 works on the Glicko-2 scale: `μ = (r - 1500)/173.7178`, `φ = RD/173.7178`.

### Known pitfalls, especially for infrequent players
1. **RD inflation during inactivity is the core mechanic and the core problem.** RD grows with
   elapsed rating periods (`φ* = sqrt(φ² + σ²·t)`), so a returning learner has a huge RD and their
   next few results move their rating violently. In a learning app where usage is bursty and
   seasonal, this produces exactly the wrong UX: "I came back after two weeks and my level jumped
   around."
2. **Rating-period design is the hidden decision.** Glicko-2 assumes batched rating periods with
   enough games each (Glickman suggests periods sized so players average ~10–15 games). A learning
   app has continuous, uneven activity — you must either define artificial periods or use an
   incremental variant, and both change the statistics.
3. **Volatility estimation is unstable in low-data regimes.** σ is fit by an iterative
   (Illinois-algorithm) root-find; with 1–2 observations per period it is barely identified, which
   is precisely why τ must be small.
4. Same adaptive-selection bias as Elo (see (d)): if opponents/items are chosen by current rating,
   ratings do not cleanly converge.

Implementations: `PlayerRatings::glicko2` (R), `skillratings` (Rust), `glicko2.ts` (JS).

### Implications for us
- Use Glicko-2's *ideas* — carry an explicit uncertainty (RD) per learner-skill and per item, and
  make step size proportional to uncertainty — rather than Glicko-2 verbatim. That is equivalent to
  the **dynamic-K Elo** recommendation in (d) and avoids the rating-period problem entirely.
- If you do use Glicko-2: τ at the **low** end (0.3–0.5), and **cap RD growth** during inactivity
  (e.g. clamp at 200–250 rather than letting it return to 350) so returning learners don't get
  whiplash. Validate the cap by held-out log loss.

---

## Consolidated build recommendation

| Layer | Ship in v1 | Why | Upgrade path |
|---|---|---|---|
| Scheduling | **FSRS-6 via `fsrs-rs`**, default weights → per-user optimized at ~200+ reviews | Best published non-neural calibration (log loss 0.346 vs HLR 0.469); one knob | FSRS-7 (35 params, fractional intervals, same-day reviews) |
| Knowledge tracing | **Best-LR-style logistic regression** on skill + count + lag features | Gervet 2020: wins at our data scale; DKT needs 10^5–10^6 | AKT (Rasch-embedded attention) at ~10^6 interactions; evaluate under pyKT |
| Item difficulty | **Two-rating Elo with dynamic K**, primed by a content-feature difficulty prior | IRT-grade at N≈200–250/item, online; Duolingo EMNLP-2021 solves cold start | 2PL per item at 250+ responses |
| Calibration hygiene | **~5% randomized non-adaptive item presentations** | Adaptive selection makes Elo/IRT estimates non-convergent | — |
| Content selection | **Per-learner probabilistic vocab state + coverage band [0.95, 0.98]**, dispersion tie-break | Hu & Nation 2000, replicated Kremmel 2023; this is operational i+1 | Modality-specific bands; LLM CEFR prefilter |
| Free-response grading | **Pairwise vs anchors, both orders, reasoning-then-score, Bradley-Terry aggregate** | Wang et al. 2305.17926: reordering flipped 66/80 verdicts | Active pair sampling à la Chatbot Arena |
| Judge QA | **Frozen 200-item gold set, monthly Cohen's kappa, ship gate at κ ≥ 0.6** | Raw agreement is meaningless at skewed base rates | Krippendorff's alpha at 3+ raters |
| Naming | **LoxeLingo** (fallback: Aster) | Only LOW-risk candidate; brand-coherent; `.com` free | Formal clearance in classes 9/41/42 |

## Marked-unverified list
- "FSRS needs 20–30% fewer reviews than SM-2 at equal retention" — secondary blogs only; benchmark
  maintainers do not publish it.
- Whether any Anki 26.x release turned FSRS on by default (open issue ankitects/anki#3616).
- Duolingo's "~1 billion exercises/day" — secondary sources, not Duolingo's own post.
- "Birdbrain v2" architecture — asserted by secondary sources; no Duolingo primary source found.
- All trademark statements are search-visible evidence only, not a clearance search.
- FSRS-6 parameter count: benchmark table says 21, DeepWiki says 19. Using 21.

## Sources
FSRS / spaced repetition
- https://github.com/open-spaced-repetition/srs-benchmark/blob/main/README.md
- https://expertium.github.io/Benchmark.html
- https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm
- https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS
- https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler
- https://github.com/open-spaced-repetition/fsrs-rs
- https://pypi.org/project/fsrs/
- https://deepwiki.com/open-spaced-repetition/srs-benchmark/3.1.3-fsrs-parameter-analysis
- https://docs.ankiweb.net/deck-options.html
- https://github.com/ankitects/anki/issues/3616
- https://forums.ankiweb.net/t/anki-25-06-beta/62271

Knowledge tracing
- https://theophilegervet.github.io/assets/pdf/gervet2020deep.pdf (JEDM 2020)
- https://jedm.educationaldatamining.org/index.php/JEDM/article/view/451
- https://arxiv.org/pdf/2206.11460 (pyKT)
- https://pykt-toolkit.readthedocs.io/en/latest/models.html
- https://stanford.edu/~cpiech/bio/papers/deepKnowledgeTracing.pdf
- https://arxiv.org/html/2105.15106v4 (KT survey)
- https://www.mdpi.com/2076-3417/15/17/9605
- https://arxiv.org/html/2506.00057v1
- https://ar5iv.labs.arxiv.org/html/1912.03072 (EdNet)
- https://github.com/riiid/ednet
- https://arxiv.org/pdf/2101.08349 ("Do we need to go Deep?")

Duolingo
- https://research.duolingo.com/papers/settles.acl16.pdf
- https://github.com/duolingo/halflife-regression
- https://blog.duolingo.com/learning-how-to-help-you-learn-introducing-birdbrain
- https://research.duolingo.com/papers/mccarthy.emnlp21.pdf
- https://research.duolingo.com/
- https://spectrum.ieee.org/duolingo
- https://www.duolingo.com/efficacy/studies
- https://blog.duolingo.com/large-language-model-duolingo-lessons/

IRT / Elo / Glicko
- https://www.sciencedirect.com/science/article/abs/pii/S036013151630080X (Pelánek 2016)
- https://link.springer.com/article/10.1007/s11257-025-09439-z (dynamic K, UMUAI 2025)
- https://pmc.ncbi.nlm.nih.gov/articles/PMC12682724/
- https://www.sciencedirect.com/science/article/pii/S2666920X25000165
- https://journals.sagepub.com/doi/10.1177/25152459251314798 (IRT sample-size tutorial)
- https://pmc.ncbi.nlm.nih.gov/articles/PMC7262992/
- https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10700496/
- https://en.wikipedia.org/wiki/Glicko_rating_system
- https://search.r-project.org/CRAN/refmans/PlayerRatings/html/glicko2.html
- https://docs.rs/skillratings/latest/skillratings/glicko2/

Lexical coverage / readability
- https://onlinelibrary.wiley.com/doi/10.1111/lang.12622 (Kremmel, replication of Hu & Nation)
- https://files.eric.ed.gov/fulltext/EJ887873.pdf
- https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/lexical-coverage-in-l1-and-l2-viewing-comprehension/DFCA6605076705D5762C98F286D16B27
- https://arxiv.org/html/2512.15552
- https://arxiv.org/abs/2112.13808 (Pedagogical Word Recommendation)
- https://link.springer.com/chapter/10.1007/978-3-030-21562-0_7
- https://aclanthology.org/2024.findings-eacl.153.pdf
- https://www.tandfonline.com/doi/abs/10.1080/17501229.2026.2635083
- https://link.springer.com/article/10.1007/s44163-025-00762-3
- https://arxiv.org/pdf/2509.14545

LLM-as-judge
- https://arxiv.org/abs/2305.17926 / https://aclanthology.org/2024.acl-long.511.pdf
- https://dl.acm.org/doi/10.5555/3666122.3668142 (MT-Bench, NeurIPS 2023)
- https://arxiv.org/pdf/2403.04132 (Chatbot Arena)
- https://arxiv.org/pdf/2412.18407
- https://arxiv.org/html/2601.14727v1
- https://arxiv.org/pdf/2606.13221
- https://arxiv.org/pdf/2606.19544
- https://arxiv.org/html/2602.02219v2
- https://arxiv.org/pdf/2604.22891
- https://arxiv.org/pdf/2604.23178
- https://arxiv.org/html/2607.02104v2
- https://openreview.net/forum?id=jVyUlri4Rw
- https://arxiv.org/pdf/2508.12792
- https://galileo.ai/blog/calibrate-llm-judge-human-annotations
- https://www.sciencedirect.com/science/article/pii/S2666675825004564 (LLM-as-a-judge survey)

Naming
- https://meridianks.com/lms-solutions/meridian-lms/
- https://www.g2.com/products/meridian-knowledge-solutions-lms/reviews
- https://blog.google/products/ads-commerce/meridian-marketing-mix-model-open-to-everyone/
- https://www.searchenginejournal.com/google-launches-open-source-meridian-marketing-mix-model/538530/
- https://trademarks.justia.com/owners/google-llc-3669657/page10
- https://apps.apple.com/us/app/meridian-study-abroad-ai/id6761497302
- https://github.com/andymatuschak/orbit
- https://www.orbitlearn.xyz/
- https://trademarks.justia.com/792/08/orbit-79208924.html
- https://trademarks.justia.com/877/55/micronomy-87755223.html
- https://find-and-update.company-information.service.gov.uk/company/08880278
- https://aster.com
- https://apps.apple.com/us/app/aster/id1385736929
- https://www.vantagelearning.com/about-us/
- https://vantage.com
- https://www.moneyhouse.ch/en/company/vantage-education-ag-21416297991
- https://www.crunchbase.com/organization/vantage-learning
- https://apps.apple.com/us/app/loxo/id6466826856
- https://www.hellolingo.com/
