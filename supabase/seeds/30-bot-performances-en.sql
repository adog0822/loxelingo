-- =============================================================================
-- LoxeLingo — the launch bot performance pool for world `en`, ladder `duel`.
--
-- The English twin of supabase/seeds/bot-performances.sql (world `ja`). Same three-row
-- structure, same derived ids, same authored timestamps, same assertions, same roster.
-- Two things are different: the language (§0 is the authoring discipline English needs and
-- Japanese does not), and the load order (§L, the one place this file cannot mirror the
-- Japanese one).
--
-- -----------------------------------------------------------------------------
-- WHY THIS FILE EXISTS
-- -----------------------------------------------------------------------------
-- `chooseOpponent` (src/lib/match/matchmaking.ts) seats an opponent by finding a STORED
-- `PoolPerformance` for the item. Bots do not answer on demand — a bot is "just an authored
-- ghost", occupying a seat through the identical code path as a human. On a fresh database
-- the `en` pool is empty, `chooseOpponent` returns `kind: 'none'`, and `startMatch` returns
-- `no_opponent`. This file is the floor under that: 5 bots × 15 en duel items = 75
-- performances, so a brand-new account always has an opponent on any English duel item.
--
-- -----------------------------------------------------------------------------
-- §L  LOAD ORDER — the one structural difference from the Japanese pool
-- -----------------------------------------------------------------------------
-- config.toml has `sql_paths = ["./seed.sql", "./seeds/*.sql"]`. The CLI expands that glob in
-- SORTED order, which was measured, not assumed:
--
--   Seeding data from supabase/seed.sql...                        <- ja concepts + items
--   Seeding data from supabase/seeds/bot-performances-en.sql...   <- THIS FILE
--   Seeding data from supabase/seeds/bot-performances.sql...      <- ja pool
--   Seeding data from supabase/seeds/english-content.sql...       <- en concepts + items
--
-- `bot-performances-en.sql` < `english-content.sql`, so THIS FILE RUNS BEFORE THE ITEMS IT
-- NEEDS EXIST. The ja pool never had this problem: it depends only on ./seed.sql, which
-- config.toml names explicitly and first. Every other file in ./seeds obeys the same
-- convention — depend on ./seed.sql and nothing else in ./seeds — and this is the first file
-- that cannot, because the English items live in a sibling.
--
-- THE REAL FIX IS ONE LINE IN config.toml, which this file is not permitted to touch:
--     sql_paths = ["./seed.sql", "./seeds/english-content.sql", "./seeds/*.sql"]
-- (the glob re-lists english-content.sql, and re-running it is a no-op by its own
-- idempotency). Apply that and §T below becomes dead code that should be deleted.
--
-- Until then the population is wrapped in `public.seed_en_duel_bot_pool()` and §T arms a
-- ONE-SHOT, SELF-REMOVING statement trigger on `public.items` when the items are not there
-- yet. english-content.sql inserts all 35 English items in a single statement; the trigger
-- fires once after it, populates the pool inside that same transaction, then drops itself and
-- both functions. End state after `npx supabase db reset`: a full pool and NO residue — no
-- trigger, no function, nothing added to the schema. If the load order is ever fixed, the
-- direct call in §T populates immediately and the trigger is never created at all. Both paths
-- run the identical function and the identical assertions, so neither can drift.
--
-- The function wrapper is the only reason this file is not a statement-for-statement mirror
-- of the Japanese one. The three inserts inside it are.
--
-- -----------------------------------------------------------------------------
-- THE SHAPE A PERFORMANCE MUST HAVE  (identical to the ja pool; restated, not assumed)
-- -----------------------------------------------------------------------------
-- `MatchmakingQueries.fetchPool` reads `submissions`, embeds the seat that produced it
-- through the COMPOSITE fk `submissions_seat_fk (match_id, seat)`, and inner-joins `matches`
-- for (item_id, world_slug, ladder_slug). A performance is therefore a THREE-row structure
-- and nothing less will be found:
--
--   matches            the origin match, carrying item_id + world + ladder
--   match_participants the seat, carrying is_bot / bot_slug / theta_before
--   submissions        the answer itself, carrying content + elapsed_ms + submitted_at
--
-- `toPoolPerformance` drops any row whose seat has no `theta_before` (it becomes NaN and
-- `fetchPool` filters it), so theta_before is mandatory, not decorative.
--
-- BOT LABELLING. `buildParticipants` throws unless `is_bot`, `user_id is null` and
-- `bot_slug is not null` all agree, and `match_participants_bot_xor_user` rejects the row
-- otherwise. Every seat below is (is_bot = true, user_id = null, bot_slug = <roster slug>).
-- The human-ness of a seat is a column, not an inference.
--
-- ONE SEAT PER ORIGIN MATCH. These matches are carriers, not contests: nobody played against
-- the bot, so there is no seat 2. The bot takes seat 1. `findOpenMatchForUser` filters on
-- `user_id = <caller>`, so a seat with a null user_id can never be mistaken for a player's
-- outstanding match.
--
-- STATUS `void`, RESULT `void`. The contract (src/lib/match/contract.ts) allows
-- awaiting_opponent -> void, and settle.ts writes exactly this pair when a match will not
-- produce a rated result. That is what an origin match is: never judged, and never to be
-- judged. `void` also keeps it out of the way of anything scanning for `awaiting_opponent`
-- or `judging` work.
--
-- IS_RATED false. `isRatedMatch` returns `ladderIsRated && !opponentIsBot`, so every match
-- these performances are copied into is unrated anyway. The origin match agrees.
--
-- RLS POSTURE. Nothing new is granted, and the existing policies already close it: `matches`
-- SELECT is `public.is_match_participant(id)` and an origin match has no human seat, so no
-- `auth.uid()` ever satisfies it; `submissions` SELECT is `user_id = auth.uid()` (null never
-- equals a uid) OR (participant AND has_own_submission); `match_participants` rides on the
-- same participation predicate. A learner sees a bot answer only after it has been COPIED
-- into a match they are seated in and only after they have committed their own answer. That
-- is the existing reveal rule, unchanged.
--
-- -----------------------------------------------------------------------------
-- IDEMPOTENCY
-- -----------------------------------------------------------------------------
-- `matches.id` and `submissions.id` default to `gen_random_uuid()`, which would churn on
-- every reset, so they are DERIVED from the real natural key of a bot performance,
-- (item_key, bot_slug), using the same v1 namespaces as the ja pool:
--
--   match_id      = md5('loxelingo:bot-origin-match:v1:' || item_key || ':' || bot_slug)
--   submission_id = md5('loxelingo:bot-submission:v1:'   || item_key || ':' || bot_slug)
--
-- The item_key is `items.external_id`, which is globally unique and already carries the world
-- (`en-duel-...` vs `ja-duel-...`), so the two pools cannot collide on a derived id.
-- Re-running rewrites the same 225 rows in place.
--
-- `submitted_at` is authored from a FIXED instant, never `now()`: `chooseOpponent` and
-- `nearestBotPerformance` both tie-break on submission age, so a clock-derived timestamp
-- would make opponent choice depend on when the seed last ran. The base instant is
-- 2026-07-02, one day after the ja pool's 2026-07-01, so the two pools stay distinguishable
-- in a raw timestamp scan.
--
-- -----------------------------------------------------------------------------
-- SOURCES AND LICENSING
-- -----------------------------------------------------------------------------
-- Every English string below is HAND-AUTHORED for this seed, on the same terms as
-- supabase/seeds/english-content.sql: nothing scraped, no corpus, no coursebook, no exam
-- paper, no machine translation. Specifically NOT used as a source of "typical learner
-- errors": any L1-tagged learner corpus, any published error taxonomy, any interlanguage
-- study. The errors are authored from the rule in §0a. No third-party licence to propagate.
-- =============================================================================


