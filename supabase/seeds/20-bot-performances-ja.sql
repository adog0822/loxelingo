-- =============================================================================
-- LoxeLingo — the launch bot performance pool for world `ja`, ladder `duel`.
--
-- Runs AFTER supabase/seed.sql (config.toml [db.seed] sql_paths), because every row here
-- resolves an item by `items.external_id`, which seed.sql creates.
--
-- -----------------------------------------------------------------------------
-- WHY THIS FILE EXISTS
-- -----------------------------------------------------------------------------
-- `chooseOpponent` (src/lib/match/matchmaking.ts) seats an opponent by finding a STORED
-- `PoolPerformance` for the item. Bots do not answer on demand — a bot is "just an authored
-- ghost", occupying a seat through the identical code path as a human. So on a fresh database
-- the pool is empty, `chooseOpponent` returns `kind: 'none'`, and every match creation fails
-- with `no_opponent_available`. This file is the floor under that: 5 bots × 25 duel items =
-- 125 performances, so a brand-new account always has an opponent on any duel item.
--
-- The 5 bots are THE JAPANESE CAST — Satoru, Rin, Haruki, Kaori, Tetsuya — read from
-- `public.bots where world_slug = 'ja'`. They are not a shared roster: English has its own five
-- characters at the same five rungs, in supabase/seeds/30-bot-performances-en.sql.
--
-- -----------------------------------------------------------------------------
-- THE SHAPE A PERFORMANCE MUST HAVE
-- -----------------------------------------------------------------------------
-- `MatchmakingQueries.fetchPool` reads `submissions`, embeds the seat that produced it through
-- the COMPOSITE fk `submissions_seat_fk (match_id, seat)`, and inner-joins `matches` for
-- (item_id, world_slug, ladder_slug). A performance is therefore a THREE-row structure and
-- nothing less will be found:
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
-- otherwise. Every seat below is (is_bot = true, user_id = null, bot_slug = <a ja cast slug>).
-- The human-ness of a seat is a column, not an inference.
--
-- ONE SEAT PER ORIGIN MATCH. These matches are carriers, not contests: nobody played against
-- the bot, so there is no seat 2. The bot takes seat 1. `findOpenMatchForUser` filters on
-- `user_id = <caller>`, so a seat with a null user_id can never be mistaken for a player's
-- outstanding match.
--
-- STATUS `void`, RESULT `void`. The contract (src/lib/match/contract.ts) allows
-- awaiting_opponent -> void, and settle.ts writes exactly this pair when a match will not
-- produce a rated result. That is precisely what an origin match is: it was never judged and
-- must never be judged. Parking it in `void` also keeps it out of the way of anything that
-- scans for `awaiting_opponent` or `judging` work.
--
-- IS_RATED false. `isRatedMatch` returns `ladderIsRated && !opponentIsBot`, so every match
-- these performances are copied into is unrated anyway. The origin match agrees.
--
-- -----------------------------------------------------------------------------
-- RLS POSTURE: THESE ROWS ARE ANSWER-ADJACENT AND UNREADABLE BY A CLIENT
-- -----------------------------------------------------------------------------
-- Nothing new is granted here; the existing policies already close it, and it is worth
-- writing down why:
--   * `matches`  SELECT is `public.is_match_participant(id)` — an origin match has no human
--     seat, so no `auth.uid()` ever satisfies it.
--   * `submissions` SELECT is `user_id = auth.uid()` (null never equals a uid) OR
--     (participant AND has_own_submission) — again unreachable, for the same reason.
--   * `match_participants` SELECT rides on the same participation predicate.
-- A learner sees a bot answer only after it has been COPIED into a match they are seated in
-- and only after they have committed their own answer. That is the existing reveal rule,
-- unchanged. Nothing here opens a path to reading the pool ahead of time.
--
-- -----------------------------------------------------------------------------
-- IDEMPOTENCY
-- -----------------------------------------------------------------------------
-- Same discipline as seed.sql: every insert conflicts on a natural key, and no id is ever
-- regenerated. `matches.id` and `submissions.id` are uuids with a `gen_random_uuid()` default,
-- which would churn on every reset, so they are DERIVED instead:
--
--   match_id      = md5('loxelingo:bot-origin-match:v1:' || item_key || ':' || bot_slug)
--   submission_id = md5('loxelingo:bot-submission:v1:'   || item_key || ':' || bot_slug)
--
-- (item_key, bot_slug) is the real natural key of a bot performance, and md5 -> uuid makes it
-- one. Re-running rewrites the same 375 rows in place. `submitted_at` is likewise authored
-- from a fixed date rather than `now()`: `chooseOpponent` tie-breaks on submission age, so a
-- clock-derived timestamp would make opponent choice depend on when the seed last ran.
--
-- -----------------------------------------------------------------------------
-- SOURCES AND LICENSING
-- -----------------------------------------------------------------------------
-- Every Japanese string below is HAND-AUTHORED for this seed, on the same terms as seed.sql:
-- nothing scraped, nothing from a corpus, no dataset, no machine translation of an English
-- sentence pattern. There is no third-party licence to propagate.
-- =============================================================================


