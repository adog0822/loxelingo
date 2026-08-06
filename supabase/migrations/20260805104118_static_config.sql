-- LoxeLingo — static / config tables.
--
-- These tables are content, not user data. They are seeded by migration and written
-- only by the service role (or by a later content-pipeline migration).
--
-- Exposure policy (deliberate, see supabase/README.md):
--   * worlds, ladders, seasons, concepts  -> readable by every signed-in user (including guests).
--     The client needs these to render the orrery, the ladder HUD and the constellation.
--   * items, item_concepts                -> NOT readable by clients. `items.answer` holds answers;
--     exposing the row exposes the answer. Prompts are served by server code (service role)
--     which projects away the answer.
--
-- As of the 2026-04-28 Supabase change (enforced 2026-10-30) tables are not auto-exposed to the
-- Data API, so every table below carries explicit grants next to its RLS policies.

grant usage on schema public to anon, authenticated, service_role;

-- Shared trigger helper. `security invoker` (the default) is correct here: it only touches NEW.
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- worlds — the six launch languages, each rendered as a place.
-- Hues and the four palette steps are transcribed from docs/design/design-system.md §2.5.
-- ---------------------------------------------------------------------------
create table public.worlds (
  slug            text primary key,                    -- BCP-47: 'ja','ko','zh-Hans','es','fr','de'
  name_en         text        not null unique,
  native_name     text        not null,                -- endonym in its own script, e.g. 日本語
  concept         text        not null,                -- 'The Cloud Sea', etc.
  hue             smallint    not null check (hue between 0 and 360),
  atmos_hex       text        not null check (atmos_hex ~ '^#[0-9A-F]{6}$'),
  mark_hex        text        not null check (mark_hex  ~ '^#[0-9A-F]{6}$'),
  deep_hex        text        not null check (deep_hex  ~ '^#[0-9A-F]{6}$'),
  dusk_hex        text        not null check (dusk_hex  ~ '^#[0-9A-F]{6}$'),
  display_order   smallint    not null unique,
  -- v1 ships CJK first; es/fr/de are seeded but not launched (plan doc "The v1 line").
  is_launched     boolean     not null default false,
  created_at      timestamptz not null default now()
);

comment on table public.worlds is
  'The six languages-as-places. Hue encodes place, never data, state, correctness or rank.';
comment on column public.worlds.atmos_hex is
  'Large glow / display type on Night. Use for any text below 18px (design-system 2.5 rule 3).';
comment on column public.worlds.mark_hex is 'Chip, rim, 2px stroke. 4.3-5.7 contrast on Night.';

insert into public.worlds
  (slug, name_en, native_name, concept, hue, atmos_hex, mark_hex, deep_hex, dusk_hex, display_order, is_launched)
values
  ('ja',      'Japanese', '日本語',   'The Cloud Sea. A vast pale moon low over a sea of cloud, cedar ridges below.',    294, '#D3C7FF', '#866EC8', '#321E5C', '#5D4796', 1, true),
  ('ko',      'Korean',   '한국어',   'The Celadon Coast. Jade sea-light, black basalt, an aurora ribbon.',              166, '#62D7AB', '#00A36F', '#003B23', '#007044', 2, true),
  ('zh-Hans', 'Mandarin', '中文',     'The Ink Valley. A ringed pale giant over karst spires and a glowing river.',      196, '#56DBDC', '#009CA0', '#003E43', '#006F74', 3, true),
  ('es',      'Spanish',  'Español',  'The Long Sun. An enormous low sun, dry gold air, terraced plain.',                 72, '#FFBB5F', '#C16600', '#531A00', '#8F3F00', 4, false),
  ('fr',      'French',   'Français', 'The Salt Flats. A small brilliant sun with a halo over still water.',             322, '#E7A5F1', '#AF56BD', '#4A0953', '#802E8D', 5, false),
  ('de',      'German',   'Deutsch',  'The Standing Stones. A dark world with a bright edge-on ring, granite and snow.', 244, '#67B2EE', '#0087DA', '#002E69', '#005CA7', 6, false);