-- =============================================================================
-- §0  THE TWO RULES THAT ARE SPECIFIC TO ENGLISH
--
--     The ja pool needs neither. This one cannot ship without both.
-- =============================================================================
--
-- 0a. ERRORS MUST BE L1-NEUTRAL.
--
-- English is the only world here whose learners come from every first language at once. A
-- ja-world learner is overwhelmingly an English speaker learning Japanese, so a beginner bot
-- can make the errors an English speaker makes and be recognisable. An en-world learner might
-- be Turkish, Yoruba, Tagalog, Portuguese or Korean, and a bot whose mistakes belong to ONE
-- of those is a bot four learners in five cannot see themselves in — and, worse, one that
-- reads as a caricature of the group it fingerprints.
--
-- So Wren's and Orrin's errors are drawn ONLY from the set that is shared across first
-- languages, because each is a property of English rather than of a transfer:
--
--   * ARTICLES, in BOTH directions. Omission (`Heating in my flat is broken`, `I am in bus`,
--     `send new card`) and intrusion (`I like the basketball`, `come to the work`,
--     `make the question 4`). Learners from article-less languages omit; learners from
--     article-having languages whose rules differ intrude. Both appear.
--   * PREPOSITIONS. `in bus`, `on train`, `in Saturday`, `in 9 o'clock`, `in yesterday
--     night`, `in the night`, `in the train`, `two time in day`. English preposition choice
--     is arbitrary seen from anywhere.
--   * TENSE AND ASPECT AGAINST A TIME ADVERBIAL. `since three day` for `for three days`;
--     `I have lost my bank card last night`; `I have a fever since yesterday evening`;
--     `If it will rain`; the bare present for the future (`I come in 10 minutes`).
--   * COUNTABILITY. `two more day`, `many other work`, `long travel`, `correct one`.
--   * COLLOCATION. `make the question` for `do question 4`.
--   * BARE VERB / MISSING COMPLEMENT. `I am work`, `is not finish`, `explain me`.
--   * COMPARATIVE FORMATION. `more near` for `nearer`.
--   * OVER-FORMALITY. Orrin and Mira write NO contractions at all. That is the most
--     L1-neutral non-native tell in written English: it is produced by classroom instruction,
--     which every learner shares, and not by any particular first language.
--
-- Deliberately ABSENT, because each one fingerprints a group: dropped copula, topic-comment
-- word order, third-person `-s` omission, plural `-s` omission, gender-pronoun confusion,
-- `informations`/`advices`, double negation, `open the light`, resumptive pronouns, and every
-- calqued idiom. Wren is blunt and wrong about English. He is not from anywhere.
--
-- 0b. NO DIALECT TRAPS, IN THE ANSWERS AS WELL AS THE ITEMS.
--
-- english-content.sql dropped every item whose correct answer forks between US and UK usage
-- and listed them in its DIALECT header. The same discipline applies here, for a different
-- reason: the duel rubric says "Never penalise dialect, regional variation, or a non-standard
-- but genuinely used form". A weak bot whose weakness reads as a dialect choice is a bot the
-- judge is instructed NOT to mark down, so the gradient silently flattens; and a STRONG bot
-- written in one dialect makes half the learner base's own correct usage look unlike the top
-- of the ladder.
--
-- Absent from all 75 answers, and asserted in §4:
--   * spellings: -our/-or, -ise/-ize, -re/-er, -lling/-ling
--   * have got / have gotten; learnt, spelt, burnt, dreamt, snuck, dove
--   * `at the weekend` vs `on the weekend` — every answer names a DAY instead
--   * lexis: maths, whilst, theatre/theater, fortnight
-- Phrasings that forced a fork were rewritten rather than picked:
--   * Orrin's casual sign-offs are `Thanks a lot!!` / `bye!` / `see you!`, never `Cheers`,
--     which is BrE/AusE-leaning and would read as regional rather than as his register slip.
--   * Kestrel's shoe answer says `arrived`, because `turned up` leans UK and `showed up`
--     leans US and both were the natural choice.
--   * The weekend-plans plan is a `concert`, not a theatre/theater.
--   * The noise note says `the flat below`, not `your neighbour`/`neighbor`.
--   * Kestrel's clinic answer says `my appointment is Tuesday`, not `I am booked in`.
--   * Sable's shoe answer says `send them back`, not `post them back`.
--   * The heating item says `someone`, not `an engineer` (UK) or `a technician` (US) — except
--     in Mira's answer, where `technician` is the deliberately over-formal word choice.
--
-- `flat`, `cupboard` and `fridge` DO appear and are not forks: `flat` is fixed by the item
-- text itself (the briefs say flat, so an answer saying apartment is answering a different
-- brief), and cupboard/fridge are in ordinary use in both standards.
-- =============================================================================


-- =============================================================================
-- §1  THE ROSTER, AND THE THREE NUMBERS THAT ARE NOT ANSWERS
-- =============================================================================
--
-- `display_rating` must equal `BOT_ROSTER[].displayRating` in matchmaking.ts. A new account
-- starts at exactly DISPLAY_INIT = 900, so Wren at 940 is barely above a beginner and Sable
-- at 1820 is near the top of the ladder; `nearestBotPerformance` gives that new account Wren.
--
-- theta_before = fromDisplayScale(rating) = (rating - DISPLAY_INIT) / DISPLAY_SCALE
--              = (rating - 900) / 400
-- computed here rather than typed, so it cannot drift from elo.ts.
--
-- ELAPSED_MS. Derived, not sprinkled. The ja model, unchanged in shape:
--     least(time_limit_ms - 1000, plan_ms + ms_per_char * char_length(content))
--   * `plan_ms` is time spent deciding WHAT to write before typing anything, and the values
--     are IDENTICAL to the ja pool's, because that decision is language-independent: choosing
--     whether to hedge costs the same thought in any language. It rises with skill through
--     Kestrel — a learner who knows a register choice exists spends time making it, and a
--     beginner who does not know it exists spends none — then FALLS for Sable, who is a
--     native and does not deliberate over `could you` vs `would you mind`.
--   * `ms_per_char` is typing and self-correction, and falls monotonically with fluency. The
--     ja values are 900/950/900/850/600 for a Japanese character; these are close to a
--     quarter of them, because a Latin character carries roughly a quarter of the information
--     of a Japanese one and an English answer to the same brief is therefore about four times
--     longer in characters. Without that rescale every answer here would pin to the cap and
--     the whole differentiation would vanish.
-- The result is deliberately NOT monotonic in rating: Kestrel is usually the slowest bot on
-- an item, Sable is faster than Mira despite writing more, and Wren — blunt and short — is
-- fastest of all. A thoughtful expert answer taking longer than a blunt beginner one is the
-- intended shape. The cap does not bind on any of the 75 answers (the slowest is 64.2s
-- against a 120000ms limit); it is kept because an elapsed_ms above the item's own time limit
-- would be a bot that ran out of time, and that must stay unrepresentable.

