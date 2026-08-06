-- LoxeLingo — learning engine: FSRS state, the append-only review log, trained parameter sets,
-- and item calibration with the 5% non-adaptive holdout.
--
-- `review_log` and `fsrs_params` are taken from docs/research/03-learning-libs.md §4.7 essentially
-- verbatim (that schema was derived by reading the fsrs-rs optimizer source). Three adaptations,
-- each deliberate:
--   1. `card_id` targets public.card, `user_id` targets auth.users, both `on delete cascade` so a
--      deleted account really disappears (required for the anonymous-user cleanup job).
--   2. fsrs_params is created before review_log, because review_log.params_id references it.
--   3. RLS, grants and an append-only privilege set are added. Nothing was removed.
--
-- Table names are singular (`card`, `review_log`) to match §4.7 verbatim, even though the plan doc
-- writes them plural. §4.7 is the authority: it is what the optimizer's dump query was written for.

-- ---------------------------------------------------------------------------
-- card — one row per (user, item): the FSRS scheduling state.
-- ---------------------------------------------------------------------------
create table public.card (
  id             bigint generated always as identity primary key,
  user_id        uuid   not null references auth.users (id) on delete cascade,
  item_id        bigint not null references public.items (id) on delete cascade,

  -- ts-fsrs Card, exact field set (03-learning-libs 2.4). elapsed_days is intentionally absent:
  -- it is deprecated in ts-fsrs 6 and is recomputed from review_log at training time anyway.
  due            timestamptz not null,
  stability      real     not null default 0,
  difficulty     real     not null default 0,
  scheduled_days integer  not null default 0,
  learning_steps smallint not null default 0,          -- index into the learning-step ladder
  reps           integer  not null default 0,
  lapses         integer  not null default 0,
  state          smallint not null default 0 check (state between 0 and 3),  -- New/Learning/Review/Relearning
  last_review    timestamptz,

  suspended      boolean  not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint card_one_per_user_item unique (user_id, item_id)
);

comment on table public.card is
  'ts-fsrs Card state. learning_steps and scheduled_days must be persisted or the scheduler loses its place (03-learning-libs 2.4).';
comment on column public.card.state is 'ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning.';

create trigger card_set_updated_at
  before update on public.card
  for each row execute function public.set_updated_at();

-- The Trials queue: "my due cards".
create index card_user_due_idx on public.card (user_id, due) where not suspended;
create index card_item_idx on public.card (item_id);

-- ---------------------------------------------------------------------------
-- fsrs_params — the parameter sets you have ever served. Never mutate a row; insert a new one.
-- (03-learning-libs §4.7, verbatim plus RLS-supporting bits.)
-- ---------------------------------------------------------------------------
create table public.fsrs_params (
  id            bigserial primary key,
  user_id       uuid references auth.users (id) on delete cascade,   -- null = global default
  fsrs_version  text    not null,                    -- 'FSRS-6'
  w             real[]  not null,                    -- length 21 for FSRS-6
  trained_at    timestamptz not null default now(),
  train_items   integer,                             -- expanded item count
  log_loss      real,                                -- from evaluate(); gate on this
  rmse_bins     real,
  is_active     boolean not null default false,
  check (array_length(w, 1) = 21 or fsrs_version <> 'FSRS-6')
);

comment on table public.fsrs_params is
  'Append-only in practice: never mutate w, insert a new row. reschedule() can only replay history onto new parameters if the old ones still exist.';
comment on column public.fsrs_params.log_loss is
  'Held-out log loss on a TIME-based split. Promote a new row only if this beats the currently active row.';

create index fsrs_params_user_idx on public.fsrs_params (user_id);
-- At most one active parameter set per user, and at most one active global default.
create unique index fsrs_params_one_active_per_user_idx
  on public.fsrs_params (user_id) where is_active and user_id is not null;
create unique index fsrs_params_one_active_global_idx
  on public.fsrs_params (fsrs_version) where is_active and user_id is null;

-- The FSRS-6 defaults, byte-identical to ts-fsrs 5.4.1 `default_w` (03-learning-libs 2.2).
insert into public.fsrs_params (user_id, fsrs_version, w, is_active) values (
  null, 'FSRS-6',
  array[0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
        0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]::real[],
  true
);

