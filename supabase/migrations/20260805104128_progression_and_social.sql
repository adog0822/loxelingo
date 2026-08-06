-- LoxeLingo — progression and social: The Daily, promotion-only leagues, rivalries,
-- and the mastery-gated companion with its draft-and-approve audit log.
--
-- The two hard rules encoded here:
--   1. LEAGUES ARE PROMOTION-ONLY. There is no demotion column, no relegation table, no
--      `demoted_at`, and points cannot decrease. Both are enforced by triggers, not by convention,
--      so a future code path physically cannot demote anyone.
--   2. THE COMPANION CANNOT SEND. companion_actions is append-only, and a 'sent' row must descend
--      from an 'approved' row approved by the acting user. There is no autonomous send path.

-- ---------------------------------------------------------------------------
-- daily_puzzles — one identical global drill per world, 48-hour window.
-- ---------------------------------------------------------------------------
create table public.daily_puzzles (
  id           uuid primary key default gen_random_uuid(),
  world_slug   text not null references public.worlds (slug) on delete restrict,
  puzzle_date  date not null,
  opens_at     timestamptz not null,
  closes_at    timestamptz not null,
  created_at   timestamptz not null default now(),
  constraint daily_puzzles_one_per_world_per_day unique (world_slug, puzzle_date),
  constraint daily_puzzles_window_ordered check (closes_at > opens_at)
);

comment on table public.daily_puzzles is
  'The retention floor and the main organic growth lever. Unrated: all gain, no loss.';

-- Policy-referenced: the SELECT policy hides unopened puzzles.
create index daily_puzzles_opens_idx on public.daily_puzzles (opens_at);
create index daily_puzzles_world_date_idx on public.daily_puzzles (world_slug, puzzle_date desc);

-- The item set. Never exposed to clients: it is the spoiler.
create table public.daily_puzzle_items (
  puzzle_id  uuid   not null references public.daily_puzzles (id) on delete cascade,
  ordinal    smallint not null check (ordinal > 0),    -- not `position`: that is a SQL function name
  item_id    bigint not null references public.items (id) on delete restrict,
  primary key (puzzle_id, ordinal),
  constraint daily_puzzle_items_no_repeats unique (puzzle_id, item_id)
);