-- NO STAGING TABLES, NO TEMP TABLES. The Supabase CLI ships a seed file to Postgres as a
-- single pipelined batch: every statement is PARSED before the first one EXECUTES. A relation
-- created earlier in the file does not exist yet when a later statement is parsed, and
-- `create table ... ; insert into that table ...` fails with 42P01. The same hazard is why §T
-- calls the function below from inside a `do` block rather than with a bare `select`: a
-- plpgsql body is compiled when it runs, so the reference resolves after the `create` has
-- executed. Nothing here creates a relation. The roster is inlined as a `values` CTE in each
-- of the three inserts (five short rows, three times) and the 75 answers appear exactly once,
-- in the insert that needs them.


-- =============================================================================
-- §2  THE POPULATION.
--
--     Wrapped in a function for the reason in §L and for no other reason. Returns the number
--     of performances in the pool, or 0 when the English items are not loaded yet — which is
--     the signal §T uses to arm the backstop. Idempotent: every insert conflicts on a natural
--     key and no id is ever regenerated, so calling it twice is calling it once.
-- =============================================================================

create or replace function public.seed_en_duel_bot_pool()
returns integer
language plpgsql
set search_path = public
as $pool$
declare
  n_items     integer;
  n_perf      integer;
  n_bots      integer;
  n_thin      integer;
  n_mislabel  integer;
  n_leak      integer;
  n_overlong  integer;
  n_rated     integer;
  n_notvoid   integer;
  n_twoseat   integer;
  n_dialect   integer;
  bad         text;
begin
  select count(*) into n_items
    from public.items where world_slug = 'en' and ladder_slug = 'duel';

  -- §L: the items are created by a seed file that sorts AFTER this one. On that pass there is
  -- nothing to hang a performance on, so do nothing at all rather than write a partial pool,
  -- and let the caller arm the backstop.
  if n_items = 0 then
    return 0;
  end if;

-- --- 2a. the origin matches ---------------------------------------------------
insert into public.matches
  (id, world_slug, ladder_slug, season_id, item_id, prompt_snapshot,
   constraint_text, time_limit_ms, status, source, is_rated, created_at, resolved_at)
with roster (bot_slug, display_rating, seq, plan_ms, ms_per_char) as (values
  ('wren-the-copyist',          940, 1, 12000, 240),
  ('orrin-the-ferryman',        1120, 2, 18000, 230),
  ('mira-the-cartographer',     1340, 3, 22000, 210),
  ('kestrel-the-archivist',     1580, 4, 26000, 190),
  ('sable-the-lantern-keeper',  1820, 5, 16000, 140)
),
seats as (
  -- The pool is a full cross product: every roster bot answers every duel item. So the seat
  -- list needs no per-row enumeration — it IS `items x roster`, which also makes it
  -- impossible for a new en duel item to be added without every bot covering it.
  select
    i.id                     as item_id,
    i.external_id,
    i.prompt,
    i.constraint_text,
    i.time_limit_ms,
    r.bot_slug,
    r.seq,
    (r.display_rating - 900)::double precision / 400.0 as theta_before,
    -- Authored, never `now()`: `chooseOpponent` and `nearestBotPerformance` break ties on
    -- submission age, so a clock-derived timestamp would change which bot a learner meets
    -- depending on when the seed last ran. Ranked on external_id, not on `items.id`, so
    -- re-seeding content cannot move it either. (rank x 5 + seq) minutes is collision-free
    -- and orders the roster weakest-first inside each item.
    timestamptz '2026-07-02 00:00:00+00'
      + make_interval(mins => (dense_rank() over (order by i.external_id) * 5 + r.seq)::integer)
                             as submitted_at
  from public.items i
  cross join roster r
  where i.world_slug = 'en' and i.ladder_slug = 'duel'
)
select
  md5('loxelingo:bot-origin-match:v1:' || s.external_id || ':' || s.bot_slug)::uuid,
  'en', 'duel', null, s.item_id, s.prompt,
  s.constraint_text, s.time_limit_ms, 'void', 'ghost', false, s.submitted_at, s.submitted_at
from seats s
on conflict (id) do update set
  item_id         = excluded.item_id,
  prompt_snapshot = excluded.prompt_snapshot,
  constraint_text = excluded.constraint_text,
  time_limit_ms   = excluded.time_limit_ms,
  status          = excluded.status,
  source          = excluded.source,
  is_rated        = excluded.is_rated,
  created_at      = excluded.created_at,
  resolved_at     = excluded.resolved_at;


-- --- 2b. the bot seats --------------------------------------------------------
-- ORDER IS LOAD-BEARING, exactly as in `createGhostMatch`: `submissions_seat_fk` references
-- (match_id, seat) on match_participants, so the seat must exist before the answer can be
-- filed into it. theta_after / rating_before / rating_after stay NULL: nothing was ever
-- settled here, and a bot's ability is an authored constant that no match may move.
insert into public.match_participants
  (match_id, user_id, seat, is_bot, bot_slug, submitted_at, theta_before, result, created_at)
with roster (bot_slug, display_rating, seq, plan_ms, ms_per_char) as (values
  ('wren-the-copyist',          940, 1, 12000, 240),
  ('orrin-the-ferryman',        1120, 2, 18000, 230),
  ('mira-the-cartographer',     1340, 3, 22000, 210),
  ('kestrel-the-archivist',     1580, 4, 26000, 190),
  ('sable-the-lantern-keeper',  1820, 5, 16000, 140)
),
seats as (
  select
    i.external_id,
    r.bot_slug,
    (r.display_rating - 900)::double precision / 400.0 as theta_before,
    timestamptz '2026-07-02 00:00:00+00'
      + make_interval(mins => (dense_rank() over (order by i.external_id) * 5 + r.seq)::integer)
                             as submitted_at
  from public.items i
  cross join roster r
  where i.world_slug = 'en' and i.ladder_slug = 'duel'
)
select
  md5('loxelingo:bot-origin-match:v1:' || s.external_id || ':' || s.bot_slug)::uuid,
  null, 1, true, s.bot_slug, s.submitted_at, s.theta_before, 'void', s.submitted_at
from seats s
on conflict (match_id, seat) do update set
  user_id      = excluded.user_id,
  is_bot       = excluded.is_bot,
  bot_slug     = excluded.bot_slug,
  submitted_at = excluded.submitted_at,
  theta_before = excluded.theta_before,
  result       = excluded.result,
  created_at   = excluded.created_at;