-- ---------------------------------------------------------------------------
-- ladders — the three independently rated skills.
-- ---------------------------------------------------------------------------
create table public.ladders (
  slug           text primary key,                     -- 'duel' | 'recall' | 'forge'
  name           text        not null unique,
  layer          text        not null,                 -- learning-engine layer this ladder serves
  description    text        not null,
  is_rated       boolean     not null default true,
  display_order  smallint    not null unique,
  created_at     timestamptz not null default now(),
  constraint ladders_slug_known check (slug in ('duel', 'recall', 'forge'))
);

comment on table public.ladders is
  'Ratings are independent per world per ladder. Tilting in one ladder must not touch another.';

insert into public.ladders (slug, name, layer, description, display_order) values
  ('duel',   'DUEL',   'situation', 'Construction under constraint. Text production judged comparatively.', 1),
  ('recall', 'RECALL', 'immersion', 'Comprehension race. Playback only, never recording.',                  2),
  ('forge',  'FORGE',  'forge',     'Morphology and script under time pressure.',                           3);

-- ---------------------------------------------------------------------------
-- seasons — themed, time-boxed. Cosmetics never return; peak rating is recorded permanently.
-- ---------------------------------------------------------------------------
create table public.seasons (
  id            integer generated always as identity primary key,
  slug          text        not null unique,
  name          text        not null,
  theme         text,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  created_at    timestamptz not null default now(),
  constraint seasons_window_ordered check (ends_at > starts_at)
);

comment on table public.seasons is
  'Honest scarcity: real end dates, cosmetics never re-issued. Current season = now() within window.';

create index seasons_window_idx on public.seasons (starts_at, ends_at);

insert into public.seasons (slug, name, theme, starts_at, ends_at) values
  ('s1', 'Season 1', 'First Light', '2026-08-05T00:00:00Z', '2026-11-04T00:00:00Z');

-- ---------------------------------------------------------------------------
-- concepts — the atoms of mastery. One row per kanji, lexeme, grammar point, phoneme.
-- Forms a forest per world (parent_id) which is both the mastery tree and the constellation.
-- ---------------------------------------------------------------------------
create table public.concepts (
  id             bigint generated always as identity primary key,
  world_slug     text        not null references public.worlds (slug) on delete restrict,
  slug           text        not null,
  kind           text        not null check (kind in ('script', 'lexeme', 'grammar', 'phonology', 'pragmatics')),
  display_name   text        not null,
  native_form    text,                                 -- e.g. the kanji itself
  description    text,
  parent_id      bigint      references public.concepts (id) on delete set null,
  tier           text,                                 -- JLPT / HSK / TOPIK / CEFR tier label
  tier_rank      smallint,                             -- ordinal within the tier scheme, for sequencing
  frequency_rank integer,                              -- corpus frequency; feeds cold-start difficulty
  is_active      boolean     not null default true,
  created_at     timestamptz not null default now(),
  constraint concepts_slug_unique_per_world unique (world_slug, slug),
  constraint concepts_not_own_parent check (parent_id is distinct from id)
);

comment on table public.concepts is
  'One star in the constellation. user_concept_mastery joins users to this table and is the keystone.';

-- Partial on is_active because the RLS SELECT policy filters on it (index every policy column).
create index concepts_world_kind_idx on public.concepts (world_slug, kind) where is_active;
create index concepts_parent_idx on public.concepts (parent_id);