-- ---------------------------------------------------------------------------
-- daily_results — one attempt per user per puzzle, plus the spoiler-free share grid.
-- ---------------------------------------------------------------------------
create table public.daily_results (
  id            uuid primary key default gen_random_uuid(),
  puzzle_id     uuid not null references public.daily_puzzles (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,

  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  elapsed_ms    integer check (elapsed_ms is null or elapsed_ms >= 0),
  score         integer not null default 0 check (score >= 0),
  correct_count smallint not null default 0 check (correct_count >= 0),
  -- Per-position outcome, ordered. The share grid is rendered from this; it must not contain
  -- item ids, prompts or answers.
  outcomes      jsonb,
  share_grid    text,

  constraint daily_results_one_per_user unique (puzzle_id, user_id)
);

comment on column public.daily_results.share_grid is
  'Pre-rendered spoiler-free grid. Contains no item ids, prompts or answers — verify in tests.';

create index daily_results_user_idx on public.daily_results (user_id);

-- ---------------------------------------------------------------------------
-- leagues / league_divisions / league_members — PROMOTION ONLY.
-- ---------------------------------------------------------------------------
create table public.leagues (
  id            uuid primary key default gen_random_uuid(),
  slug          text     not null unique,
  name          text     not null,
  tier          smallint not null unique check (tier > 0),   -- 1 = entry; higher is better
  promote_top_n smallint not null default 10 check (promote_top_n > 0),
  created_at    timestamptz not null default now()
);

comment on table public.leagues is
  'Tier definitions. Note what is absent: there is no demote_bottom_n. The rating carries all loss aversion; the league carries pure accumulation.';

create table public.league_divisions (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid not null references public.leagues (id) on delete restrict,
  season_id   integer references public.seasons (id) on delete set null,
  world_slug  text references public.worlds (slug) on delete restrict,   -- null = cross-world division
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  capacity    smallint not null default 50 check (capacity > 0),
  created_at  timestamptz not null default now(),
  constraint league_divisions_window_ordered check (ends_at > starts_at)
);

create index league_divisions_league_window_idx on public.league_divisions (league_id, starts_at desc);

create table public.league_members (
  id                     uuid primary key default gen_random_uuid(),
  division_id            uuid not null references public.league_divisions (id) on delete cascade,
  user_id                uuid not null references auth.users (id) on delete cascade,

  points                 integer not null default 0 check (points >= 0),
  rank                   smallint check (rank is null or rank > 0),
  joined_at              timestamptz not null default now(),

  -- The only movement this table can express.
  promoted_at            timestamptz,
  promoted_to_division_id uuid references public.league_divisions (id) on delete set null,

  constraint league_members_one_per_division unique (division_id, user_id)
);

comment on table public.league_members is
  'Promotion-only by construction: the only movement columns are promoted_at / promoted_to_division_id, and points are monotonic. Adding a demotion column would be a schema change, which is the point.';

create index league_members_user_idx on public.league_members (user_id);
create index league_members_division_points_idx on public.league_members (division_id, points desc);

-- Points never decrease. A "reset" is a new division, not a subtraction.
create function public.enforce_league_points_monotonic()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.points < old.points then
    raise exception 'league points are monotonic (% -> %): leagues are promotion-only', old.points, new.points;
  end if;
  return new;
end;
$$;

create trigger league_members_points_monotonic
  before update on public.league_members
  for each row execute function public.enforce_league_points_monotonic();

-- A promotion target must be a strictly higher tier than the division the member is in.
create function public.enforce_promotion_only()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  from_tier smallint;
  to_tier   smallint;
begin
  if new.promoted_to_division_id is null then
    return new;
  end if;

  select l.tier into from_tier
    from public.league_divisions d
    join public.leagues l on l.id = d.league_id
   where d.id = new.division_id;

  select l.tier into to_tier
    from public.league_divisions d
    join public.leagues l on l.id = d.league_id
   where d.id = new.promoted_to_division_id;

  if to_tier is null or from_tier is null then
    raise exception 'promotion target division not found';
  end if;

  if to_tier <= from_tier then
    raise exception 'promotion must move to a strictly higher tier (tier % -> tier %): no demotion path exists',
      from_tier, to_tier;
  end if;

  return new;
end;
$$;

create trigger league_members_promotion_only
  before insert or update of promoted_to_division_id on public.league_members
  for each row execute function public.enforce_promotion_only();

-- ---------------------------------------------------------------------------
-- rivalries — persistent head-to-head, auto-formed out of rematch chains.
-- The pair is stored canonically (user_a < user_b) so there is exactly one row per pair per world.
-- ---------------------------------------------------------------------------
create table public.rivalries (
  id            uuid primary key default gen_random_uuid(),
  world_slug    text not null references public.worlds (slug) on delete restrict,
  user_a        uuid not null references auth.users (id) on delete cascade,
  user_b        uuid not null references auth.users (id) on delete cascade,

  wins_a        integer not null default 0 check (wins_a >= 0),
  wins_b        integer not null default 0 check (wins_b >= 0),
  draws         integer not null default 0 check (draws >= 0),
  matches_played integer generated always as (wins_a + wins_b + draws) stored,

  first_match_at timestamptz not null default now(),
  last_match_at  timestamptz not null default now(),

  constraint rivalries_canonical_order check (user_a < user_b),
  constraint rivalries_one_per_pair_per_world unique (world_slug, user_a, user_b)
);

create index rivalries_user_a_idx on public.rivalries (user_a);
create index rivalries_user_b_idx on public.rivalries (user_b);

-- ---------------------------------------------------------------------------
-- companions — one per world. A capability gate, not fine-tuning.
-- ---------------------------------------------------------------------------
create table public.companions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  world_slug          text not null references public.worlds (slug) on delete restrict,

  name                text,
  species             text,
  level               smallint not null default 1 check (level > 0),
  xp                  integer  not null default 0 check (xp >= 0),
  -- Derived from user_concept_mastery at gate-evaluation time and cached here for display only.
  -- It is NEVER a grant: the gate re-reads mastery on every action.
  unlocked_capabilities text[] not null default '{}',
  capability_synced_at  timestamptz,
  cosmetics           jsonb not null default '{}',
  memory              jsonb not null default '{}',

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint companions_one_per_user_per_world unique (user_id, world_slug)
);