-- ---------------------------------------------------------------------------
-- review_log — APPEND-ONLY. Never UPDATE, never DELETE. This table is the asset.
-- (03-learning-libs §4.7, verbatim.)
--
-- The five canonical FSRS CSV columns fall out of one SELECT, and the (tz, day_cutoff_hour) pair
-- needed to compute delta_t as a CALENDAR-DAY difference is preserved per row. delta_t is never
-- stored: the timezone and cutoff can change retroactively, so it is computed at training time.
-- ---------------------------------------------------------------------------
create table public.review_log (
  id              bigserial primary key,
  user_id         uuid        not null references auth.users (id) on delete cascade,
  card_id         bigint      not null references public.card (id) on delete cascade,

  -- === the five canonical FSRS columns ===
  review_time     timestamptz not null,               -- absolute instant; -> epoch ms
  review_rating   smallint    not null check (review_rating between 1 and 4),
  review_state    smallint    not null check (review_state between 0 and 5),
  review_duration integer     not null default 0,     -- ms spent answering

  -- === needed to compute delta_t correctly (03-learning-libs 4.3) ===
  tz              text        not null,               -- IANA zone AT REVIEW TIME, e.g. 'America/New_York'
  day_cutoff_hour smallint    not null default 4,     -- Anki's "next day starts at"

  -- === derived state, for serving + debugging (NOT training input) ===
  state_before          smallint not null,            -- ts-fsrs ReviewLog.state
  stability_before      real,                         -- ts-fsrs ReviewLog.stability
  difficulty_before     real,                         -- ts-fsrs ReviewLog.difficulty
  scheduled_days_before integer  not null default 0,
  learning_steps_before smallint not null default 0,
  due_before            timestamptz,

  -- === provenance: which model produced this scheduling decision ===
  fsrs_version    text        not null default 'FSRS-6',
  -- `on delete set null` only so that deleting an account (which cascades fsrs_params) cannot
  -- deadlock against this FK. Parameter rows are never deleted in normal operation.
  params_id       bigint      references public.fsrs_params (id) on delete set null,  -- exact w[] used
  request_retention real       not null,

  -- === flags so the reference convertor's filters can be reconstructed (4.5) ===
  is_manual       boolean     not null default false,
  is_cram         boolean     not null default false, -- didn't affect scheduling
  elapsed_days    integer,                            -- as computed at write time (audit only)

  created_at      timestamptz not null default now()
);

comment on table public.review_log is
  'APPEND-ONLY. No UPDATE or DELETE policy exists and the UPDATE/DELETE privileges are revoked. Row-level correctness here cannot be backfilled — this is the highest-stakes table in the project.';
comment on column public.review_log.tz is
  'IANA zone at review time, not the profile''s current zone. Users travel and the cutoff is retroactive.';
comment on column public.review_log.elapsed_days is
  'Audit only. delta_t is ALWAYS recomputed at training time as a calendar-day difference under (tz, day_cutoff_hour). Never train on this column.';
comment on column public.review_log.review_state is
  'Reference CSV mapping: 0,1 => Learning; 2 => Review; 3 => Relearning; 4 => Filtered; 5 => Manual.';

create index review_log_user_card_time_idx on public.review_log (user_id, card_id, review_time);
create index review_log_user_time_idx on public.review_log (user_id, review_time);
-- one row per review, idempotent under client retry
create unique index review_log_card_time_key on public.review_log (card_id, review_time);
create index review_log_params_idx on public.review_log (params_id);

-- ---------------------------------------------------------------------------
-- item_presentations — every time an item was put in front of a user.
--
-- THE 5% HOLDOUT. ~5% of presentations are chosen at random, non-adaptively. Item difficulty is
-- calibrated from THAT SLICE ONLY: when items are selected adaptively by current rating, variance
-- inflates and the difficulty estimate never converges. `is_holdout` is tied to selection_policy by
-- a check constraint so the two can never disagree, and a client cannot declare its own holdout
-- status (there is no client INSERT policy on this table).
-- ---------------------------------------------------------------------------
create table public.item_presentations (
  id                bigint generated always as identity primary key,
  user_id           uuid   not null references auth.users (id) on delete cascade,
  item_id           bigint not null references public.items (id) on delete cascade,
  match_id          uuid,                             -- FK added in the match-loop migration
  card_id           bigint references public.card (id) on delete set null,

  selection_policy  text   not null check (selection_policy in
                       ('adaptive', 'random_holdout', 'trial', 'daily', 'spark', 'gauntlet')),
  is_holdout        boolean not null,

  presented_at      timestamptz not null default now(),
  responded_at      timestamptz,
  is_correct        boolean,
  score             real,                             -- partial credit where a ladder allows it
  response_ms       integer check (response_ms is null or response_ms >= 0),

  -- Snapshots so a calibration run can be reproduced exactly.
  user_theta_at_presentation double precision,
  item_beta_at_presentation  double precision,
  predicted_p                real,

  constraint item_presentations_holdout_matches_policy
    check (is_holdout = (selection_policy = 'random_holdout'))
);