-- ---------------------------------------------------------------------------
-- items — a single presentable / gradeable unit of content.
-- `answer` is a secret: this table is never exposed to the Data API.
-- ---------------------------------------------------------------------------
create table public.items (
  id              bigint generated always as identity primary key,
  world_slug      text        not null references public.worlds (slug) on delete restrict,
  ladder_slug     text        references public.ladders (slug) on delete restrict,  -- null = solo only (SPARK / Trials)
  kind            text        not null,                -- 'kanji_reading' | 'conjugation' | 'cloze' | 'brief' | ...
  prompt          jsonb       not null,
  answer          jsonb,                               -- SECRET. Null for open-ended DUEL briefs.
  rubric_version  text,                                -- for open-ended items: which rubric grades this
  constraint_text text,                                -- the one permitted eyebrow: the match constraint line
  media_path      text,                                -- storage object path for RECALL audio / clips
  time_limit_ms   integer     check (time_limit_ms is null or time_limit_ms > 0),
  -- Cold-start difficulty predicted from content features (EMNLP 2021 approach). The *live*
  -- difficulty estimate lives in item_stats and is calibrated from holdout presentations only.
  cold_start_beta real,
  source          text,
  license         text,
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.items is
  'Content. Not exposed to the Data API because `answer` would leak. Server projects prompts.';
comment on column public.items.cold_start_beta is
  'Difficulty prior from content features. Seeds item_stats.beta, with a small pseudo-count in beta_n.';

create index items_world_ladder_idx on public.items (world_slug, ladder_slug) where is_active;
create index items_kind_idx on public.items (kind);

create trigger items_set_updated_at
  before update on public.items
  for each row execute function public.set_updated_at();

-- item -> concept mapping. Every item must map to >= 1 concept (asserted by the content pipeline).
create table public.item_concepts (
  item_id     bigint not null references public.items (id) on delete cascade,
  concept_id  bigint not null references public.concepts (id) on delete cascade,
  weight      real   not null default 1.0 check (weight > 0),
  primary key (item_id, concept_id)
);

create index item_concepts_concept_idx on public.item_concepts (concept_id);

-- ---------------------------------------------------------------------------
-- Altitude bands (design-system 5.2). Immutable helper so band names live in one place.
-- ---------------------------------------------------------------------------
create function public.altitude_band(rating double precision)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when rating is null then null
    when rating < 900   then 'Valley Floor'
    when rating < 1100  then 'Treeline'
    when rating < 1300  then 'Ridge'
    when rating < 1550  then 'Above the Deck'
    when rating < 1800  then 'The Long Light'
    when rating < 2100  then 'Exosphere'
    else                     'Meridian'
  end;
$$;

comment on function public.altitude_band(double precision) is
  'Band boundaries 900/1100/1300/1550/1800/2100 per design-system 5.2. Re-derive once a real rating distribution exists.';

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.worlds        enable row level security;
alter table public.ladders       enable row level security;
alter table public.seasons       enable row level security;
alter table public.concepts      enable row level security;
alter table public.items         enable row level security;
alter table public.item_concepts enable row level security;

-- Readable config. `to authenticated` covers guests: anonymous sign-in issues a JWT whose role is
-- `authenticated` with is_anonymous = true. (Never `auth.role() = 'authenticated'` in a predicate.)
create policy "worlds: readable by signed-in users"
  on public.worlds for select to authenticated using (true);

create policy "ladders: readable by signed-in users"
  on public.ladders for select to authenticated using (true);

create policy "seasons: readable by signed-in users"
  on public.seasons for select to authenticated using (true);

create policy "concepts: active concepts readable by signed-in users"
  on public.concepts for select to authenticated using (is_active);

-- items / item_concepts: RLS enabled with no policy = deny-all for anon and authenticated.
-- service_role bypasses RLS, so server code still reads them.

grant select on public.worlds   to authenticated;
grant select on public.ladders  to authenticated;
grant select on public.seasons  to authenticated;
grant select on public.concepts to authenticated;

grant all on public.worlds        to service_role;
grant all on public.ladders       to service_role;
grant all on public.seasons       to service_role;
grant all on public.concepts      to service_role;
grant all on public.items         to service_role;
grant all on public.item_concepts to service_role;
-- Identity-column sequences need no explicit grant: an identity default is applied by the system,
-- not by the inserting role. bigserial columns DO need one — see the learning-engine migration.

grant execute on function public.altitude_band(double precision) to authenticated, service_role;
