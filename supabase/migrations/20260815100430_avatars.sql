-- LoxeLingo — avatars. The student you teach, and the pairing that holds what you taught it.
--
-- Implements Phase 2 of docs/superpowers/plans/2026-08-13-v2-goal-and-plan.md.
--
-- =============================================================================
-- AN AVATAR IS NOT A BOT
-- =============================================================================
-- `public.bots` is an OPPONENT. It has a rung on the ladder, an authored ghost performance,
-- and the player's relationship to it is "beat it". One exists per rung per world and the
-- player never chooses one.
--
-- An AVATAR is a STUDENT. It starts knowing exactly what the player knows, usually nothing,
-- and the player's relationship to it is "teach it". The player chooses one, and what it
-- learns is the record of what the player could explain. The two tables share no column and
-- must never be merged: a single `characters` table would put a difficulty rung and a
-- teaching pairing in the same row and the first feature to read it would get one of them
-- wrong.
--
-- Nor is this `public.companions` (20260805104128). A companion is a capability gate: one per
-- user per world, cached from `user_concept_mastery`, identity optional and mutable. It is
-- precisely the shape this migration must not repeat. See THE SWITCH, below.
--
-- =============================================================================
-- HOMAGE, AND THE LINE
-- =============================================================================
-- Plan decision 2026-08-13: "Recognizable homage. Traits, mannerisms and cadence track the
-- source. Names, faces, verbatim catchphrases and trademarks do not."
--
-- Restated so a later contributor cannot drift across it by accident:
--
--   ALLOWED   a trait profile, a bearing, a speech cadence, a mannerism, a comic rhythm,
--             a recognizable stance toward being taught. None of these is protectable, and
--             recognizability is the point: a player should think "I know this person"
--             without ever being able to say from where.
--
--   FORBIDDEN a source character's name or any part of it; a described likeness; a verbatim
--             or near-verbatim catchphrase; a trademarked term, title, ability name or motto;
--             a plot beat lifted whole.
--
-- The line is enforced twice. `homage_note` is the ONE column where a source may be named,
-- and it is granted to nobody but `service_role`: no player can read it and no prompt is
-- built from it. Every other text column is covered by `avatars_names_no_source`, which
-- rejects the source tokens outright.
--
-- =============================================================================
-- THE TRAIT VECTOR: SIX AXES, EIGHTEEN POINTS
-- =============================================================================
-- Personality is stored as points across six axes, not as prose, because prompt construction
-- has to READ it. A paragraph of characterisation produces one voice; a vector produces a
-- behaviour per situation, and it can be diffed, tested and tuned.
--
--   warmth    attention paid to the player's state rather than the material
--   humour    how often a turn carries a joke, independent of who the joke is on
--   edge      willingness to aim the wit AT the player
--   patience  tolerance for slowness, repetition and a fourth attempt
--   candour   how plainly it reports its own confusion (0 = bluffs, 5 = says it flat)
--   drive     how hard it pushes for the next thing without being asked
--
-- WHY THESE SIX. Four of them are the Big Five / HEXACO factors that survive contact with
-- dialogue: `warmth` is Big-Five agreeableness's trust-and-affection half, `patience` is
-- HEXACO agreeableness (tolerance, forgiveness, anger management), `edge` is the antagonism
-- pole those two models keep splitting, `candour` is HEXACO's honesty-humility, `drive` is
-- the assertive half of extraversion. `humour` is in neither model and is added anyway,
-- because it is the axis a reader detects in one line and the two comic axes must be
-- separable: SILLY is high humour with low edge, CUTTING is low humour with high edge, and a
-- single "funny" score cannot tell them apart. Conscientiousness and openness are omitted on
-- purpose: neither changes how a character reacts to being taught badly, which is the only
-- thing this vector is for.
--
-- WHY NOT AN AXIS FOR THE TRAITS THE BRIEF NAMED. "Grumpy", "troll" and "impatient" are
-- REGIONS of this space, not dimensions of it. Grumpy = low warmth x high edge x low
-- patience. Troll = high edge x mid-to-high humour x low warmth. Impatient = 5 - patience.
-- A basis whose members are already composites cannot express a character that is grumpy
-- but tender, or funny but never at your expense. Naming the composites as axes is the
-- mistake that makes five characters read as five settings of one character.
--
-- THE BUDGET. Every avatar spends exactly 18 of a possible 30. That is the whole design:
-- a character is a set of tradeoffs, so three 5s leave 3 points for the other three axes.
-- `avatars_trait_budget` makes it arithmetic rather than editorial. `avatars_trait_silhouette`
-- then rejects the flat build (a 3 everywhere sums to 18 and is nobody), by requiring a gap
-- of at least 3 between the strongest and weakest axis.
--
-- Six smallint columns, not one jsonb: a CHECK can sum columns and cannot sum a jsonb object
-- without a subquery, and the budget is the invariant most worth having the database keep.
--
-- =============================================================================
-- REGISTER IS NOT ON THE BUDGET
-- =============================================================================
-- How a character SOUNDS (sentence length, diction, whether it finishes its clauses) lives in
-- `voice_guide`, outside the point budget, because it does not compete. A formal character is
-- not spending personality on formality, and putting cadence on the budget would tax a
-- character for having a voice. `voice_guide` is `{ "speaks": [...], "never": [...] }`: the
-- second array is the load-bearing one, since a voice is defined by its refusals.
--
-- =============================================================================
-- THE FOUR SITUATIONS
-- =============================================================================
-- A trait only counts if it is observable, so every avatar answers the same four questions,
-- in `reactions`: the player teaches well, teaches badly, is slow, quits mid-lesson. Those
-- four are the corners of the teaching loop and they are the moments where a personality is
-- either real or decoration. The key set is closed by constraint; a fifth situation is a
-- migration, which is correct, because adding one without authoring five answers ships a
-- cast that goes silent in a place the player will find.
--
-- =============================================================================
-- WHAT THE PLAYER MAY READ
-- =============================================================================
-- `avatars_says_no_label` bans the axis vocabulary from every reader-facing and model-facing
-- string, in the spirit of `bots_self_description_states_no_archetype`. Same reason: a card
-- that reads "warm, impatient, funny" hands the player a verdict on a character they have not
-- met, and it is the exact field a later content edit will casually break.
--
-- The grants take the same position one step further. `authenticated` may read slug, name,
-- look, hook, portrait_path and sort_order. It may NOT read the trait columns. A trait
-- readout is a stat block, and a stat block is the label the constraint above exists to
-- withhold: the player is supposed to work the character out from four situations, not from
-- six bars. `voice_guide`, `reactions` and `homage_note` are prompt material and authoring
-- notes, and prompts are built server-side.
--
-- =============================================================================
-- THE SWITCH: WHY PROGRESS CANNOT FOLLOW A PLAYER TO A NEW AVATAR
-- =============================================================================
-- The obvious schema is `user_avatars (user_id, world_slug) primary key` with `avatar_slug`
-- as a mutable column and the progress beside it. It is wrong, and it fails silently: a
-- switch is then an UPDATE of one column, every progress number stays exactly where it was,
-- and a player who has taught nothing to their new avatar meets it already fluent. `companions`
-- has that shape today. It is a capability cache, so it gets away with it. Teaching progress
-- would not.
--
-- Here the primary key is `(user_id, world_slug, avatar_slug)`. There is no row that means
-- "this player's teaching progress in Japanese"; there are only rows that mean "this player's
-- teaching progress in Japanese WITH Vane". The progress columns are unreachable except
-- through a key that already names the avatar, so carrying them across is not a rule anyone
-- has to remember: there is nowhere to carry them TO.
--
-- Two constraints close the remaining gap, which is a well-meaning INSERT that copies the old
-- numbers into the new pairing:
--
--   user_avatars_untaught_pairing_sits_at_origin
--     lessons_taught = 0 implies stage = 1 AND theta = origin_theta. A fresh pairing sits
--     exactly where the player was, which IS "it starts knowing what you know". Smuggling a
--     taught theta into a new row fails here, because origin_theta is the player's ability
--     and the two would disagree.
--
--   user_avatars_lessons_and_last_taught_agree
--     a pairing has a last-taught timestamp exactly when it has lessons. Faking lessons_taught
--     to get around the constraint above therefore also requires faking a history.
--
-- WHICH AVATAR IS CURRENT is a separate fact from progress and is stored as one: the current
-- pairing is the one with `retired_at is null`, and a partial unique index allows exactly one
-- per (user, world). Retiring an avatar sets a timestamp; nothing is deleted, so switching
-- back finds the old pairing exactly as it was left. A boolean `is_active` beside the
-- timestamp was rejected: two columns that can disagree about the same fact eventually do.
--
-- =============================================================================
-- EXPOSURE
-- =============================================================================
-- `avatars` is static config the client renders, like `worlds` and `bots`: RLS on, readable by
-- every signed-in user, with the explicit column grants the 2026-04-28 Data API change
-- requires. `user_avatars` is per-user and readable only by its owner, with NO client write
-- path at all, matching `user_ratings`. `origin_theta` has to be read out of `user_ratings` to
-- be true, and a client that can write it can claim its avatar started at the summit.
--
-- The five characters are NOT in this migration. They are content, and content lives in
-- supabase/seeds/50-avatars.sql where it can be re-run and edited without a schema change.

