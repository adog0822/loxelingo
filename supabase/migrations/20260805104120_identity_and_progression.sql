-- LoxeLingo — identity and progression.
--
-- Guest-first: the first match is played with no account. Supabase anonymous sign-in issues a
-- normal JWT whose role is `authenticated` and whose `is_anonymous` claim is true. Conversion to a
-- permanent account keeps the same auth.users.id, so every row below survives it untouched.
--
-- Two consequences that shape every policy in this file:
--   1. `auth.role() = 'authenticated'` is never used — it is true for guests too. Ownership is
--      always `user_id = (select auth.uid())`, wrapped in a subselect so the planner evaluates it
--      once per statement instead of once per row.
--   2. Permanent-user-only features are gated on the JWT `is_anonymous` claim, not on
--      profiles.is_guest (a mirror, not the authority) and never on user_metadata (user-editable).

-- ---------------------------------------------------------------------------
-- profiles — 1:1 with auth.users.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  handle             text unique,                     -- null until claimed; permanent accounts only
  display_name       text,
  avatar_url         text,
  primary_world_slug text references public.worlds (slug) on delete set null,
  -- delta_t for FSRS is a calendar-day difference under these two values (03-learning-libs 4.3).
  timezone           text        not null default 'UTC',
  day_cutoff_hour    smallint    not null default 4 check (day_cutoff_hour between 0 and 23),
  locale             text        not null default 'en-US',
  is_guest           boolean     not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  last_active_at     timestamptz not null default now(),
  constraint profiles_handle_format check (handle is null or handle ~ '^[a-z0-9_]{3,20}$')
);

comment on table public.profiles is
  'One row per auth.users row, created by the on_auth_user_created trigger. is_guest mirrors auth.users.is_anonymous; the JWT claim is the authority for gating.';
comment on column public.profiles.timezone is
  'IANA zone. Copied into review_log at write time because users travel and the cutoff is retroactive.';
comment on column public.profiles.day_cutoff_hour is
  'Anki''s "next day starts at". Default 4. Part of the delta_t definition, so it must be stored.';
comment on column public.profiles.handle is
  'Lowercase, 3-20 chars. Guests cannot set one: the UPDATE policy only accepts handle = null from an anonymous JWT.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profile creation on signup. security definer + `set search_path = ''` so the function cannot be