comment on table public.companions is
  'Capability gate, not per-user training. unlocked_capabilities is a display cache; the authoritative ceiling is always a live read of user_concept_mastery.';

create trigger companions_set_updated_at
  before update on public.companions
  for each row execute function public.set_updated_at();

create index companions_user_idx on public.companions (user_id);

-- ---------------------------------------------------------------------------
-- companion_actions — draft-and-approve audit log. Every draft, every approval, every send.
-- Append-only, like review_log.
-- ---------------------------------------------------------------------------
create table public.companion_actions (
  id                uuid primary key default gen_random_uuid(),
  companion_id      uuid not null references public.companions (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  parent_action_id  uuid references public.companion_actions (id) on delete restrict,

  action_kind       text not null check (action_kind in ('drafted', 'edited', 'approved', 'rejected', 'sent')),
  task_kind         text,                              -- 'menu_read' | 'comment_explain' | 'reply_draft' | ...
  content           text,
  target_summary    text,                              -- where a 'sent' action went, in plain language

  -- The gate decision, recorded per action so a violation is auditable after the fact.
  concept_ids       bigint[] not null default '{}',
  min_concept_mastery real,
  gate_passed       boolean not null default false,
  gate_reason       text,

  model             text,
  model_version     text,
  prompt_version    text,

  approved_by       uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),

  constraint companion_actions_approval_is_self check (
    action_kind <> 'approved' or approved_by = user_id
  )
);

comment on table public.companion_actions is
  'Append-only audit log. No UPDATE or DELETE policy. A ''sent'' row must descend from an ''approved'' row (enforced by trigger): the companion composes, the user sends.';
comment on column public.companion_actions.min_concept_mastery is
  'Lowest mastery among concept_ids at action time. The proof that the companion stayed at or below the user''s ceiling.';

create index companion_actions_user_created_idx on public.companion_actions (user_id, created_at desc);
create index companion_actions_companion_idx on public.companion_actions (companion_id);
create index companion_actions_parent_idx on public.companion_actions (parent_action_id);

-- No autonomous send. A send must point at an approval by the same user.
create function public.enforce_companion_send_requires_approval()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_kind        text;
  parent_approved_by uuid;
begin
  if new.action_kind <> 'sent' then
    return new;
  end if;

  if new.parent_action_id is null then
    raise exception 'a sent companion action must reference the approval it descends from';
  end if;

  select a.action_kind, a.approved_by
    into parent_kind, parent_approved_by
    from public.companion_actions a
   where a.id = new.parent_action_id;

  if parent_kind is distinct from 'approved' then
    raise exception 'a sent companion action must descend from an approved action (parent is %)', parent_kind;
  end if;

  if parent_approved_by is distinct from new.user_id then
    raise exception 'the approval must have been given by the sending user';
  end if;

  return new;
end;
$$;

create trigger companion_actions_send_requires_approval
  before insert on public.companion_actions
  for each row execute function public.enforce_companion_send_requires_approval();

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.daily_puzzles      enable row level security;
alter table public.daily_puzzle_items enable row level security;
alter table public.daily_results      enable row level security;
alter table public.leagues            enable row level security;
alter table public.league_divisions   enable row level security;
alter table public.league_members     enable row level security;
alter table public.rivalries          enable row level security;
alter table public.companions         enable row level security;
alter table public.companion_actions  enable row level security;

