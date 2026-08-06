# Design Spec: Competitive Language Platform (working name TBD)

**Date:** 2026-08-05
**Status:** Awaiting user approval before implementation planning.
**Research basis:** `docs/research/00-market-brief.md`

---

## 1. What this is

A competitive ladder with learning as the mechanism of advancement — not a learning app with a leaderboard attached. The reference model is chess.com: a *chess ladder* that happens to make you better at chess.

**The core mechanic — the opponent is the lesson.** You receive a brief with a hard time limit and a required constraint. Your opponent receives the identical brief. You both answer. Then you see theirs — someone rated above you solving the exact problem you just solved, better — and a verdict explaining precisely why you lost.

That is comprehensible input, pitched at your level, delivered by a peer, at the moment of maximum emotional salience, because you just lost to it. No lesson can manufacture that attention. **Duolingo has to beg you to care about the content; here you care because you got beaten by it.** It is also the one element a bundler cannot replicate, because it requires your rivals and your rating history.

## 2. Positioning and ICP

- **ICP:** US Gen Z. Fandom-driven and school-driven learners.
- **Worlds at launch (6):** Japanese, Korean, Mandarin, Spanish, French, German.
- **Motivation model:** fandom and identity, not self-improvement. Anime, K-pop, manga, webtoons, dramas, travel, heritage. Fandom motivation retains like fan communities retain — not like New Year's resolutions.
- **Why US-first despite a smaller TAM:** US Gen Z taste is a cultural export. Winning here makes international expansion *pull* rather than push. Adding a language is content, not code, so the architecture generalizes. Beachhead, not ceiling.
- **The wedge against Duolingo:** it is weak precisely where this is strong — CJK languages (LingoDeer exists for this reason), a brand that reads childish to Gen Z, and no competitive social layer at all.

**Brand register: rank as dignity, expressed as altitude.** Every incumbent sells self-improvement, which is a guilt product. Competitive platforms sell identity, a pride product. "I'm 1600 in Japanese" is a sentence people say about themselves unprompted. Not aspiration — **standing.** Earned, contested, revocable, therefore real.

## 3. Visual system

Derived from user-supplied references: immense scale, one dominant celestial light, atmospheric haze, the feeling of standing somewhere vast. One reference warm rose-gold dusk, one deep indigo night threaded with earned light.

Three mappings that make the aesthetic functional rather than decorative:

1. **Each language is a world.** You don't study Spanish, you enter it. Six worlds, each with its own celestial identity, horizon, and palette. Home screen is worlds in motion; the user clicks through into an immersive space.
2. **Rating is altitude.** Low rating: ground level, in the haze, sun not visible. Climbing thins the haze. High rating: above the cloud deck, the planet filling the sky. A number becomes something you see yourself standing in.
3. **Mastery is a constellation.** Every character, word, and grammar point owned is a star. Over months your sky fills in. Simultaneously the progression system, the shareable artifact, and the hero image.

**Palette:** deep indigo base; warm rose-gold for everything earned. Cold vast unknown, warm earned light.

## 4. Product surfaces

### Rated ladders (async 1v1, independent dynamic-K Elo rating per world per ladder)
- **DUEL** — construction under constraint. Text production: rewrite, persuade, translate, complete. Judged on task completion, accuracy, register, range.
- **RECALL** — comprehension race. Listen or read under time pressure, answer faster and more accurately. *Audio playback only — no recording, therefore no moderation surface.*
- **FORGE** — morphology under time pressure. Per-world content: kanji readings and hanzi/hangul in CJK worlds; verb conjugation and agreement in Romance and Germanic worlds. Solves the script-depth asymmetry between world types with one ladder.

**Dynamic-K Elo.** Step size proportional to rating uncertainty, so a learner who disappears for three weeks re-finds their level fast instead of being punished for having a life.

*Corrected 2026-08-05: earlier drafts specified Glicko-2. Glicko-2 assumes discrete rating periods — a structure learning apps violate — and its volatility parameter is barely identifiable at 1–2 observations per period, producing rating whiplash for returning learners. Dynamic-K Elo keeps the uncertainty-proportional step size without the broken assumption. See `docs/research/02-ml-and-naming.md` §g.*

**Independent ratings are a retention mechanism, not a feature.** Tilting in DUEL sends you to FORGE, not to the App Store. This is chess.com's bullet/blitz/rapid structure and it is the single most important reason its DAU compounds while individual players tilt.

