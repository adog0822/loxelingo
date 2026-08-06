# Design Spec, Part 2: Learning Engine, Psychology, Social Architecture

**Date:** 2026-08-05
**Part 1:** `2026-08-05-competitive-language-platform-design.md`
**Research:** `docs/research/00-market-brief.md`, `docs/research/01-competitor-sweep.md`

---

## 1. Competitive position (post-sweep)

**Verdict: the concept is not taken, but it is surrounded.** Nobody ships async 1v1 + AI comparative judging of open-ended production + a real rating ladder for language.

### Unclaimed — these are the moat
1. **AI comparative judging of two learners' open-ended production.** No prior art found. The hard problem, and the one that makes the rating mean anything.
2. **Multiple independent per-skill ladders** in a language app.
3. **A companion whose capabilities unlock from proven mastery.** Language pets exist (Lexie, Lingua Pet); mastery-gated agent capability does not.

### Commoditized — do not treat as differentiation
Leagues, daily puzzle with shareable grid, tournaments, seasons, streaks, language pets, space/celestial theming. Wordle Global already runs per-language dailies with emoji grids in 91+ languages.

### The actual threat: Duolingo, with every component unassembled
- **Friends Clash** — async 1v1, 60s rounds, player two has ~2 days, best-of-three. Announced Sept 2024, limited rollout. **No rating, no stranger matchmaking, no identical tasks, no AI judging.**
- **Duolingo Score** — 0–130, CEFR-aligned, IRT-based. A real language rating, but solo-derived, not PvP.
- **Rated real-time PvP matchmaking in production** for the Chess course (iOS late 2025, Android Mar 2026).
- Leagues (10 tiers, **with demotion** — our promotion-only design is a genuine differentiator), monthly Diamond tournaments, ~50M DAU, 2026 an "investment year," Speaking Adventures mid-2026.

**Strategic consequence — priority reordering:**
- **CJK depth first.** Japanese, Korean, Mandarin script and morphology ladders. Duolingo's weakest surface, and where US Gen Z demand is most intense (LingoDeer exists for precisely this reason).
- **Judging pipeline gets disproportionate engineering.** It is the moat.
- **The Daily ships as distribution, not defense.**

**Other actors:** *LearnClash* (Mar 2026) — async 1v1 + Glicko-2 + 8 tiers + same price band, on general-knowledge MCQ, ~7 App Store ratings. Proves the architecture is easy to build and hard to make matter. *Gizmo* — 13M Gen Z users, $22M Series A (Apr 2026), no rating and no language vertical; the distribution threat. *Conjuguemos Live* — multiplayer conjugation races already familiar in US high-school Spanish/French classrooms; a brand risk, since the ICP may associate the mechanic with homework.

---

## 2. The learning engine

Spine: the skill-acquisition sequence from cognitive science — declarative → procedural → automatic — plus comprehensible input at volume. Five layers, each with a solo and a competitive surface.

### Layer 1 — SPARK (conceptual/declarative) · 30–60s
A **minimum viable explanation in context**: the pattern shown in use three times in real content, one line of explanation, one production attempt, exit. The only place new concepts enter the system. Never longer than 60 seconds.

*Rationale:* Duolingo fails at both extremes — no explanation (infinite inference) or bloated trees. Brief explicit instruction followed immediately by practice outperforms both.

### Layer 2 — FORGE (procedural → automatic) · the grind
High-volume drilling under time pressure: conjugation, kanji/hanzi readings, particles, agreement, word order.
- Solo: **Trials** (FSRS-scheduled)
- Competitive: **FORGE ladder** (rated 1v1), **Gauntlet** (unrated endless run)

**This layer is the concept's core justification.** Automaticity requires practice under *speed pressure specifically*; untimed drilling produces declarative knowledge that never becomes fluent. The time pressure is the pedagogical mechanism, not a game gimmick — and a rated match is the most natural delivery vehicle for it. The game design and the pedagogy want the same thing.

Corollary: nobody grinds flashcards for fun; everyone grinds ranked. Same repetitions, different frame — and unlike a streak, the compulsion points at *more reps*, which is exactly what the learning requires.

### Layer 3 — SITUATION (transfer) · DUEL ladder
Task-based briefs with real communicative goals under constraint. Judged comparatively; the better answer is always revealed.

### Layer 4 — IMMERSION (comprehensible input) · RECALL ladder
Real content — anime clips, lyrics, webtoon panels, short video, podcasts — selected algorithmically at i+1.

**Best motivation/method fit in the design.** The ICP's actual goal is understanding anime unsubbed and parsing lyrics, so the content is simultaneously the reward and the practice. Every unknown word tapped becomes a Trial item and a constellation star.

