-- LoxeLingo — bots become CONTENT, and content is per-world.
--
-- -----------------------------------------------------------------------------
-- WHAT WAS WRONG
-- -----------------------------------------------------------------------------
-- `BOT_ROSTER` was a hardcoded array of five bots in src/lib/match/matchmaking.ts, shared by
-- every world. When only Japanese existed that was invisible. With English shipped it is a
-- product bug on the screen: the same five characters — Wren, Orrin, Mira, Kestrel, Sable —
-- seated in a Japanese duel, answering in Japanese, under English names. A world is supposed
-- to feel like its own place, and the cast is most of what does that work.
--
-- Names, avatars and voices are therefore CONTENT: authored per world, versioned with the
-- seed, editable without a deploy. A constant in a TypeScript module is none of those things.
--
-- -----------------------------------------------------------------------------
-- THE MODEL: THE RUNGS ARE ARCHETYPES, THE CAST IS LOCAL
-- -----------------------------------------------------------------------------
-- Five rungs, five archetypes, one stable machine-readable id per rung SHARED ACROSS WORLDS:
--
--   earnest_beginner   theta 0.10   says the thing and stops
--   casual_peer        theta 0.55   fluent-sounding, misses the required form
--   precise_literary   theta 1.10   correct, not idiomatic
--   warm_guide         theta 1.70   idiomatic, gently corrective
--   master             theta 2.30   does the pragmatic work, cultural depth
--
-- (COMMENT CORRECTED. This block, and the paragraph below it, listed the rungs by their
-- display ratings on the scale of the day: 940 / 1120 / 1340 / 1580 / 1820. The `values` list
-- further down still inserts those numbers because it has already run and an applied migration
-- is history, but they are no longer what the rows hold:
-- `20260815131207_bot_ratings_10k.sql` restated them as 1125 / 1688 / 2375 / 3125 / 3875 after
-- `20260815094459_rating_scale_10k.sql` moved the display scale underneath them. The thetas
-- above never moved, which is why they are what this comment names now.)
--
-- The ARCHETYPE is what makes the ladder legible across worlds: `archetype` is what code
-- reasons about ("the warm_guide rung"), so a feature written against the Japanese cast works
-- unchanged against the English one and against a Korean cast that does not exist yet. The
-- SKILL PROFILE the rubric judges is a property of the rung. The NAME and the VOICE are
-- properties of the world. Hence `archetype` and `display_rating` are shared by rung, while
-- `name` / `self_description` / `avatar_path` are local.
--
-- `display_rating` is a DISPLAY number (`DISPLAY_INIT + DISPLAY_SCALE * theta` in elo.ts), not
-- a logit, because a designer places a bot in a band and `nearestBotPerformance` compares
-- display ratings so the authored number means what was typed. It is shared by rung because a
-- rung IS a difficulty: precise_literary must be the same climb in every world or the ladder
-- stops being one ladder.
--
-- -----------------------------------------------------------------------------
-- SELF_DESCRIPTION: INFERABLE, NEVER DECLARATIVE
-- -----------------------------------------------------------------------------
-- One first-person line, shipped now so the UI layer that will render a bot card needs no
-- second migration. The hard rule: it SHOWS the archetype and never NAMES it. "I'm Satoru, an
-- earnest beginner" tells the player how to feel about an opponent they have not met; "I write
-- the sentence, read it twice, and send it before I lose my nerve" lets them work it out from
-- an answer they are about to read. The archetype id is for code. The line is for a person.
-- A check constraint keeps the label words out of the line, because this is exactly the field
-- a future content edit will casually break.
--
-- `avatar_path` is nullable and unset: a storage object path for the portrait, added when the
-- art exists. Nullable-and-planned beats a migration per asset.
--
-- -----------------------------------------------------------------------------
-- EXPOSURE
-- -----------------------------------------------------------------------------
-- Unlike `items`, this table holds no answers — a bot's name, rating and one-liner are all
-- things the UI must render on the verdict screen and (soon) a roster screen. So it is
-- readable by every signed-in user, exactly like `worlds` and `ladders`, with the explicit
-- grant the 2026-04-28 Data API change requires (tables are no longer auto-exposed).
--
-- NOT included: a FK from `match_participants.bot_slug` to `bots.slug`. It is tempting and it
-- is a coordination hazard — the bot performance pools are seed files, one per world and (soon)
-- per ladder, and a FK would make the order of unrelated seeds load-bearing while making a
-- retired bot un-deletable without rewriting history. The invariant is enforced where it
-- matters instead: `botDisplayRating` throws on a slug that is not in its world's roster, and
-- each pool seed asserts its own slugs against this table.
--
-- Re-runnable: `on conflict (slug) do update`. Every value is authored; nothing derives from
-- `now()` except `created_at` on first insert.