-- =============================================================================
-- §3  THE ANSWERS — 15 en duel items x 5 bots, filed into the seats created above.
-- =============================================================================
--
-- HOW SKILL IS DIFFERENTIATED. These are judged live by an LLM against real players on the
-- `duel@1` rubric (src/lib/judge/rubric.ts), whose axes are task_completion (weighted
-- highest), accuracy, range and register. The gradient is built on THOSE axes:
--
--   Wren 940      - task_completion and register. Communicates the bare proposition and
--                   stops. Articles missing or wrong, prepositions wrong, tense flattened
--                   toward the present, no hedge anywhere English requires one, and `Please`
--                   doing all of the politeness work by itself. Blunt but always
--                   comprehensible: a native reader gets the message and winces.
--   Orrin 1120    - accuracy is broadly fine and a politeness level is CHOSEN, then not
--                   sustained (`Dear Sir or Madam` closing `Thanks a lot!!`; a friendly
--                   opening turning into `This is not acceptable`). Crucially he is the bot
--                   that MISSES THE ITEM'S REQUIRED FORM most often: past simple where the
--                   brief needs the present perfect and present perfect where it needs the
--                   past simple; `will` where an arranged plan needs the present continuous;
--                   `In case of` where the item says use `if`; three questions where it says
--                   one; three sentences where it says two; an announcement where it says
--                   ask; a reason where the brief says give none. The rubric caps
--                   task_completion at 4 for exactly that, and that clause is the whole
--                   reason a 1120 does not beat a 1340.
--   Mira 1340     - every stated constraint honoured, communicative goal reached, register
--                   consistent end to end. Reads as a competent non-native: over-explicit
--                   subjects, `because` where `since`/`as` is smoother, `telephoned` and
--                   `I would like to ask` where a native shortens, no contractions at all,
--                   and the same sentence shape three times running — accurate, and paying
--                   for it on `range`.
--   Kestrel 1580  - idiomatic. Correct phrasal verbs (`comes on`, `turn it up`, `came
--                   through`, `come down with`, `hand it in`, `send out`, `clears up`),
--                   correct aspect, and the natural hedges (`I was wondering if I could`,
--                   `Would you mind`, `I'm afraid`, `Sorry to bother you`). Uses the grammar
--                   the item is really testing instead of a safe paraphrase of it.
--   Sable 1820    - what a native actually writes in that situation. Does the PRAGMATIC work,
--                   not only the grammatical work: blames the building rather than the person
--                   upstairs, says who she is before asking a stranger for homework help,
--                   answers the bank's next question before it is asked, offers the manager a
--                   better outcome instead of asking for a favour, tells the friend to take
--                   the seats. Often the SHORTEST answer on the item — the rubric says "Never
--                   reward length", and a native does not pad.
--
-- CONTRACTIONS ARE PART OF THE GRADIENT, not incidental. Wren contracts occasionally and at
-- random, Orrin and Mira never contract at all (§0a: the most L1-neutral non-native tell in
-- written English), Kestrel and Sable contract freely — EXCEPT on en-duel-sick-email-manager,
-- whose constraint_text says FORMAL, where they both stop. Knowing when not to contract is
-- the register skill that item measures.
--
-- LENGTH. `prompt.input.countLimit` is the item's character limit and every constraint_text
-- says UNDER N. Every answer here is STRICTLY under its item's limit; §4 asserts it rather
-- than trusting it. Per-bot ranges: Wren 41-132, Orrin 109-201, Mira 102-200, Kestrel 74-195,
-- Sable 78-201.
-- =============================================================================

insert into public.submissions
  (id, match_id, user_id, seat, content, media_path, selected_option,
   elapsed_ms, paste_detected, submitted_at)
