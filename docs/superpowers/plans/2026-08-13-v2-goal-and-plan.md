# LoxeLingo v2 — Goal and Plan

**Date:** 2026-08-13
**Supersedes scope in:** `2026-08-05-loxelingo-v1-plan.md` (v1 shipped; this expands it)

---

## The goal

Solve loneliness by letting anyone on earth grow alongside anyone else. On the surface a language platform. Underneath, a social space.

A player learns by **teaching**. They get an avatar who knows as little as they do, they take a short segment, then they teach it back under pressure inside a situation that is absurd, funny or high stakes. They are scored on whether the avatar can now do the thing. Separately they compete live against other humans for a global rating shown beside their nationality.

**The measure of success:** a stranger with no account finishes a first lesson, teaches it back to a character they chose, and wants to tell someone about it.

---

## Decisions taken (2026-08-13)

| Decision | Choice | Consequence |
|---|---|---|
| Core loop | Teaching is solo progression; **PvP becomes live real-time** | The async DUEL/FORGE/RECALL ladders retire as the competitive surface. Their content and judging survive. |
| Rating scale | **Rescale to 0–10,000 now** | Display transform and altitude bands move. No migration, since no real ratings exist. |
| Voice | **Conditional on research** | Build only if the cost-benefit lands. Browser platform availability is the open question. |
| Avatars | **Recognizable homage** | Traits, mannerisms and cadence track the source. Names, faces, verbatim catchphrases and trademarks do not. |
| Infrastructure | **Stay on Vercel + Supabase** | Realtime gives websockets, Supavisor gives pooling, RLS gives authorization. Revisit AWS when we outgrow it, not before. |

### The cold-start risk, and the mitigation

Live PvP has a hard problem the async design did not: at zero population there is nobody to match. The original research is explicit that synchronous, appointment-shaped play has no retention floor, and it is what killed HQ Trivia.

**Mitigation:** a live match seats a **labeled bot** when no human is available within the wait window. The 275 stored bot performances become that bot's play. The mode works with two people online and improves as population grows. Bots stay labeled in the data and in the UI. A disguised bot is fraud and is fatal for a competitive brand.

---

## What survives from v1

Guest-first auth with identity linking that preserves `auth.uid()`. The Elo engine and FSRS scheduling. The item bank, `cold_start_beta` and the 5% randomized holdout. The whole judging pipeline: comparative, both orderings, reasoning before verdict, Bradley-Terry aggregation, and the Cohen's kappa gate that keeps ratings frozen until a judge is calibrated. All migrations and seeds. 95 items and 275 bot performances across Japanese and English.

## What is new

The teaching loop. Avatar personality system. Onboarding with placement. Six-stage progression. Live PvP with presence and matchmaking. Leaderboards with nationality. Spanish content. A CEFR level gate on generated content. Communities.

---

## Phases

Each phase is self-contained and ends with verification. Phases inside a wave have disjoint file ownership and run in parallel.

### Phase 0 — Research *(in flight)*
Voice cost-benefit and browser platform reality. Curriculum spines, licences, Hugging Face datasets, the CEFR checker, tokenization per language. **Gate:** no content pipeline work begins until licensing is clear. "It is on GitHub" is not a licence.

### Wave 1

**Phase 1 — Rating rescale to 0–10,000.**
The display transform only. Internal logits are unchanged. `DISPLAY_INIT`, `DISPLAY_SCALE`, the generated Postgres columns, the altitude bands and `display-scale.test.ts` move together. The test that reads the migration file keeps a one-sided edit impossible.

**Phase 2 — Avatar system.**
New `avatars` table: trait vector as points across named axes, name, look descriptor, voice guide, and the homage line recorded explicitly. Five characters. An avatar starts at the player's level and holds its own per-language teaching progress. Distinct from `bots`, which are opponents; an avatar is a student.

### Wave 2

**Phase 3 — The teaching loop.**
Learn segment of two to five minutes, then teach-back under constraint. A new judging rubric scored on whether the avatar can now perform the thing, not on whether the player's prose was elegant. Six stages, Novice to Expert. Reuses the existing both-orderings and kappa machinery.

**Phase 4 — Onboarding and placement.**
Email and age, Resend for delivery, avatar selection, an avatar-led tour of ratings, leaderboards and the social layer, then the first lesson. Guest-first stays: play before signup, claim later.

### Wave 3

**Phase 5 — Spanish, and the CEFR gate.**
Spanish content to parity with Japanese. Generated content passes a level classifier before reaching a player, with a re-prompt loop on failure. Lemmatize, then check frequency against the curriculum spine.

**Phase 6 — Live PvP.**
Supabase Realtime for presence and matchmaking. Match state in memory, one write at settlement. Bot seating when no human is available. Sabotage is a single string asset code over the wire; the client renders it.

### Wave 4

**Phase 7 — Leaderboards.** Global, per language, with nationality. Ranked by the PvP rating.
**Phase 8 — Communities.** Anonymous handles, tags, voting, moderation. Carries real safety obligations from day one.
**Phase 9 — Voice.** Only if Phase 0 supports it.

---

## Standing constraints

Learning is never paywalled and never gated behind energy or hearts. Ratings stay frozen until the kappa gate passes. Bots and avatars are labeled as such in data and UI. Every reader-facing string follows `docs/design/copy.md`: no em-dashes, no negative framing, no "no X, no Y, no Z", never the word "genuinely". Content is pre-generated and served static wherever possible; a player fetching a lesson should not wake an LLM.