-- ---------------------------------------------------------------------------
-- avatars — the five characters. Static config.
-- ---------------------------------------------------------------------------
create table public.avatars (
  slug           text        primary key,
  name           text        not null unique check (char_length(name) between 2 and 40),

  -- The look, in words. There is no art yet and there may never need to be: a described face
  -- is also the one that cannot accidentally resemble a source character's.
  look           text        not null,
  -- One first-person line. Shows the character; never labels it. Same job as bots.self_description.
  hook           text        not null,

  -- The vector. 0-5 each, summing to exactly 18. See the header.
  warmth         smallint    not null check (warmth   between 0 and 5),
  humour         smallint    not null check (humour   between 0 and 5),
  edge           smallint    not null check (edge     between 0 and 5),
  patience       smallint    not null check (patience between 0 and 5),
  candour        smallint    not null check (candour  between 0 and 5),
  drive          smallint    not null check (drive    between 0 and 5),

  -- { "speaks": [...], "never": [...] }. Off the point budget: cadence does not compete
  -- with personality, it carries it.
  voice_guide    jsonb       not null,
  -- The four situations, keyed exactly. One authored stance each.
  reactions      jsonb       not null,

  -- The ONE place a source may be named. Granted to service_role only; never reaches a prompt.
  homage_note    text        not null check (char_length(homage_note) between 20 and 400),

  -- Storage object path for a portrait, if art ever exists. Nullable-and-planned, same
  -- rationale as bots.avatar_path: this beats a migration per asset.
  portrait_path  text,

  sort_order     smallint    not null unique,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint avatars_slug_format check (slug ~ '^[a-z0-9-]+$'),

  -- THE BUDGET. A character is a set of tradeoffs or it is a wish list.
  constraint avatars_trait_budget check (
    warmth + humour + edge + patience + candour + drive = 18
  ),
  -- THE SILHOUETTE. 3,3,3,3,3,3 sums to 18 and is nobody. Require a real strongest and a
  -- real weakest.
  constraint avatars_trait_silhouette check (
    greatest(warmth, humour, edge, patience, candour, drive)
    - least(warmth, humour, edge, patience, candour, drive) >= 3
  ),

  constraint avatars_hook_one_line check (
    position(E'\n' in hook) = 0
    and position(E'\r' in hook) = 0
    and char_length(hook) between 20 and 140
  ),
  constraint avatars_look_bounds check (char_length(look) between 40 and 320),

  -- Shape of the authored jsonb. `coalesce(jsonb_typeof(...), 'missing')` rather than a bare
  -- comparison: a missing key makes jsonb_typeof NULL, and a CHECK passes on NULL, so the
  -- naive form would wave through the exact row it exists to stop.
  constraint avatars_voice_guide_shape check (
    coalesce(jsonb_typeof(voice_guide -> 'speaks'), 'missing') = 'array'
    and coalesce(jsonb_typeof(voice_guide -> 'never'), 'missing') = 'array'
    and jsonb_array_length(voice_guide -> 'speaks') between 3 and 8
    and jsonb_array_length(voice_guide -> 'never')  between 3 and 8
    and voice_guide - 'speaks' - 'never' = '{}'::jsonb
  ),

  -- Exactly the four situations, no more and no fewer, each a usable line.
  constraint avatars_reactions_cover_every_situation check (
    coalesce(jsonb_typeof(reactions -> 'taught_well'),  'missing') = 'string'
    and coalesce(jsonb_typeof(reactions -> 'taught_badly'), 'missing') = 'string'
    and coalesce(jsonb_typeof(reactions -> 'player_slow'),  'missing') = 'string'
    and coalesce(jsonb_typeof(reactions -> 'player_quit'),  'missing') = 'string'
    and char_length(reactions ->> 'taught_well')  between 20 and 240
    and char_length(reactions ->> 'taught_badly') between 20 and 240
    and char_length(reactions ->> 'player_slow')  between 20 and 240
    and char_length(reactions ->> 'player_quit')  between 20 and 240
    and reactions - 'taught_well' - 'taught_badly' - 'player_slow' - 'player_quit'
        = '{}'::jsonb
  ),

  -- THE LABEL BAN. The player infers a character; they are never handed a readout of one.
  -- Word-bounded (\m..\M) so a longer word that merely contains one of these survives.
  -- Covers reader-facing AND model-facing text: the model's output is read by a player, so a
  -- voice guide that says "be warm" produces the same failure one step later.
  constraint avatars_says_no_label check (
    (name || ' ' || look || ' ' || hook || ' ' || voice_guide::text || ' ' || reactions::text)
      !~* '\m(warm|warmth|warmly|humour|humor|humorous|edge|edges|edgy|patience|patient|impatient|impatience|candour|candor|candid|drive|driven|trait|traits|axis|vector|personality|persona|archetype|temperament|grumpy|grumpiness|troll|sarcastic|deadpan|abrasive|snarky|moody)\M'
  ),

  -- THE HOMAGE LINE, as SQL. Traits and cadence may track a source; the source's NAME may
  -- appear in exactly one column, and this is not it.
  constraint avatars_names_no_source check (
    (name || ' ' || look || ' ' || hook || ' ' || voice_guide::text || ' ' || reactions::text)
      !~* '\m(luffy|goku|naruto|uzumaki|kimmy|schmidt|bakugo|katsuki|vegeta|midoriya|tucker|malcolm|saitama|ludgate|hinata|hyuga|chidi|anagonye|reigen|arataka|sparrow)\M'
  )
);