with roster (bot_slug, display_rating, seq, plan_ms, ms_per_char) as (values
  ('wren-the-copyist',          940, 1, 12000, 240),
  ('orrin-the-ferryman',        1120, 2, 18000, 230),
  ('mira-the-cartographer',     1340, 3, 22000, 210),
  ('kestrel-the-archivist',     1580, 4, 26000, 190),
  ('sable-the-lantern-keeper',  1820, 5, 16000, 140)
),
seats as (
  select
    i.external_id,
    i.time_limit_ms,
    r.bot_slug,
    r.plan_ms,
    r.ms_per_char,
    timestamptz '2026-07-02 00:00:00+00'
      + make_interval(mins => (dense_rank() over (order by i.external_id) * 5 + r.seq)::integer)
                             as submitted_at
  from public.items i
  cross join roster r
  where i.world_slug = 'en' and i.ladder_slug = 'duel'
),
answers (item_key, bot_slug, content) as (values

-- --- en-duel-broken-heating · <200 · HOW LONG · ASK FOR A DATE · present perfect ---
-- Duration that is still true takes the present perfect, so `has been off for three
-- days` is the form this item exists to test. Wren writes `since three day`: wrong
-- preposition, no plural. Orrin is clean past simple (`stopped working three days ago`)
-- and then asks `Can you please fix it soon?`, which is not a date, so the second stated
-- constraint is unmet.
('en-duel-broken-heating','wren-the-copyist',          'Hello. Heating in my flat is broken since three day. I called one time and nobody came. Please tell me the day you send someone.'),
('en-duel-broken-heating','orrin-the-ferryman',        'Dear Sir or Madam, my heating stopped working three days ago and the flat is cold. I already called your office and nobody came. Can you please fix it soon? Thanks a lot!!'),
('en-duel-broken-heating','mira-the-cartographer',     'Hello, the heating in my flat has not worked for three days. I telephoned on Monday because the flat was very cold, but nobody came. Please tell me which day a technician can come.'),
('en-duel-broken-heating','kestrel-the-archivist',     'Hi, the heating''s been off for three days now. I called on Monday and nobody''s come out yet. Could you let me know which day someone can look at it?'),
('en-duel-broken-heating','sable-the-lantern-keeper',  'Following up on my call: the heating''s been off since Monday, so three days now, and nobody came. I''d rather not keep asking, so could you give me a date this week? The flat is cold.'),

-- --- en-duel-deadline-extension · <200 · ASK, DO NOT DEMAND · ONE REASON · one apology only ---
-- The constraint is pragmatic: the request must be refusable. Wren's `Please give me
-- until Friday` is an order with a please on it. Orrin announces the new date instead of
-- asking and apologises twice where the brief allows one - two stated constraints missed
-- with the grammar intact. Sable never asks for an extension; she offers the manager a
-- better outcome, which is what gets a yes.
('en-duel-deadline-extension','wren-the-copyist',          'Sorry. The report is not finish. I need two more day. Please give me until Friday. I have many other work now.'),
('en-duel-deadline-extension','orrin-the-ferryman',        'Dear Ms Adams, I am sorry, I cannot finish the report by tomorrow. I will send it on Friday because I am still waiting for the sales figures. Sorry again about this. Thanks a lot!!'),
('en-duel-deadline-extension','mira-the-cartographer',     'Dear Ms Adams, I would like to ask for two more days for the report. I need until Friday because the sales figures arrived only this morning. I am sorry for the late notice. Thank you.'),
('en-duel-deadline-extension','kestrel-the-archivist',     'Hi Ms Adams, I was wondering if I could have two more days on the report. The sales figures only came through this morning, so Friday would let me check them properly. Sorry for the short notice.'),
('en-duel-deadline-extension','sable-the-lantern-keeper',  'Would Friday work for the report? The sales figures only landed this morning, and I''d rather send you something you can use than something you have to send back. Sorry for the short notice.'),

-- --- en-duel-decline-dinner · <150 · SAY NO · OFFER ANOTHER DAY · no reason given ---
-- The brief says you do not want to say why, so a reason is a task failure and not extra
-- credit. Orrin invents a family dinner. Wren has `in Saturday` and drops the article in
-- `Maybe other day?`. Sable gives no reason at all and then says she still wants to go,
-- which is what keeps the invitation alive.
('en-duel-decline-dinner','wren-the-copyist',          'Sorry, I cannot come in Saturday. I am busy. Maybe other day?'),
('en-duel-decline-dinner','orrin-the-ferryman',        'Thank you for the invitation. Unfortunately I cannot come on Saturday because I have a family dinner. We can meet another day maybe. Bye!'),
('en-duel-decline-dinner','mira-the-cartographer',     'Thank you for the invitation, but I am not free on Saturday. Would Wednesday be possible instead? I would be happy to come then.'),
('en-duel-decline-dinner','kestrel-the-archivist',     'Thanks for the invite! I can''t make Saturday, I''m afraid. Are you around on Wednesday instead? I''d be up for that.'),
('en-duel-decline-dinner','sable-the-lantern-keeper',  'Saturday''s no good for me, unfortunately. Any chance you''re free on Wednesday? I''d still like to go, just not that night.'),

-- --- en-duel-first-day-intro · <200 · NOT FORMAL · say what you do + one thing you like ---
-- NOT FORMAL is a constraint like any other and Orrin breaks it head-on with `allow me
-- to introduce myself` in a team chat, plus `I enjoyed cooking` - past simple for a
-- standing preference. Wren's `I am work` is the aspect error and `the basketball` the
-- article error. Sable's message gives people something to reply to, which is what an
-- introduction is for.
('en-duel-first-day-intro','wren-the-copyist',          'Hello everybody. I am new here. I am work in the design team. I like the basketball very much. Thank you.'),
('en-duel-first-day-intro','orrin-the-ferryman',        'Dear colleagues, allow me to introduce myself. My name is Alex and I have been appointed to the design team. In my free time I enjoyed cooking. I look forward to working with you all.'),
('en-duel-first-day-intro','mira-the-cartographer',     'Hello everyone, my name is Alex and I am the new designer on the product team. I am very happy to be here. I like cooking, and I also like running in the morning.'),
('en-duel-first-day-intro','kestrel-the-archivist',     'Hi all! Alex here, joining the design team today. I''ll mostly be working on the app. Outside work I''m into baking, so I''ll happily take your cake recipes.'),
('en-duel-first-day-intro','sable-the-lantern-keeper',  'Hi everyone, I''m Alex, the new designer. Day one, so if I ask you something obvious, that''s why. I like baking, which means someone has to eat it: volunteers welcome on Fridays.'),

-- --- en-duel-flat-instructions · <220 · THREE INSTRUCTIONS · SAY WHERE · phrasal verbs + place prepositions ---
-- Three instructions, three places. Orrin locates the key and the cat food and leaves
-- the heating unplaced, then adds a fourth instruction nobody asked for. Wren drops
-- every article and writes `two time in day`. Kestrel's `comes on` and `turn it up` are
-- the phrasal verbs the concept row names; Sable writes it as a note actually gets
-- written - labels, not sentences.
('en-duel-flat-instructions','wren-the-copyist',          'Key is in the box near door. Heating is on wall in kitchen, push the button. Cat food is in cupboard. Give her food two time in day.'),
('en-duel-flat-instructions','orrin-the-ferryman',        'Dear friend, the key is under the mat outside the door. Please turn on the heating if you are cold. The cat food is in the kitchen cupboard, please feed her twice a day. Kindly do not open the windows.'),
('en-duel-flat-instructions','mira-the-cartographer',     'The key is under the mat by the front door. The heating switch is on the wall in the kitchen, next to the fridge. The cat food is in the cupboard above the sink. Please feed her twice a day.'),
('en-duel-flat-instructions','kestrel-the-archivist',     'Key''s under the mat by the front door. The heating comes on from the dial on the kitchen wall, by the fridge, so turn it up if you get cold. Cat food''s in the cupboard over the sink, twice a day.'),
('en-duel-flat-instructions','sable-the-lantern-keeper',  'Key: under the mat by the front door. Heating: dial on the kitchen wall by the fridge, turn it up, it takes an hour. Cat: food in the cupboard over the sink, twice a day, and she''ll say she''s starving.'),

-- --- en-duel-homework-help · <180 · ONE CLEAR QUESTION · say when you need it ---
-- One question. Orrin asks three, which is the miss. Wren's `make the question` is the
-- make/do collocation and `explain me` the missing preposition. Sable does the thing the
-- brief buries: they have never spoken, so she says who she is first, and then takes the
-- pressure back off.
('en-duel-homework-help','wren-the-copyist',          'Hi, I am in your class. I cannot make the question 4 of homework. Please explain me. I need it tomorrow.'),
('en-duel-homework-help','orrin-the-ferryman',        'Hello, we are in the same class. I did not understand the homework. What does question 4 want? Do we use the formula from Monday? And which page? I need it tomorrow. Thanks!'),
('en-duel-homework-help','mira-the-cartographer',     'Hello, I am in your class. I do not understand the second part of question 4. Could you explain what it is asking? I need to send the homework tomorrow morning.'),
('en-duel-homework-help','kestrel-the-archivist',     'Hi, we''re in the same class. Sorry to bother you, but I''m stuck on question 4. Do we need the formula from Monday, or just the table? I have to hand it in tomorrow at nine.'),
('en-duel-homework-help','sable-the-lantern-keeper',  'Hi, we haven''t met, I sit two rows behind you. One thing: on question 4, do we use Monday''s formula or the table? It''s due tomorrow morning, so no rush if you''re busy.'),

-- --- en-duel-late-to-cinema · <120 · SAY WHEN YOU WILL ARRIVE · where + future ---
-- Two facts, and Orrin files one: `See you soon` is not a time. Wren has `in bus` and
-- the bare present `I come` for a future arrival. Sable is the shortest answer on the
-- item and the only one that solves the friend's actual problem, which is standing
-- outside.
('en-duel-late-to-cinema','wren-the-copyist',          'Sorry! I am in bus. I come in 10 minutes.'),
('en-duel-late-to-cinema','orrin-the-ferryman',        'I am very sorry for being late. I am on the bus now and there is a lot of traffic. See you soon, sorry again!'),
('en-duel-late-to-cinema','mira-the-cartographer',     'I am sorry, I am on the bus now. I will arrive at the cinema in about ten minutes. Please wait for me.'),
('en-duel-late-to-cinema','kestrel-the-archivist',     'So sorry, I''m on the bus, about ten minutes away. Go in and I''ll find you.'),
('en-duel-late-to-cinema','sable-the-lantern-keeper',  'On the bus, ten minutes out, sorry. Take the seats and I''ll find you in there.'),

-- --- en-duel-lost-bank-card · <200 · WHEN AND WHERE · past simple + what you want ---
-- A finished event at a stated past time takes the past simple, so Orrin's `I have lost
-- my bank card last night` is exactly the error this item catches - and the mirror of
-- his broken-heating miss, where he used past simple for a state that is still true.
-- Wren has `in yesterday night` and `on train`. Sable answers the bank's next question
-- before it is asked.
('en-duel-lost-bank-card','wren-the-copyist',          'I lost my card in yesterday night. I was on train from London. Please stop the card and send new card.'),
('en-duel-lost-bank-card','orrin-the-ferryman',        'Dear Sir or Madam, I have lost my bank card last night on the train. It was not in my bag this morning. Please block the card immediately and send me a new one. Thanks a lot, bye!'),
('en-duel-lost-bank-card','mira-the-cartographer',     'I lost my bank card last night on the train between Central Station and my home. I did not notice it until this morning. Please block the card and send me a new one to my address.'),
('en-duel-lost-bank-card','kestrel-the-archivist',     'I left my bank card on the train last night, on the 22:40 from Central, and only noticed this morning. Could you freeze it and send out a replacement? Nothing''s been taken from the account.'),
('en-duel-lost-bank-card','sable-the-lantern-keeper',  'Card left on the 22:40 train from Central last night; I noticed this morning. Please freeze it and send a replacement. I''ve been through the account and there''s nothing on it that isn''t mine.'),

-- --- en-duel-move-appointment · <180 · BOTH DAYS · ASK TO CONFIRM · time prepositions ---
-- Orrin gives both days and never asks for confirmation, and `Please change it to
-- Thursday` instructs a clinic rather than asking one. Wren's `in 9 o'clock` is the time
-- preposition the concept row names. Sable widens the ask to any Thursday slot, which is
-- how a confirmation actually comes back.
('en-duel-move-appointment','wren-the-copyist',          'Hello. I have appointment on Tuesday in 9 o''clock. I cannot come. I want Thursday. Please write me.'),
('en-duel-move-appointment','orrin-the-ferryman',        'Dear Doctor, I have an appointment on Tuesday at 9:00, but I cannot come. Please change it to Thursday. I will be there at the same time. Thanks a lot, see you!'),
('en-duel-move-appointment','mira-the-cartographer',     'Hello, I have an appointment on Tuesday at 9:00, but I cannot come that day. Could you move it to Thursday, at the same time if possible? Please confirm the new day for me.'),
('en-duel-move-appointment','kestrel-the-archivist',     'Hello, my appointment is Tuesday at 9:00 but I can''t make it. Could I move it to Thursday, ideally at the same time? Please let me know if that works for you.'),
('en-duel-move-appointment','sable-the-lantern-keeper',  'I have Tuesday at 9:00 and can''t make it. Could I move to Thursday? Nine again is ideal, but any time Thursday works. Confirm whatever suits you and I''ll be there.'),

-- --- en-duel-neighbour-noise · <200 · FRIENDLY · NOT ANGRY · habitual present ---
-- The register constraint IS the item. Orrin opens politely, writes `This is not
-- acceptable` and threatens the landlord: a politeness level chosen and then abandoned
-- mid-note. His past simple describes one night where the complaint is habitual. Wren
-- has `in the night`. Sable blames the building rather than the person, which is the
-- only version of this note you can live above.
('en-duel-neighbour-noise','wren-the-copyist',          'Hello. You play music very loud in the night. I cannot sleep. Please stop it. I live under you.'),
('en-duel-neighbour-noise','orrin-the-ferryman',        'Hello, my name is Alex and I live in flat 4, below you. Your music was very loud last night and also on Monday. This is not acceptable. Please stop it, or I will speak to the landlord.'),
('en-duel-neighbour-noise','mira-the-cartographer',     'Hello, I am the person in flat 4, just below you. I can hear your music in my bedroom after midnight, and I cannot sleep because of it. Could you turn it down after eleven? Thank you very much.'),
('en-duel-neighbour-noise','kestrel-the-archivist',     'Hi! I''m in flat 4, just below you. I can hear the music in my bedroom after midnight and it''s keeping me up. Would you mind turning it down after eleven? Thanks a lot.'),
('en-duel-neighbour-noise','sable-the-lantern-keeper',  'Hi, I''m in the flat below and we haven''t met yet. The floors here are thinner than they look, and music carries after midnight. Any chance of keeping it down after eleven? Nothing personal.'),

-- --- en-duel-picnic-rain · <180 · ONE SENTENCE WITH IF · first conditional -----
-- The named form is the first conditional and Orrin routes around it entirely - `In case
-- of rain`, `When the weather is good` - so the single stated constraint is unmet by an
-- answer with no grammatical error in it. Wren produces `If it will rain`, the commonest
-- first-conditional error in English and one no first language has a monopoly on.
('en-duel-picnic-rain','wren-the-copyist',          'Sunday the weather is bad maybe. If it will rain, we can go in my house and watch film. If sun, we do the picnic.'),
('en-duel-picnic-rain','orrin-the-ferryman',        'Hello, I saw the forecast for Sunday and it says rain. In case of rain we can go to the museum. When the weather is good, we will have the picnic in the park. Bad news, sorry!'),
('en-duel-picnic-rain','mira-the-cartographer',     'I looked at the forecast and it says rain on Sunday. If it rains, we can go to the museum instead, and if it is sunny, we will have the picnic as we planned.'),
('en-duel-picnic-rain','kestrel-the-archivist',     'The forecast has turned: rain on Sunday. If it pours we can duck into the museum instead, and if it clears up we''ll stick with the picnic. Either way I''m free all day.'),
('en-duel-picnic-rain','sable-the-lantern-keeper',  'Rain on Sunday, apparently. If it holds off we do the picnic as planned, and if not, the museum is five minutes from the park, so we can decide on the day.'),

-- --- en-duel-sick-email-manager · <200 · SUBJECT LINE FIRST · FORMAL · two sentences, no more ---
-- Three constraints and a hard count. Orrin writes three sentences where two are allowed
-- and `I have a fever since yesterday evening` is present simple with `since`. Wren has
-- no formal register at all and `come to the work`. This is the one item where Kestrel
-- and Sable use NO contractions: FORMAL is stated, and knowing when not to contract is
-- the register skill being measured.
('en-duel-sick-email-manager','wren-the-copyist',          'Sick today. I am ill and I cannot come to the work today. I go to doctor at 3.'),
('en-duel-sick-email-manager','orrin-the-ferryman',        'Subject: Absence today. Dear Ms Adams, I am ill today and I cannot come to the office. I have a fever since yesterday evening. I hope to be back tomorrow. Thanks a lot!!'),
('en-duel-sick-email-manager','mira-the-cartographer',     'Subject: Sick leave today. Dear Ms Adams, I am ill and I will not be able to work today. I will send you an update tomorrow morning. Kind regards, Alex'),
('en-duel-sick-email-manager','kestrel-the-archivist',     'Subject: Off sick today. Dear Ms Adams, I have come down with something and will not be able to work today. I will pick the report up first thing tomorrow. Best regards, Alex'),
('en-duel-sick-email-manager','sable-the-lantern-keeper',  'Subject: Out sick today. Dear Ms Adams, I am ill and will not be online today. Nothing on my side is urgent, and the report is with Tom if anyone needs it. Best regards, Alex'),

-- --- en-duel-two-flats · <220 · COMPARE BOTH · ONE REASON · comparatives -------
-- `Compare the two` is the constraint and Orrin describes only the flat he took. Wren
-- produces `more near`, the double comparative, plus `in the train` and `long travel`.
-- Mira compares correctly and then repeats `I chose` - accurate, and paying for it in
-- range. Sable's reason is about herself rather than the flats, which is what a real
-- decision sounds like.
('en-duel-two-flats','wren-the-copyist',          'I take the expensive flat. It is more near to work. The cheap flat is very far, one hour in the train. I don''t like long travel.'),
('en-duel-two-flats','orrin-the-ferryman',        'Dear friend, I have made a decision about the flat. I will take the expensive one near the office. It costs more money, but I think it is a good choice. Please tell me your opinion!!'),
('en-duel-two-flats','mira-the-cartographer',     'I have chosen the expensive flat. The cheap one is an hour from work and the expensive one is only ten minutes away. I chose the second one because two hours on the train every day is too much for me.'),
('en-duel-two-flats','kestrel-the-archivist',     'I''ve gone for the expensive one. The cheap flat would save me money, but it''s an hour each way, and the other is ten minutes down the road. I''d rather pay more than give up two hours a day.'),
('en-duel-two-flats','sable-the-lantern-keeper',  'Took the expensive one. On paper the cheap flat wins, it''s half the rent, but it''s an hour each way and I know exactly what I''m like after two hours on a train. Ten minutes is worth the money.'),

-- --- en-duel-weekend-plans · <150 · TWO PLANS · ONE ALREADY ARRANGED · present continuous vs will ---
-- English marks `already arranged with another person` with the present continuous, so
-- `I am meeting my sister` is the required form. Orrin states the arrangement and then
-- uses `I will meet`, the form for a decision taken at the moment of speaking. Wren uses
-- the bare present for both plans and so marks neither as arranged.
('en-duel-weekend-plans','wren-the-copyist',          'Saturday I go to cinema with my brother. And I want maybe to clean the flat.'),
('en-duel-weekend-plans','orrin-the-ferryman',        'On Saturday I will meet my sister at a concert, we bought the tickets last week. On Sunday I will maybe go running. And you? Bye!'),
('en-duel-weekend-plans','mira-the-cartographer',     'On Saturday I am meeting my sister at a concert; we bought the tickets last week. On Sunday I am going to go running, but it is not certain.'),
('en-duel-weekend-plans','kestrel-the-archivist',     'I''m meeting my sister at a concert on Saturday, the tickets are booked. Sunday I might go for a run, but nothing''s fixed yet.'),
('en-duel-weekend-plans','sable-the-lantern-keeper',  'Concert with my sister on Saturday, tickets already booked. Sunday''s empty so far, so if you want company for a walk, say the word.'),

-- --- en-duel-wrong-size-shoes · <200 · SAY WHAT YOU WANT TO HAPPEN · past simple + definite article ---
-- Orrin describes the problem, calls it disappointing, and asks `What can I do now?` -
-- the one thing the brief told him to state, he asks about instead. `I have ordered ...
-- last week` is the same present-perfect-with-a-past-time error as the bank card. Wren's
-- tenses collapse to the present (`I buy`, `they come`) and `correct one` loses its
-- plural.
('en-duel-wrong-size-shoes','wren-the-copyist',          'I buy shoes from your website. Yesterday they come but the size is wrong. I want size 42. Send me correct one please.'),
('en-duel-wrong-size-shoes','orrin-the-ferryman',        'Dear Sir or Madam, I have ordered shoes on your website last week and they arrived yesterday in size 40, not size 42. This is very disappointing. What can I do now? Thanks a lot, bye!'),
('en-duel-wrong-size-shoes','mira-the-cartographer',     'I ordered shoes from your website last week. They arrived yesterday, but they are size 40 and I ordered size 42. Could you send me the correct size and tell me how to return these?'),
('en-duel-wrong-size-shoes','kestrel-the-archivist',     'I ordered a pair of shoes last week and they arrived yesterday in a 40 instead of a 42. Could you swap them for the right size and email me a return label for these?'),
('en-duel-wrong-size-shoes','sable-the-lantern-keeper',  'Order 4821: I ordered a 42 and a 40 arrived yesterday. I''d like the 42 sent out and a label for the 40. They haven''t been worn and the box is intact, so I can send them back today.')

)
select
  md5('loxelingo:bot-submission:v1:' || a.item_key || ':' || a.bot_slug)::uuid,
  md5('loxelingo:bot-origin-match:v1:' || a.item_key || ':' || a.bot_slug)::uuid,
  null, 1, a.content, null, null,
  least(
    coalesce(s.time_limit_ms, 120000) - 1000,
    s.plan_ms + s.ms_per_char * char_length(a.content)
  )::integer,
  false,
  s.submitted_at