create table public.bots (
  -- Globally unique, not per-world unique: `match_participants.bot_slug` is a bare text column
  -- with no world beside it, and it is the value that flows into the pool, the API and the UI.
  -- One global namespace means a slug always resolves to exactly one character; a collision
  -- with a future world's cast fails loudly here, at migration time, instead of quietly
  -- seating the wrong bot.
  slug             text        primary key,
  world_slug       text        not null references public.worlds (slug) on delete restrict,

  -- The rung. Machine-readable, shared across worlds, closed set: code reasons by rung.
  archetype        text        not null check (archetype in (
                     'earnest_beginner', 'casual_peer', 'precise_literary', 'warm_guide', 'master'
                   )),

  name             text        not null check (char_length(name) between 1 and 60),
  -- DISPLAY scale (a brand-new account sits at DISPLAY_INIT). Bounded so a typo that would park
  -- a bot outside every band is rejected rather than seated.
  -- (COMMENT CORRECTED: 400-3000 was sized for the old scale's theta -1.25 to 5.25, and
  -- `20260815131207_bot_ratings_10k.sql` replaced it with the 0-10,000 display range itself.
  -- The bound below is what ran, not what the table carries today.)
  display_rating   integer     not null check (display_rating between 400 and 3000),

  -- First person, ONE line, shows the archetype without naming it. See the header.
  self_description text        not null,
  -- Storage object path for the portrait. Null until the art exists.
  avatar_path      text,

  sort_order       smallint    not null,
  created_at       timestamptz not null default now(),

  constraint bots_slug_format check (slug ~ '^[a-z0-9-]+$'),
  -- One bot per rung per world. This is what makes "the warm_guide of this world" a well-defined
  -- lookup, and what stops a world from shipping four rungs or two precise_literarys.
  constraint bots_one_per_rung_per_world unique (world_slug, archetype),
  constraint bots_sort_order_unique_per_world unique (world_slug, sort_order),
  -- A single line. A paragraph here is a paragraph in a card with room for one line.
  constraint bots_self_description_one_line check (
    position(E'\n' in self_description) = 0
    and position(E'\r' in self_description) = 0
    and char_length(self_description) between 20 and 140
  ),
  -- The user infers, never reads a label. The archetype words are banned from the voice line.
  -- Word-bounded (\m..\M) so a legitimate word that merely contains one of them survives.
  constraint bots_self_description_states_no_archetype check (
    self_description !~* '\m(beginner|beginners|casual|peer|peers|precise|precisely|literary|guide|master|archetype|novice|expert|advanced|intermediate|fluent|native)\M'
  )
);

comment on table public.bots is
  'The per-world bot cast. Five rungs per world; `archetype` is the rung and is shared across worlds, `name`/`self_description`/`avatar_path` are local to the world. Replaces BOT_ROSTER in src/lib/match/matchmaking.ts.';
comment on column public.bots.slug is
  'Globally unique. This is the value stored in match_participants.bot_slug, which carries no world of its own.';
-- (Both column comments below name rungs by their old display ratings and are RESTATED by
-- `20260815131207_bot_ratings_10k.sql`. They are executable statements that have already run,
-- so they stay as they were written; the later migration is where the current text lives.)
comment on column public.bots.archetype is
  'The rung, machine-readable and shared across worlds, so code can say "the 1580" without knowing the cast.';
comment on column public.bots.display_rating is
  'The 900-2100 DISPLAY scale, not logits: nearestBotPerformance compares display ratings, so the authored number means what a designer typed.';
comment on column public.bots.self_description is
  'One first-person line that SHOWS the archetype and never names it. The player infers an opponent; they are never handed a label for one.';
comment on column public.bots.avatar_path is
  'Storage object path for the portrait. Nullable and currently unset — shipped now so the roster UI needs no second migration.';
comment on column public.bots.sort_order is
  'Roster display order, weakest rung first. Distinct from display_rating so a world could reorder its cast without restating the ladder.';

create index bots_world_rating_idx on public.bots (world_slug, display_rating);