comment on table public.avatars is
  'The five student characters a player teaches. Distinct from public.bots, which are opponents a player beats: an avatar knows only what it has been taught, a bot arrives at a fixed rung.';
comment on column public.avatars.look is
  'The look in words, not an asset. A described face cannot accidentally resemble a source character''s.';
comment on column public.avatars.hook is
  'One first-person line that SHOWS the character and never labels it. Same contract as bots.self_description.';
comment on column public.avatars.warmth is
  'Points on the attention-to-the-player axis. Part of a fixed 18-point budget across six axes; see avatars_trait_budget.';
comment on column public.avatars.humour is
  'Joke rate, independent of target. Kept separate from `edge` so silly and cutting are different characters rather than one slider.';
comment on column public.avatars.edge is
  'Willingness to aim the wit at the player. The axis the product owner called "troll", as a dimension rather than a label.';
comment on column public.avatars.patience is
  'Tolerance for slowness and repetition. Impatience is 5 minus this; it is not its own axis.';
comment on column public.avatars.candour is
  'How plainly it reports its own confusion. 0 bluffs through a lesson it did not follow, 5 says so flatly. The axis that decides whether a player can trust a teach-back.';
comment on column public.avatars.drive is
  'How hard it pushes for the next thing unasked.';
comment on column public.avatars.voice_guide is
  'How it speaks and what it never says: { "speaks": [...], "never": [...] }. Deliberately off the point budget, because cadence does not trade against personality.';