-- hijacked by search-path shadowing and can write through profiles' RLS.
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, is_guest, display_name)
  values (
    new.id,
    coalesce(new.is_anonymous, false),
    -- app_metadata only. Never raw_user_meta_data: the user can edit it.
    nullif(new.raw_app_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function public.handle_new_user() is
  'AFTER INSERT on auth.users. security definer + empty search_path per Supabase guidance.';

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Anonymous -> permanent conversion flips auth.users.is_anonymous. Mirror it so server code can
-- read guest status without decoding a JWT. The claim remains the authority for policies.
create function public.handle_user_converted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(old.is_anonymous, false) is distinct from coalesce(new.is_anonymous, false) then
    update public.profiles
       set is_guest = coalesce(new.is_anonymous, false)
     where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_converted
  after update of is_anonymous on auth.users
  for each row execute function public.handle_user_converted();

-- ---------------------------------------------------------------------------
-- user_worlds — enrollment. A user may enter several worlds; collection is the point.
-- ---------------------------------------------------------------------------
create table public.user_worlds (
  user_id        uuid        not null references auth.users (id) on delete cascade,
  world_slug     text        not null references public.worlds (slug) on delete restrict,
  joined_at      timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  primary key (user_id, world_slug)
);

-- ---------------------------------------------------------------------------
-- user_ratings — user x world x ladder. Dynamic-K Elo on the LOGIT scale (02-ml-and-naming,
-- 03-learning-libs 7.3); the display number is derived, never stored twice by hand.
--
-- (COMMENT CORRECTED. This header said "the 900-2100 display number", and the two generated
-- columns below really did run as `900 + 400 * theta`. Both columns were dropped and redefined
-- as `1000 + 1250 * theta` by `20260815094459_rating_scale_10k.sql`, so the formulas in this
-- file are history rather than the current schema. The prose here now names the scale by its
-- constants instead of by two numbers, which is the form that survives the next rescale.)
-- ---------------------------------------------------------------------------
create table public.user_ratings (
  user_id         uuid     not null references auth.users (id) on delete cascade,
  world_slug      text     not null references public.worlds (slug) on delete restrict,
  ladder_slug     text     not null references public.ladders (slug) on delete restrict,

  theta           double precision not null default 0,         -- ability, logit scale
  -- DISPLAY SCALE: must stay identical to DISPLAY_INIT / DISPLAY_SCALE in
  -- src/lib/engine/elo.ts. Postgres cannot call TypeScript, so the formula is
  -- written twice; src/lib/engine/display-scale.test.ts pins the constants so a
  -- one-sided edit fails the suite. DISPLAY_INIT is the floor of the Treeline
  -- altitude band: a fresh account must start at the bottom of the visible climb.
  -- (SUPERSEDED: both generated columns were redefined as `1000 + 1250 * theta`
  -- by `20260815094459_rating_scale_10k.sql`. Read that file for what the table
  -- carries; the expressions here are what ran on this date.)
  rating          double precision generated always as (900 + 400 * theta) stored,
  games_played    integer  not null default 0 check (games_played >= 0),
  -- uncertainty = the dynamic-K step size K(n) = a / (1 + b*n), with a = 1.0, b = 0.05.
  uncertainty     real     not null default 1.0 check (uncertainty > 0),

  peak_theta      double precision not null default 0,
  peak_rating     double precision generated always as (900 + 400 * peak_theta) stored,
  peak_season_id  integer  references public.seasons (id) on delete set null,
  peak_reached_at timestamptz,

  last_played_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, world_slug, ladder_slug)
);

comment on table public.user_ratings is
  'Independent per world per ladder — the retention mechanism, not a feature. Written by the engine (service role) only: there is deliberately no client INSERT/UPDATE policy.';
-- (RESTATED by `20260815131207_bot_ratings_10k.sql` to name the constants rather than one
-- scale's arithmetic. The statement below has already run, so it stays as it was written.)
comment on column public.user_ratings.theta is
  'Logit-scale ability. rating = 900 + 400*theta is a presentation convention; bands compare against rating.';
comment on column public.user_ratings.uncertainty is
  'Current dynamic-K step size. Persisting it (with games_played) is what lets a lapsed player be re-measured instead of punished.';
comment on column public.user_ratings.peak_theta is
  'Peak altitude is permanent. Never lowered — you can be below your own line, you cannot lose the line.';

create trigger user_ratings_set_updated_at
  before update on public.user_ratings
  for each row execute function public.set_updated_at();

create index user_ratings_world_ladder_rating_idx
  on public.user_ratings (world_slug, ladder_slug, rating desc);

-- Peak is a high-water mark. Enforced in the schema so no code path can lower it.
create function public.enforce_peak_monotonic()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.peak_theta < old.peak_theta then
    raise exception 'peak_theta is a permanent high-water mark and cannot decrease (% -> %)',
      old.peak_theta, new.peak_theta;
  end if;
  if new.theta > new.peak_theta then
    new.peak_theta := new.theta;
    new.peak_reached_at := now();
  end if;
  return new;
end;
$$;

create trigger user_ratings_peak_monotonic
  before update on public.user_ratings
  for each row execute function public.enforce_peak_monotonic();

-- ---------------------------------------------------------------------------
-- user_concept_mastery — THE KEYSTONE TABLE.
-- Drives SPARK sequencing, Trials selection, constellation rendering, and the companion
-- capability ceiling.
-- ---------------------------------------------------------------------------
create table public.user_concept_mastery (
  user_id        uuid   not null references auth.users (id) on delete cascade,
  concept_id     bigint not null references public.concepts (id) on delete cascade,

  mastery        real   not null default 0 check (mastery >= 0 and mastery <= 1),  -- P(knows)
  mastery_logit  double precision,                    -- the tracer's native scale, for debugging
  observations   integer not null default 0 check (observations >= 0),
  correct_count  integer not null default 0 check (correct_count >= 0),

  first_seen_at  timestamptz not null default now(),
  last_review_at timestamptz,
  updated_at     timestamptz not null default now(),
  primary key (user_id, concept_id),
  constraint user_concept_mastery_counts_sane check (correct_count <= observations)
);

comment on table public.user_concept_mastery is
  'Per-concept mastery probability from the knowledge tracer. The companion capability gate reads this and is hard-capped by it — a companion may never produce language above proven mastery.';
comment on column public.user_concept_mastery.mastery is
  'Probability in [0,1]. The companion gate compares this against a configured threshold; no threshold is baked into the schema, so it can be tuned without a migration.';

create trigger user_concept_mastery_set_updated_at
  before update on public.user_concept_mastery
  for each row execute function public.set_updated_at();

create index user_concept_mastery_concept_idx on public.user_concept_mastery (concept_id);

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.user_worlds          enable row level security;
alter table public.user_ratings         enable row level security;
alter table public.user_concept_mastery enable row level security;

-- profiles: owner-only through the Data API. Public surfaces (ladder, results feed, rivals) are
-- rendered by server code, which projects exactly the public columns. See supabase/README.md.
create policy "profiles: select own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

-- UPDATE needs BOTH using and with check, or a user could reassign the row to someone else.
-- UPDATE also requires a SELECT policy to exist, or updates silently affect 0 rows — it exists above.
-- The handle clause is the permanent-user gate: an anonymous JWT may only write handle = null.
create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and (
      handle is null
      or (select (auth.jwt() ->> 'is_anonymous')::boolean) is false
    )
  );

-- No INSERT policy: rows are created by on_auth_user_created.
-- No DELETE policy: account deletion goes through auth.users and cascades.

create policy "user_worlds: select own"
  on public.user_worlds for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user_worlds: insert own"
  on public.user_worlds for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "user_worlds: update own"
  on public.user_worlds for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "user_ratings: select own"
  on public.user_ratings for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user_concept_mastery: select own"
  on public.user_concept_mastery for select to authenticated
  using (user_id = (select auth.uid()));

-- Column-level grants do the work a row policy cannot: they stop a user rewriting id, is_guest or
-- created_at on their own row.
grant select on public.profiles to authenticated;
grant update (handle, display_name, avatar_url, primary_world_slug, timezone, day_cutoff_hour, locale, last_active_at)
  on public.profiles to authenticated;

grant select on public.user_worlds to authenticated;
grant insert (user_id, world_slug) on public.user_worlds to authenticated;
grant update (last_active_at) on public.user_worlds to authenticated;
grant select on public.user_ratings to authenticated;          -- engine writes; no client write path
grant select on public.user_concept_mastery to authenticated;  -- tracer writes; no client write path

grant all on public.profiles             to service_role;
grant all on public.user_worlds          to service_role;
grant all on public.user_ratings         to service_role;
grant all on public.user_concept_mastery to service_role;