-- Open puzzles only: an unopened puzzle is a spoiler for everyone in every timezone.
create policy "daily_puzzles: select open puzzles"
  on public.daily_puzzles for select to authenticated
  using (opens_at <= now());

-- daily_puzzle_items: RLS enabled with no policy = deny-all. The server serves prompts.

create policy "daily_results: select own"
  on public.daily_results for select to authenticated
  using (user_id = (select auth.uid()));

create policy "daily_results: insert own"
  on public.daily_results for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "daily_results: update own"
  on public.daily_results for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- League structure is config, not user data.
create policy "leagues: readable by signed-in users"
  on public.leagues for select to authenticated using (true);

create policy "league_divisions: readable by signed-in users"
  on public.league_divisions for select to authenticated using (true);

create policy "league_members: select own membership"
  on public.league_members for select to authenticated
  using (user_id = (select auth.uid()));

-- Joining a league is a permanent-account feature: a weekly division that outlives a guest session
-- is meaningless. Gated on the JWT claim, never on user_metadata.
create policy "league_members: join own, permanent accounts only"
  on public.league_members for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select (auth.jwt() ->> 'is_anonymous')::boolean) is false
  );

-- No client UPDATE on league_members: points and rank are awarded server-side.
-- No DELETE policy anywhere in this file's league tables: leaving is not a demotion mechanic.

create policy "rivalries: select own"
  on public.rivalries for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));

create policy "companions: select own"
  on public.companions for select to authenticated
  using (user_id = (select auth.uid()));

create policy "companions: insert own, permanent accounts only"
  on public.companions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select (auth.jwt() ->> 'is_anonymous')::boolean) is false
  );

-- Cosmetics and naming are client-editable; level/xp/capabilities are protected by column grants.
create policy "companions: update own"
  on public.companions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "companion_actions: select own"
  on public.companion_actions for select to authenticated
  using (user_id = (select auth.uid()));

-- Approvals and rejections come from the client. Drafts and sends are written server-side, which is
-- why the trigger — not the policy — is what makes an autonomous send impossible.
create policy "companion_actions: insert own, permanent accounts only"
  on public.companion_actions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (select (auth.jwt() ->> 'is_anonymous')::boolean) is false
  );

-- No UPDATE and no DELETE policy on companion_actions: it is an audit log.

grant select on public.daily_puzzles to authenticated;
grant select, insert, update on public.daily_results to authenticated;
grant select on public.leagues to authenticated;
grant select on public.league_divisions to authenticated;
-- Column-level INSERT grants, so a client cannot set the fields the server is supposed to own:
-- league points, companion level/capabilities, or the companion gate decision itself.
grant select on public.league_members to authenticated;
grant insert (division_id, user_id) on public.league_members to authenticated;

grant select on public.rivalries to authenticated;

grant select on public.companions to authenticated;
grant insert (user_id, world_slug, name, species, cosmetics) on public.companions to authenticated;
grant update (name, cosmetics) on public.companions to authenticated;

grant select on public.companion_actions to authenticated;
grant insert (companion_id, user_id, parent_action_id, action_kind, task_kind, content, approved_by)
  on public.companion_actions to authenticated;

grant all on public.daily_puzzles      to service_role;
grant all on public.daily_puzzle_items to service_role;
grant all on public.daily_results      to service_role;
grant all on public.leagues            to service_role;
grant all on public.league_divisions   to service_role;
grant all on public.league_members     to service_role;
grant all on public.rivalries          to service_role;
grant all on public.companions         to service_role;
grant all on public.companion_actions  to service_role;

-- Deliberately NOT seeded. League tier names are not specified in any source doc, and the seven
-- altitude band names (Valley Floor .. Meridian) belong to the rating, not to the league — reusing
-- them here would conflate the loss-bearing ladder with the gain-only one, which the spec separates
-- on purpose. Seed public.leagues in a follow-up migration once the names are decided.