comment on table public.item_presentations is
  'Append-only presentation log. Difficulty calibration reads only rows WHERE is_holdout, per the 5% non-adaptive rule (spec part 2 section 3).';
comment on constraint item_presentations_holdout_matches_policy on public.item_presentations is
  'is_holdout is true exactly when the item was chosen by the non-adaptive random policy. The two can never drift apart.';

create index item_presentations_user_time_idx on public.item_presentations (user_id, presented_at desc);
-- The calibration query: holdout rows for one item.
create index item_presentations_holdout_idx on public.item_presentations (item_id, presented_at)
  where is_holdout;
create index item_presentations_item_idx on public.item_presentations (item_id);
create index item_presentations_match_idx on public.item_presentations (match_id);

-- ---------------------------------------------------------------------------
-- item_stats — the calibrated item. Two separate counter sets: overall (for ops dashboards) and
-- holdout-only (the ONLY input to `beta`). Keeping them apart in the schema is what stops someone
-- accidentally calibrating from the adaptive slice.
-- ---------------------------------------------------------------------------
create table public.item_stats (
  item_id              bigint primary key references public.items (id) on delete cascade,

  -- all presentations, adaptive included: monitoring only
  presentations        integer not null default 0 check (presentations >= 0),
  correct_count        integer not null default 0 check (correct_count >= 0),

  -- holdout slice only: the calibration input
  holdout_presentations integer not null default 0 check (holdout_presentations >= 0),
  holdout_correct       integer not null default 0 check (holdout_correct >= 0),

  -- dynamic-K Elo item difficulty on the logit scale. Primed from items.cold_start_beta with a
  -- small pseudo-count in beta_n so the content prior is not instantly washed out.
  beta                 double precision not null default 0,
  beta_n               integer not null default 0 check (beta_n >= 0),
  -- IRT 2PL, fitted offline from the holdout slice.
  irt_a                real,                          -- discrimination
  irt_b                real,                          -- difficulty
  irt_fitted_at        timestamptz,

  last_calibrated_at   timestamptz,
  updated_at           timestamptz not null default now(),
  constraint item_stats_counts_sane check (
    correct_count <= presentations
    and holdout_correct <= holdout_presentations
    and holdout_presentations <= presentations
  )
);

comment on table public.item_stats is
  'Item calibration. beta / irt_* are computed from item_presentations WHERE is_holdout ONLY. The overall counters exist for monitoring and must never feed the estimate.';
comment on column public.item_stats.beta_n is
  'Observation count driving K(n) = a/(1+b*n). Cap the effective K floor (~0.02) so a long-lived item can still drift with the population.';

create trigger item_stats_set_updated_at
  before update on public.item_stats
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS + grants
-- ---------------------------------------------------------------------------
alter table public.card               enable row level security;
alter table public.fsrs_params        enable row level security;
alter table public.review_log         enable row level security;
alter table public.item_presentations enable row level security;
alter table public.item_stats         enable row level security;

create policy "card: select own"
  on public.card for select to authenticated
  using (user_id = (select auth.uid()));

create policy "card: insert own"
  on public.card for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Both using and with check: without with check a user could hand their card to someone else.
create policy "card: update own"
  on public.card for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- No DELETE policy on card: review_log references it, and history is the asset.

create policy "fsrs_params: select own or global default"
  on public.fsrs_params for select to authenticated
  using (user_id = (select auth.uid()) or user_id is null);

-- review_log: SELECT and INSERT only. There is no UPDATE policy and no DELETE policy, and the
-- privileges are not granted either — belt and braces. Do not add them, ever.
create policy "review_log: select own"
  on public.review_log for select to authenticated
  using (user_id = (select auth.uid()));

create policy "review_log: insert own"
  on public.review_log for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "item_presentations: select own"
  on public.item_presentations for select to authenticated
  using (user_id = (select auth.uid()));

-- No client INSERT on item_presentations: the server assigns selection_policy, so a client cannot
-- manufacture holdout rows and poison item difficulty.

-- item_stats: RLS enabled with no policy = deny-all for clients. Difficulty is an internal signal.

grant select, insert, update on public.card to authenticated;
grant select on public.fsrs_params to authenticated;
grant select, insert on public.review_log to authenticated;
grant usage on sequence public.review_log_id_seq to authenticated;   -- bigserial needs this for INSERT
revoke update, delete, truncate on public.review_log from authenticated;
grant select on public.item_presentations to authenticated;

grant all on public.card               to service_role;
grant all on public.fsrs_params        to service_role;
grant all on public.review_log         to service_role;
grant all on public.item_presentations to service_role;
grant all on public.item_stats         to service_role;
grant usage, select on sequence public.review_log_id_seq, public.fsrs_params_id_seq to service_role;