-- =============================================================================
-- 1. THE CAST, AND THE TWO NUMBERS THAT ARE NOT ANSWERS
-- =============================================================================
--
-- THE CAST IS JAPANESE, AND IT IS READ, NOT AUTHORED HERE. These 125 performances used to be
-- attributed to Wren, Orrin, Mira, Kestrel and Sable — an English cast, shared by every world
-- because the roster was a hardcoded array in matchmaking.ts. The answers below have always
-- been Japanese; the characters delivering them now are too: Satoru, Rin, Haruki, Kaori,
-- Tetsuya, from `public.bots where world_slug = 'ja'`. Not one Japanese string changed in the
-- re-attribution — only the bot each one belongs to, rung for rung.
--
-- `display_rating` is therefore READ from `public.bots`, not typed here: it is the authored
-- number `botDisplayRating` returns, and `nearestBotPerformance` picks the bot whose display
-- rating is closest to the learner's, so a second copy of it in this file would be a second
-- place for it to be wrong. A new account starts at exactly DISPLAY_INIT, the floor of the
-- visible climb, so Satoru at theta 0.10 is barely above a beginner and Tetsuya at theta 2.30
-- is near the top of the ladder.
--
-- theta_before = fromDisplayScale(rating) = (rating - DISPLAY_INIT) / DISPLAY_SCALE
--              = (rating - 1000) / 1250
-- computed here rather than typed, so it cannot drift from the roster. The two constants ARE
-- typed, because SQL cannot read elo.ts, and they have moved once: restate them here in the
-- same commit as any display rescale or every seeded bot seat lands on the wrong rung.
-- `src/lib/engine/bot-rungs.test.ts` reads this file and fails if they disagree with elo.ts.
--
-- ELAPSED_MS. Derived, not sprinkled: `plan_ms + ms_per_char * char_length(content)`.
--   * `plan_ms` is time spent deciding WHAT to write before typing anything. It rises with
--     skill up to Kaori — a learner who knows a register choice exists spends time making it,
--     and a beginner who does not know it exists spends none — and then FALLS for Tetsuya, who
--     is a native and does not deliberate over 〜てくださいvs 〜ていただけますか.
--   * `ms_per_char` is typing and self-correction, and falls monotonically with fluency.
-- The result is deliberately NOT monotonic in rating: Kaori is the slowest bot on the board
-- and Tetsuya is faster than Haruki, while Satoru — blunt and short — is faster than everyone.
-- A thoughtful expert answer taking longer than a blunt beginner one is the intended shape.
-- =============================================================================