-- ---------------------------------------------------------------------------
-- The cast.
--
-- Japanese: given names only, no honorifics — an honorific is a relationship, not a name, and
-- baking one in fixes a relationship the player has not had yet. English: the existing launch
-- roster, unchanged in name and rating, because 75 authored English performances in
-- supabase/seeds/30-bot-performances-en.sql already reference these slugs.
--
-- No line references any anime, drama, film or real person: this cast has to carry a product
-- for years without borrowing someone else's character.
-- ---------------------------------------------------------------------------
insert into public.bots
  (slug, world_slug, archetype, name, display_rating, self_description, avatar_path, sort_order)
values
  -- --- ja -------------------------------------------------------------------
  ('satoru',  'ja', 'earnest_beginner', 'Satoru',   940,
   'I write the sentence, read it twice, and send it before I lose my nerve.', null, 1),
  ('rin',     'ja', 'casual_peer',      'Rin',     1120,
   'I answer the way I text my friends, and look up the grammar note afterwards.', null, 2),
  ('haruki',  'ja', 'precise_literary', 'Haruki',  1340,
   'I would rather be exactly right than sound like anyone in particular.', null, 3),
  ('kaori',   'ja', 'warm_guide',       'Kaori',   1580,
   'I answer first, then tell you the one word I would have changed in yours.', null, 4),
  ('tetsuya', 'ja', 'master',           'Tetsuya', 1820,
   'Before I write anything I decide who is reading it and what they need to hear.', null, 5),

  -- --- en -------------------------------------------------------------------
  ('wren-the-copyist',         'en', 'earnest_beginner', 'Wren, the Copyist',          940,
   'I set the sentence down plainly, and I stop once the thing is said.', null, 1),
  ('orrin-the-ferryman',       'en', 'casual_peer',      'Orrin, the Ferryman',       1120,
   'I will get you across. Do not ask which words I left on the bank.', null, 2),
  ('mira-the-cartographer',    'en', 'precise_literary', 'Mira, the Cartographer',    1340,
   'Every line I draw is accurate. None of them are roads anyone actually walks.', null, 3),
  ('kestrel-the-archivist',    'en', 'warm_guide',       'Kestrel, the Archivist',    1580,
   'I keep every sentence that ever worked, and I will lend you the one that fits.', null, 4),
  ('sable-the-lantern-keeper', 'en', 'master',           'Sable, the Lantern Keeper', 1820,
   'I read the room before I light anything, then say only what it needs.', null, 5)
on conflict (slug) do update set
  world_slug       = excluded.world_slug,
  archetype        = excluded.archetype,
  name             = excluded.name,
  display_rating   = excluded.display_rating,
  self_description = excluded.self_description,
  avatar_path      = excluded.avatar_path,
  sort_order       = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- RLS + grants. Same posture as worlds/ladders: config the client renders.
-- `to authenticated` covers guests — anonymous sign-in issues an `authenticated` JWT with
-- is_anonymous = true. (Never `auth.role() = 'authenticated'` in a predicate.)
-- ---------------------------------------------------------------------------
alter table public.bots enable row level security;

create policy "bots: readable by signed-in users"
  on public.bots for select to authenticated using (true);

grant select on public.bots to authenticated;
grant all    on public.bots to service_role;

-- ---------------------------------------------------------------------------
-- Assertions. A world with four rungs is a world where a learner whose band caps out meets
-- `no_opponent_available` on a screen that already promised them a match. Fail here instead.
-- ---------------------------------------------------------------------------
do $$
declare
  n_worlds  integer;
  n_thin    integer;
  n_ratings integer;
  bad       text;
begin
  select count(distinct world_slug) into n_worlds from public.bots;

  select count(*) into n_thin
  from (
    select world_slug
    from public.bots
    group by world_slug
    having count(*) <> 5 or count(distinct archetype) <> 5
  ) t;
  if n_thin > 0 then
    raise exception 'bots: % world(s) do not carry all five rungs', n_thin;
  end if;

  -- A rung IS a difficulty: the same archetype must mean the same climb in every world, or
  -- "the precise_literary" stops naming one thing.
  select count(*) into n_ratings
  from (
    select archetype from public.bots group by archetype having count(distinct display_rating) > 1
  ) t;
  if n_ratings > 0 then
    raise exception 'bots: % archetype(s) carry different display_ratings across worlds', n_ratings;
  end if;

  -- Every playable world needs a cast, or its first match cannot be seated.
  select string_agg(w.slug, ', ') into bad
  from public.worlds w
  where w.is_launched
    and not exists (select 1 from public.bots b where b.world_slug = w.slug);
  if bad is not null then
    raise exception 'bots: launched world(s) with no cast: %', bad;
  end if;

  raise notice 'LoxeLingo bots: % rows across % world(s)',
    (select count(*) from public.bots), n_worlds;
end $$;