from answers a
join seats s on s.external_id = a.item_key and s.bot_slug = a.bot_slug
on conflict (id) do update set
  content      = excluded.content,
  elapsed_ms   = excluded.elapsed_ms,
  submitted_at = excluded.submitted_at;

-- The join above is an INNER join, so an answer whose item_key is not a real en duel
-- external_id is silently dropped rather than erroring. §4's count check is what catches
-- that: a typo in an item_key shows up as 74 performances, not as 75 with one wrong.


-- =============================================================================
-- §4  ASSERTIONS. A half-seeded pool is worse than none: it fails at match creation, on one
--     item, for one learner, in production. Fail here instead.
--
--     Every check reads the REAL tables, not a staging copy, so it verifies what actually
--     landed. scripts/content/verify-seed.sql conventions apply: raise, do not warn.
-- =============================================================================

  select count(*), count(distinct mp.bot_slug)
    into n_perf, n_bots
  from public.submissions sub
  join public.match_participants mp
    on mp.match_id = sub.match_id and mp.seat = sub.seat
  join public.matches m on m.id = sub.match_id
  where m.world_slug = 'en' and m.ladder_slug = 'duel' and mp.is_bot;

  -- Every duel item must carry a full roster of FIVE DISTINCT bots, or a learner whose band
  -- caps out on that item gets `no_opponent_available` and the match simply does not start.
  -- Counting distinct slugs rather than rows also rules out one bot covering an item twice.
  select count(*) into n_thin
  from public.items i
  where i.world_slug = 'en' and i.ladder_slug = 'duel'
    and (
      select count(distinct mp.bot_slug)
      from public.matches m
      join public.match_participants mp on mp.match_id = m.id and mp.is_bot
      join public.submissions sub on sub.match_id = mp.match_id and sub.seat = mp.seat
      where m.item_id = i.id
    ) <> 5;

  -- The label `buildParticipants` and `match_participants_bot_xor_user` both insist on, plus
  -- the theta_before without which `toPoolPerformance` yields NaN and `fetchPool` drops the
  -- row.
  select count(*) into n_mislabel
  from public.match_participants mp
  join public.matches m on m.id = mp.match_id
  where m.world_slug = 'en' and m.ladder_slug = 'duel' and mp.is_bot
    and (mp.user_id is not null or mp.bot_slug is null or mp.theta_before is null);

  -- A bot slug that is not on the roster in matchmaking.ts would fall back to a theta-derived
  -- display rating in `botDisplayRating`, i.e. silently stop being the authored character.
  select count(*) into n_leak
  from public.match_participants mp
  join public.matches m on m.id = mp.match_id
  where m.world_slug = 'en' and m.ladder_slug = 'duel' and mp.is_bot
    and mp.bot_slug not in ('wren-the-copyist', 'orrin-the-ferryman', 'mira-the-cartographer',
                            'kestrel-the-archivist', 'sable-the-lantern-keeper');

  -- Answers must fit the limit the item states; every constraint_text says UNDER N, so this
  -- is strict. An over-long bot answer would be a bot that cannot honour its own constraint,
  -- which is the axis Orrin is supposed to be the only one failing, and only on purpose.
  select count(*) into n_overlong
  from public.submissions sub
  join public.match_participants mp on mp.match_id = sub.match_id and mp.seat = sub.seat
  join public.matches m on m.id = sub.match_id
  join public.items i on i.id = m.item_id
  where mp.is_bot and m.world_slug = 'en' and m.ladder_slug = 'duel'
    and (i.prompt -> 'input' ->> 'countLimit') is not null
    and char_length(sub.content) >= (i.prompt -> 'input' ->> 'countLimit')::integer;

  select count(*) into n_rated
  from public.matches m
  join public.match_participants mp on mp.match_id = m.id and mp.is_bot
  where m.world_slug = 'en' and m.ladder_slug = 'duel' and m.is_rated;

  -- An origin match that is not `void` is a match something else may pick up as work.
  select count(*) into n_notvoid
  from public.matches m
  join public.match_participants mp on mp.match_id = m.id and mp.is_bot
  where m.world_slug = 'en' and m.ladder_slug = 'duel'
    and (m.status <> 'void' or mp.result <> 'void' or mp.seat <> 1);

  -- A second seat on an origin match would mean the carrier is being read as a real contest.
  select count(*) into n_twoseat
  from public.matches m
  where m.world_slug = 'en' and m.ladder_slug = 'duel' and m.source = 'ghost'
    and (select count(*) from public.match_participants mp where mp.match_id = m.id) <> 1;

  -- §0b, enforced rather than promised. A US/UK fork in a bot answer is invisible to the
  -- rubric (which is told not to penalise dialect) and therefore silently flattens the
  -- gradient, so it has to be caught here. `learned` is NOT on this list: it is standard in
  -- both, and only `learnt` is the fork.
  select count(*) into n_dialect
  from public.submissions sub
  join public.match_participants mp on mp.match_id = sub.match_id and mp.seat = sub.seat
  join public.matches m on m.id = sub.match_id
  where mp.is_bot and m.world_slug = 'en' and m.ladder_slug = 'duel'
    and (
      sub.content ~* '\y(gotten|learnt|spelt|burnt|dreamt|snuck|dove|colour|flavour|neighbour|behaviour|theatre|theater|centre|metre|realise|organise|apologise|recognise|analyse|travelling|cancelled|labelled|maths|whilst|fortnight|cheers)\y'
      or sub.content ~* '\y(have|has|had|having)\s+got\y'
      or sub.content ~* 'at the weekend'
    );

  if n_perf <> n_items * 5 then
    raise exception 'en bot pool: expected % performances (% items x 5 bots), got %',
      n_items * 5, n_items, n_perf;
  end if;
  if n_bots <> 5 then
    raise exception 'en bot pool: expected 5 distinct bots, got %', n_bots;
  end if;
  if n_thin > 0 then
    raise exception 'en bot pool: % duel item(s) do not carry all 5 bots', n_thin;
  end if;
  if n_mislabel > 0 then
    raise exception 'en bot pool: % bot seat(s) are mislabelled or have no theta_before',
      n_mislabel;
  end if;
  if n_leak > 0 then
    raise exception 'en bot pool: % seat(s) carry a bot_slug that is not in BOT_ROSTER', n_leak;
  end if;
  if n_overlong > 0 then
    select string_agg(i.external_id || '/' || mp.bot_slug, ', ') into bad
    from public.submissions sub
    join public.match_participants mp on mp.match_id = sub.match_id and mp.seat = sub.seat
    join public.matches m on m.id = sub.match_id
    join public.items i on i.id = m.item_id
    where mp.is_bot and m.world_slug = 'en' and m.ladder_slug = 'duel'
      and (i.prompt -> 'input' ->> 'countLimit') is not null
      and char_length(sub.content) >= (i.prompt -> 'input' ->> 'countLimit')::integer;
    raise exception 'en bot pool: % answer(s) reach or exceed the item character limit: %',
      n_overlong, bad;
  end if;
  if n_rated > 0 then
    raise exception 'en bot pool: % origin match(es) are marked rated; bot matches are unrated',
      n_rated;
  end if;
  if n_notvoid > 0 then
    raise exception 'en bot pool: % origin match/seat(s) are not (void, void, seat 1)',
      n_notvoid;
  end if;
  if n_twoseat > 0 then
    raise exception 'en bot pool: % origin match(es) do not have exactly one seat', n_twoseat;
  end if;
  if n_dialect > 0 then
    select string_agg(i.external_id || '/' || mp.bot_slug, ', ') into bad
    from public.submissions sub
    join public.match_participants mp on mp.match_id = sub.match_id and mp.seat = sub.seat
    join public.matches m on m.id = sub.match_id
    join public.items i on i.id = m.item_id
    where mp.is_bot and m.world_slug = 'en' and m.ladder_slug = 'duel'
      and (
        sub.content ~* '\y(gotten|learnt|spelt|burnt|dreamt|snuck|dove|colour|flavour|neighbour|behaviour|theatre|theater|centre|metre|realise|organise|apologise|recognise|analyse|travelling|cancelled|labelled|maths|whilst|fortnight|cheers)\y'
        or sub.content ~* '\y(have|has|had|having)\s+got\y'
        or sub.content ~* 'at the weekend'
      );
    raise exception 'en bot pool: % answer(s) contain a US/UK dialect fork (see §0b): %',
      n_dialect, bad;
  end if;

  raise notice 'LoxeLingo en bot pool: % performances across % bots on % duel items',
    n_perf, n_bots, n_items;

  return n_perf;