comment on column public.avatars.reactions is
  'One authored stance per situation, keyed taught_well / taught_badly / player_slow / player_quit. The key set is closed by constraint: a fifth situation needs five authored answers.';
comment on column public.avatars.homage_note is
  'The recognizable profile this character was built against. Authoring notes: granted to service_role only, never rendered, never sent to a model. The only column where a source may be named.';
comment on column public.avatars.portrait_path is
  'Storage object path for a portrait. Null until art exists; the `look` column is the shipping description.';

create trigger avatars_set_updated_at
  before update on public.avatars
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_avatars — the pairing, and everything the pairing learned.
--
-- One row per (player, world, avatar). Not per (player, world): see THE SWITCH in the header.
-- ---------------------------------------------------------------------------
create table public.user_avatars (
  user_id        uuid        not null references auth.users (id) on delete cascade,
  world_slug     text        not null references public.worlds (slug) on delete restrict,
  avatar_slug    text        not null references public.avatars (slug) on delete restrict,

  -- Novice .. Expert, the six stages of the teaching loop (plan Phase 3).
  stage          smallint    not null default 1 check (stage between 1 and 6),

  -- What the AVATAR can do, on the logit scale, exactly like user_ratings.theta. No generated
  -- display column here on purpose: the 0-10,000 transform already exists twice (elo.ts and
  -- 20260815094459_rating_scale_10k.sql) and display-scale.test.ts pins those two to each
  -- other. A third copy is a third thing to keep in step, for a number no screen has asked for.
  theta          double precision not null default 0,
  -- The player's own ability at the moment this pairing began. "It starts knowing exactly what
  -- you know" is this column, and the constraint below is what makes that a fact.
  origin_theta   double precision not null default 0,

  lessons_taught integer     not null default 0 check (lessons_taught >= 0),
  last_taught_at timestamptz,

  chosen_at      timestamptz not null default now(),
  -- Null means this is the current pairing. Non-null means set down, and kept: switching back
  -- finds it exactly as it was left.
  retired_at     timestamptz,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  primary key (user_id, world_slug, avatar_slug),

  constraint user_avatars_retired_after_chosen check (
    retired_at is null or retired_at >= chosen_at
  ),
  -- An untaught pairing sits exactly where the player was. This is what a switch cannot get
  -- around: copying a taught theta into a fresh row leaves theta and origin_theta disagreeing.
  constraint user_avatars_untaught_pairing_sits_at_origin check (
    lessons_taught > 0 or (stage = 1 and theta = origin_theta)
  ),
  -- And faking the lesson count to escape that requires faking a history too.
  constraint user_avatars_lessons_and_last_taught_agree check (
    (last_taught_at is null) = (lessons_taught = 0)
  )
);