### Unrated surfaces (the pressure valves — all gain, no loss)
- **The Daily** — one identical global drill per world, 48-hour window, spoiler-free shareable grid. This is both the retention floor (it catches you on days you don't want to fight anyone) and the primary organic growth lever.
- **Gauntlet** — endless run against escalating difficulty. Score-chase, leaderboard, no rating exposure.
- **Echo** — private speaking practice. On-device STT, self-scored, never uploaded, never broadcast.

### Progression
- **Trials** — the mastery tree, SRS-backed. Feeds the constellation.
- **Bosses** — milestone gates that are real tasks, e.g. understand a full unsubbed clip, complete an order.
- **Leagues** — weekly ~50-player divisions, **promotion-only, never demotion.** The rating carries all loss aversion; the league carries pure accumulation. Copied deliberately from chess.com.
- **Seasons** — themed, time-boxed, cosmetic rewards.

### Social
- **Crews** — squads with shared boards.
- **Rivals** — persistent head-to-head records against named humans, formed naturally out of rematch chains.
- **Replays** — watch how a higher-rated player answered your prompt.
- **Results feed** — not a chat feed. *"Maya just beat a 1700 in Japanese RECALL."* Ambient competitive presence.
- **Profile** — the flex object. Ratings, constellation, companion, badges, season banners, rare cosmetics.

### The Companion
One per world. A creature native to that world that you grow.

- **It is a capability gate, not fine-tuning.** No per-user model training. Its abilities are unlocked by your mastery constellation; its knowledge is what you have proven you own. Implementation: system prompt + capability gate + retrieved mastery state. It *feels* like training because the gate is real.
- **It cannot exceed your mastery.** Non-negotiable. A companion that can do language work you can't is Google Translate in a costume and it destroys the reason to learn. Capped at your constellation, the incentive inverts: leveling your companion becomes the reason to learn.
- **Draft-and-approve, never autonomous.** It composes; the user sends. Rationale: an agent autonomously messaging or transacting on a young user's behalf in a language they don't fully understand is a real harm surface; the user learns from reading the draft; and the user stays the author of anything sent in their name.
- **Real-world tasks:** read a menu photo, explain what a comment actually means, draft a reply to a creator, walk through an order. Utility that exists only because it was leveled.
- Collecting one per world makes multi-language learning legible as collection.

### Bots
Used to seed ladder density at launch. **Labeled, always.** Named characters with personalities and ratings — chess.com's bots are beloved precisely because they are characters. Unlabeled bots masquerading as humans is fraud, and when it surfaces it is fatal for a competitive brand.

## 5. Business model

**App is free. Learning is never paywalled.** Paid tier at $1.99–$5.99/mo:
- Expanded companion capabilities, action volume, and memory
- Unlimited deep post-match breakdowns (free tier: one per day)
- Cosmetics and identity items: profile, companion appearance, world skins, constellation themes
- Season pass

Two principles: **paywall emotion and identity, never learning.** And the free tier stays genuinely generous because DAU is the asset — chess.com converts 0.75% of registered users but roughly 17% of DAU.

*Note: the credential model (verified rating sold as proof of proficiency) was evaluated and dropped. It required employer demand, which exists for English proficiency in BPO markets but not for recreational Korean. It remains a viable later expansion if the platform moves into English-learning markets.*

## 6. Architecture

**Matchmaking: async performance pool ("ghost matching").** Every match is against a *stored performance*. The opponent need not be online. You are matched against a recorded answer from someone in your rating band; they receive your result when they next open the app. Density becomes a function of *cumulative* players rather than *concurrent* ones — the difference between needing 100,000 simultaneous users and needing a few hundred total.

Layered later: **direct challenges** as rivalries form out of rematch chains. Held for later: **live synchronous** matches, for tournaments and the spectacle layer only, once there is an audience to spectate.

**Judging: comparative, not absolute.** The judge answers "which of these two performances is better, and why" — a dramatically easier and more reliable problem than "what CEFR level is this." Structured rubric, cached prompts, batched. Latest Claude models via Vercel AI Gateway.

**Proposed stack (pending confirmation):**
- Next.js on Vercel, mobile-first, installable PWA. Expo wrapper follows once the loop is proven.
- Supabase: Postgres, auth, RLS, storage.
- Vercel AI Gateway for model access.
- Postgres-backed job queue for judging.
- On-device STT for Echo (whisper.cpp / WASM).

**Tradeoff accepted:** web-first weakens app-store distribution and push notifications, and push matters for an async-match daily loop. iOS PWA push requires install-to-home-screen. Judged worth it for speed to a stunning UI and because the available design tooling targets web.

**Anti-cheat (ladder integrity):** paste detection on text input, response-time anomaly detection, translation-tool signals, collusion and boosting detection via win-pattern anomalies, labeled bots. Lower stakes than a credential product, but ladder integrity is still load-bearing — and moderation cost scales faster than compute (Lichess spends 4x more on moderation than on servers).

## 7. Constraints inherited from research

1. **Async-first, never appointment-based.** Synchronous scheduled play has no retention floor.
2. **The AI is referee, opponent-generator, and companion — never the relationship.** AI apps convert 52% better and churn ~30% worse; every winner has a non-AI habit underneath. The habit here is humans and rating.
3. **Separate the loss-bearing ladder from the gain-only ladder.** Rating falls; leagues only rise; Daily and Gauntlet are unrated.
4. **Build for DAU, price against DAU.**
5. **Do not become a point solution.** The defensible assets are the social graph, rating history, constellation, and companion — not any single feature.
6. **First threshold crossings are the highest-leverage retention events** (ICWSM 2023, Codeforces). Make early tier boundaries frequent and celebrated, then space them out.

## 8. Open items

- Product name. Candidates: ORBIT, VANTAGE, ASTER, MERIDIAN.
- Web-first vs native-first confirmation.
- Per-match judging cost (unverified — research session exhausted its web budget).
- Whether Echo ships in v1 or immediately after.