-- NO STAGING TABLES, NO TEMP TABLES. The Supabase CLI ships a seed file to Postgres as a
-- single pipelined batch: every statement is PARSED before the first one EXECUTES. A relation
-- created earlier in the file therefore does not exist yet when a later statement is parsed,
-- and `create table ... ; insert into that table ...` fails with 42P01. So this file creates
-- nothing. The roster CTE below is repeated in each of the three inserts (a five-row join
-- against `public.bots`, three times) and the 125 answers appear exactly once, in the insert
-- that needs them.
--
-- `public.bots` is a MIGRATION table, created and populated by
-- supabase/migrations/*_bots_per_world.sql, which runs before any seed file. So reading it here
-- is safe in a way that reading another seed's table would not be.


-- =============================================================================
-- 2. THE ORIGIN MATCHES AND THE BOT SEATS
--
--    Both are pure `items x roster`, so they carry no authored content and are listed first;
--    the answers themselves are §3. ORDER IS LOAD-BEARING, exactly as in
--    `createGhostMatch`: `submissions_seat_fk` references (match_id, seat) on
--    match_participants, so the seat must exist before the answer can be filed into it.
-- =============================================================================

-- --- 2a. the origin matches ---------------------------------------------------
insert into public.matches
  (id, world_slug, ladder_slug, season_id, item_id, prompt_snapshot,
   constraint_text, time_limit_ms, status, source, is_rated, created_at, resolved_at)
with roster (bot_slug, display_rating, seq, plan_ms, ms_per_char) as (
  -- READ, not authored. The cast is per-world content and lives in `public.bots`, so the slug
  -- and the display rating come from there and cannot drift from the roster the code resolves
  -- against. Only the two timing knobs are authored here, and they are keyed by ARCHETYPE
  -- (the rung) rather than by name: how long a rung deliberates is a property of the rung, and
  -- survives the world renaming its cast.
  select b.slug, b.display_rating, b.sort_order, k.plan_ms, k.ms_per_char
  from public.bots b
  join (values
    ('earnest_beginner', 12000, 900),
    ('casual_peer',      18000, 950),
    ('precise_literary', 22000, 900),
    ('warm_guide',       26000, 850),
    ('master',           16000, 600)
  ) as k (archetype, plan_ms, ms_per_char) on k.archetype = b.archetype
  where b.world_slug = 'ja'
),
seats as (
  -- The pool is a full cross product: every roster bot answers every duel item. So the seat
  -- list needs no per-row enumeration — it IS `items x roster`, which also makes it impossible
  -- for a new duel item to be added without every bot covering it.
  select
    i.id                     as item_id,
    i.external_id,
    i.prompt,
    i.constraint_text,
    i.time_limit_ms,
    r.bot_slug,
    r.seq,
    r.plan_ms,
    r.ms_per_char,
    (r.display_rating - 1000)::double precision / 1250.0 as theta_before,
    -- Authored, never `now()`: `chooseOpponent` breaks ties on submission age, so a
    -- clock-derived timestamp would change which bot a learner meets depending on when the
    -- seed last ran. Ranked on external_id, not on `items.id`, so re-seeding content cannot
    -- move it either. (rank x 5 + seq) minutes is collision-free and orders the roster
    -- weakest-first inside each item.
    timestamptz '2026-07-01 00:00:00+00'
      + make_interval(mins => (dense_rank() over (order by i.external_id) * 5 + r.seq)::integer)
                             as submitted_at
  from public.items i
  cross join roster r
  where i.world_slug = 'ja' and i.ladder_slug = 'duel'
)
select
  md5('loxelingo:bot-origin-match:v1:' || s.external_id || ':' || s.bot_slug)::uuid,
  'ja', 'duel', null, s.item_id, s.prompt,
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
-- theta_after / rating_before / rating_after stay NULL: nothing was ever settled here, and a
-- bot's ability is an authored constant that no match may move.
insert into public.match_participants
  (match_id, user_id, seat, is_bot, bot_slug, submitted_at, theta_before, result, created_at)
with roster (bot_slug, display_rating, seq, plan_ms, ms_per_char) as (
  -- READ, not authored. The cast is per-world content and lives in `public.bots`, so the slug
  -- and the display rating come from there and cannot drift from the roster the code resolves
  -- against. Only the two timing knobs are authored here, and they are keyed by ARCHETYPE
  -- (the rung) rather than by name: how long a rung deliberates is a property of the rung, and
  -- survives the world renaming its cast.
  select b.slug, b.display_rating, b.sort_order, k.plan_ms, k.ms_per_char
  from public.bots b
  join (values
    ('earnest_beginner', 12000, 900),
    ('casual_peer',      18000, 950),
    ('precise_literary', 22000, 900),
    ('warm_guide',       26000, 850),
    ('master',           16000, 600)
  ) as k (archetype, plan_ms, ms_per_char) on k.archetype = b.archetype
  where b.world_slug = 'ja'
),
seats as (
  -- The pool is a full cross product: every roster bot answers every duel item. So the seat
  -- list needs no per-row enumeration — it IS `items x roster`, which also makes it impossible
  -- for a new duel item to be added without every bot covering it.
  select
    i.id                     as item_id,
    i.external_id,
    i.prompt,
    i.constraint_text,
    i.time_limit_ms,
    r.bot_slug,
    r.seq,
    r.plan_ms,
    r.ms_per_char,
    (r.display_rating - 1000)::double precision / 1250.0 as theta_before,
    -- Authored, never `now()`: `chooseOpponent` breaks ties on submission age, so a
    -- clock-derived timestamp would change which bot a learner meets depending on when the
    -- seed last ran. Ranked on external_id, not on `items.id`, so re-seeding content cannot
    -- move it either. (rank x 5 + seq) minutes is collision-free and orders the roster
    -- weakest-first inside each item.
    timestamptz '2026-07-01 00:00:00+00'
      + make_interval(mins => (dense_rank() over (order by i.external_id) * 5 + r.seq)::integer)
                             as submitted_at
  from public.items i
  cross join roster r
  where i.world_slug = 'ja' and i.ladder_slug = 'duel'
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
-- 3. THE ANSWERS — 25 duel items x 5 bots, filed into the seats created above.
-- =============================================================================
--
-- HOW SKILL IS DIFFERENTIATED. These are judged live by an LLM against real players on the
-- `duel@1` rubric (src/lib/judge/rubric.ts), whose axes are task_completion (weighted
-- highest), accuracy, range and register. So the gradient is built on THOSE axes, and mostly
-- on the two a rubric can actually see.
--
-- The gradient belongs to the RUNG, not to the name. Each paragraph below describes an
-- archetype — the same five archetypes the English cast fills with different characters — which
-- is why a feature can speak of "the precise_literary" in any world and why re-attributing
-- these answers from Mira to Haruki changed nothing about what they demonstrate. The rungs are
-- named by archetype and by theta below, never by display rating, because the display rating is
-- a presentation of theta and has already been restated once underneath these paragraphs:
--
--   Satoru   theta 0.10  earnest_beginner - task_completion and register. Communicates the bare
--                   proposition and stops. Plain forms regardless of audience, particles
--                   dropped, no aspect and no nuance. The errors are real L2 errors a beginner
--                   makes (あなたの to a neighbour, 食べません for 食べられません, the て-form
--                   where たら is required), never nonsense: it must read as comprehensible but
--                   blunt.
--   Rin      theta 0.55  casual_peer - accuracy is basically fine and the politeness level is
--                   CHOSEN, then not sustained (だから inside a です/ます request to a teacher,
--                   ごめんね closing a polite note) or chosen for the wrong audience entirely
--                   (ます to a close friend on a PLAIN FORM item). Vocabulary is generic.
--                   Crucially Rin is the bot that misses the REQUIRED FORM most often - active
--                   voice where the item wants the passive, plain past where it wants
--                   〜ていました, four sentences where it wants one sequence. The rubric caps
--                   task_completion at 4 for exactly that, which is what keeps the casual_peer
--                   rung from beating the precise_literary one.
--   Haruki   theta 1.10  precise_literary - register consistent, set phrases correct, communicative
--                   goal reached, every stated constraint honoured. Reads like a competent
--                   non-native: over-explicit 私は, から where ので is softer, 〜たいです to a
--                   manager, the same construction repeated where range would want variation.
--   Kaori    theta 1.70  warm_guide - idiomatic, correct aspect and modality, and uses the specific
--                   grammar the item is really testing (置いてあります, 入れてあります,
--                   〜てもらえない, 〜みたい, 早退, 通り過ぎる).
--   Tetsuya  theta 2.30  master - what a native actually writes: concise, socially calibrated, and
--                   doing the pragmatic work the brief asks for rather than only the
--                   grammatical work (opening with おいしそうですね before declining;
--                   お手数ですが / ご配慮いただけると助かります in a note you have to live
--                   next door to).
--
-- LENGTH. `prompt.input.countLimit` is the item's character limit and several constraints say
-- UNDER N. Every answer here is STRICTLY under its item's limit; §4 asserts it rather than
-- trusting it.
-- =============================================================================

insert into public.submissions
  (id, match_id, user_id, seat, content, media_path, selected_option,
   elapsed_ms, paste_detected, submitted_at)
with roster (bot_slug, display_rating, seq, plan_ms, ms_per_char) as (
  -- READ, not authored. The cast is per-world content and lives in `public.bots`, so the slug
  -- and the display rating come from there and cannot drift from the roster the code resolves
  -- against. Only the two timing knobs are authored here, and they are keyed by ARCHETYPE
  -- (the rung) rather than by name: how long a rung deliberates is a property of the rung, and
  -- survives the world renaming its cast.
  select b.slug, b.display_rating, b.sort_order, k.plan_ms, k.ms_per_char
  from public.bots b
  join (values
    ('earnest_beginner', 12000, 900),
    ('casual_peer',      18000, 950),
    ('precise_literary', 22000, 900),
    ('warm_guide',       26000, 850),
    ('master',           16000, 600)
  ) as k (archetype, plan_ms, ms_per_char) on k.archetype = b.archetype
  where b.world_slug = 'ja'
),
seats as (
  -- The pool is a full cross product: every roster bot answers every duel item. So the seat
  -- list needs no per-row enumeration — it IS `items x roster`, which also makes it impossible
  -- for a new duel item to be added without every bot covering it.
  select
    i.id                     as item_id,
    i.external_id,
    i.prompt,
    i.constraint_text,
    i.time_limit_ms,
    r.bot_slug,
    r.seq,
    r.plan_ms,
    r.ms_per_char,
    (r.display_rating - 1000)::double precision / 1250.0 as theta_before,
    -- Authored, never `now()`: `chooseOpponent` breaks ties on submission age, so a
    -- clock-derived timestamp would change which bot a learner meets depending on when the
    -- seed last ran. Ranked on external_id, not on `items.id`, so re-seeding content cannot
    -- move it either. (rank x 5 + seq) minutes is collision-free and orders the roster
    -- weakest-first inside each item.
    timestamptz '2026-07-01 00:00:00+00'
      + make_interval(mins => (dense_rank() over (order by i.external_id) * 5 + r.seq)::integer)
                             as submitted_at
  from public.items i
  cross join roster r
  where i.world_slug = 'ja' and i.ladder_slug = 'duel'
),
answers (item_key, bot_slug, content) as (values


-- --- ja-duel-package-note · <40 · POLITE · 〜てしまった ------------------------
-- The register test is a note to a NEIGHBOUR: polite, and the delay is the thing being
-- apologised for. Satoru's あなたの is the classic beginner calque and plain form to a stranger
-- is the register failure; Rin picks です/ます and then closes with ごめんね.
('ja-duel-package-note','satoru',  'これ、あなたの荷物。一週間ドアにあった。ごめん。'),
('ja-duel-package-note','rin',     'すみません、この荷物を一週間見ませんでした。遅くなってしまいました。ごめんね。'),
('ja-duel-package-note','haruki',  'お荷物、一週間気がつかなくて遅くなってしまいました。すみません。'),
('ja-duel-package-note','kaori',   'お荷物が届いていました。気づくのが遅れてしまって、すみませんでした。'),
('ja-duel-package-note','tetsuya', '間違って届いていました。気づくのが遅くなってしまい、申し訳ありません。'),

-- --- ja-duel-late-to-station · <30 · PLAIN --------------------------------------
-- Two facts required: where you are, when you arrive. Satoru drops に after 20分後 and reaches
-- for 行く where 着く is the word; Rin fronts 私は, which is grammatical and unnatural.
('ja-duel-late-to-station','satoru',  'ごめん。今電車。20分後駅に行く。'),
('ja-duel-late-to-station','rin',     'ごめん。私は今電車にいる。20分後に駅に着く。'),
('ja-duel-late-to-station','haruki',  'ごめんね、今電車に乗っている。20分後に着く。'),
('ja-duel-late-to-station','kaori',   'ごめん！今電車の中で、20分くらいで着くと思う。'),
('ja-duel-late-to-station','tetsuya', 'ごめん、今電車の中。あと20分くらいで着く。'),

-- --- ja-duel-cleaner-key-note · <50 · 〜てください -------------------------------
-- Two instructions in order. Satoru uses the て-form where the たら conditional is required —
-- a real learner error, not a nonsense one. Kaori reaches for 入れてあります (resultative
-- transitive), Tetsuya for 戻しておいてください (the ておく that means "leave it that way").
('ja-duel-cleaner-key-note','satoru',  '鍵、ポストの中。終わって、ポストに入れてください。'),
('ja-duel-cleaner-key-note','rin',     '鍵はポストにあります。掃除の後で、鍵をポストに入れてください。'),
('ja-duel-cleaner-key-note','haruki',  '鍵はポストの中にあります。掃除が終わったら、ポストに返してください。'),
('ja-duel-cleaner-key-note','kaori',   '鍵は郵便受けに入れてあります。作業が終わったら、同じ場所に戻してください。'),
('ja-duel-cleaner-key-note','tetsuya', '鍵はポストの中に入っています。終わったら、ポストに戻しておいてください。'),

-- --- ja-duel-decline-food · <40 · POLITE ----------------------------------------
-- The pragmatic core: 食べません refuses by WILL and is the socially damaging answer;
-- 食べられません refuses by ABILITY and protects her. Tetsuya adds the おいしそうですね that
-- does the actual face-saving, which is the whole difference between the warm_guide and
-- master rungs here.
('ja-duel-decline-food','satoru',  'すみません。私は卵だめです。食べません。'),
('ja-duel-decline-food','rin',     'ごめんなさい。卵が食べられません。アレルギーがあります。'),
('ja-duel-decline-food','haruki',  'すみません。私は卵アレルギーですから、食べることができません。'),
('ja-duel-decline-food','kaori',   'すみません、卵アレルギーがあるので、これは食べられないんです。'),
('ja-duel-decline-food','tetsuya', 'おいしそうですね。ただ、卵アレルギーがあって食べられないんです。すみません。'),

-- --- ja-duel-leave-class-early · POLITE · 〜てもいいですか ------------------------
-- Ask, do not announce. Rin sustains です/ます and then puts だから in the middle of it.
('ja-duel-leave-class-early','satoru',  '先生、病院行く。早く帰ってもいいですか。'),
('ja-duel-leave-class-early','rin',     '先生、今日病院に行きます。だから、早く帰ってもいいですか。'),
('ja-duel-leave-class-early','haruki',  '先生、すみません。病院の予約がありますから、早く帰ってもいいですか。'),
('ja-duel-leave-class-early','kaori',   '先生、今日は病院に行かなければならないので、早退してもいいですか。'),
('ja-duel-leave-class-early','tetsuya', '先生、すみません。今日は病院の予約があるので、少し早く帰ってもいいですか。'),

-- --- ja-duel-borrow-notes · PLAIN · A REQUEST, NOT AN ORDER ----------------------
-- The item is testing whether you can build a refusable request. 貸して is a command,
-- 貸してください is a polite command, 貸してくれない？ and 見せてもらえない？ are requests.
('ja-duel-borrow-notes','satoru',  '昨日、学校行かなかった。ノート、貸して。'),
('ja-duel-borrow-notes','rin',     '昨日授業に行かなかった。ノートを貸してください。'),
('ja-duel-borrow-notes','haruki',  '昨日、授業を休んだ。ノートを貸してくれない？'),
('ja-duel-borrow-notes','kaori',   '昨日授業に出られなかったんだけど、ノート貸してくれない？'),
('ja-duel-borrow-notes','tetsuya', '昨日休んじゃって、ノート見せてもらえない？'),

-- --- ja-duel-thank-coworker · <50 · POLITE · 〜てくれて / 〜ていただいて ----------
-- "Name what they did" is the task_completion hook: 遅くまで残って must appear.
('ja-duel-thank-coworker','satoru',  '昨日ありがとう。手伝ってくれて、よかった。'),
('ja-duel-thank-coworker','rin',     '昨日はありがとうございました。私のレポートを手伝ってくれて、うれしいです。'),
('ja-duel-thank-coworker','haruki',  '昨日は遅くまでレポートを手伝ってくれて、ありがとうございます。'),
('ja-duel-thank-coworker','kaori',   '昨日は残ってレポートを手伝ってくれて、本当にありがとうございました。'),
('ja-duel-thank-coworker','tetsuya', '昨日は遅くまで手伝っていただいて、ありがとうございました。おかげで間に合いました。'),

-- --- ja-duel-wrong-dish · <35 · POLITE -------------------------------------------
-- Both facts required. 〜んですが is the softener that makes a complaint not a confrontation.
('ja-duel-wrong-dish','satoru',  'すみません。これ違う。カレー、ください。'),
('ja-duel-wrong-dish','rin',     'すみません。これは違います。カレーを頼みました。'),
('ja-duel-wrong-dish','haruki',  'すみません、私はカレーを注文しましたが、これはラーメンです。'),
('ja-duel-wrong-dish','kaori',   'すみません、注文したのはカレーなんですが、これは違うようです。'),
('ja-duel-wrong-dish','tetsuya', 'すみません、これ頼んでいないんですが。カレーを注文しました。'),

-- --- ja-duel-describe-room · <60 · ある/いる + 上下前後 ---------------------------
-- Two things, each findable. Rin locates one and then just asserts a bed exists.
('ja-duel-describe-room','satoru',  '私の部屋、机ある。机の上に本ある。ベッドもある。'),
('ja-duel-describe-room','rin',     '私の部屋にテーブルがあります。テーブルの上に本があります。あと、ベッドがあります。'),
('ja-duel-describe-room','haruki',  '部屋に大きい机があります。机の上に青い本があります。ベッドの下に箱があります。'),
('ja-duel-describe-room','kaori',   '窓の前に机があって、その上に青いノートパソコンが置いてあります。本はベッドの下の箱の中です。'),
('ja-duel-describe-room','tetsuya', '机の上にノートパソコンがあって、その下の引き出しに鍵が入っています。ベッドは窓の前です。'),

-- --- ja-duel-missed-party · <40 · PLAIN · 〜てしまった / ので ---------------------
-- The task is admitting it, so an invented excuse costs task_completion. Rin's failure is
-- the register one: ました to a close friend on a PLAIN FORM item.
('ja-duel-missed-party','satoru',  'ごめん。私、パーティー忘れた。行きたかった。'),
('ja-duel-missed-party','rin',     'ごめんなさい。私はパーティーを忘れてしまいました。'),
('ja-duel-missed-party','haruki',  'ごめん。パーティーのことを忘れてしまった。本当にごめん。'),
('ja-duel-missed-party','kaori',   '本当にごめん。すっかり忘れてしまって、気づいたのは今朝だった。'),
('ja-duel-missed-party','tetsuya', 'ごめん、すっかり忘れてしまった。行くつもりだったんだけど。'),

-- --- ja-duel-recommend-restaurant · <50 · より + のほうが -------------------------
-- Rin's より安いです is the standard L2 error: より fronted as English "more", with the
-- standard of comparison missing. Satoru omits より entirely and misses the constraint.
('ja-duel-recommend-restaurant','satoru',  'そば屋のほうがいい。ラーメン屋、高い。'),
('ja-duel-recommend-restaurant','rin',     'ラーメン屋とそば屋があります。そば屋のほうがいいです。より安いです。'),
('ja-duel-recommend-restaurant','haruki',  '駅の前に二つの店があります。ラーメン屋よりそば屋のほうが安いです。'),
('ja-duel-recommend-restaurant','kaori',   '二軒あるけど、ラーメン屋よりそば屋のほうが静かだから、話すならそっちがいい。'),
('ja-duel-recommend-restaurant','tetsuya', '駅前のラーメン屋より、隣のそば屋のほうがおいしいよ。値段も安い。'),

-- --- ja-duel-barking-dog · <60 · POLITE ------------------------------------------
-- "You still have to live next door to these people" is the axis. Rin is grammatically
-- clean and socially a declaration of war: あなたの犬 + うるさい + bare 〜てください.
-- Tetsuya does it the way it is actually done: name the effect on you, never the fault.
('ja-duel-barking-dog','satoru',  '犬、うるさい。夜、寝られない。静かにして。'),
('ja-duel-barking-dog','rin',     'すみません。あなたの犬は夜うるさいです。私は寝られません。静かにしてください。'),
('ja-duel-barking-dog','haruki',  'すみません。夜、犬の鳴き声が大きくて、よく眠れません。少し静かにしていただけませんか。'),
('ja-duel-barking-dog','kaori',   'はじめまして、隣の者です。夜に犬の声が聞こえて、なかなか眠れません。ご確認いただけないでしょうか。'),
('ja-duel-barking-dog','tetsuya', '夜、ワンちゃんの鳴き声で眠れないことがあります。お手数ですが、ご配慮いただけると助かります。'),

-- --- ja-duel-earthquake-doing · <45 · 〜ていました --------------------------------
-- The aspect item. Rin's 食べました reports a completed act where the brief asks what was
-- IN PROGRESS — the exact error the item exists to catch, and a constraint miss on top.
('ja-duel-earthquake-doing','satoru',  '昨日地震あった。私、テレビ見た。こわい。'),
('ja-duel-earthquake-doing','rin',     '地震のとき、私は晩ご飯を食べました。とても怖かったです。'),
('ja-duel-earthquake-doing','haruki',  '昨日の夜、地震が始まったとき、私はテレビを見ていました。'),
('ja-duel-earthquake-doing','kaori',   '揺れたとき、部屋でテレビを見ていました。立てないくらい揺れました。'),
('ja-duel-earthquake-doing','tetsuya', '地震のとき、ちょうど晩ご飯を作っていました。鍋のお湯がこぼれそうでした。'),

-- --- ja-duel-sick-day-message · <60 · POLITE · ので --------------------------------
-- Situation, consequence, apology, in that order. Rin uses だから and misses the required
-- ので. Haruki states a desire (休みたいです) where a request is owed upward; Kaori requests
-- (休ませてください); Tetsuya defers (休ませていただけますでしょうか). That ladder IS the item.
('ja-duel-sick-day-message','satoru',  '熱ある。今日、仕事行けない。ごめんなさい。'),
('ja-duel-sick-day-message','rin',     'おはようございます。私は熱があります。だから、今日は行けません。すみません。'),
('ja-duel-sick-day-message','haruki',  'おはようございます。熱があるので、今日は休みたいです。すみません。よろしくお願いします。'),
('ja-duel-sick-day-message','kaori',   'おはようございます。熱が出てしまったので、今日はアルバイトを休ませてください。ご迷惑をおかけします。'),
('ja-duel-sick-day-message','tetsuya', 'おはようございます。朝から熱があるので、本日はお休みさせていただけますでしょうか。急で申し訳ありません。'),

-- --- ja-duel-advice-study-japan · <50 · 〜たら -------------------------------------
-- "Concrete, something they could do in their first week." Rin's たら is correct and the
-- advice is a platitude, so accuracy holds and task_completion does not.
('ja-duel-advice-study-japan','satoru',  '日本行ったら、たくさん勉強して。がんばって。'),
('ja-duel-advice-study-japan','rin',     '日本に行ったら、日本人と話してください。日本語が上手になります。'),
('ja-duel-advice-study-japan','haruki',  '日本に行ったら、すぐに携帯電話を買ったほうがいいです。とても便利です。'),
('ja-duel-advice-study-japan','kaori',   '日本に着いたら、最初の週に銀行口座を作るといいよ。バイトの給料が振り込めないから。'),
('ja-duel-advice-study-japan','tetsuya', '着いたらすぐ市役所に行って、住民登録をしたほうがいいよ。それがないと何も始まらない。'),

-- --- ja-duel-exchange-profile · <60 · POLITE · 〜たい ------------------------------
-- Read by strangers, so polite; a profile, so short. Satoru drops every copula and every
-- polite form. Rin repeats 私は twice, which is the tell.
('ja-duel-exchange-profile','satoru',  '私はトム。アメリカ人。日本語話したい。よろしく。'),
('ja-duel-exchange-profile','rin',     'はじめまして。私はトムです。私は日本語を勉強したいです。友達になりましょう。'),
('ja-duel-exchange-profile','haruki',  'はじめまして。アメリカから来た学生です。日本語で話したいです。よろしくお願いします。'),
('ja-duel-exchange-profile','kaori',   'はじめまして。大学生です。英語を教えられます。仕事で使える日本語を練習したいです。よろしくお願いします。'),
('ja-duel-exchange-profile','tetsuya', 'はじめまして。東京で働いているアメリカ人です。日常会話を自然に話せるようになりたいので、よろしくお願いします。'),

-- --- ja-duel-stolen-bicycle · <50 · POLITE · PASSIVE ------------------------------
-- "The bicycle is the topic, not the thief." Rin's 誰かが…取りました is grammatical and
-- makes the thief the subject, which is both a constraint miss and the wrong report.
('ja-duel-stolen-bicycle','satoru',  '私の自転車、ない。誰か取った。アパートの前。'),
('ja-duel-stolen-bicycle','rin',     'すみません。誰かが私の自転車を取りました。アパートの前にありました。'),
('ja-duel-stolen-bicycle','haruki',  'すみません。自転車が盗まれました。アパートの前に置いていました。'),
('ja-duel-stolen-bicycle','kaori',   '自転車が盗まれました。昨日の夜、アパートの入り口の横に置いておいたものです。'),
('ja-duel-stolen-bicycle','tetsuya', 'すみません、自転車を盗まれました。マンションの前の駐輪場に停めていたものです。'),

-- --- ja-duel-decline-karaoke · <40 · PLAIN · 〜なければならない / 〜なきゃ ---------
-- The obligation must be the reason. Haruki's なければならない is correct and bookish for
-- speech among friends; なきゃ is what is actually said, which is the warm_guide/master rung.
('ja-duel-decline-karaoke','satoru',  'ごめん、行かない。明日テストある。勉強する。'),
('ja-duel-decline-karaoke','rin',     'ごめんなさい。明日試験があります。勉強しなければなりません。'),
('ja-duel-decline-karaoke','haruki',  'ごめん、行けない。明日試験があるから、勉強しなければならない。'),
('ja-duel-decline-karaoke','kaori',   '行きたいけど、明日試験だから今日は寝なきゃいけない。また今度誘って。'),
('ja-duel-decline-karaoke','tetsuya', 'ごめん、明日の朝試験だから、今日は帰って勉強しなきゃ。'),

-- --- ja-duel-propose-friday · <40 · VOLITIONAL -------------------------------------
-- "A proposal, so it leaves room for them to decline." Satoru gets the volitional and nothing
-- else: no に, and no door left open.
('ja-duel-propose-friday','satoru',  '金曜日、ラーメン屋行こう。'),
('ja-duel-propose-friday','rin',     '金曜日、ラーメンを食べに行きましょう。いいですか。'),
('ja-duel-propose-friday','haruki',  '金曜日に新しいラーメン屋に行きましょう。どうですか。'),
('ja-duel-propose-friday','kaori',   '金曜日、新しいラーメン屋に行ってみようよ。都合が悪かったら言ってね。'),
('ja-duel-propose-friday','tetsuya', '金曜、新しくできたラーメン屋に行こうよ。空いてたらでいいけど。'),

-- --- ja-duel-directions-konbini · <70 · ONE SEQUENCE 〜て、〜てください -------------
-- Rin writes four correct sentences, which is exactly what the constraint forbids.
('ja-duel-directions-konbini','satoru',  '改札出て、右。銀行の後、コンビニある。'),
('ja-duel-directions-konbini','rin',     '改札を出てください。右に行ってください。銀行があります。コンビニは角です。'),
('ja-duel-directions-konbini','haruki',  '改札を出て、右に曲がって、銀行の前を通ってください。コンビニは角にあります。'),
('ja-duel-directions-konbini','kaori',   '改札を出て、右に曲がってください。銀行を通り過ぎると、角にコンビニがあります。'),
('ja-duel-directions-konbini','tetsuya', '改札を出て右に曲がって、銀行の前を通ってまっすぐ行ってください。角にありますよ。'),

-- --- ja-duel-describe-friend · <50 · NOUN-MODIFYING CLAUSE --------------------------
-- Rin decomposes into three copular sentences and never builds the modifying clause, and
-- 眼鏡があります is the wrong verb for wearing glasses.
('ja-duel-describe-friend','satoru',  '友達、背が高い。赤いシャツ。眼鏡ある。'),
('ja-duel-describe-friend','rin',     '私の友達は背が高いです。シャツは赤いです。眼鏡があります。'),
('ja-duel-describe-friend','haruki',  '赤いシャツを着ている人です。髪が長くて、眼鏡をかけています。'),
('ja-duel-describe-friend','kaori',   '青いシャツを着て、窓の近くでコーヒーを飲んでいる人です。髪が短いです。'),
('ja-duel-describe-friend','tetsuya', '窓際に座ってる、赤いパーカーを着た背の高い人です。眼鏡をかけています。'),

-- --- ja-duel-broken-laptop · <45 · PLAIN · 〜られた ---------------------------------
-- The adversative passive. Rin's active 弟が…壊した is correct Japanese that reports the
-- wrong thing: the brief says "make it clear this was done to you".
('ja-duel-broken-laptop','satoru',  '弟、私のパソコン壊した。だめ。'),
('ja-duel-broken-laptop','rin',     '弟が私のパソコンを壊した。とても悲しい。'),
('ja-duel-broken-laptop','haruki',  '弟にパソコンを壊された。とても困っている。'),
('ja-duel-broken-laptop','kaori',   '弟にノートパソコンを壊された。修理に出さないといけないみたい。'),
('ja-duel-broken-laptop','tetsuya', '弟にパソコンを壊された。ゲームしてて落としたらしい。まじで最悪。'),

-- --- ja-duel-duplicate-gift · <45 · POLITE · もらう / いただく ----------------------
-- "Not obliged to lie, but obliged to be gracious." Rin is polite, accurate, and lands the
-- one sentence that makes the giver feel bad — でも、もう持っています — with no もらう/いただく.
('ja-duel-duplicate-gift','satoru',  'ありがとう。でも、これ持ってる。'),
('ja-duel-duplicate-gift','rin',     'ありがとうございます。でも、私はもうこれを持っています。'),
('ja-duel-duplicate-gift','haruki',  'ありがとうございます。すてきなプレゼントをもらって、とてもうれしいです。'),
('ja-duel-duplicate-gift','kaori',   'ありがとうございます。いただけてうれしいです。もう一つ持っているので、職場でも使えます。'),
('ja-duel-duplicate-gift','tetsuya', 'わあ、ありがとうございます。実はもう一つ持っているんですが、いただけて嬉しいです。'),

-- --- ja-duel-milk-note · <40 · PLAIN · APOLOGISE AND SAY WHAT YOU WILL DO ------------
-- Two required moves. Satoru does the first and stops, so the note is incomplete on its face.
('ja-duel-milk-note','satoru',  'ごめん。牛乳、飲んだ。全部。'),
('ja-duel-milk-note','rin',     'ごめんなさい。私は牛乳を全部飲みました。明日買います。'),
('ja-duel-milk-note','haruki',  'ごめん、牛乳を全部飲んでしまった。あとで買ってくる。'),
('ja-duel-milk-note','kaori',   '牛乳、全部使ってしまってごめん。今日の夜、買っておくね。'),
('ja-duel-milk-note','tetsuya', 'ごめん、牛乳飲みきっちゃった。帰りに買ってくるね。'),

-- --- ja-duel-weekend-report · <60 · POLITE PAST · EXACTLY TWO SENTENCES --------------
-- A counting constraint, which a judge can check exactly. Rin writes three and the third
-- adds nothing; Satoru writes two but the second is not past and adds nothing.
('ja-duel-weekend-report','satoru',  '映画を見ました。楽しい。'),
('ja-duel-weekend-report','rin',     '私は友達と映画を見ました。楽しかったです。とてもよかったです。'),
('ja-duel-weekend-report','haruki',  '土曜日に買い物に行きました。日曜日は家で本を読みました。'),
('ja-duel-weekend-report','kaori',   '日曜日に友達と映画を見に行きました。その後、近くのカフェで二時間ぐらい話しました。'),
('ja-duel-weekend-report','tetsuya', '土曜日は友達と鎌倉に行きました。人が多かったですが、海がきれいでよかったです。')
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


-- =============================================================================
-- 4. ASSERTIONS. A half-seeded pool is worse than none: it fails at match creation,
--    on one item, for one learner, in production. Fail here instead.
--
--    Every check reads the REAL tables, not a staging copy, so it verifies what actually
--    landed. scripts/content/verify-seed.sql conventions apply: raise, do not warn.
-- =============================================================================

do $$
declare
  n_items    integer;
  n_perf     integer;
  n_bots     integer;
  n_thin     integer;
  n_mislabel integer;
  n_overlong integer;
  n_rated    integer;
  n_leak     integer;
  bad        text;
begin
  select count(*) into n_items
    from public.items where world_slug = 'ja' and ladder_slug = 'duel';

  select count(*), count(distinct mp.bot_slug)
    into n_perf, n_bots
  from public.submissions sub
  join public.match_participants mp
    on mp.match_id = sub.match_id and mp.seat = sub.seat
  join public.matches m on m.id = sub.match_id
  where m.world_slug = 'ja' and m.ladder_slug = 'duel' and mp.is_bot;

  -- Every duel item must carry a full roster, or a learner whose band caps out on that item
  -- gets `no_opponent_available` and the match simply does not start.
  select count(*) into n_thin
  from public.items i
  where i.world_slug = 'ja' and i.ladder_slug = 'duel'
    and (
      select count(*)
      from public.matches m
      join public.match_participants mp on mp.match_id = m.id and mp.is_bot
      join public.submissions sub on sub.match_id = mp.match_id and sub.seat = mp.seat
      where m.item_id = i.id
    ) <> 5;

  -- The label `buildParticipants` and `match_participants_bot_xor_user` both insist on, plus
  -- the theta_before without which `toPoolPerformance` yields NaN and `fetchPool` drops the row.
  select count(*) into n_mislabel
  from public.match_participants mp
  join public.matches m on m.id = mp.match_id
  where m.world_slug = 'ja' and m.ladder_slug = 'duel' and mp.is_bot
    and (mp.user_id is not null or mp.bot_slug is null or mp.theta_before is null);

  -- A bot slug that is not in THIS WORLD's cast now throws in `botDisplayRating` — it used to
  -- fall back to a theta-derived rating and silently stop being the authored character, which
  -- is precisely how an English-named bot went on answering in Japanese for as long as it did.
  -- Checked against `public.bots` rather than a copied list of slugs, so this assertion cannot
  -- be the thing that goes stale next time the cast changes.
  select count(*) into n_leak
  from public.match_participants mp
  join public.matches m on m.id = mp.match_id
  where m.world_slug = 'ja' and m.ladder_slug = 'duel' and mp.is_bot
    and mp.bot_slug not in (select b.slug from public.bots b where b.world_slug = 'ja');

  -- Answers must fit the limit the item states; several constraints say UNDER N, so this is
  -- strict. An over-long bot answer would be a bot that cannot honour its own constraint.
  select count(*) into n_overlong
  from public.submissions sub
  join public.match_participants mp on mp.match_id = sub.match_id and mp.seat = sub.seat
  join public.matches m on m.id = sub.match_id
  join public.items i on i.id = m.item_id
  where mp.is_bot and m.world_slug = 'ja' and m.ladder_slug = 'duel'
    and (i.prompt -> 'input' ->> 'countLimit') is not null
    and char_length(sub.content) >= (i.prompt -> 'input' ->> 'countLimit')::integer;

  select count(*) into n_rated
  from public.matches m
  join public.match_participants mp on mp.match_id = m.id and mp.is_bot
  where m.world_slug = 'ja' and m.ladder_slug = 'duel' and m.is_rated;

  if n_perf <> n_items * 5 then
    raise exception 'bot pool: expected % performances (% items x 5 bots), got %',
      n_items * 5, n_items, n_perf;
  end if;
  if n_bots <> 5 then
    raise exception 'bot pool: expected 5 distinct bots, got %', n_bots;
  end if;
  if n_thin > 0 then
    raise exception 'bot pool: % duel item(s) do not carry all 5 bots', n_thin;
  end if;
  if n_mislabel > 0 then
    raise exception 'bot pool: % bot seat(s) are mislabelled or have no theta_before',
      n_mislabel;
  end if;
  if n_leak > 0 then
    raise exception 'bot pool: % seat(s) carry a bot_slug that is not in the ja cast (public.bots)',
      n_leak;
  end if;
  if n_overlong > 0 then
    select string_agg(i.external_id || '/' || mp.bot_slug, ', ') into bad
    from public.submissions sub
    join public.match_participants mp on mp.match_id = sub.match_id and mp.seat = sub.seat
    join public.matches m on m.id = sub.match_id
    join public.items i on i.id = m.item_id
    where mp.is_bot and m.world_slug = 'ja' and m.ladder_slug = 'duel'
      and (i.prompt -> 'input' ->> 'countLimit') is not null
      and char_length(sub.content) >= (i.prompt -> 'input' ->> 'countLimit')::integer;
    raise exception 'bot pool: % answer(s) reach or exceed the item character limit: %',
      n_overlong, bad;
  end if;
  if n_rated > 0 then
    raise exception 'bot pool: % origin match(es) are marked rated; bot matches are unrated',
      n_rated;
  end if;

  raise notice 'LoxeLingo ja bot pool: % performances across % bots on % duel items',
    n_perf, n_bots, n_items;
end $$;
