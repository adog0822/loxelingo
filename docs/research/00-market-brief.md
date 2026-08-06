# Competitive Language Learning — Market Brief

**Date:** 2026-08-04
**Status:** Synthesis of three completed research streams. Raw data in `01-incumbents.md`, `02-consumer-ai-2026.md`, `03-chess-case-study.md`, `harvested-partial-research.md`.
**Confidence markers:** [R] = reported by primary source · [E] = third-party estimate, directional only.

---

## 1. The one-paragraph thesis

Language learning has no rating. Chess has Elo. Competitive programming has Codeforces. Every game has MMR. Language has CEFR — a static, expensive, annual certificate issued by a declining incumbent. There is no live, public, contested, globally-comparable number that answers "how good is your Spanish, right now, relative to everyone else on Earth." **That number is the product.** Lessons, AI tutors, and content are scaffolding whose only job is to move the number. The number is also the business: it is a credential, and the credentialing incumbent is in visible retreat.

---

## 2. The incumbent field is in structural retreat

This is the most underrated fact in the space. The category's strategic acquirers have all taken impairments:

| Asset | Buyer | Price | Status Aug 2026 |
|---|---|---|---|
| **Mondly** (100M learners, 41 languages) | Pearson, 2022 | ~$67M+ | **Being wound down.** All marketing ceased 30 Jun 2026; technical development stopped entirely — no further features. A zombie/harvest asset. [R] |
| **Busuu** (120M registered) | Chegg, 2021 | **$436M** | Still inside Chegg. **Chegg's entire market cap is ~$96M.** Analysts value Busuu standalone at **$50–150M**. Activist (Galloway Capital, 5.44%) demanding breakup. [R] |
| **Drops** (55+ languages) | Kahoot, 2020 | ~$50M | ~$4.4M ARR. [E] |
| **Rosetta Stone** | IXL, 2021 | $792M | The only healthy one — and IXL is an operator-consolidator, not a strategic diversifier. Launched "Sapphire" Aug 2026. [R] |

Other signals of retreat:
- **Babbel killed Babbel Live for consumers** (bookings closed 30 Jun 2025). Stated reason: individual learners "did not accept Babbel Live as part of their language learning path." Live instruction survives only in B2B. Replaced by AI ("Babbel Speak"). CEO said an IPO is **"off the table"** (27 Jun 2025). Last real revenue figure is FY2024 **€352M, +6.6%** — single-digit growth. [R]
- **Busuu B2C grew 6% while B2B grew 39%** (Q2 2025). The money left consumer. [R]
- **Memrise has not raised since June 2018** (~$25.3M total, 8 years ago). UK filings put FY2023 revenue in the **£1–10M** band. [R-ish]
- **Lifetime/one-time pricing is spreading** among subscale players — Pimsleur "All Access Lifetime," Lingvist's 10-year deal, LingoDeer's $299.99 tier. Textbook signal of subscription-growth exhaustion.
- **Pearson downgraded its English Language Learning guidance** in H1 2026 — institutional growth "more than offset by declines in Pearson Test of English." **The credentialing incumbent is shrinking.** [R]

**Read:** nobody has cracked consumer social language learning, the field's best-funded attempts are being written down, and the certification incumbent is weakening. That is an unusually clean opening.

---

## 3. The retention wall — the single most important design constraint

**RevenueCat, State of Subscription Apps 2026** (115,000+ apps, $16B revenue, 1B+ transactions) [R]:

| Metric | AI apps | Non-AI apps |
|---|---|---|
| Free-trial → paid conversion | **8.5%** | 5.6% |
| Year-1 realized LTV | **$30.16** | $21.37 |
| **Annual-plan retention** | **21.1%** | **30.7%** |
| Monthly-plan retention | 6.1% | 9.5% |
| Refund rate | **4.2%** | 3.5% |

RevenueCat's own framing: **"AI sells, but it doesn't stick."** AI apps generate 41% more revenue per payer and churn ~30% faster. AI monthly plans retain **36% worse** over 12 months.