-- Exactly one current pairing per player per world. The partial index IS the "which avatar am
-- I using" answer; there is no second column that could disagree with it.
create unique index user_avatars_one_current_per_world
  on public.user_avatars (user_id, world_slug)
  where retired_at is null;

create index user_avatars_avatar_idx on public.user_avatars (avatar_slug);

comment on table public.user_avatars is
  'One row per (player, world, avatar). Teaching progress is keyed by the pairing, so switching avatars cannot carry it: there is no row that means "progress in this world" without naming the avatar.';
comment on column public.user_avatars.theta is
  'The AVATAR''s ability, logit scale, mirroring user_ratings.theta. What the player managed to teach, not what the player knows.';
comment on column public.user_avatars.origin_theta is
  'The player''s own theta when this pairing began. Immutable in practice: written once by the server action that creates the pairing, from a live read of user_ratings.';
comment on column public.user_avatars.retired_at is
  'Null = the current pairing. The single source of truth for "which avatar", enforced by user_avatars_one_current_per_world.';

create trigger user_avatars_set_updated_at
  before update on public.user_avatars
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS + grants.
-- `to authenticated` covers guests: anonymous sign-in issues an `authenticated` JWT with
-- is_anonymous = true. (Never `auth.role() = 'authenticated'` in a predicate.)
-- ---------------------------------------------------------------------------
alter table public.avatars      enable row level security;
alter table public.user_avatars enable row level security;

