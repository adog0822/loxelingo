# LoxeLingo v1 — Implementation Plan

**Date:** 2026-08-05
**Specs:** `docs/superpowers/specs/2026-08-05-competitive-language-platform-design.md` · `docs/superpowers/specs/2026-08-05-learning-engine-and-social-design.md`
**Research:** `docs/research/00-market-brief.md` · `docs/research/02-ml-and-naming.md` · `docs/research/03-learning-libs.md`
**Design:** `docs/design/design-system.md`

Each phase is self-contained and executable in a fresh context. Every phase cites its documentation sources and ends with a verification checklist.

---

## The v1 line

**Ships in v1** (the three moat pillars plus the wedge, and nothing that isn't):
- AI comparative judging of open-ended production — **moat pillar 1**
- Three independent rated ladders — **moat pillar 2**
- Mastery-gated Companion — **moat pillar 3**
- CJK depth (Japanese first, then Korean, Mandarin) — **the wedge**
- Play-before-signup, The Daily, promotion-only leagues, Trials, constellation, Rivals

**Deferred to v1.1:** Crews, Ask threads, annotated replays, Natives role, Gauntlet, rating-gated tournaments, Echo (speaking), Spanish/French/German worlds.

Rationale: the competitor sweep found leagues, dailies, tournaments, seasons, streaks, pets, and space theming all commoditized. Only the four items above are defensible, so they get the engineering.

---

## Phase 0 — Documentation Discovery *(in progress)*

Four parallel agents establishing actual APIs. Output is an **Allowed APIs** list that every later phase must cite. No phase may proceed on assumed signatures.

1. Next.js / Vercel / AI SDK v6 / AI Gateway / queues / cron
2. Supabase `@supabase/ssr`, anonymous auth + identity linking, RLS performance patterns
3. ts-fsrs signatures, review-log training schema, dynamic-K Elo, Bradley-Terry, CJK tokenization
4. Design system: palette, typography with CJK, motion, altitude bands, screen compositions

**Gate:** do not write implementation code until all four report, and until any "UNVERIFIED" item that a phase depends on has been resolved.

---

## Phase 1 — Foundation

**Implement:** project scaffold, auth, schema, RLS.

**Critical requirement — guest-first auth.** A user plays their first match with no account and earns a rating, then converts. This means anonymous sign-in at first touch and identity linking on conversion, preserving the same user id and all rating history. If Supabase anonymous auth cannot link cleanly to OAuth, that is a blocking finding and the auth approach changes — Phase 0 agent 2 is verifying this.

### Data model

Static config (seeded, not user data): `worlds`, `ladders`, `concepts`, `items`, `cosmetics`, `seasons`.

**Identity & progression**
- `profiles` — display name, handle, avatar, primary world, created_at, is_guest
- `user_worlds` — user × world enrollment, joined_at, last_active
- `user_ratings` — user × world × ladder → rating, games_played, uncertainty, peak_rating, peak_season
- `user_concept_mastery` — user × concept → mastery probability, last_updated, first_seen. **The keystone table**: drives SPARK sequencing, Trials selection, constellation rendering, and companion capability gating.

**Learning engine**
- `cards` — user × item → FSRS scheduling state (stability, difficulty, due, state, reps, lapses)
- `review_logs` — **append-only, never mutated.** Exact column set dictated by the FSRS optimizer's training input format (Phase 0 agent 3). Getting this wrong on day one means never being able to optimize parameters or migrate FSRS versions. Highest-stakes schema decision in the project.
- `item_stats` — item difficulty rating, presentation count, correct count, IRT params, **`is_holdout_presentation` support**

> **The 5% holdout rule.** ~5% of item presentations must be randomized and non-adaptive, and item difficulty is calibrated *from that slice only*. When items are selected adaptively by current rating, variance inflates and difficulty never converges. This must be designed in from the first schema, not retrofitted.

**Match loop**
- `matches` — world, ladder, task/prompt ref, created_at, status, season
- `match_participants` — match × user, submitted_at, rating_before, rating_delta, result
- `submissions` — participant's answer: text or media ref, elapsed_ms, keystroke/timing features, paste_detected
- `judgments` — verdict, per-axis scores, reasoning text, judge model + version, **both position orderings stored separately**, aggregated Bradley-Terry score
- `judge_gold_labels` — human-labeled calibration set with the exact rubric text shown to the judge

**Progression & social**
- `daily_puzzles` (world × date), `daily_results` (+ share grid)
- `leagues`, `league_divisions`, `league_members` — **promotion-only; no demotion path in the schema**
- `rivalries` — pair, head-to-head record, auto-created from rematch chains
- `companions` — user × world: level, unlocked capabilities, cosmetics, memory
- `companion_actions` — draft-and-approve audit log. Every draft, every approval, every send.
- `entitlements`, `user_cosmetics`, `subscriptions`

**Verification:** RLS policies on every user-data table, tested with a second user's JWT. Anonymous→permanent conversion preserves user id and ratings, proven by a test. Migrations run clean from empty. `review_logs` column set matches the optimizer's documented input exactly.

**Anti-patterns:** deprecated `@supabase/auth-helpers`; `getSession()` server-side instead of `getUser()`; service-role key reachable from the client; RLS policies calling `auth.uid()` unwrapped; any mutation or deletion path on `review_logs`.

---

## Phase 2 — Design system

Implement `docs/design/design-system.md` as code: CSS custom properties, Tailwind theme, typography with CJK fonts loaded correctly, motion primitives with reduced-motion handling, the altitude bands, and the base component layer.

**Verification:** contrast ratios pass on every palette pair; CJK glyphs render at display sizes without fallback substitution; reduced-motion disables all non-essential animation; no default shadcn styling left visibly untouched on primary surfaces.

**Anti-pattern:** shipping recognizable template defaults. The competitor sweep found the space theme is commoditized — execution is the only differentiator here.

---

## Phase 3 — Content pipeline & item bank (Japanese first)

The unglamorous phase that determines whether the product has anything to do. CJK depth is the wedge.

**Implement:** ingest jōyō kanji + JLPT tiers with stroke data and readings; a word list with frequency ranks; a grammar-point inventory; CJK tokenization and lemmatization; per-item concept mapping; and **item difficulty cold-start from content features** (the EMNLP 2021 approach — predict difficulty from item content so the bank works before any response data exists).

**Verification:** every item maps to ≥1 concept; tokenizer round-trips a Japanese corpus sample; cold-start difficulty predictions correlate with JLPT tier; licensing documented for every data source.

---

## Phase 4 — Engines

Pure, unit-testable modules with no I/O: dynamic-K Elo (players and items), FSRS scheduling wrapper, knowledge tracing (feature-based logistic regression — **not** deep KT at this scale), and the comprehensibility scorer (coverage in the 0.95–0.98 band, with dispersion and learnability tie-breaks).

**Verification:** property tests — ratings are zero-sum, K decreases with games played, FSRS intervals monotonic in stability, coverage computed correctly against a known vector. Golden-file tests against reference implementations.

---

## Phase 5 — Match loop & judging pipeline *(moat pillar 1 — highest engineering priority)*

Async performance-pool matchmaking: match against a *stored* performance, so density depends on cumulative rather than concurrent players.

**The judging pipeline is the moat and must be built defensively:**
- Comparative (A vs B), never absolute scoring
- Reasoning emitted **before** the verdict, never after
- **Both position orderings run and aggregated** — position bias is severe enough that reordering alone flipped outcomes on 66 of 80 queries in the ACL 2024 study
- Bradley-Terry aggregation of pairwise outcomes into stable scores
- Structured output against a fixed rubric; the rubric text is versioned and stored with each judgment
- Cohen's kappa calibration against human gold labels — **never raw agreement**

**Verification:** judge agreement κ > 0.6 against a 100–300 item human-labeled set before any rating is written to a user profile. Order-swap disagreement rate tracked and alarmed. An always-pass judge must fail the calibration gate.

---

## Phase 6 — The three ladders

DUEL (construction under constraint), RECALL (comprehension race, audio playback only — no recording), FORGE (morphology/script under time pressure). Independent ratings per world per ladder.

**Verification:** tilting in one ladder leaves the others untouched; matchmaking pairs within rating band; the 5% holdout fires at the correct rate.

---

## Phase 7 — The Daily & play-before-signup

One identical global drill per world, 48-hour window, spoiler-free shareable grid. First match inside 60 seconds with no account.

**Verification:** time-to-first-match under 60s on a cold load; share grid leaks no answers; guest conversion preserves everything.

---

## Phase 8 — Progression

Trials (FSRS queue), constellation view, promotion-only leagues, seasons, true-proximity prompts.

**Verification:** no code path demotes a league member. Notifications reference world events, never user failure — grep the copy. Streak freezes apply automatically.

---

## Phase 9 — The Companion *(moat pillar 3)*

One per world. Capability gate driven by `user_concept_mastery` — **hard-capped at proven mastery**, draft-and-approve only, every action logged.

**Verification:** a test proving the companion cannot produce language above the user's mastery ceiling. No autonomous send path exists anywhere in the codebase.

---

## Phase 10 — Rivals & minimal social

Persistent head-to-head records from rematch chains. Results feed.

---

## Phase 11 — Integrity

Paste detection, response-time anomalies, collusion/boosting detection, labeled bots for cold-start density.

**Verification:** bots are labeled in the UI and in the API response — a client cannot mistake a bot for a human.

---

## Phase 12 — Final verification

Every implementation checked against Phase 0's Allowed APIs list. Grep for invented APIs and deprecated patterns. Full test run. Judge calibration re-run. Load-test matchmaking at simulated density.