Corroborating evidence that AI novelty does not convert:
- **Nano Banana**: +22M incremental downloads in 28 days → **$181K** incremental revenue.
- **Meta Vibes**: +2.6M downloads in 28 days → **~zero** revenue.
- **Sora**: 9.6M lifetime downloads, **$1.4M** lifetime consumer spend = **$0.15/download**. Jan 2026 installs −45% MoM; fell out of US top 100.
- **Claude**: $2.69 revenue/download — highest measured. **ChatGPT/GPT-4o images: +12M downloads → ~$70M incremental spend.**
- **Midjourney fell from a16z's top 10 to #46** once ChatGPT/Gemini/Grok bundled image generation. Point solutions get absorbed.
- New AI-assisted app launches went from **~2,000/month (Jan 2022) to 14,700+/month (Jan 2026)**. Differentiation is compressing; switching is costless.

**The pattern in the winners:** ChatGPT, Gemini, Claude, and Notion all have a **non-AI habit underneath the AI**. Notion's AI attach rate went 20% → 50% in a year because Notion was already a habit.

### Design implication (non-negotiable)
**An AI conversation partner is a feature that churns. A rating you can lose to a human being is a habit.** The AI must be the referee, the opponent-generator, and the content factory — never the relationship. The retention has to come from other people and from a number you are afraid to lose. If the core loop is "talk to the AI," this product dies on the RevenueCat curve regardless of how good the model gets.

---

## 4. Chess.com is the real playbook — and it publishes its books

Chess.com posts quarterly board reports with genuine operating metrics at `chess.com/board-reports`. This is the highest-quality primary source in the entire consumer-competitive space and almost every write-up misses it.

### Scale
| Date | Registered | Avg DAU | Games/quarter |
|---|---|---|---|
| Jun 2020 | 35M [R] | 1.3M (Mar 2020) | — |
| Dec 2022 | **100M** [R] | 7M (first time) | — |
| Jan–Feb 2023 | — | **10–11M peak** | 31.7M games in one day |
| Q4 2025 | 243M+ | **8.7M** (+17.5% YoY) | 2.5B (+20.6%) |
| **Q1 2026** | **252M+** | **9.7M** (+17.7% YoY) | **2.6B** (+14.5%), 360 games/sec |

**Critical caveat that most people miss:** the registered:DAU ratio *degraded from ~7% to 3.8%* while the company grew. The Jan 2023 11M DAU was a **peak, not a level** — quarterly-average DAU only reached 9.7M three years later. Registered-user counts are vanity. Build for DAU.

### Business
- **1.5M paying subscribers against 200M registered = 0.75% conversion on registered, ~17% on DAU.** [R, Apr 2025] Plan for DAU-based conversion, not registered.
- Revenue **~$150M (2023)** [E]; never officially disclosed. Bootstrapped from a **$70,000 loan** in 2009; first outside money (General Atlantic) not until 2022. Crossed $1B valuation 2023. **664 staff, fully remote.**
- **85% of new registrations are from outside the US.** [R]

### The retention mechanics that actually work

**The rating is the currency — proven by their own accounting.** Chess.com **refunded 113.1M rating points in Q4 2025 and 127.6M in Q1 2026** as compensation for cheating and outages. When they wrong a user, they pay them in *rating points, not money*. Nothing else in this research demonstrates so cleanly what users actually value.

**Loss-bearing and gain-only ladders are deliberately separated:**
- **Rating** (bullet/blitz/rapid/daily/puzzles, each independent) — carries the loss aversion. Multiple independent ratings mean a bad day on one ladder never removes your reason to play; you switch ladders instead of churning.
- **Leagues** (Wood → Stone → Bronze → Silver → Crystal → Elite → Champion → Legend, weekly, ~50-player divisions, reset Sundays) — **promotion-only. "You can never go back down once you advance."** Pure gain. Trophies earned from normal play, weighted by time control: **Rapid win = 15, Blitz = 9, Bullet = 3** — a direct session-length lever.
- **Puzzle Rush / Puzzle Battle / Lichess Puzzle Storm** — explicitly **unrated**. Score-chase stripped of rating downside.

**The daily puzzle is the streak engine:** 48-hour completion window, flame icon, **1M+ solvers every single day** since 5 Dec 2022. [R]