create policy "avatars: readable by signed-in users"
  on public.avatars for select to authenticated using (true);

create policy "user_avatars: select own"
  on public.user_avatars for select to authenticated
  using (user_id = (select auth.uid()));

-- Column grants, not a table grant. The trait columns are withheld from the client on the
-- same grounds as avatars_says_no_label: six bars on a selection card are the label the
-- constraint exists to prevent. voice_guide / reactions / homage_note are prompt material and
-- authoring notes; prompts are built on the server.
grant select (slug, name, look, hook, portrait_path, sort_order, created_at)
  on public.avatars to authenticated;

-- No client write path on either table. Pairing creation reads the player's live theta out of
-- user_ratings, and a client that can write origin_theta can claim its avatar started expert.
grant select on public.user_avatars to authenticated;

grant all on public.avatars      to service_role;
grant all on public.user_avatars to service_role;

-- ---------------------------------------------------------------------------
-- Assertion. The budget lives in three places (this file, the seed, and
-- TRAIT_POINT_BUDGET in src/lib/avatars/traits.ts) because Postgres cannot call TypeScript.
-- Pin the SQL side to a literal here so a change to avatars_trait_budget that forgets the
-- other two fails at migration time rather than at prompt-construction time.
-- ---------------------------------------------------------------------------
do $$
declare
  probe_ok boolean;
begin
  -- 18 must pass and 17 must fail, or the budget is not the number the code thinks it is.
  begin
    insert into public.avatars
      (slug, name, look, hook, warmth, humour, edge, patience, candour, drive,
       voice_guide, reactions, homage_note, sort_order)
    values
      ('budget-probe', 'Budget Probe',
       'A placeholder row that exists for the length of one transaction and is rolled back.',
       'I am here to prove a number, and then I am not here at all.',
       5, 4, 1, 1, 2, 5,
       '{"speaks":["a","b","c"],"never":["a","b","c"]}'::jsonb,
       '{"taught_well":"aaaaaaaaaaaaaaaaaaaaaa","taught_badly":"aaaaaaaaaaaaaaaaaaaaaa","player_slow":"aaaaaaaaaaaaaaaaaaaaaa","player_quit":"aaaaaaaaaaaaaaaaaaaaaa"}'::jsonb,
       'Probe row. Asserts the point budget at migration time.', 32767);
    probe_ok := true;
  exception when check_violation then
    probe_ok := false;
  end;
  if not probe_ok then
    raise exception 'avatars: a 18-point vector was rejected; avatars_trait_budget disagrees with TRAIT_POINT_BUDGET in src/lib/avatars/traits.ts';
  end if;

  delete from public.avatars where slug = 'budget-probe';

  begin
    insert into public.avatars
      (slug, name, look, hook, warmth, humour, edge, patience, candour, drive,
       voice_guide, reactions, homage_note, sort_order)
    values
      ('budget-probe', 'Budget Probe',
       'A placeholder row that exists for the length of one transaction and is rolled back.',
       'I am here to prove a number, and then I am not here at all.',
       5, 4, 1, 1, 2, 4,
       '{"speaks":["a","b","c"],"never":["a","b","c"]}'::jsonb,
       '{"taught_well":"aaaaaaaaaaaaaaaaaaaaaa","taught_badly":"aaaaaaaaaaaaaaaaaaaaaa","player_slow":"aaaaaaaaaaaaaaaaaaaaaa","player_quit":"aaaaaaaaaaaaaaaaaaaaaa"}'::jsonb,
       'Probe row. Asserts the point budget at migration time.', 32767);
    probe_ok := true;
  exception when check_violation then
    probe_ok := false;
  end;
  if probe_ok then
    delete from public.avatars where slug = 'budget-probe';
    raise exception 'avatars: a 17-point vector was accepted; avatars_trait_budget is not binding';
  end if;

  raise notice 'LoxeLingo avatars: schema in place, 18-point budget binding. Cast loads from supabase/seeds/50-avatars.sql';
end $$;