### Layer 5 — WILD (production in the world) · the Companion
Draft-and-approve real tasks, hard-capped at proven mastery.

---

## 3. ML architecture

The layer that separates this from a quiz app with a leaderboard. *(Specifics under verification by a research agent; build against interfaces.)*

| System | Purpose |
|---|---|
| **FSRS** | Review scheduling, trainable on the user's own review logs. Materially better than SM-2/Anki defaults. |
| **Knowledge tracing** (Bayesian → deep) | Per-concept mastery probability. Drives SPARK sequencing, Trials selection, the constellation, and **companion capability gating**. The keystone model. |
| **Elo-rated items** | Items and players on the *same* scale, so difficulty matching is automatic and ratings are meaningful. Same approach as chess puzzle ratings. |
| **IRT (2PL)** | Item difficulty and discrimination calibration from response data. |
| **Comprehensibility model** | Immersion content selection: % known tokens against the mastery vector, targeting the lexical-coverage threshold. |
| **Dynamic-K Elo** | Player rating with step size proportional to uncertainty, so lapsed players are re-measured rather than punished. **Not Glicko-2** — it assumes rating periods that learning apps violate, and its volatility term is unidentifiable at 1–2 observations per period. |
| **5% random holdout** | ~5% of item presentations are randomized and non-adaptive. **Critical:** when items are selected adaptively by current rating, variance inflates and item difficulty never converges. Calibrate difficulty from the holdout slice only. |
| **Bradley-Terry aggregation** | Turns pairwise LLM verdicts into stable scores; calibrated against a human-labeled gold set. **Non-negotiable: LLM judges have position bias and drift, and an unmonitored judge silently corrupts every rating on the platform.** |
| **Churn prediction** | Times interventions precisely instead of spraying notifications. |

---

## 4. Psychology: pull, not push

**Organizing principle.** Duolingo *pushes* — guilt, loss, nagging. Fortnite *pulls* — something is happening and you want to be there. Identical behavioral economics, opposite emotional valence. The tell is whether the app seems afraid you will leave.

**Implemented:**
- **Seasons with real end dates.** Honest scarcity: Season 1 cosmetics never return; peak rating is recorded permanently.
- **Sunk cost, honestly — the constellation.** Real accumulated value that cannot be rebuilt elsewhere. Making the investment *legible* is the ethical form.
- **True-proximity prompts.** "40 points from Gold, season ends in six hours" — only when true, and only when acting costs ~60 seconds. Backed by ICWSM 2023: first threshold crossings are the highest-leverage retention events in a rating system.
- **Variable reward without gacha.** A rated match is already a variable-reward event with real stakes.
- **Network effects as the return trigger.** "Kenji answered. Your move." A specific human is waiting — a fact, not a manipulation.
- **Play before signup.** First match inside 60 seconds, no account. You own a rating before you own an account, so signup becomes protecting something rather than paying something.

**Explicitly rejected:**
1. **No energy, hearts, or timers gating learning.** The most-hated mechanic in the category, and it contradicts "learning is never paywalled." Scarce cosmetics yes; scarce practice never.
2. **No guilt notifications.** Every notification is about the world moving, never about the user's failure.
3. **Streak reframed as a record, not a fragile object — freezes free and automatic.** Streak anxiety is what makes people quit; a streak that forgives is a streak that lasts. The ICP is highly manipulation-literate and screenshots Duolingo's notifications as jokes; being *seen* as manipulative costs more than the retention it buys.

---

## 5. Social architecture

- **Ask** — Q&A threads anchored to *specific objects*: this kanji, this grammar point, this match replay. Not a generic forum. More useful, and it generates indexed pages — per the chess.com data, organic search is the real growth engine (81.9M clicks/quarter).
- **Natives** — a verified native-speaker role earning standing for answering. Status-motivated expertise, Stack Overflow-style.
- **Annotated replays** — explain your answer. Teaching is the strongest form of learning (protégé effect) and generates content for free.
- **Rivals** — persistent head-to-head records, auto-formed from rematch chains.
- **Crews** — squads, crew-vs-crew, shared boards.
- **Rating-gated tournaments** — "1500+ only." Manufactures aspiration and confers legitimacy on the number.
- **Spectating** — watch the top of the ladder.

---

## 6. Open items

- Product name (clearance in progress). Leaning **Meridian** — a line of longitude circles a world and locates you on it; fits the worlds-and-altitude system and doesn't cap the brand at language the way "-Lingo" does.
- ML specifics pending research verification.
- Per-match judging cost, unverified.