**The paywall sits on the post-loss emotional peak:** free tier = **1 Game Review/day, 3 rated puzzles/day, 1 Puzzle Rush/day**. Chess.com's chief growth officer attributed growth partly to the **AI-powered Game Review** shipped in 2021. [R] The free tier gives exactly enough to form the habit; the paywall attaches to the moment of maximum emotional intensity — immediately after losing.

**Anti-engagement features exist and matter:** Lichess ships **Zen mode** (hides your rating, opponent's rating, chat) and **no global leaderboard on Puzzle Storm**, with the stated reason: *"where there is a leaderboard, there is cheating."*

### The creator-flywheel finding that contradicts conventional wisdom
PogChamps peaked at **375,110 CCV (2021)**; hours watched fell **1.54M (2020) → 0.72M (2025)**. Chess.com's own Q1 2026 social metrics: **impressions −34% YoY, interactions −57%, new followers −46%.** In that same quarter registrations grew **+23.8%** and DAU **+17.7%**.

**Growth decoupled from the creator layer.** What actually drives it now: **81.9M organic search clicks/quarter**, **17.3M mobile installs/quarter**, 85% international registrations, esports legitimation (Esports World Cup 2025, $1.5M pool), and Netflix documentaries. Influencer seeding is an ignition strategy, not a growth loop.

### Lichess — what a free competitor costs
Lichess publishes a fully itemized budget: **$789,389/year total**, of which **servers are only $64,824 (8.2%)**. It runs **5.2M games/day at $0.00042 per game**. Moderation & ops ($246,760) costs **4x** what servers do. It serves ~18% of Chess.com's game volume on ~0.5% of its revenue base — by refusing to monetize retention (no ads, no paid analysis, no daily caps; patrons get cosmetic wings and nothing else).

**Read:** in a competitive platform, compute is cheap and **trust & safety is the real cost line**. Budget for moderation and anti-cheat as a first-class expense, not an afterthought.

---

## 5. The rating-as-identity literature

There is no peer-reviewed paper on chess "rating anxiety" specifically. The closest and best citation is on a near-identical Elo system:

> **"Personal History Affects Reference Points: A Case Study of Codeforces," ICWSM 2023, DOI 10.1609/icwsm.v17i1.22164**

Findings: users show **increased loss aversion immediately after crossing a rating milestone** — heightened reluctance to risk new standing. Prior difficulty reaching a threshold **strengthens** the bias; repeated crossings **weaken** it; **first crossings produce the strongest effect.** The authors note the model can be used to predict behavior and to "motivate people to remain more active."

Supporting: Dota 2 SDT study (PMC7372929) found **perceived competence and autonomy were the only significant predictors** of MMR performance beyond matches played. "Got Skillz?" (ACM 2014) is the canonical matchmaking↔engagement study (~50-50 win rates and perceived mastery drive continued play).

**Design implication:** first-time threshold crossings are the highest-leverage retention events in the product. Make tier boundaries frequent, visible, and celebrated early — then space them out.

---

## 6. The AI consumer moment — is the thesis right?

Largely yes, with one correction.

**Scale is real:**
- **ChatGPT: 900M WAU** (Feb 2026) [R]; **1B mobile MAU in May 2026 — fastest app ever to 1B MAU (3 years)** [R, Sensor Tower]; **$25B+ annualized revenue**; **50M+ consumer subscribers**.
- **Gemini: 750M MAU (Q4 2025) → 950M+ (Q2 2026)** [R].
- **Meta AI: 1B+ MAU** across Meta apps [R, Q1 2025].
- **Time spent in gen-AI apps: 48B hours in 2025 = 3.6x 2024, ~10x 2023.** H1 2026 alone: **36B hours**, more than double H1 2025. [R]
- **AI app IAP revenue more than tripled to $5B+ in 2025** — but **ChatGPT alone was $3.4B of it (~68%)**. [R]
- **2025 was the first year non-gaming app IAP revenue surpassed games** (+21% vs +1.3%). [R]

**The correction to the thesis:** "the only new icon on your home screen is ChatGPT" is directionally right but the reason is not that consumer AI is early — it is that **AI is being absorbed into existing habits faster than it creates new ones.** a16z's 6th edition (Mar 2026) changed its own methodology to include legacy apps where AI became core (Canva, CapCut, Notion, Grammarly), and explicitly warned that "as AI moves from a destination to a feature, our methodology will need to shift." Midjourney's fall to #46 is the same story.

**So the durable-consumer-AI question is not "what can the model now do?" It is "what habit can only exist because the model exists, that a bundler cannot absorb?"** A social graph plus a contested rating ladder is exactly that: OpenAI can add a language tutor tomorrow; it cannot add *your rivals and your rating history*. Network effects and identity are the moat. The AI is a commodity input — which, given tokens falling ~10x/year, is precisely what you want it to be.

**Geography confirms the billion-user target is not in the US:** per-capita AI adoption ranks Singapore 1st, UAE 2nd, Hong Kong 3rd, South Korea 4th, **US 20th.** China's AI app MAU: **~710–851M in Q1 2026, +51% QoQ**, with Doubao alone at **382M MAU**. And **22 of a16z's global mobile top-50 are Chinese-origin apps, 19 of them targeting overseas audiences.**

---

## 7. Sharpened concept

**The category:** not a learning app with a leaderboard bolted on. A **competitive ladder with learning as the mechanism of advancement** — the way chess.com is a chess *ladder* that happens to make you better at chess.

**The four layers:**

1. **The Rating.** Live, public, globally comparable, per-language, per-skill. Loss-bearing. Multiple independent ladders (so a bad session moves you sideways, not out). This is the identity object.
2. **The Match.** Async-first head-to-head. AI generates the task, judges both sides, and explains the verdict. Async is non-negotiable — see §8.
3. **The Ladder Furniture.** Promotion-only leagues, an unrated daily puzzle with a streak, seasons, national/regional leaderboards. All gain, no loss — the counterweight to the rating.
4. **The Credential.** The rating, verified, sold as proof. Free to earn, paid to certify. The incumbent (PTE/IELTS/TOEFL) is declining and Pearson just said so in its own guidance.

**Brand positioning:** Every language app on the market sells **self-improvement**, which is a guilt product — Duolingo's owl is a nag, and the streak is something you protect out of obligation. Competitive platforms sell **identity**, which is a pride product. "I'm 1450 rapid" is a sentence people say about themselves unprompted. The goal is for someone to say **"I'm 1600 in Spanish"** the way they say "I'm a Diamond player." That is the "sense of being" — not aspiration, **standing**. Earned, contested, revocable, and therefore real.

---

## 8. Hard constraints the research imposes

1. **Async-first, never appointment-based.** Synchronous scheduled play has no retention floor. Live matches can exist as a premium/spectacle layer, but the daily loop must work alone at 3am.
2. **The AI is the referee, not the friend.** Retention comes from humans and from rating. (§3)
3. **Separate the loss-bearing ladder from the gain-only ladder.** Rating falls; leagues only rise; daily puzzle is unrated. (§4)
4. **Anti-cheat is a first-class cost centre, not a v2 feature.** Lichess spends 4x more on moderation than servers. Chess.com closed **412,200 accounts for fair play in Q1 2026 alone** and refunded 127.6M rating points. A language rating that becomes a credential will be attacked from day one — by ringers, by translation tools, by scripted audio.
5. **Build for DAU, price against DAU.** Chess.com converts 0.75% of registered but ~17% of DAU.
6. **International-first, mobile-first, SEO-heavy.** 85% of chess.com registrations are non-US; growth runs on 81.9M organic clicks and 17.3M installs per quarter, not on influencers.
7. **Monetize the competitive layer, not the AI novelty.** Paywall the post-loss analysis moment — the highest emotional intensity in the session, and the one thing users will pay for repeatedly.
8. **Do not become a point solution.** Anything a bundler can absorb, it will (Midjourney → #46). The defensible assets are the social graph, the rating history, and the credential.

---

## 9. Open questions blocking design

- What is the contested skill in a match — production (speaking/writing) or comprehension? Determines cost, cheat surface, and social risk.
- Voice or text as the primary modality? Deepest architectural fork; drives unit economics.
- Beachhead: the billion (English learners in India/Brazil/Indonesia/Vietnam) or the money (US/EU hobbyists)? These want different products.
- What does the rating actually predict, and how do we validate it against CEFR to make the credential credible?
- How do you make a losable rating tolerable for beginners, given the foreign-language-anxiety literature?