end
$pool$;


-- =============================================================================
-- §T  THE CALL, AND THE LOAD-ORDER BACKSTOP.
--
--     Read §L first. This whole section exists only because this file sorts before the file
--     that creates the items it needs. Fix the order in config.toml and delete §T; the
--     `do` block's first branch is the only one that will ever run afterwards.
--
--     The call is inside a `do` block, not a bare `select`, because the CLI parses the entire
--     file before executing any of it and `public.seed_en_duel_bot_pool` does not exist at
--     that moment. A plpgsql body is compiled when it runs, so the reference resolves late.
-- =============================================================================

create or replace function public.seed_en_duel_bot_pool_backstop()
returns trigger
language plpgsql
set search_path = public
as $backstop$
declare
  n integer;
begin
  n := public.seed_en_duel_bot_pool();
  if n > 0 then
    -- One shot. Remove the trigger and both functions inside the same transaction that just
    -- inserted the items, so a completed `db reset` leaves NOTHING of this mechanism behind.
    drop trigger seed_en_duel_bot_pool_once on public.items;
    drop function public.seed_en_duel_bot_pool_backstop();
    drop function public.seed_en_duel_bot_pool();
    raise notice 'LoxeLingo en bot pool: seeded from the load-order backstop; backstop removed';
  end if;
  return null;
end
$backstop$;

do $run$
declare
  n integer;
begin
  n := public.seed_en_duel_bot_pool();

  if n > 0 then
    -- The items were already there (this file was applied by hand, or config.toml was fixed).
    -- Nothing to defer, so leave no residue.
    drop function public.seed_en_duel_bot_pool_backstop();
    drop function public.seed_en_duel_bot_pool();
  else
    -- Statement-level, because english-content.sql inserts all 35 English items in ONE
    -- statement: the trigger fires once, sees all 15 duel items, and populates the pool.
    create trigger seed_en_duel_bot_pool_once
      after insert on public.items
      for each statement
      execute function public.seed_en_duel_bot_pool_backstop();
    raise notice
      'LoxeLingo en bot pool: en duel items not loaded yet (see §L); backstop armed on public.items';
  end if;
end
$run$;
